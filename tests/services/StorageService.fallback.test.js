/**
 * StorageService facade — per-call fallback between injected backends and
 * honest boolean results.
 * @module tests/services/StorageService.fallback
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { StorageService } from '../../scripts/services/StorageService.js';
import { IndexedDbBackend } from '../../scripts/services/storage/IndexedDbBackend.js';
import { LocalStorageBackend } from '../../scripts/services/storage/LocalStorageBackend.js';

/** A backend whose every operation is a spy; `fail` makes them all reject. */
function createBackend({ available = true, fail = false, data = null } = {}) {
  const op = (value) =>
    vi.fn(async () => {
      if (fail) throw new Error('backend down');
      return value;
    });
  return {
    isAvailable: vi.fn(() => available),
    has: op(data !== null),
    read: op(data),
    write: op(undefined),
    remove: op(undefined),
    clear: op(undefined),
    close: vi.fn(),
    open: vi.fn(async () => ({ name: 'db', version: 1, objectStoreNames: [] })),
  };
}

describe('StorageService fallback', () => {
  let warn;
  let error;

  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    error = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => vi.restoreAllMocks());

  it('uses only the primary backend when it works', async () => {
    const primary = createBackend({ data: { a: 1 } });
    const fallback = createBackend();
    const service = new StorageService({ primary, fallback });

    expect(await service.save('k', 1)).toBe(true);
    expect(await service.load('k')).toEqual({ a: 1 });
    expect(await service.has('k')).toBe(true);
    expect(await service.remove('k')).toBe(true);
    expect(await service.clear()).toBe(true);

    for (const name of ['write', 'read', 'has', 'remove', 'clear']) {
      expect(fallback[name]).not.toHaveBeenCalled();
    }
  });

  it('falls back per call when the primary fails, and logs it', async () => {
    const primary = createBackend({ fail: true });
    const fallback = createBackend({ data: { b: 2 } });
    const service = new StorageService({ primary, fallback });

    expect(await service.save('k', 1)).toBe(true);
    expect(await service.load('k')).toEqual({ b: 2 });
    expect(fallback.write).toHaveBeenCalledWith('k', 1);
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('IndexedDB save failed'),
      expect.any(Error)
    );

    // The next call tries the primary again: one failure does not demote the session.
    await service.has('k');
    expect(primary.has).toHaveBeenCalled();
  });

  it('skips the primary entirely when it is unavailable', async () => {
    const primary = createBackend({ available: false });
    const fallback = createBackend();
    const service = new StorageService({ primary, fallback });

    await service.save('k', 1);

    expect(primary.write).not.toHaveBeenCalled();
    expect(fallback.write).toHaveBeenCalled();
  });

  it('returns false / null when both backends fail, and logs the error', async () => {
    const service = new StorageService({
      primary: createBackend({ fail: true }),
      fallback: createBackend({ fail: true }),
    });

    expect(await service.save('k', 1)).toBe(false);
    expect(await service.remove('k')).toBe(false);
    expect(await service.clear()).toBe(false);
    expect(await service.has('k')).toBe(false);
    expect(await service.load('k')).toBeNull();
    expect(error).toHaveBeenCalledWith(
      expect.stringContaining('localStorage save failed'),
      expect.any(Error)
    );
  });

  it('save reports false when localStorage is over quota after an IndexedDB failure', async () => {
    const storage = {
      getItem: () => null,
      setItem: () => {
        throw new DOMException('quota', 'QuotaExceededError');
      },
      removeItem: () => {},
    };
    const service = new StorageService({
      primary: createBackend({ fail: true }),
      fallback: new LocalStorageBackend({ getStorage: () => storage }),
    });

    expect(await service.save('k', { a: 1 })).toBe(false);
  });

  it('sanitizes data loaded from either backend', async () => {
    const tainted = JSON.parse('{"__proto__": {"p": 1}, "ok": true}');
    const service = new StorageService({
      primary: createBackend({ data: tainted }),
      fallback: createBackend(),
    });

    const loaded = await service.load('k');

    expect(loaded).toEqual({ ok: true });
    expect(Object.hasOwn(loaded, '__proto__')).toBe(false);
  });

  describe('testConnection', () => {
    it('is true when IndexedDB opens', async () => {
      const service = new StorageService({ primary: createBackend(), fallback: createBackend() });

      expect(await service.testConnection()).toBe(true);
    });

    it('is false when IndexedDB fails to open', async () => {
      const primary = createBackend();
      primary.open.mockRejectedValue(new Error('nope'));
      const service = new StorageService({ primary, fallback: createBackend() });

      expect(await service.testConnection()).toBe(false);
    });

    it('without IndexedDB, reports whether localStorage is actually usable', async () => {
      const storage = {
        setItem: () => {
          throw new DOMException('denied', 'SecurityError');
        },
        removeItem: () => {},
      };
      const service = new StorageService({
        primary: new IndexedDbBackend({ getFactory: () => null }),
        fallback: new LocalStorageBackend({ getStorage: () => storage }),
      });

      expect(await service.testConnection()).toBe(false);
    });
  });

  describe('migration', () => {
    it('does not remove the old key when saving the migrated data fails', async () => {
      const fallback = createBackend({ data: { old: true } });
      fallback.write.mockRejectedValue(new Error('quota'));
      const service = new StorageService({ primary: createBackend({ fail: true }), fallback });

      expect(await service.migrateFromLocalStorage('old', 'new')).toBe(false);
      expect(fallback.remove).not.toHaveBeenCalled();
    });

    it('needsMigration is false, and logged, when checking throws', async () => {
      const fallback = createBackend();
      fallback.has.mockRejectedValue(new Error('denied'));
      const service = new StorageService({ primary: createBackend(), fallback });

      expect(await service.needsMigration('old', 'new')).toBe(false);
      expect(warn).toHaveBeenCalled();
    });
  });
});
