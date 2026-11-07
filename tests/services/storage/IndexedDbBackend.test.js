/**
 * IndexedDbBackend — the primary Strategy, against fake-indexeddb, plus the
 * open failure / blocked / quota paths with hand-made requests.
 * @module tests/services/storage/IndexedDbBackend
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { IndexedDbBackend } from '../../../scripts/services/storage/IndexedDbBackend.js';

const DB_NAME = 'idb-backend-test';

function deleteDatabase() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.deleteDatabase(DB_NAME);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

describe('IndexedDbBackend (fake-indexeddb)', () => {
  let backend;

  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    backend = new IndexedDbBackend({ dbName: DB_NAME });
  });

  afterEach(async () => {
    backend.close();
    await deleteDatabase();
    vi.restoreAllMocks();
  });

  it('is available when the browser exposes indexedDB', () => {
    expect(backend.isAvailable()).toBe(true);
  });

  it('round-trips data and reports existence', async () => {
    await backend.write('k', { list: ['a', 'b'] });

    expect(await backend.has('k')).toBe(true);
    expect(await backend.read('k')).toEqual({ list: ['a', 'b'] });
  });

  it('read returns null and has returns false for a missing key', async () => {
    expect(await backend.read('missing')).toBeNull();
    expect(await backend.has('missing')).toBe(false);
  });

  it('remove and clear delete records', async () => {
    await backend.write('a', 1);
    await backend.write('b', 2);

    await backend.remove('a');
    expect(await backend.has('a')).toBe(false);
    expect(await backend.has('b')).toBe(true);

    await backend.clear();
    expect(await backend.has('b')).toBe(false);
  });

  it('concurrent opens share one connection', async () => {
    const [a, b] = await Promise.all([backend.open(), backend.open()]);

    expect(a).toBe(b);
    expect(backend.connection).toBe(a);
  });

  it('creates the object store at version 1 (migration switch, case 0)', async () => {
    const db = await backend.open();

    expect(db.version).toBe(1);
    expect(Array.from(db.objectStoreNames)).toEqual(['index']);
  });

  it('write rejects when the transaction aborts (e.g. quota exceeded)', async () => {
    const db = await backend.open();
    const original = db.transaction.bind(db);
    vi.spyOn(db, 'transaction').mockImplementation((...args) => {
      const tx = original(...args);
      Promise.resolve().then(() => tx.abort());
      return tx;
    });

    await expect(backend.write('k', 1)).rejects.toBeDefined();
  });
});

describe('IndexedDbBackend without IndexedDB', () => {
  it('is unavailable when no factory exists', () => {
    expect(new IndexedDbBackend({ getFactory: () => undefined }).isAvailable()).toBe(false);
  });

  it('is unavailable, and logged, when looking up the factory throws', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const backend = new IndexedDbBackend({
      getFactory: () => {
        throw new Error('SecurityError');
      },
    });

    expect(backend.isAvailable()).toBe(false);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});

describe('IndexedDbBackend open failures', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  /** A factory whose open() hands back a request the test drives by hand. */
  function createManualFactory() {
    const requests = [];
    return {
      requests,
      factory: {
        open: vi.fn(() => {
          const request = { error: null, result: null };
          requests.push(request);
          return request;
        }),
      },
    };
  }

  it('rejects on an open error, and the next call retries', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { factory, requests } = createManualFactory();
    const backend = new IndexedDbBackend({ getFactory: () => factory });

    const first = backend.open();
    requests[0].error = new Error('open failed');
    requests[0].onerror();
    await expect(first).rejects.toThrow('open failed');

    backend.open().catch(() => {});
    expect(factory.open).toHaveBeenCalledTimes(2);
  });

  it('rejects a blocked open after the grace period instead of hanging', async () => {
    vi.useFakeTimers();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { factory, requests } = createManualFactory();
    const backend = new IndexedDbBackend({ getFactory: () => factory });

    const opening = backend.open();
    const settled = vi.fn();
    opening.catch(settled);
    requests[0].onblocked();
    requests[0].onblocked();

    await vi.advanceTimersByTimeAsync(9_999);
    expect(settled).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    await expect(opening).rejects.toThrow(/blocked/);
  });

  it('a blocked open that clears before the grace period succeeds', async () => {
    vi.useFakeTimers();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const { factory, requests } = createManualFactory();
    const backend = new IndexedDbBackend({ getFactory: () => factory });
    const db = { close: vi.fn() };

    const opening = backend.open();
    requests[0].onblocked();
    requests[0].result = db;
    requests[0].onsuccess();
    await vi.advanceTimersByTimeAsync(20_000);

    await expect(opening).resolves.toBe(db);
  });

  it('drops the connection on a version change from another tab', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const { factory, requests } = createManualFactory();
    const backend = new IndexedDbBackend({ getFactory: () => factory });
    const db = { close: vi.fn() };

    const opening = backend.open();
    requests[0].result = db;
    requests[0].onsuccess();
    await opening;
    db.onversionchange();

    expect(db.close).toHaveBeenCalled();
    expect(backend.connection).toBeNull();
  });
});
