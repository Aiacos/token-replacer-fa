/**
 * TVACacheService - Full test suite
 * Covers constructor DI, init lifecycle, cache parsing (all 3 formats),
 * search methods with scoring, and error paths.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TVACacheService } from '../../scripts/services/TVACacheService.js';
import {
  MOCK_TVA_CACHE_JSON,
  EXPECTED_IMAGE_COUNT,
  EXPECTED_CATEGORIES,
} from '../helpers/mock-tva-cache.js';

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

/** Minimal storageService mock that always misses IndexedDB */
function createMockStorage() {
  return {
    load: vi.fn(async () => null),
    save: vi.fn(async () => true),
    remove: vi.fn(async () => true),
    needsMigration: vi.fn(async () => false),
    migrateFromLocalStorage: vi.fn(async () => {}),
  };
}

/** Create a TVA API object that looks like game.modules.get('token-variants').api */
function createMockTvaAPI(overrides = {}) {
  return {
    TVA_CONFIG: {
      staticCache: true,
      staticCacheFile: 'data/tva-cache.json',
      ...overrides.TVA_CONFIG,
    },
    isCaching: vi.fn(() => false),
    ...overrides,
  };
}

/** Mock fetch Response returning JSON */
function createMockFetchResponse(json, ok = true, status = 200) {
  return {
    ok,
    status,
    statusText: ok ? 'OK' : 'Not Found',
    json: vi.fn(async () => json),
    headers: {
      get: vi.fn((header) => {
        if (header === 'Last-Modified') return 'Thu, 01 Jan 2026 00:00:00 GMT';
        if (header === 'Content-Length') return String(JSON.stringify(json).length);
        return null;
      }),
    },
  };
}

