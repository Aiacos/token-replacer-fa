/**
 * IndexService comprehensive tests
 * Covers: DI smoke tests, createEmptyIndex, buildTermCategoryMap, categorizeImage,
 * tokenizeSearchText, addImageToIndex, loadFromCache, saveToCache, search methods,
 * and Worker vs direct path parity.
 *
 * @module tests/services/IndexService
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { IndexService } from '../../scripts/services/IndexService.js';
import { CREATURE_TYPE_MAPPINGS } from '../../scripts/core/Constants.js';

/**
 * Create a standard mock storage service for IndexService DI.
 * @returns {object} Mock storage with all required methods
 */
function createMockStorage() {
  return {
    load: vi.fn(async () => null),
    save: vi.fn(async () => true),
    remove: vi.fn(async () => true),
    needsMigration: vi.fn(async () => false),
    migrateFromLocalStorage: vi.fn(async () => {}),
  };
}

/**
 * Create an IndexService with all injected mocks.
 * @param {object} [overrides={}] - Override specific dependencies
 * @returns {IndexService}
 */
function createService(overrides = {}) {
  return new IndexService({
    storageService: createMockStorage(),
    workerFactory: vi.fn(),
    getSetting: vi.fn(),
    getTvaAPI: vi.fn(),
    ...overrides,
  });
}

