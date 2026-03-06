/**
 * StorageService unit tests
 * Covers all 11 public methods across IndexedDB and localStorage paths,
 * plus migration, error scenarios, and singleton verification.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Polyfill localStorage with a proper Storage implementation.
// Vitest's jsdom environment provides a bare object without Web Storage API methods.
// StorageService relies on getItem/setItem/removeItem/key/length.
// ---------------------------------------------------------------------------
(() => {
  if (typeof localStorage.getItem === 'function') return; // Already functional

  const store = new Map();

  const storage = {
    getItem(key) {
      return store.has(key) ? store.get(key) : null;
    },
    setItem(key, value) {
      store.set(key, String(value));
    },
    removeItem(key) {
      store.delete(key);
    },
    key(index) {
      const keys = [...store.keys()];
      return index < keys.length ? keys[index] : null;
    },
    get length() {
      return store.size;
    },
    clear() {
      store.clear();
    },
  };

  // Replace the global localStorage
  Object.defineProperty(globalThis, 'localStorage', {
    value: storage,
    writable: true,
    configurable: true,
  });
})();

import { StorageService, storageService } from '../../scripts/services/StorageService.js';

/**
 * Clear all localStorage keys.
 */
function clearLocalStorage() {
  localStorage.clear();
}

// ---------------------------------------------------------------------------
// IndexedDB path (isIndexedDBSupported = true, default with fake-indexeddb)
// ---------------------------------------------------------------------------
describe('StorageService - IndexedDB path', () => {
  /** @type {StorageService} */
  let service;

  beforeEach(() => {
    service = new StorageService();
  });

  afterEach(async () => {
    service.close();
    // Clean up the database between tests
    await new Promise((resolve, reject) => {
      const req = indexedDB.deleteDatabase('token-replacer-fa');
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  });

  describe('openDatabase()', () => {
    it('opens a connection', async () => {
      const result = await service.testConnection();
      expect(result).toBe(true);
    });

    it('reuses cached connection on second call', async () => {
      // First call opens
      await service.testConnection();
      const db1 = service.db;
      // Second call reuses
      await service.testConnection();
      const db2 = service.db;
      expect(db1).toBe(db2);
    });
  });

  describe('testConnection()', () => {
    it('returns true and database info is accessible', async () => {
      const result = await service.testConnection();
      expect(result).toBe(true);
      expect(service.db).not.toBeNull();
      expect(service.db.name).toBe('token-replacer-fa');
      expect(service.db.version).toBe(1);
    });
  });

  describe('has()', () => {
    it('returns true for existing key', async () => {
      await service.save('test-key', { foo: 'bar' });
      expect(await service.has('test-key')).toBe(true);
    });

    it('returns false for missing key', async () => {
      expect(await service.has('nonexistent')).toBe(false);
    });
  });

  describe('save()', () => {
    it('stores data and returns true', async () => {
      const result = await service.save('my-key', { hello: 'world' });
      expect(result).toBe(true);
    });

    it('stores timestamp metadata', async () => {
      const before = Date.now();
      await service.save('ts-key', { value: 1 });
      const after = Date.now();

      // Read raw record from IndexedDB
      const db = await service.openDatabase();
      const tx = db.transaction(['index'], 'readonly');
      const store = tx.objectStore('index');
      const record = await new Promise((resolve, reject) => {
        const req = store.get('ts-key');
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });

      expect(record.timestamp).toBeTypeOf('number');
      expect(record.timestamp).toBeGreaterThanOrEqual(before);
      expect(record.timestamp).toBeLessThanOrEqual(after);
    });
  });

  describe('load()', () => {
    it('returns saved data (round-trip)', async () => {
      const data = { creatures: ['dragon', 'goblin'], count: 42 };
      await service.save('round-trip', data);
      const loaded = await service.load('round-trip');
      expect(loaded).toEqual(data);
    });

    it('returns null for missing key', async () => {
      const result = await service.load('missing');
      expect(result).toBeNull();
    });
  });

  describe('remove()', () => {
    it('deletes data and returns true', async () => {
      await service.save('to-remove', 'data');
      const result = await service.remove('to-remove');
      expect(result).toBe(true);
    });

    it('has() returns false after remove', async () => {
      await service.save('to-check', 'data');
      expect(await service.has('to-check')).toBe(true);
      await service.remove('to-check');
      expect(await service.has('to-check')).toBe(false);
    });
  });

  describe('clear()', () => {
    it('removes all records from IndexedDB', async () => {
      await service.save('key1', 'val1');
      await service.save('key2', 'val2');
      await service.save('key3', 'val3');

      const result = await service.clear();
      expect(result).toBe(true);

      expect(await service.has('key1')).toBe(false);
      expect(await service.has('key2')).toBe(false);
      expect(await service.has('key3')).toBe(false);
    });
  });

  describe('close()', () => {
    it('nullifies db and dbPromise', async () => {
      await service.testConnection();
      expect(service.db).not.toBeNull();

      service.close();
      expect(service.db).toBeNull();
      expect(service.dbPromise).toBeNull();
    });
  });
});

// ---------------------------------------------------------------------------
// localStorage fallback (isIndexedDBSupported set to false)
// ---------------------------------------------------------------------------
describe('StorageService - localStorage fallback', () => {
  /** @type {StorageService} */
  let service;

  beforeEach(() => {
    clearLocalStorage();
    service = new StorageService();
    service.isIndexedDBSupported = false;
  });

  afterEach(() => {
    clearLocalStorage();
  });

  describe('has()', () => {
    it('returns true for existing localStorage key', async () => {
      localStorage.setItem('my-key', JSON.stringify({ data: 'x', timestamp: Date.now() }));
      expect(await service.has('my-key')).toBe(true);
    });

    it('returns false for missing key', async () => {
      expect(await service.has('nonexistent')).toBe(false);
    });
  });

  describe('save()', () => {
    it('stores to localStorage and returns true', async () => {
      const result = await service.save('ls-key', { name: 'test' });
      expect(result).toBe(true);

      const stored = JSON.parse(localStorage.getItem('ls-key'));
      expect(stored.data).toEqual({ name: 'test' });
      expect(stored.timestamp).toBeTypeOf('number');
    });

    it('returns false for data exceeding 4.5MB size limit', async () => {
      const bigData = 'x'.repeat(5 * 1024 * 1024);
      const result = await service.save('big-key', bigData);
      expect(result).toBe(false);
    });
  });

  describe('load()', () => {
    it('returns saved data (round-trip via localStorage)', async () => {
      const data = { tokens: ['a', 'b'], enabled: true };
      await service.save('rt-key', data);
      const loaded = await service.load('rt-key');
      expect(loaded).toEqual(data);
    });

    it('returns null for missing key', async () => {
      const result = await service.load('missing');
      expect(result).toBeNull();
    });
  });

  describe('remove()', () => {
    it('removes key from localStorage', async () => {
      await service.save('to-remove', 'data');
      expect(localStorage.getItem('to-remove')).not.toBeNull();

      const result = await service.remove('to-remove');
      expect(result).toBe(true);
      expect(localStorage.getItem('to-remove')).toBeNull();
    });
  });

  describe('clear()', () => {
    it('removes only token-replacer-fa-prefixed keys, leaves others intact', async () => {
      // Module keys
      localStorage.setItem('token-replacer-fa-index', 'data1');
      localStorage.setItem('token-replacer-fa-cache', 'data2');
      // Other keys
      localStorage.setItem('other-module-setting', 'keep-me');
      localStorage.setItem('unrelated-key', 'also-keep');

      const result = await service.clear();
      expect(result).toBe(true);

      expect(localStorage.getItem('token-replacer-fa-index')).toBeNull();
      expect(localStorage.getItem('token-replacer-fa-cache')).toBeNull();
      expect(localStorage.getItem('other-module-setting')).toBe('keep-me');
      expect(localStorage.getItem('unrelated-key')).toBe('also-keep');
    });
  });
});

// ---------------------------------------------------------------------------
// Migration
// ---------------------------------------------------------------------------
describe('StorageService - Migration', () => {
  /** @type {StorageService} */
  let service;

  beforeEach(() => {
    clearLocalStorage();
    service = new StorageService();
  });

  afterEach(async () => {
    service.close();
    clearLocalStorage();
    await new Promise((resolve, reject) => {
      const req = indexedDB.deleteDatabase('token-replacer-fa');
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  });

  describe('needsMigration()', () => {
    it('returns true when old localStorage key exists and new key is empty', async () => {
      localStorage.setItem('old-key', JSON.stringify({ data: 'old', timestamp: Date.now() }));
      expect(await service.needsMigration('old-key', 'new-key')).toBe(true);
    });

    it('returns false when no old key exists', async () => {
      expect(await service.needsMigration('old-key', 'new-key')).toBe(false);
    });

    it('returns false when new key already has data', async () => {
      localStorage.setItem('old-key', JSON.stringify({ data: 'old', timestamp: Date.now() }));
      await service.save('new-key', 'already-migrated');
      expect(await service.needsMigration('old-key', 'new-key')).toBe(false);
    });
  });

  describe('migrateFromLocalStorage()', () => {
    it('full round-trip: migrates data to IndexedDB and removes old key', async () => {
      const migrationData = { categories: { beast: ['wolf.png'] }, version: 3 };
      localStorage.setItem(
        'old-index',
        JSON.stringify({ data: migrationData, timestamp: Date.now() })
      );

      const result = await service.migrateFromLocalStorage('old-index', 'new-index');
      expect(result).toBe(true);

      // Verify data accessible via load
      const loaded = await service.load('new-index');
      expect(loaded).toEqual(migrationData);

      // Verify old key removed
      expect(localStorage.getItem('old-index')).toBeNull();
    });

    it('returns false when old key does not exist', async () => {
      const result = await service.migrateFromLocalStorage('nonexistent', 'new-key');
      expect(result).toBe(false);
    });

    it('returns false when old key has invalid format (no data property)', async () => {
      localStorage.setItem('bad-key', JSON.stringify({ wrong: 'format' }));
      const result = await service.migrateFromLocalStorage('bad-key', 'new-key');
      expect(result).toBe(false);
    });
  });
});

// ---------------------------------------------------------------------------
// Error scenarios
// ---------------------------------------------------------------------------
describe('StorageService - Error scenarios', () => {
  /** @type {StorageService} */
  let service;

  beforeEach(() => {
    clearLocalStorage();
    service = new StorageService();
  });

  afterEach(async () => {
    service.close();
    clearLocalStorage();
    await new Promise((resolve, reject) => {
      const req = indexedDB.deleteDatabase('token-replacer-fa');
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  });

  it('IndexedDB open failure falls through to localStorage for save/load/remove', async () => {
    // Spy on openDatabase to simulate failure
    vi.spyOn(service, 'openDatabase').mockRejectedValue(new Error('DB open failed'));

    // save should fall through to localStorage
    const saveResult = await service.save('fallback-key', { fallback: true });
    expect(saveResult).toBe(true);

    // load should fall through to localStorage
    const loadResult = await service.load('fallback-key');
    expect(loadResult).toEqual({ fallback: true });

    // remove should fall through to localStorage
    const removeResult = await service.remove('fallback-key');
    expect(removeResult).toBe(true);
    expect(await service.load('fallback-key')).toBeNull();

    vi.restoreAllMocks();
  });

  it('transaction abort on save does not silently lose data (falls through to localStorage)', async () => {
    // Open the database first so we can spy on transaction
    const db = await service.openDatabase();

    const originalTransaction = db.transaction.bind(db);
    vi.spyOn(db, 'transaction').mockImplementation((...args) => {
      const tx = originalTransaction(...args);
      // Schedule abort after microtask to simulate transaction failure
      Promise.resolve().then(() => {
        try {
          tx.abort();
        } catch {
          // Transaction may already be finished
        }
      });
      return tx;
    });

    // save should fall through to localStorage after abort
    const result = await service.save('abort-key', { aborted: true });
    expect(result).toBe(true);

    // Verify data landed in localStorage
    const stored = localStorage.getItem('abort-key');
    expect(stored).not.toBeNull();
    const parsed = JSON.parse(stored);
    expect(parsed.data).toEqual({ aborted: true });

    vi.restoreAllMocks();
  });
});

// ---------------------------------------------------------------------------
// Singleton
// ---------------------------------------------------------------------------
describe('StorageService - Singleton', () => {
  it('exported storageService is an instance of StorageService', () => {
    expect(storageService).toBeInstanceOf(StorageService);
  });

  it('storageService.isIndexedDBSupported is true (fake-indexeddb loaded)', () => {
    expect(storageService.isIndexedDBSupported).toBe(true);
  });
});