/** Create a fresh service with hasTVA=true (post-init) and fetch mocked */
function createInitializedService(mockStorage) {
  const mockAPI = createMockTvaAPI();
  const service = new TVACacheService({
    getTvaAPI: () => mockAPI,
    getSetting: vi.fn(),
    storageService: mockStorage,
  });
  service.init();
  return { service, mockAPI };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('TVACacheService', () => {
  let originalFetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  // =========================================================================
  // constructor DI (merged from TVACacheService.di.test.js)
  // =========================================================================
  describe('constructor DI', () => {
    it('instantiates with injected getTvaAPI and storageService without accessing globals', () => {
      const mockAPI = createMockTvaAPI();
      const mockStorage = createMockStorage();

      const service = new TVACacheService({
        getTvaAPI: () => mockAPI,
        storageService: mockStorage,
      });

      expect(service).toBeInstanceOf(TVACacheService);
      expect(service._getTvaAPI).toBeTypeOf('function');
      expect(service._storageService).toBe(mockStorage);
    });

    it('init() uses injected getTvaAPI and does NOT access game.modules', () => {
      const mockAPI = createMockTvaAPI();
      const mockStorage = createMockStorage();

      const service = new TVACacheService({
        getTvaAPI: () => mockAPI,
        storageService: mockStorage,
      });

      service.init();
      expect(service.tvaAPI).toBe(mockAPI);
      expect(service.hasTVA).toBe(true);
    });

    it('init() sets hasTVA to false when getTvaAPI returns null', () => {
      const mockStorage = createMockStorage();
      const service = new TVACacheService({
        getTvaAPI: () => null,
        storageService: mockStorage,
      });

      service.init();
      expect(service.tvaAPI).toBeNull();
      expect(service.hasTVA).toBe(false);
    });

    it('default constructor (no args) does not throw at construction time', () => {
      expect(() => new TVACacheService()).not.toThrow();
    });

    it('stores injected getSetting function', () => {
      const mockGetSetting = vi.fn();
      const service = new TVACacheService({ getSetting: mockGetSetting });
      expect(service._getSetting).toBe(mockGetSetting);
    });
  });

  // =========================================================================
  // init()
  // =========================================================================
  describe('init()', () => {
    it('sets tvaAPI and hasTVA=true when getTvaAPI returns an API object', () => {
      const mockAPI = createMockTvaAPI();
      const service = new TVACacheService({
        getTvaAPI: () => mockAPI,
        storageService: createMockStorage(),
      });

      service.init();

      expect(service.tvaAPI).toBe(mockAPI);
      expect(service.hasTVA).toBe(true);
    });

    it('sets hasTVA=false when getTvaAPI returns null', () => {
      const service = new TVACacheService({
        getTvaAPI: () => null,
        storageService: createMockStorage(),
      });

      service.init();

      expect(service.tvaAPI).toBeNull();
      expect(service.hasTVA).toBe(false);
    });

    it('does not throw when called multiple times', () => {
      const mockAPI = createMockTvaAPI();
      const service = new TVACacheService({
        getTvaAPI: () => mockAPI,
        storageService: createMockStorage(),
      });

      expect(() => {
        service.init();
        service.init();
        service.init();
      }).not.toThrow();

      expect(service.hasTVA).toBe(true);
    });
  });

  // =========================================================================
  // _loadTVACacheFromFile()
  // =========================================================================
  describe('_loadTVACacheFromFile()', () => {
    it('parses string path entries (format 1) - name extracted from filename', async () => {
      const mockStorage = createMockStorage();
      const { service } = createInitializedService(mockStorage);

      // Cache with only format-1 entries
      const cacheJson = {
        TestCategory: ['path/to/Tokens/Dragon_Red_01.webp'],
      };

      vi.stubGlobal(
        'fetch',
        vi.fn(async () => createMockFetchResponse(cacheJson))
      );

      await service._loadTVACacheFromFile();

      expect(service.tvaCacheImages).toHaveLength(1);
      const img = service.tvaCacheImages[0];
      expect(img.path).toBe('path/to/Tokens/Dragon_Red_01.webp');
      expect(img.name).toBe('Dragon_Red_01'); // filename without extension
      expect(img.category).toBe('TestCategory');
      expect(img.tags).toBeUndefined();
    });

    it('parses [path, name] tuple entries (format 2) - name from array', async () => {
      const mockStorage = createMockStorage();
      const { service } = createInitializedService(mockStorage);

      const cacheJson = {
        Beasts: [['path/to/Wolf_01.webp', 'Wolf']],
      };

      vi.stubGlobal(
        'fetch',
        vi.fn(async () => createMockFetchResponse(cacheJson))
      );

      await service._loadTVACacheFromFile();

      const img = service.tvaCacheImages[0];
      expect(img.path).toBe('path/to/Wolf_01.webp');
      expect(img.name).toBe('Wolf');
      expect(img.category).toBe('Beasts');
      expect(img.tags).toBeUndefined();
    });

    it('parses [path, name, tags] triple entries (format 3) - tags preserved', async () => {
      const mockStorage = createMockStorage();
      const { service } = createInitializedService(mockStorage);

      const cacheJson = {
        Undead: [['path/to/Skeleton.webp', 'Skeleton Warrior', ['undead', 'skeleton']]],
      };

      vi.stubGlobal(
        'fetch',
        vi.fn(async () => createMockFetchResponse(cacheJson))
      );

      await service._loadTVACacheFromFile();

      const img = service.tvaCacheImages[0];
      expect(img.path).toBe('path/to/Skeleton.webp');
      expect(img.name).toBe('Skeleton Warrior');
      expect(img.category).toBe('Undead');
      expect(img.tags).toEqual(['undead', 'skeleton']);
    });

    it('populates tvaCacheImages flat array with all entries from MOCK_TVA_CACHE_JSON', async () => {
      const mockStorage = createMockStorage();
      const { service } = createInitializedService(mockStorage);

      vi.stubGlobal(
        'fetch',
        vi.fn(async () => createMockFetchResponse(MOCK_TVA_CACHE_JSON))
      );

      await service._loadTVACacheFromFile();

      expect(service.tvaCacheImages).toHaveLength(EXPECTED_IMAGE_COUNT);
    });

    it('populates tvaCacheByCategory with original category structure', async () => {
      const mockStorage = createMockStorage();
      const { service } = createInitializedService(mockStorage);

      vi.stubGlobal(
        'fetch',
        vi.fn(async () => createMockFetchResponse(MOCK_TVA_CACHE_JSON))
      );

      await service._loadTVACacheFromFile();

      const categoryKeys = Object.keys(service.tvaCacheByCategory);
      expect(categoryKeys).toEqual(EXPECTED_CATEGORIES);
      // Each category should have the same count as the original
      for (const cat of EXPECTED_CATEGORIES) {
        expect(service.tvaCacheByCategory[cat]).toHaveLength(MOCK_TVA_CACHE_JSON[cat].length);
      }
    });

    it('sets tvaCacheLoaded = true on success', async () => {
      const mockStorage = createMockStorage();
      const { service } = createInitializedService(mockStorage);

      vi.stubGlobal(
        'fetch',
        vi.fn(async () => createMockFetchResponse(MOCK_TVA_CACHE_JSON))
      );

      expect(service.tvaCacheLoaded).toBe(false);
      await service._loadTVACacheFromFile();
      expect(service.tvaCacheLoaded).toBe(true);
    });

    it('skips non-array entries in JSON (metadata keys)', async () => {
      const mockStorage = createMockStorage();
      const { service } = createInitializedService(mockStorage);

      const cacheJson = {
        version: '1.0', // string - should be skipped
        timestamp: 12345, // number - should be skipped
        TestCategory: ['path/to/Token.webp'],
      };

      vi.stubGlobal(
        'fetch',
        vi.fn(async () => createMockFetchResponse(cacheJson))
      );

      await service._loadTVACacheFromFile();

      expect(service.tvaCacheImages).toHaveLength(1);
      expect(Object.keys(service.tvaCacheByCategory)).toEqual(['TestCategory']);
    });

    it('throws structured error when TVA_CONFIG is missing', async () => {
      const mockStorage = createMockStorage();
      const mockAPI = createMockTvaAPI();
      delete mockAPI.TVA_CONFIG;

      const service = new TVACacheService({
        getTvaAPI: () => mockAPI,
        getSetting: vi.fn(),
        storageService: mockStorage,
      });
      service.init();

      await expect(service._loadTVACacheFromFile()).rejects.toMatchObject({
        errorType: 'cache_load_failed',
        message: expect.any(String),
        recoverySuggestions: expect.any(Array),
      });
    });

    it('throws structured error when staticCache is disabled', async () => {
      const mockStorage = createMockStorage();
      const mockAPI = createMockTvaAPI({ TVA_CONFIG: { staticCache: false } });

      const service = new TVACacheService({
        getTvaAPI: () => mockAPI,
        getSetting: vi.fn(),
        storageService: mockStorage,
      });
      service.init();

      await expect(service._loadTVACacheFromFile()).rejects.toMatchObject({
        errorType: 'tva_cache_disabled',
      });
    });

    it('throws structured error when fetch fails (HTTP error)', async () => {
      const mockStorage = createMockStorage();
      const { service } = createInitializedService(mockStorage);

      vi.stubGlobal(
        'fetch',
        vi.fn(async () => createMockFetchResponse({}, false, 404))
      );

      await expect(service._loadTVACacheFromFile()).rejects.toMatchObject({
        errorType: 'network_error',
      });
    });

    it('throws structured error when JSON is invalid', async () => {
      const mockStorage = createMockStorage();
      const { service } = createInitializedService(mockStorage);

      vi.stubGlobal(
        'fetch',
        vi.fn(async () => ({
          ok: true,
          status: 200,
          json: vi.fn(async () => {
            throw new SyntaxError('Unexpected token');
          }),
          headers: { get: vi.fn(() => null) },
        }))
      );

      await expect(service._loadTVACacheFromFile()).rejects.toMatchObject({
        errorType: 'cache_load_failed',
      });
    });

    it('throws structured error when cache is empty (0 images)', async () => {
      const mockStorage = createMockStorage();
      const { service } = createInitializedService(mockStorage);

      // Cache with only metadata keys, no image arrays
      vi.stubGlobal(
        'fetch',
        vi.fn(async () => createMockFetchResponse({ version: '1.0' }))
      );

      await expect(service._loadTVACacheFromFile()).rejects.toMatchObject({
        errorType: 'tva_cache_empty',
      });
    });

    it('rejects cross-origin cache file URL', async () => {
      const mockStorage = createMockStorage();
      const mockAPI = createMockTvaAPI({
        TVA_CONFIG: { staticCache: true, staticCacheFile: 'https://evil.com/cache.json' },
      });
      const service = new TVACacheService({
        getTvaAPI: () => mockAPI,
        getSetting: vi.fn(),
        storageService: mockStorage,
      });
      service.init();

      await expect(service._loadTVACacheFromFile()).rejects.toMatchObject({
        errorType: 'invalid_cache_path',
      });
    });

    it('rejects protocol-relative cache file URL', async () => {
      const mockStorage = createMockStorage();
      const mockAPI = createMockTvaAPI({
        TVA_CONFIG: { staticCache: true, staticCacheFile: '//evil.com/cache.json' },
      });
      const service = new TVACacheService({
        getTvaAPI: () => mockAPI,
        getSetting: vi.fn(),
        storageService: mockStorage,
      });
      service.init();

      await expect(service._loadTVACacheFromFile()).rejects.toMatchObject({
        errorType: 'invalid_cache_path',
      });
    });

    it('calls fetch with credentials omitted', async () => {
      const mockStorage = createMockStorage();
      const { service } = createInitializedService(mockStorage);

      const cacheJson = { TestCategory: ['path/to/token.webp'] };
      const fetchSpy = vi.fn(async () => createMockFetchResponse(cacheJson));
      vi.stubGlobal('fetch', fetchSpy);

      await service._loadTVACacheFromFile();

      expect(fetchSpy).toHaveBeenCalledWith('data/tva-cache.json', { credentials: 'omit' });
    });
  });

  // =========================================================================
  // loadTVACache()
  // =========================================================================
  describe('loadTVACache()', () => {
    it('returns true immediately if already loaded', async () => {
      const mockStorage = createMockStorage();
      const { service } = createInitializedService(mockStorage);

      // Manually mark as loaded
      service.tvaCacheLoaded = true;

      const result = await service.loadTVACache();
      expect(result).toBe(true);
    });

    it('throws structured error if hasTVA is false', async () => {
      const service = new TVACacheService({
        getTvaAPI: () => null,
        storageService: createMockStorage(),
      });
      service.init();

      await expect(service.loadTVACache()).rejects.toMatchObject({
        errorType: 'tva_missing',
      });
    });

    it('promise deduplication: concurrent calls share same promise', async () => {
      const mockStorage = createMockStorage();
      const { service } = createInitializedService(mockStorage);

      vi.stubGlobal(
        'fetch',
        vi.fn(async () => createMockFetchResponse(MOCK_TVA_CACHE_JSON))
      );

      // Launch two concurrent loads
      const promise1 = service.loadTVACache();
      const promise2 = service.loadTVACache();

      // They should be the same promise object (via _loadPromise)
      const [result1, result2] = await Promise.all([promise1, promise2]);
      expect(result1).toBe(true);
      expect(result2).toBe(true);

      // fetch should only have been called once
      expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    });
  });

  // =========================================================================
  // searchTVACacheDirect()
  // =========================================================================
  describe('searchTVACacheDirect()', () => {
    /** Set up service with pre-populated searchable cache */
    function createServiceWithSearchableCache() {
      const service = new TVACacheService({
        getTvaAPI: () => createMockTvaAPI(),
        getSetting: vi.fn(),
        storageService: createMockStorage(),
      });
      service.init();

      // Manually populate searchable cache
      service.tvaCacheLoaded = true;
      service.tvaCacheSearchable = [
        { path: 'FA_Pack/Tokens/Humanoids/Bandit/Bandit_01.webp', name: 'Bandit', category: 'Humanoids' },
        { path: 'FA_Pack/Tokens/Humanoids/Bandit/Bandit_Captain_01.webp', name: 'Bandit Captain', category: 'Humanoids' },
        { path: 'FA_Pack/Tokens/Beasts/Wolf/Wolf_01.webp', name: 'Wolf', category: 'Beasts' },
        { path: 'FA_Pack/Tokens/Undead/Skeleton/Skeleton_01.webp', name: 'Skeleton', category: 'Undead' },
        { path: 'FA_Pack/Tokens/Dragons/Dragon_Red/Dragon_Red_Adult_01.webp', name: 'Dragon Red Adult', category: 'Dragons' },
      ];

      return service;
    }

    it('returns empty array when cache not loaded', async () => {
      const service = new TVACacheService({
        getTvaAPI: () => createMockTvaAPI(),
        storageService: createMockStorage(),
      });
      service.init();
      // tvaCacheLoaded is false by default

      const results = await service.searchTVACacheDirect('bandit');
      expect(results).toEqual([]);
    });

    it('returns empty array for empty search term', async () => {
      const service = createServiceWithSearchableCache();
      const results = await service.searchTVACacheDirect('');
      expect(results).toEqual([]);
    });

    it('matches on name (case-insensitive)', async () => {
      const service = createServiceWithSearchableCache();
      const results = await service.searchTVACacheDirect('WOLF');
      expect(results).toHaveLength(1);
      expect(results[0].name).toBe('Wolf');
    });

    it('matches on path (case-insensitive)', async () => {
      const service = createServiceWithSearchableCache();
      // "skeleton" appears in the path even if we search for it
      const results = await service.searchTVACacheDirect('skeleton');
      expect(results.length).toBeGreaterThanOrEqual(1);
      expect(results[0].path).toContain('Skeleton');
    });

    it('exact name match gets score 0, startsWith gets 0.1, includes gets 0.3', async () => {
      const service = createServiceWithSearchableCache();
      const results = await service.searchTVACacheDirect('bandit');

      // "Bandit" is exact match (score 0), "Bandit Captain" starts with (score 0.1)
      const exact = results.find((r) => r.name === 'Bandit');
      const startsWith = results.find((r) => r.name === 'Bandit Captain');

      expect(exact.score).toBe(0);
      expect(startsWith.score).toBe(0.1);
    });

    it('results sorted by score ascending (best matches first)', async () => {
      const service = createServiceWithSearchableCache();
      const results = await service.searchTVACacheDirect('bandit');

      expect(results.length).toBeGreaterThanOrEqual(2);
      for (let i = 1; i < results.length; i++) {
        expect(results[i].score).toBeGreaterThanOrEqual(results[i - 1].score);
      }
    });
  });

  // =========================================================================
  // searchTVACacheByCategory()
  // =========================================================================
  describe('searchTVACacheByCategory()', () => {
    function createServiceWithCategoryCache() {
      const service = new TVACacheService({
        getTvaAPI: () => createMockTvaAPI(),
        getSetting: vi.fn(),
        storageService: createMockStorage(),
      });
      service.init();

      service.tvaCacheLoaded = true;
      service.tvaCacheSearchable = [
        { path: 'FA_Pack/Tokens/Undead/Skeleton/Skeleton_01.webp', name: 'Skeleton', category: 'Undead' },
        { path: 'FA_Pack/Tokens/Undead/Zombie/Zombie_01.webp', name: 'Zombie', category: 'Undead' },
        { path: 'FA_Pack/Tokens/Humanoids/Bandit/Bandit_01.webp', name: 'Bandit', category: 'Humanoids' },
        { path: 'FA_Pack/Tokens/Beasts/Wolf/Wolf_01.webp', name: 'Wolf', category: 'Beasts' },
        // duplicate path to test deduplication
        { path: 'FA_Pack/Tokens/Undead/Skeleton/Skeleton_01.webp', name: 'Skeleton Duplicate', category: 'Dupes' },
      ];

      return service;
    }

    it('returns empty when cache not loaded', async () => {
      const service = new TVACacheService({
        getTvaAPI: () => createMockTvaAPI(),
        storageService: createMockStorage(),
      });
      service.init();
      const results = await service.searchTVACacheByCategory('undead');
      expect(results).toEqual([]);
    });

    it('returns empty for unknown category type', async () => {
      const service = createServiceWithCategoryCache();
      const results = await service.searchTVACacheByCategory('nonexistent_category_xyz');
      expect(results).toEqual([]);
    });

    it('matches using CREATURE_TYPE_MAPPINGS terms against name and path', async () => {
      const service = createServiceWithCategoryCache();
      // "undead" category includes terms like "skeleton", "zombie", "vampire", etc.
      const results = await service.searchTVACacheByCategory('undead');
      expect(results.length).toBeGreaterThanOrEqual(2);

      const names = results.map((r) => r.name);
      expect(names).toContain('Skeleton');
      expect(names).toContain('Zombie');
    });

    it('does NOT match against TVA folder category (img.category)', async () => {
      const service = new TVACacheService({
        getTvaAPI: () => createMockTvaAPI(),
        getSetting: vi.fn(),
        storageService: createMockStorage(),
      });
      service.init();

      service.tvaCacheLoaded = true;
      // This entry has category "Undead" but its name and path have no undead terms
      service.tvaCacheSearchable = [
        { path: 'FA_Pack/Tokens/Misc/Wisp_01.webp', name: 'Wisp', category: 'Undead' },
      ];

      const results = await service.searchTVACacheByCategory('undead');
      // "Wisp" should not match just because category says "Undead"
      expect(results).toHaveLength(0);
    });

    it('deduplicates results by path', async () => {
      const service = createServiceWithCategoryCache();
      const results = await service.searchTVACacheByCategory('undead');

      const paths = results.map((r) => r.path);
      const uniquePaths = [...new Set(paths)];
      expect(paths).toEqual(uniquePaths);
    });
  });

  // =========================================================================
  // searchTVACacheMultiple()
  // =========================================================================
  describe('searchTVACacheMultiple()', () => {
    function createServiceWithMultiCache() {
      const service = new TVACacheService({
        getTvaAPI: () => createMockTvaAPI(),
        getSetting: vi.fn(),
        storageService: createMockStorage(),
      });
      service.init();

      service.tvaCacheLoaded = true;
      service.tvaCacheSearchable = [
        { path: 'FA_Pack/Tokens/Humanoids/Bandit/Bandit_01.webp', name: 'Bandit', category: 'Humanoids' },
        { path: 'FA_Pack/Tokens/Beasts/Wolf/Wolf_01.webp', name: 'Wolf', category: 'Beasts' },
        { path: 'FA_Pack/Tokens/Undead/Skeleton/Skeleton_01.webp', name: 'Skeleton', category: 'Undead' },
      ];

      return service;
    }

    it('returns matches for any of the given terms (OR logic)', async () => {
      const service = createServiceWithMultiCache();
      const results = await service.searchTVACacheMultiple(['bandit', 'wolf']);

      expect(results).toHaveLength(2);
      const names = results.map((r) => r.name);
      expect(names).toContain('Bandit');
      expect(names).toContain('Wolf');
    });

    it('returns empty when no terms provided', async () => {
      const service = createServiceWithMultiCache();
      const results = await service.searchTVACacheMultiple([]);
      expect(results).toEqual([]);
    });

    it('deduplicates across terms', async () => {
      const service = createServiceWithMultiCache();
      // Both terms match "Bandit" (name and path)
      const results = await service.searchTVACacheMultiple(['bandit', 'Bandit_01']);

      const paths = results.map((r) => r.path);
      const uniquePaths = [...new Set(paths)];
      expect(paths).toEqual(uniquePaths);
    });
  });

  // =========================================================================
  // getTVACacheStats()
  // =========================================================================
  describe('getTVACacheStats()', () => {
    it('returns correct counts', () => {
      const service = new TVACacheService({
        getTvaAPI: () => createMockTvaAPI(),
        getSetting: vi.fn(),
        storageService: createMockStorage(),
      });
      service.init();

      // Populate manually
      service.tvaCacheLoaded = true;
      service.tvaCacheImages = [{ path: 'a' }, { path: 'b' }, { path: 'c' }];
      service.tvaCacheByCategory = { CatA: [1, 2], CatB: [3] };

      const stats = service.getTVACacheStats();
      expect(stats.loaded).toBe(true);
      expect(stats.totalImages).toBe(3);
      expect(stats.categories).toBe(2);
    });

    it('returns zero counts when cache not loaded', () => {
      const service = new TVACacheService({
        getTvaAPI: () => createMockTvaAPI(),
        getSetting: vi.fn(),
        storageService: createMockStorage(),
      });

      const stats = service.getTVACacheStats();
      expect(stats.loaded).toBe(false);
      expect(stats.totalImages).toBe(0);
      expect(stats.categories).toBe(0);
    });
  });

  // =========================================================================
  // isTVACacheLoaded getter
  // =========================================================================
  describe('isTVACacheLoaded', () => {
    it('returns false initially and true after loading', async () => {
      const mockStorage = createMockStorage();
      const { service } = createInitializedService(mockStorage);

      expect(service.isTVACacheLoaded).toBe(false);

      vi.stubGlobal(
        'fetch',
        vi.fn(async () => createMockFetchResponse(MOCK_TVA_CACHE_JSON))
      );

      await service._loadTVACacheFromFile();
      expect(service.isTVACacheLoaded).toBe(true);
    });
  });
});
