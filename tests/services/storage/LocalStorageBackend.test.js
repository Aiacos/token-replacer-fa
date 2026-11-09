/**
 * LocalStorageBackend — the fallback Strategy, against an in-memory Storage.
 * @module tests/services/storage/LocalStorageBackend
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { LocalStorageBackend } from '../../../scripts/services/storage/LocalStorageBackend.js';

/** Minimal Web Storage implementation backed by a Map. */
function createMemoryStorage() {
  const store = new Map();
  return {
    getItem: (key) => (store.has(key) ? store.get(key) : null),
    setItem: vi.fn((key, value) => store.set(key, String(value))),
    removeItem: (key) => store.delete(key),
    key: (index) => [...store.keys()][index] ?? null,
    get length() {
      return store.size;
    },
  };
}

describe('LocalStorageBackend', () => {
  let storage;
  let backend;

  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    storage = createMemoryStorage();
    backend = new LocalStorageBackend({ getStorage: () => storage });
  });

  it('round-trips data inside a {data, timestamp} record', async () => {
    await backend.write('k', { a: [1, 2] });

    expect(JSON.parse(storage.getItem('k'))).toMatchObject({
      data: { a: [1, 2] },
      timestamp: expect.any(Number),
    });
    expect(await backend.read('k')).toEqual({ a: [1, 2] });
    expect(await backend.has('k')).toBe(true);
  });

  it('read returns null for a missing key or a record without data', async () => {
    storage.setItem('empty', JSON.stringify({ wrong: 'format' }));

    expect(await backend.read('missing')).toBeNull();
    expect(await backend.read('empty')).toBeNull();
  });

  it('strips polluting keys while parsing', async () => {
    storage.setItem('k', '{"data": {"__proto__": {"p": 1}, "ok": true}}');

    const data = await backend.read('k');

    expect(data).toEqual({ ok: true });
    expect(Object.hasOwn(data, '__proto__')).toBe(false);
  });

  it('read throws on corrupt JSON, leaving the decision to the caller', async () => {
    storage.setItem('k', '{not json');

    await expect(backend.read('k')).rejects.toThrow(SyntaxError);
  });

  it('write rejects a payload over the size ceiling without touching storage', async () => {
    const small = new LocalStorageBackend({ getStorage: () => storage, maxBytes: 64 });

    await expect(small.write('k', 'x'.repeat(100))).rejects.toThrow(/too large/);
    expect(storage.setItem).not.toHaveBeenCalled();
  });

  it('write rejects when the browser quota is exceeded', async () => {
    storage.setItem.mockImplementation(() => {
      throw new DOMException('quota', 'QuotaExceededError');
    });

    await expect(backend.write('k', { a: 1 })).rejects.toThrow('quota');
  });

  it('clear removes only keys with the module prefix', async () => {
    storage.setItem('token-replacer-fa-index', '1');
    storage.setItem('token-replacer-fa-tva', '2');
    storage.setItem('other-module', '3');

    await backend.clear();

    expect(storage.getItem('token-replacer-fa-index')).toBeNull();
    expect(storage.getItem('token-replacer-fa-tva')).toBeNull();
    expect(storage.getItem('other-module')).toBe('3');
  });

  it('remove deletes the key', async () => {
    await backend.write('k', 1);
    await backend.remove('k');

    expect(await backend.has('k')).toBe(false);
  });

  it('isAvailable is true when a probe write succeeds and leaves nothing behind', () => {
    expect(backend.isAvailable()).toBe(true);
    expect(storage.length).toBe(0);
  });

  it('isAvailable is false, and logged, when storage refuses writes', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    storage.setItem.mockImplementation(() => {
      throw new DOMException('denied', 'SecurityError');
    });

    expect(backend.isAvailable()).toBe(false);
    expect(warn).toHaveBeenCalled();
  });
});
