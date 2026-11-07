/**
 * IndexRepository: version check, localStorage migration, shape sanitising on
 * load, and a save that reports failure honestly.
 *
 * @module tests/services/index/IndexRepository.test
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { IndexRepository } from '../../../scripts/services/index/IndexRepository.js';

/** @returns {object} Storage double with every method the repository calls */
function createStorage(overrides = {}) {
  return {
    load: vi.fn(async () => null),
    save: vi.fn(async () => true),
    remove: vi.fn(async () => true),
    needsMigration: vi.fn(async () => false),
    migrateFromLocalStorage: vi.fn(async () => {}),
    ...overrides,
  };
}

/** A well-formed index of the current version. */
const validIndex = () => ({
  version: IndexRepository.VERSION,
  lastUpdate: 1,
  categories: { beast: { wolf: [0], _all: [0] } },
  pathList: ['a/wolf.webp'],
  allPaths: [{ name: 'Wolf', category: 'beast', subcategories: ['wolf'] }],
  termIndex: { wolf: [0] },
});

describe('IndexRepository', () => {
  beforeEach(() => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });
  afterEach(() => vi.restoreAllMocks());

  it('exposes the storage key callers check for a cached index', () => {
    expect(IndexRepository.CACHE_KEY).toBe('token-replacer-fa-index-v3');
  });

  describe('load', () => {
    it('returns the stored index as is', async () => {
      const index = validIndex();
      const storage = createStorage({ load: vi.fn(async () => index) });

      await expect(new IndexRepository({ storageService: storage }).load()).resolves.toBe(index);
      expect(storage.load).toHaveBeenCalledWith(IndexRepository.CACHE_KEY);
    });

    it('returns null when nothing is stored', async () => {
      const storage = createStorage();
      await expect(new IndexRepository({ storageService: storage }).load()).resolves.toBeNull();
      expect(storage.remove).not.toHaveBeenCalled();
    });

    it('migrates a localStorage cache to IndexedDB before loading', async () => {
      const order = [];
      const storage = createStorage({
        needsMigration: vi.fn(async () => true),
        migrateFromLocalStorage: vi.fn(async () => order.push('migrate')),
        load: vi.fn(async () => {
          order.push('load');
          return validIndex();
        }),
      });

      await new IndexRepository({ storageService: storage }).load();

      expect(order).toEqual(['migrate', 'load']);
    });

    it('removes and rejects an index of another version', async () => {
      const storage = createStorage({
        load: vi.fn(async () => ({ ...validIndex(), version: IndexRepository.VERSION - 1 })),
      });

      await expect(new IndexRepository({ storageService: storage }).load()).resolves.toBeNull();
      expect(storage.remove).toHaveBeenCalledWith(IndexRepository.CACHE_KEY);
    });

    it.each([
      ['a non-object', 'garbage'],
      ['a missing pathList', { ...validIndex(), pathList: undefined }],
      ['a missing allPaths', { ...validIndex(), allPaths: undefined }],
      ['parallel arrays of different length', { ...validIndex(), pathList: ['a', 'b'] }],
      ['categories as an array', { ...validIndex(), categories: [] }],
      ['termIndex as an array', { ...validIndex(), termIndex: [] }],
      ['a non-string path', { ...validIndex(), pathList: [42] }],
      ['a null entry', { ...validIndex(), allPaths: [null] }],
    ])('removes and rejects an index with %s', async (_label, data) => {
      const stored =
        typeof data === 'object' ? { ...data, version: IndexRepository.VERSION } : data;
      const storage = createStorage({ load: vi.fn(async () => stored) });

      await expect(new IndexRepository({ storageService: storage }).load()).resolves.toBeNull();
      expect(storage.remove).toHaveBeenCalled();
    });

    it('accepts an index cached before termIndex existed (it is rebuilt later)', async () => {
      const { termIndex: _dropped, ...legacy } = validIndex();
      const storage = createStorage({ load: vi.fn(async () => legacy) });

      await expect(new IndexRepository({ storageService: storage }).load()).resolves.toBe(legacy);
    });

    it('never throws: a failing store is cleaned up and reported as null', async () => {
      const storage = createStorage({
        load: vi.fn(async () => {
          throw new Error('IDB exploded');
        }),
        remove: vi.fn(async () => {
          throw new Error('still exploded');
        }),
      });

      await expect(new IndexRepository({ storageService: storage }).load()).resolves.toBeNull();
      expect(storage.remove).toHaveBeenCalled();
      expect(console.warn).toHaveBeenCalledWith(
        expect.stringContaining('Cache cleanup failed'),
        expect.any(Error)
      );
    });
  });

  describe('save', () => {
    it('reports success when storage accepted the index', async () => {
      const storage = createStorage();
      const index = validIndex();

      await expect(new IndexRepository({ storageService: storage }).save(index)).resolves.toBe(
        true
      );
      expect(storage.save).toHaveBeenCalledWith(IndexRepository.CACHE_KEY, index);
    });

    it('refuses to save a null index', async () => {
      const storage = createStorage();
      await expect(new IndexRepository({ storageService: storage }).save(null)).resolves.toBe(
        false
      );
      expect(storage.save).not.toHaveBeenCalled();
    });

    it('returns false and signals a full store when storage rejects the index', async () => {
      const onStorageFull = vi.fn();
      const storage = createStorage({ save: vi.fn(async () => false) });

      const saved = await new IndexRepository({ storageService: storage, onStorageFull }).save(
        validIndex()
      );

      expect(saved).toBe(false);
      expect(onStorageFull).toHaveBeenCalledTimes(1);
    });

    it('returns false and signals a full store on QuotaExceededError', async () => {
      const onStorageFull = vi.fn();
      const quota = Object.assign(new Error('full'), { name: 'QuotaExceededError' });
      const storage = createStorage({ save: vi.fn(async () => Promise.reject(quota)) });

      const saved = await new IndexRepository({ storageService: storage, onStorageFull }).save(
        validIndex()
      );

      expect(saved).toBe(false);
      expect(onStorageFull).toHaveBeenCalledTimes(1);
    });

    it('returns false without blaming quota for any other error', async () => {
      const onStorageFull = vi.fn();
      const storage = createStorage({ save: vi.fn(async () => Promise.reject(new Error('x'))) });

      const saved = await new IndexRepository({ storageService: storage, onStorageFull }).save(
        validIndex()
      );

      expect(saved).toBe(false);
      expect(onStorageFull).not.toHaveBeenCalled();
      expect(console.warn).toHaveBeenCalled();
    });
  });

  describe('clear', () => {
    it('removes the stored index and never throws', async () => {
      const storage = createStorage({
        remove: vi.fn(async () => {
          throw new Error('nope');
        }),
      });

      await expect(
        new IndexRepository({ storageService: storage }).clear()
      ).resolves.toBeUndefined();
      expect(storage.remove).toHaveBeenCalledWith(IndexRepository.CACHE_KEY);
    });
  });
});