describe('IndexService', () => {
  // -----------------------------------------------------------------------
  // Constructor DI (merged from IndexService.di.test.js)
  // -----------------------------------------------------------------------
  describe('constructor DI', () => {
    it('instantiates with injected deps without accessing Foundry globals', () => {
      const mockStorage = createMockStorage();
      const mockWorkerFactory = vi.fn();
      const mockGetSetting = vi.fn();
      const mockGetTvaAPI = vi.fn();

      const service = new IndexService({
        storageService: mockStorage,
        workerFactory: mockWorkerFactory,
        getSetting: mockGetSetting,
        getTvaAPI: mockGetTvaAPI,
      });

      expect(service).toBeInstanceOf(IndexService);
      expect(service._storageService).toBe(mockStorage);
      expect(service._workerFactory).toBe(mockWorkerFactory);
      expect(service._getSetting).toBe(mockGetSetting);
      expect(service._getTvaAPI).toBe(mockGetTvaAPI);
    });

    it('constructor does NOT call workerFactory (Worker is lazy)', () => {
      const mockWorkerFactory = vi.fn();

      new IndexService({
        storageService: createMockStorage(),
        workerFactory: mockWorkerFactory,
        getSetting: vi.fn(),
        getTvaAPI: vi.fn(),
      });

      expect(mockWorkerFactory).not.toHaveBeenCalled();
    });

    it('buildTermCategoryMap() works (pure logic, no globals)', () => {
      const service = createService();
      const map = service.termCategoryMap;

      expect(map).toBeInstanceOf(Map);
      expect(map.size).toBeGreaterThan(0);

      const wolfEntry = map.get('wolf');
      expect(wolfEntry).toBeDefined();
      expect(wolfEntry.category).toBe('beast');
    });

    it('default constructor (no args) does not throw at construction time', () => {
      expect(() => new IndexService()).not.toThrow();
    });
  });

  // -----------------------------------------------------------------------
  // createEmptyIndex()
  // -----------------------------------------------------------------------
  describe('createEmptyIndex()', () => {
    it('returns object with all required properties', () => {
      const service = createService();
      const index = service.createEmptyIndex();

      expect(index).toHaveProperty('version');
      expect(index).toHaveProperty('timestamp');
      expect(index).toHaveProperty('lastUpdate');
      expect(index).toHaveProperty('categories');
      expect(index).toHaveProperty('allPaths');
      expect(index).toHaveProperty('termIndex');
    });

    it('has version set to 14 (INDEX_VERSION)', () => {
      const service = createService();
      const index = service.createEmptyIndex();
      expect(index.version).toBe(14);
    });

    it('categories has keys for all CREATURE_TYPE_MAPPINGS entries', () => {
      const service = createService();
      const index = service.createEmptyIndex();
      const expectedCategories = Object.keys(CREATURE_TYPE_MAPPINGS);

      for (const cat of expectedCategories) {
        expect(index.categories).toHaveProperty(cat);
        expect(index.categories[cat]).toEqual({});
      }
    });

    it('allPaths and termIndex are empty objects', () => {
      const service = createService();
      const index = service.createEmptyIndex();

      expect(index.allPaths).toEqual({});
      expect(index.termIndex).toEqual({});
    });
  });

  // -----------------------------------------------------------------------
  // buildTermCategoryMap()
  // -----------------------------------------------------------------------
  describe('buildTermCategoryMap()', () => {
    it('returns Map with entries for all CREATURE_TYPE_MAPPINGS terms', () => {
      const service = createService();
      const map = service.termCategoryMap;

      // Count total terms across all categories
      let totalTerms = 0;
      const seenTerms = new Set();
      for (const terms of Object.values(CREATURE_TYPE_MAPPINGS)) {
        for (const term of terms) {
          const lower = term.toLowerCase();
          if (!seenTerms.has(lower)) {
            seenTerms.add(lower);
            totalTerms++;
          }
        }
      }

      expect(map.size).toBe(totalTerms);
    });

    it('maps wolf to beast category', () => {
      const service = createService();
      const entry = service.termCategoryMap.get('wolf');
      expect(entry).toBeDefined();
      expect(entry.category).toBe('beast');
    });

    it('maps zombie to undead category', () => {
      const service = createService();
      const entry = service.termCategoryMap.get('zombie');
      expect(entry).toBeDefined();
      expect(entry.category).toBe('undead');
    });

    it('maps elf to humanoid category', () => {
      const service = createService();
      const entry = service.termCategoryMap.get('elf');
      expect(entry).toBeDefined();
      expect(entry.category).toBe('humanoid');
    });

    it('each entry maps to { category, originalTerm }', () => {
      const service = createService();
      const entry = service.termCategoryMap.get('dragon');
      expect(entry).toHaveProperty('category', 'dragon');
      expect(entry).toHaveProperty('originalTerm', 'dragon');
    });
  });

  // -----------------------------------------------------------------------
  // categorizeImage()
  // -----------------------------------------------------------------------
  describe('categorizeImage()', () => {
    it('categorizes beast path correctly', () => {
      const service = createService();
      const result = service.categorizeImage(
        'FA_Pack/Tokens/Beasts/Wolf/Wolf_01.webp',
        'Wolf'
      );

      expect(result.category).toBe('beast');
      expect(result.subcategories).toContain('wolf');
    });

    it('categorizes humanoid path correctly', () => {
      const service = createService();
      const result = service.categorizeImage(
        'FA_Pack/Tokens/Humanoids/Bandit/Bandit_01.webp',
        'Bandit'
      );

      expect(result.category).toBe('humanoid');
      expect(result.subcategories).toContain('bandit');
    });

    it('returns null category for uncategorizable path', () => {
      const service = createService();
      const result = service.categorizeImage(
        'FA_Pack/Tokens/Misc/RandomThing_01.webp',
        'RandomThing'
      );

      expect(result.category).toBeNull();
      expect(result.subcategories).toEqual([]);
    });

    it('returns empty result for null path', () => {
      const service = createService();
      const result = service.categorizeImage(null, 'Name');

      expect(result.category).toBeNull();
      expect(result.subcategories).toEqual([]);
    });

    it('returns empty result for undefined path', () => {
      const service = createService();
      const result = service.categorizeImage(undefined, 'Name');

      expect(result.category).toBeNull();
      expect(result.subcategories).toEqual([]);
    });

    it('picks highest-count category when path matches multiple', () => {
      const service = createService();
      // "skeleton warrior" matches undead (skeleton) and humanoid (none strong),
      // so undead should win
      const result = service.categorizeImage(
        'FA_Pack/Tokens/Undead/Skeleton/Skeleton_Warrior_01.webp',
        'Skeleton Warrior'
      );

      expect(result.category).toBe('undead');
    });
  });

  // -----------------------------------------------------------------------
  // tokenizeSearchText()
  // -----------------------------------------------------------------------
  describe('tokenizeSearchText()', () => {
    it('splits by /, \\, -, _, space, dot', () => {
      const service = createService();
      const terms = service.tokenizeSearchText('a/b\\c-d_e f.g');

      expect(terms).toContain('a');
      expect(terms).toContain('b');
      expect(terms).toContain('c');
      expect(terms).toContain('d');
      expect(terms).toContain('e');
      expect(terms).toContain('f');
      expect(terms).toContain('g');
    });

    it('converts to lowercase', () => {
      const service = createService();
      const terms = service.tokenizeSearchText('WOLF/Bear');

      expect(terms).toContain('wolf');
      expect(terms).toContain('bear');
      expect(terms).not.toContain('WOLF');
      expect(terms).not.toContain('Bear');
    });

    it('returns unique terms', () => {
      const service = createService();
      const terms = service.tokenizeSearchText('wolf/wolf/wolf');

      expect(terms).toEqual(['wolf']);
    });

    it('returns empty array for null input', () => {
      const service = createService();
      expect(service.tokenizeSearchText(null)).toEqual([]);
    });

    it('returns empty array for empty string', () => {
      const service = createService();
      expect(service.tokenizeSearchText('')).toEqual([]);
    });
  });

  // -----------------------------------------------------------------------
  // addImageToIndex()
  // -----------------------------------------------------------------------
  describe('addImageToIndex()', () => {
    let service;

    beforeEach(() => {
      service = createService();
      service.index = service.createEmptyIndex();
    });

    it('adds image to allPaths with name, category, subcategories', () => {
      const result = service.addImageToIndex(
        'FA_Pack/Tokens/Beasts/Wolf/Wolf_01.webp',
        'Wolf'
      );

      expect(result).toBe(true);
      const entry = service.index.allPaths['FA_Pack/Tokens/Beasts/Wolf/Wolf_01.webp'];
      expect(entry).toBeDefined();
      expect(entry.name).toBe('Wolf');
      expect(entry.category).toBe('beast');
      expect(entry.subcategories).toContain('wolf');
    });

    it('adds search terms to termIndex', () => {
      service.addImageToIndex(
        'FA_Pack/Tokens/Beasts/Wolf/Wolf_01.webp',
        'Wolf'
      );

      expect(service.index.termIndex['wolf']).toContain(
        'FA_Pack/Tokens/Beasts/Wolf/Wolf_01.webp'
      );
    });

    it('adds to categories structure when categorizable', () => {
      service.addImageToIndex(
        'FA_Pack/Tokens/Beasts/Wolf/Wolf_01.webp',
        'Wolf'
      );

      expect(service.index.categories.beast.wolf).toBeDefined();
      expect(service.index.categories.beast.wolf.length).toBe(1);
      expect(service.index.categories.beast.wolf[0].path).toBe(
        'FA_Pack/Tokens/Beasts/Wolf/Wolf_01.webp'
      );
    });

    it('adds to _all subcategory', () => {
      service.addImageToIndex(
        'FA_Pack/Tokens/Beasts/Wolf/Wolf_01.webp',
        'Wolf'
      );

      expect(service.index.categories.beast._all).toBeDefined();
      expect(service.index.categories.beast._all.length).toBe(1);
    });

    it('returns false for null path', () => {
      expect(service.addImageToIndex(null, 'Name')).toBe(false);
    });

    it('returns false for undefined path', () => {
      expect(service.addImageToIndex(undefined, 'Name')).toBe(false);
    });

    it('returns false when index not initialized', () => {
      service.index = null;
      expect(
        service.addImageToIndex('FA_Pack/Tokens/Beasts/Wolf/Wolf_01.webp', 'Wolf')
      ).toBe(false);
    });

    it('skips already-indexed paths (returns false)', () => {
      const path = 'FA_Pack/Tokens/Beasts/Wolf/Wolf_01.webp';
      expect(service.addImageToIndex(path, 'Wolf')).toBe(true);
      expect(service.addImageToIndex(path, 'Wolf')).toBe(false);
    });

    it('extracts name from path when name not provided', () => {
      service.addImageToIndex('FA_Pack/Tokens/Beasts/Wolf/Wolf_Dire_01.webp');

      const entry = service.index.allPaths['FA_Pack/Tokens/Beasts/Wolf/Wolf_Dire_01.webp'];
      expect(entry).toBeDefined();
      expect(entry.name).toBe('Wolf Dire 01');
    });
  });

  // -----------------------------------------------------------------------
  // loadFromCache()
  // -----------------------------------------------------------------------
  describe('loadFromCache()', () => {
    it('returns true and sets index when storageService.load returns valid data', async () => {
      const mockStorage = createMockStorage();
      const validIndex = {
        version: 14,
        timestamp: Date.now(),
        lastUpdate: Date.now(),
        categories: { humanoid: {}, beast: {} },
        allPaths: { 'test/path.webp': { name: 'Test', category: 'beast', subcategories: [] } },
        termIndex: { test: ['test/path.webp'] },
      };
      mockStorage.load.mockResolvedValue(validIndex);

      const service = createService({ storageService: mockStorage });
      const result = await service.loadFromCache();

      expect(result).toBe(true);
      expect(service.index).toBe(validIndex);
    });

    it('returns false when storageService.load returns null', async () => {
      const mockStorage = createMockStorage();
      mockStorage.load.mockResolvedValue(null);

      const service = createService({ storageService: mockStorage });
      const result = await service.loadFromCache();

      expect(result).toBe(false);
    });

    it('returns false and removes cache when version mismatch', async () => {
      const mockStorage = createMockStorage();
      const staleIndex = {
        version: 10, // old version
        timestamp: Date.now(),
        lastUpdate: Date.now(),
        categories: {},
        allPaths: {},
        termIndex: {},
      };
      mockStorage.load.mockResolvedValue(staleIndex);

      const service = createService({ storageService: mockStorage });
      const result = await service.loadFromCache();

      expect(result).toBe(false);
      expect(mockStorage.remove).toHaveBeenCalled();
    });

    it('rebuilds termIndex from allPaths when termIndex is empty', async () => {
      const mockStorage = createMockStorage();
      const indexWithEmptyTermIndex = {
        version: 14,
        timestamp: Date.now(),
        lastUpdate: Date.now(),
        categories: { beast: {} },
        allPaths: {
          'FA_Pack/Tokens/Beasts/Wolf/Wolf_01.webp': {
            name: 'Wolf',
            category: 'beast',
            subcategories: ['wolf'],
          },
        },
        termIndex: {}, // empty - needs rebuild
      };
      mockStorage.load.mockResolvedValue(indexWithEmptyTermIndex);

      const service = createService({ storageService: mockStorage });
      const result = await service.loadFromCache();

      expect(result).toBe(true);
      // termIndex should now have entries
      expect(Object.keys(service.index.termIndex).length).toBeGreaterThan(0);
      expect(service.index.termIndex['wolf']).toContain(
        'FA_Pack/Tokens/Beasts/Wolf/Wolf_01.webp'
      );
      // Should also save the updated index back
      expect(mockStorage.save).toHaveBeenCalled();
    });

    it('returns false and cleans up on storageService error', async () => {
      const mockStorage = createMockStorage();
      mockStorage.load.mockRejectedValue(new Error('Storage failure'));

      const service = createService({ storageService: mockStorage });
      const result = await service.loadFromCache();

      expect(result).toBe(false);
      expect(mockStorage.remove).toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // saveToCache()
  // -----------------------------------------------------------------------
  describe('saveToCache()', () => {
    it('saves index to storageService', async () => {
      const mockStorage = createMockStorage();
      const service = createService({ storageService: mockStorage });
      service.index = service.createEmptyIndex();

      const result = await service.saveToCache();

      expect(result).toBe(true);
      expect(mockStorage.save).toHaveBeenCalled();
    });

    it('returns false when index is null', async () => {
      const service = createService();
      service.index = null;

      const result = await service.saveToCache();

      expect(result).toBe(false);
    });

    it('returns false on save error (QuotaExceededError handling)', async () => {
      const mockStorage = createMockStorage();
      const quotaError = new Error('Storage full');
      quotaError.name = 'QuotaExceededError';
      mockStorage.save.mockRejectedValue(quotaError);

      const service = createService({ storageService: mockStorage });
      service.index = service.createEmptyIndex();

      const result = await service.saveToCache();

      expect(result).toBe(false);
    });
  });

  // -----------------------------------------------------------------------
  // search()
  // -----------------------------------------------------------------------
  describe('search()', () => {
    it('returns paths from termIndex for matching term', () => {
      const service = createService();
      service.index = service.createEmptyIndex();
      service.addImageToIndex('FA_Pack/Tokens/Beasts/Wolf/Wolf_01.webp', 'Wolf');
      service.isBuilt = true;

      const results = service.search('wolf');

      expect(results.length).toBeGreaterThan(0);
      expect(results[0].path).toBe('FA_Pack/Tokens/Beasts/Wolf/Wolf_01.webp');
    });

    it('returns empty for non-matching term', () => {
      const service = createService();
      service.index = service.createEmptyIndex();
      service.addImageToIndex('FA_Pack/Tokens/Beasts/Wolf/Wolf_01.webp', 'Wolf');
      service.isBuilt = true;

      const results = service.search('nonexistent_xyzzy');

      expect(results).toEqual([]);
    });

    it('returns empty when index not built', () => {
      const service = createService();
      expect(service.search('wolf')).toEqual([]);
    });
  });

  // -----------------------------------------------------------------------
  // searchMultiple()
  // -----------------------------------------------------------------------
  describe('searchMultiple()', () => {
    it('returns aggregated results across multiple terms', () => {
      const service = createService();
      service.index = service.createEmptyIndex();
      service.addImageToIndex('FA_Pack/Tokens/Beasts/Wolf/Wolf_01.webp', 'Wolf');
      service.addImageToIndex('FA_Pack/Tokens/Beasts/Bear/Bear_01.webp', 'Bear');
      service.isBuilt = true;

      const results = service.searchMultiple(['wolf', 'bear']);

      expect(results.length).toBe(2);
      const paths = results.map((r) => r.path);
      expect(paths).toContain('FA_Pack/Tokens/Beasts/Wolf/Wolf_01.webp');
      expect(paths).toContain('FA_Pack/Tokens/Beasts/Bear/Bear_01.webp');
    });

    it('returns empty when index not built', () => {
      const service = createService();
      expect(service.searchMultiple(['wolf'])).toEqual([]);
    });
  });

  // -----------------------------------------------------------------------
  // searchByCategory()
  // -----------------------------------------------------------------------
  describe('searchByCategory()', () => {
    it('returns results for known category', () => {
      const service = createService();
      service.index = service.createEmptyIndex();
      service.addImageToIndex('FA_Pack/Tokens/Beasts/Wolf/Wolf_01.webp', 'Wolf');
      service.isBuilt = true;

      const results = service.searchByCategory('beast');

      expect(results.length).toBeGreaterThan(0);
      expect(results[0].category).toBe('beast');
    });

    it('returns empty for unknown category', () => {
      const service = createService();
      service.index = service.createEmptyIndex();
      service.isBuilt = true;

      const results = service.searchByCategory('nonexistent');

      expect(results).toEqual([]);
    });

    it('returns empty when index not built', () => {
      const service = createService();
      expect(service.searchByCategory('beast')).toEqual([]);
    });
  });

  // -----------------------------------------------------------------------
  // Worker fallback notification
  // -----------------------------------------------------------------------
  describe('worker fallback notification', () => {
    /**
     * Create a mock worker that fires an error when postMessage is called,
     * simulating a Worker crash for fallback testing.
     */
    function createCrashingWorker() {
      const worker = {
        postMessage: vi.fn(() => {
          if (worker._errorHandler) {
            worker._errorHandler({ message: 'Worker crashed' });
          }
        }),
        addEventListener: vi.fn((event, handler) => {
          if (event === 'message') worker._messageHandler = handler;
          if (event === 'error') worker._errorHandler = handler;
        }),
        removeEventListener: vi.fn(),
        terminate: vi.fn(),
        _messageHandler: null,
        _errorHandler: null,
      };
      return worker;
    }

    it('calls ui.notifications.warn when Worker fails and falls back to direct indexing', async () => {
      const mockWorker = createCrashingWorker();
      const service = createService({
        workerFactory: () => mockWorker,
        getTvaAPI: vi.fn(() => ({ fileCaches: {} })),
      });
      service.index = service.createEmptyIndex();

      ui.notifications.warn.mockClear();

      // Use buildFromTVA with pre-loaded cache to trigger worker path
      const tvaCacheImages = [
        { path: 'FA_Pack/Tokens/Beasts/Wolf/Wolf_01.webp', name: 'Wolf', category: 'beast' },
      ];
      const count = await service.buildFromTVA(null, tvaCacheImages);

      expect(count).toBeGreaterThan(0); // Fallback succeeded
      expect(ui.notifications.warn).toHaveBeenCalled();
      expect(service.worker).toBeNull(); // Worker disabled after fallback
    });

    it('sets worker to null after fallback', async () => {
      const mockWorker = createCrashingWorker();
      const service = createService({
        workerFactory: () => mockWorker,
        getTvaAPI: vi.fn(() => ({ fileCaches: {} })),
      });
      service.index = service.createEmptyIndex();

      const tvaCacheImages = [
        { path: 'FA_Pack/Tokens/Beasts/Wolf/Wolf_01.webp', name: 'Wolf', category: 'beast' },
      ];
      const count = await service.buildFromTVA(null, tvaCacheImages);

      expect(service.worker).toBeNull();
      expect(count).toBeGreaterThan(0);
    });
  });

  // -----------------------------------------------------------------------
  // terminate()
  // -----------------------------------------------------------------------
  describe('terminate()', () => {
    it('calls worker.terminate() and sets worker to null', () => {
      const mockWorker = { terminate: vi.fn() };
      const service = createService({
        workerFactory: () => mockWorker,
      });

      // Initialize worker
      service._ensureWorker();
      expect(service.worker).toBe(mockWorker);

      service.terminate();

      expect(mockWorker.terminate).toHaveBeenCalled();
      expect(service.worker).toBeNull();
    });

    it('is safe to call when no worker exists', () => {
      const service = createService();
      // No worker initialized
      expect(service.worker).toBeNull();
      expect(() => service.terminate()).not.toThrow();
    });
  });

  // -----------------------------------------------------------------------
  // Worker vs direct path parity (INTG-03)
  // -----------------------------------------------------------------------
  describe('Worker vs direct path parity (INTG-03)', () => {
    const testPaths = [
      { path: 'FA_Pack/Tokens/Beasts/Wolf/Wolf_01.webp', name: 'Wolf' },
      { path: 'FA_Pack/Tokens/Beasts/Bear/Bear_Brown_01.webp', name: 'Brown Bear' },
      { path: 'FA_Pack/Tokens/Humanoids/Bandit/Bandit_01.webp', name: 'Bandit' },
      { path: 'FA_Pack/Tokens/Undead/Skeleton/Skeleton_01.webp', name: 'Skeleton' },
      { path: 'FA_Pack/Tokens/Dragons/Dragon_Red/Dragon_Red_Adult_01.webp', name: 'Red Dragon' },
    ];

    it('indexPathsDirectly produces a valid index structure', async () => {
      const service = createService();
      service.index = service.createEmptyIndex();

      const count = await service.indexPathsDirectly(testPaths);

      expect(count).toBe(5);
      expect(Object.keys(service.index.allPaths).length).toBe(5);
      expect(Object.keys(service.index.termIndex).length).toBeGreaterThan(0);
    });

    it('indexPathsWithWorker produces matching structure via MockWorker', async () => {
      // Build the "expected" index via direct path first
      const directService = createService();
      directService.index = directService.createEmptyIndex();
      await directService.indexPathsDirectly(testPaths);

      // Now build via Worker path using MockWorker
      const mockWorkerInstance = new Worker('mock-url');
      const workerService = createService({
        workerFactory: () => mockWorkerInstance,
      });
      workerService.index = workerService.createEmptyIndex();

      // Intercept postMessage to simulate worker completing with same results
      mockWorkerInstance.postMessage = vi.fn(() => {
        // Simulate the worker completing with the direct-path results
        mockWorkerInstance._simulateMessage({
          type: 'complete',
          total: testPaths.length,
          imagesFound: testPaths.length,
          result: {
            categories: directService.index.categories,
            allPaths: directService.index.allPaths,
            termIndex: directService.index.termIndex,
          },
        });
      });

      // Initialize the worker
      workerService._ensureWorker();

      const count = await workerService.indexPathsWithWorker(testPaths);

      expect(count).toBe(testPaths.length);

      // Compare categories structure
      expect(Object.keys(workerService.index.categories).sort()).toEqual(
        Object.keys(directService.index.categories).sort()
      );

      // Compare allPaths keys
      expect(Object.keys(workerService.index.allPaths).sort()).toEqual(
        Object.keys(directService.index.allPaths).sort()
      );

      // Compare termIndex keys
      expect(Object.keys(workerService.index.termIndex).sort()).toEqual(
        Object.keys(directService.index.termIndex).sort()
      );
    });
  });
});
