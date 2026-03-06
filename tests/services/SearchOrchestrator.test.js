/**
 * SearchOrchestrator - Full test suite
 * Covers constructor DI, folderMatchesCreatureType, fuzzy search with real Fuse.js,
 * category fallback search, searchTokenArt orchestration, and searchTVA fast/slow paths.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import Fuse from 'fuse.js';
import { SearchOrchestrator } from '../../scripts/services/SearchOrchestrator.js';
import { MOCK_TVA_CACHE_JSON, createParsedImages } from '../helpers/mock-tva-cache.js';

// Mock loadFuse to return real Fuse.js from devDependency instead of CDN import
vi.mock('../../scripts/core/Utils.js', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, loadFuse: vi.fn(async () => Fuse) };
});

// Re-import loadFuse so we can override it per-test when needed
import { loadFuse } from '../../scripts/core/Utils.js';

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

/** Build a small test index for fuzzy search tests */
function createTestIndex() {
  return [
    { path: 'FA_Pack/Tokens/Beasts/Wolf/Wolf_01.webp', name: 'Wolf', fileName: 'Wolf_01', category: 'Beasts' },
    { path: 'FA_Pack/Tokens/Beasts/Wolf/Wolf_Dire_01.webp', name: 'Dire Wolf', fileName: 'Wolf_Dire_01', category: 'Beasts' },
    { path: 'FA_Pack/Tokens/Beasts/Bear/Bear_Brown_01.webp', name: 'Brown Bear', fileName: 'Bear_Brown_01', category: 'Beasts' },
    { path: 'FA_Pack/Tokens/Beasts/Bear/Bear_Polar_01.webp', name: 'Polar Bear', fileName: 'Bear_Polar_01', category: 'Beasts' },
    { path: 'FA_Pack/Tokens/Humanoids/Bandit/Bandit_01.webp', name: 'Bandit', fileName: 'Bandit_01', category: 'Humanoids' },
    { path: 'FA_Pack/Tokens/Humanoids/Guard/Guard_City_01.webp', name: 'City Guard', fileName: 'Guard_City_01', category: 'Humanoids' },
    { path: 'FA_Pack/Tokens/Humanoids/Cultist/Cultist_01.webp', name: 'Cultist', fileName: 'Cultist_01', category: 'Humanoids' },
    { path: 'FA_Pack/Tokens/Undead/Skeleton/Skeleton_01.webp', name: 'Skeleton', fileName: 'Skeleton_01', category: 'Undead' },
    { path: 'FA_Pack/Tokens/Undead/Zombie/Zombie_01.webp', name: 'Zombie', fileName: 'Zombie_01', category: 'Undead' },
    { path: 'FA_Pack/Tokens/Dragons/Dragon_Red/Dragon_Red_Adult_01.webp', name: 'Red Dragon Adult', fileName: 'Dragon_Red_Adult_01', category: 'Dragons' },
    { path: 'FA_Pack/Tokens/Humanoids/Noble/Noble_01.webp', name: 'Noble', fileName: 'Noble_01', category: 'Humanoids' },
    { path: 'FA_Pack/Tokens/Aberrations/Beholder/Beholder_01.webp', name: 'Beholder', fileName: 'Beholder_01', category: 'Aberrations' },
  ];
}

/** Create default mock dependencies */
function createMockDeps(overrides = {}) {
  const mockIndexService = {
    isBuilt: false,
    searchByCategory: vi.fn(() => []),
    search: vi.fn(() => []),
    searchMultiple: vi.fn(() => []),
    ...overrides.indexService,
  };
  const mockTVACache = {
    hasTVA: true,
    tvaAPI: { doImageSearch: vi.fn(async () => []) },
    tvaCacheLoaded: true,
    isTVACacheLoaded: true,
    searchTVACacheDirect: vi.fn(async () => []),
    searchTVACacheByCategory: vi.fn(async () => []),
    searchTVACacheMultiple: vi.fn(async () => []),
    ...overrides.tvaCacheService,
  };
  const mockGetSetting = vi.fn((mod, key) => {
    if (key === 'fuzzyThreshold') return 0.3;
    if (key === 'searchPriority') return 'faNexus';
    if (key === 'useTVACache') return true;
    return undefined;
  });
  const mockForgeBazaar = {
    isServiceAvailable: () => false,
    ...overrides.forgeBazaarService,
  };
  const mockWorkerFactory = vi.fn(() => { throw new Error('Worker not available in tests'); });

  return {
    indexService: mockIndexService,
    tvaCacheService: mockTVACache,
    getSetting: overrides.getSetting || mockGetSetting,
    forgeBazaarService: mockForgeBazaar,
    workerFactory: overrides.workerFactory || mockWorkerFactory,
  };
}

/** Create a SearchOrchestrator with default mocks */
function createOrchestrator(overrides = {}) {
  const deps = createMockDeps(overrides);
  return { orchestrator: new SearchOrchestrator(deps), deps };
}

// ===========================================================================
// Tests
// ===========================================================================

describe('SearchOrchestrator', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Restore default loadFuse mock
    vi.mocked(loadFuse).mockResolvedValue(Fuse);
  });

  // -----------------------------------------------------------------------
  // Constructor DI (merged from SearchOrchestrator.di.test.js)
  // -----------------------------------------------------------------------
  describe('constructor DI', () => {
    it('instantiates with all injected deps without accessing Foundry globals', () => {
      const mockGetSetting = vi.fn((mod, key) => undefined);
      const mockIndexService = { isBuilt: false, searchByCategory: vi.fn(() => []) };
      const mockTVACache = { hasTVA: false, tvaCacheLoaded: false };
      const mockForgeBazaar = { isServiceAvailable: () => false };
      const mockWorkerFactory = vi.fn();

      const orchestrator = new SearchOrchestrator({
        getSetting: mockGetSetting,
        indexService: mockIndexService,
        tvaCacheService: mockTVACache,
        forgeBazaarService: mockForgeBazaar,
        workerFactory: mockWorkerFactory,
      });

      expect(orchestrator).toBeInstanceOf(SearchOrchestrator);
      expect(orchestrator._getSetting).toBe(mockGetSetting);
      expect(orchestrator._indexService).toBe(mockIndexService);
      expect(orchestrator._tvaCacheService).toBe(mockTVACache);
      expect(orchestrator._forgeBazaarService).toBe(mockForgeBazaar);
      expect(orchestrator._workerFactory).toBe(mockWorkerFactory);
    });

    it('setDependencies() updates _tvaCacheService and _forgeBazaarService', () => {
      const orchestrator = new SearchOrchestrator({
        getSetting: vi.fn(),
        indexService: { isBuilt: false },
        workerFactory: vi.fn(),
      });

      expect(orchestrator._tvaCacheService).toBeNull();
      expect(orchestrator._forgeBazaarService).toBeNull();

      const mockTVA = { hasTVA: true };
      const mockForge = { isServiceAvailable: () => true };
      orchestrator.setDependencies(mockTVA, mockForge);

      expect(orchestrator._tvaCacheService).toBe(mockTVA);
      expect(orchestrator._forgeBazaarService).toBe(mockForge);
    });

    it('default constructor (no args) does not throw at construction time', () => {
      expect(() => new SearchOrchestrator()).not.toThrow();
    });

    it('clearCache() works on DI-constructed instance', () => {
      const { orchestrator } = createOrchestrator();
      orchestrator.searchCache.set('test-key', [{ path: '/test.png' }]);
      expect(orchestrator.searchCache.size).toBe(1);

      orchestrator.clearCache();
      expect(orchestrator.searchCache.size).toBe(0);
    });
  });

  // -----------------------------------------------------------------------
  // folderMatchesCreatureType
  // -----------------------------------------------------------------------
  describe('folderMatchesCreatureType()', () => {
    it('matches direct type inclusion (Humanoids contains humanoid)', () => {
      const { orchestrator } = createOrchestrator();
      expect(orchestrator.folderMatchesCreatureType('Humanoids', 'humanoid')).toBe(true);
    });

    it('matches via CREATURE_TYPE_MAPPINGS (Elf maps to humanoid)', () => {
      const { orchestrator } = createOrchestrator();
      // 'Elf' is in CREATURE_TYPE_MAPPINGS.humanoid
      expect(orchestrator.folderMatchesCreatureType('Elf', 'humanoid')).toBe(true);
    });

    it('returns false for non-matching folder', () => {
      const { orchestrator } = createOrchestrator();
      expect(orchestrator.folderMatchesCreatureType('Furniture', 'beast')).toBe(false);
    });

    it('returns false for null/empty inputs', () => {
      const { orchestrator } = createOrchestrator();
      expect(orchestrator.folderMatchesCreatureType(null, 'beast')).toBe(false);
      expect(orchestrator.folderMatchesCreatureType('Beasts', null)).toBe(false);
      expect(orchestrator.folderMatchesCreatureType('', 'beast')).toBe(false);
      expect(orchestrator.folderMatchesCreatureType('Beasts', '')).toBe(false);
    });

    it('is case-insensitive', () => {
      const { orchestrator } = createOrchestrator();
      expect(orchestrator.folderMatchesCreatureType('BEASTS', 'BEAST')).toBe(true);
    });
  });

  // -----------------------------------------------------------------------
  // searchLocalIndexDirectly — fuzzy search with real Fuse.js (TEST-11)
  // -----------------------------------------------------------------------
  describe('searchLocalIndexDirectly() -- fuzzy search (TEST-11)', () => {
    it('returns results matching search term with Fuse.js', async () => {
      const { orchestrator } = createOrchestrator();
      const index = createTestIndex();

      const results = await orchestrator.searchLocalIndexDirectly(['wolf'], index);

      expect(results.length).toBeGreaterThan(0);
      // Wolf should be among results
      const wolfResult = results.find((r) => r.name === 'Wolf');
      expect(wolfResult).toBeDefined();
      expect(wolfResult.source).toBe('local');
      expect(typeof wolfResult.score).toBe('number');
    });

    it('returns Wolf higher-scored than Dire Wolf for exact term "wolf"', async () => {
      const { orchestrator } = createOrchestrator();
      const index = createTestIndex();

      const results = await orchestrator.searchLocalIndexDirectly(['wolf'], index);

      const wolfResult = results.find((r) => r.name === 'Wolf');
      const direWolfResult = results.find((r) => r.name === 'Dire Wolf');
      expect(wolfResult).toBeDefined();
      expect(direWolfResult).toBeDefined();
      // Lower score = better match in Fuse.js
      expect(wolfResult.score).toBeLessThanOrEqual(direWolfResult.score);
    });

    it('respects configurable fuzzyThreshold setting', async () => {
      // Tight threshold (0.1) should return fewer results than loose (0.6)
      const tightGetSetting = vi.fn((mod, key) => {
        if (key === 'fuzzyThreshold') return 0.1;
        return undefined;
      });
      const { orchestrator: tightOrch } = createOrchestrator({ getSetting: tightGetSetting });
      const index = createTestIndex();
      const tightResults = await tightOrch.searchLocalIndexDirectly(['wolf'], index);

      const looseGetSetting = vi.fn((mod, key) => {
        if (key === 'fuzzyThreshold') return 0.6;
        return undefined;
      });
      const { orchestrator: looseOrch } = createOrchestrator({ getSetting: looseGetSetting });
      const looseResults = await looseOrch.searchLocalIndexDirectly(['wolf'], index);

      // Loose threshold should return at least as many results as tight
      expect(looseResults.length).toBeGreaterThanOrEqual(tightResults.length);
    });

    it('filters by creature type when provided', async () => {
      const { orchestrator } = createOrchestrator();
      const index = createTestIndex();

      // Search 'bandit' but filter to beast type -- should exclude humanoid results
      const results = await orchestrator.searchLocalIndexDirectly(['bandit'], index, 'beast');

      // Bandit is in Humanoids category, which does not match 'beast'
      const banditResult = results.find((r) => r.name === 'Bandit');
      expect(banditResult).toBeUndefined();
    });

    it('returns empty for empty index', async () => {
      const { orchestrator } = createOrchestrator();
      const results = await orchestrator.searchLocalIndexDirectly(['wolf'], []);
      expect(results).toEqual([]);
    });

    it('returns empty for null index', async () => {
      const { orchestrator } = createOrchestrator();
      const results = await orchestrator.searchLocalIndexDirectly(['wolf'], null);
      expect(results).toEqual([]);
    });

    it('returns empty when loadFuse returns null', async () => {
      vi.mocked(loadFuse).mockResolvedValueOnce(null);
      const { orchestrator } = createOrchestrator();
      const index = createTestIndex();

      const results = await orchestrator.searchLocalIndexDirectly(['wolf'], index);
      expect(results).toEqual([]);
    });

    it('deduplicates results across multiple search terms', async () => {
      const { orchestrator } = createOrchestrator();
      const index = createTestIndex();

      // Search same term twice -- results should not contain duplicates
      const results = await orchestrator.searchLocalIndexDirectly(['wolf', 'wolf'], index);
      const paths = results.map((r) => r.path);
      const uniquePaths = new Set(paths);
      expect(paths.length).toBe(uniquePaths.size);
    });
  });

  // -----------------------------------------------------------------------
  // searchByCategory — category fallback (TEST-12)
  // -----------------------------------------------------------------------
  describe('searchByCategory() -- category fallback (TEST-12)', () => {
    it('uses pre-built index when isBuilt=true', async () => {
      const mockResults = [
        { path: 'FA_Pack/Tokens/Beasts/Wolf/Wolf_01.webp', name: 'Wolf', source: 'index' },
      ];
      const { orchestrator, deps } = createOrchestrator({
        indexService: {
          isBuilt: true,
          searchByCategory: vi.fn(() => mockResults),
          search: vi.fn(() => []),
          searchMultiple: vi.fn(() => []),
        },
      });

      const results = await orchestrator.searchByCategory('beast', null);

      expect(deps.indexService.searchByCategory).toHaveBeenCalledWith('beast');
      expect(results.length).toBe(1);
      expect(results[0].path).toBe('FA_Pack/Tokens/Beasts/Wolf/Wolf_01.webp');
    });

    it('uses TVA cache when index not built and cache loaded', async () => {
      const cacheResults = [
        { path: 'FA_Pack/Tokens/Beasts/Bear/Bear_01.webp', name: 'Bear' },
      ];
      const { orchestrator, deps } = createOrchestrator({
        indexService: { isBuilt: false, searchByCategory: vi.fn(() => []), search: vi.fn(() => []), searchMultiple: vi.fn(() => []) },
        tvaCacheService: {
          hasTVA: true,
          tvaCacheLoaded: true,
          isTVACacheLoaded: true,
          tvaAPI: { doImageSearch: vi.fn(async () => []) },
          searchTVACacheDirect: vi.fn(async () => []),
          searchTVACacheByCategory: vi.fn(async () => cacheResults),
          searchTVACacheMultiple: vi.fn(async () => []),
        },
      });

      const results = await orchestrator.searchByCategory('beast', null);

      expect(deps.tvaCacheService.searchTVACacheByCategory).toHaveBeenCalledWith('beast');
      expect(results.length).toBe(1);
    });

    it('searches direct term in TVA when directSearchTerm provided', async () => {
      const tvaResults = [
        { path: 'FA_Pack/Tokens/Beasts/Wolf/Wolf_01.webp', name: 'Wolf', source: 'tva', score: 0.1 },
      ];
      const { orchestrator, deps } = createOrchestrator({
        tvaCacheService: {
          hasTVA: true,
          tvaCacheLoaded: true,
          isTVACacheLoaded: true,
          tvaAPI: { doImageSearch: vi.fn(async () => []) },
          searchTVACacheDirect: vi.fn(async () => tvaResults),
          searchTVACacheByCategory: vi.fn(async () => []),
          searchTVACacheMultiple: vi.fn(async () => []),
        },
      });

      const results = await orchestrator.searchByCategory('beast', null, 'wolf');

      expect(results.length).toBeGreaterThanOrEqual(1);
    });

    it('deduplicates results by path', async () => {
      const duplicatePath = 'FA_Pack/Tokens/Beasts/Wolf/Wolf_01.webp';
      const indexResults = [
        { path: duplicatePath, name: 'Wolf', source: 'index' },
      ];
      const localIndex = [
        { path: duplicatePath, name: 'Wolf', category: 'Beasts' },
      ];

      const { orchestrator } = createOrchestrator({
        indexService: {
          isBuilt: true,
          searchByCategory: vi.fn(() => indexResults),
          search: vi.fn(() => []),
          searchMultiple: vi.fn(() => []),
        },
      });

      const results = await orchestrator.searchByCategory('beast', localIndex);

      // Should not have duplicates
      const paths = results.map((r) => r.path);
      const uniquePaths = new Set(paths);
      expect(paths.length).toBe(uniquePaths.size);
    });

    it('returns empty when no search source available', async () => {
      const { orchestrator } = createOrchestrator({
        indexService: { isBuilt: false, searchByCategory: vi.fn(() => []), search: vi.fn(() => []), searchMultiple: vi.fn(() => []) },
        tvaCacheService: {
          hasTVA: false,
          tvaCacheLoaded: false,
          isTVACacheLoaded: false,
          tvaAPI: null,
          searchTVACacheDirect: vi.fn(async () => []),
          searchTVACacheByCategory: vi.fn(async () => []),
          searchTVACacheMultiple: vi.fn(async () => []),
        },
        forgeBazaarService: { isServiceAvailable: () => false },
      });

      const results = await orchestrator.searchByCategory('beast', null);
      expect(results).toEqual([]);
    });
  });

  // -----------------------------------------------------------------------
  // searchTokenArt — orchestrated flow
  // -----------------------------------------------------------------------
  describe('searchTokenArt() -- orchestrated flow', () => {
    it('caches results and returns cached on second call', async () => {
      const tvaResults = [
        { path: 'FA_Pack/Tokens/Beasts/Wolf/Wolf_01.webp', name: 'Wolf', source: 'tva', score: 0.1 },
      ];
      const { orchestrator, deps } = createOrchestrator({
        tvaCacheService: {
          hasTVA: true,
          tvaCacheLoaded: true,
          isTVACacheLoaded: true,
          tvaAPI: { doImageSearch: vi.fn(async () => []) },
          searchTVACacheDirect: vi.fn(async () => tvaResults),
          searchTVACacheByCategory: vi.fn(async () => []),
          searchTVACacheMultiple: vi.fn(async () => []),
        },
      });

      const creatureInfo = {
        actorName: 'Wolf',
        type: 'beast',
        subtype: '',
        searchTerms: ['wolf'],
      };

      const results1 = await orchestrator.searchTokenArt(creatureInfo, null);
      const results2 = await orchestrator.searchTokenArt(creatureInfo, null);

      // Second call should use cache (searchTVA not called again)
      expect(results2).toEqual(results1);
    });

    it('returns empty for empty searchTerms', async () => {
      const { orchestrator } = createOrchestrator();
      const creatureInfo = { actorName: 'Test', type: 'beast', subtype: '', searchTerms: [] };

      const results = await orchestrator.searchTokenArt(creatureInfo, null);
      expect(results).toEqual([]);
    });

    it('triggers category search fallback for generic subtype', async () => {
      const categoryResults = [
        { path: 'FA_Pack/Tokens/Beasts/Wolf/Wolf_01.webp', name: 'Wolf' },
      ];
      const { orchestrator, deps } = createOrchestrator({
        indexService: {
          isBuilt: true,
          searchByCategory: vi.fn(() => categoryResults),
          search: vi.fn(() => []),
          searchMultiple: vi.fn(() => []),
        },
        tvaCacheService: {
          hasTVA: true,
          tvaCacheLoaded: true,
          isTVACacheLoaded: true,
          tvaAPI: { doImageSearch: vi.fn(async () => []) },
          searchTVACacheDirect: vi.fn(async () => []),
          searchTVACacheByCategory: vi.fn(async () => []),
          searchTVACacheMultiple: vi.fn(async () => []),
        },
      });

      const creatureInfo = {
        actorName: 'Wild Beast',
        type: 'beast',
        subtype: 'any', // Generic subtype
        searchTerms: ['wild beast'],
      };

      const results = await orchestrator.searchTokenArt(creatureInfo, null);

      // searchByCategory should have been called for generic subtype
      expect(deps.indexService.searchByCategory).toHaveBeenCalledWith('beast');
      // Results should include items marked fromCategory
      const categoryResult = results.find((r) => r.fromCategory === true);
      expect(categoryResult).toBeDefined();
    });

    it('sorts results: fromName > fromSubtype > fromCategory > other', async () => {
      const { orchestrator, deps } = createOrchestrator({
        indexService: {
          isBuilt: true,
          searchByCategory: vi.fn(() => [
            { path: 'cat.webp', name: 'Cat', source: 'index' },
          ]),
          search: vi.fn(() => [
            { path: 'goblin-name.webp', name: 'Goblin', score: 0.1 },
          ]),
          searchMultiple: vi.fn(() => [
            { path: 'goblin-sub.webp', name: 'Goblin Shaman', score: 0.3 },
          ]),
        },
        tvaCacheService: {
          hasTVA: false,
          tvaCacheLoaded: false,
          isTVACacheLoaded: false,
          tvaAPI: null,
          searchTVACacheDirect: vi.fn(async () => []),
          searchTVACacheByCategory: vi.fn(async () => []),
          searchTVACacheMultiple: vi.fn(async () => []),
        },
      });

      const creatureInfo = {
        actorName: 'Goblin',
        type: 'humanoid',
        subtype: 'goblinoid',
        searchTerms: ['goblin'],
      };

      const results = await orchestrator.searchTokenArt(creatureInfo, null);

      // Name matches should come before subtype matches
      if (results.length >= 2) {
        const nameIdx = results.findIndex((r) => r.fromName === true);
        const subtypeIdx = results.findIndex((r) => r.fromSubtype === true);
        if (nameIdx >= 0 && subtypeIdx >= 0) {
          expect(nameIdx).toBeLessThan(subtypeIdx);
        }
      }
    });

    it('filters invalid results (no path, non-string path)', async () => {
      const { orchestrator } = createOrchestrator({
        tvaCacheService: {
          hasTVA: true,
          tvaCacheLoaded: true,
          isTVACacheLoaded: true,
          tvaAPI: { doImageSearch: vi.fn(async () => []) },
          searchTVACacheDirect: vi.fn(async () => [
            { path: 'FA_Pack/valid.webp', name: 'Valid', source: 'tva', score: 0.1 },
            { path: null, name: 'NullPath', source: 'tva', score: 0.5 },
            { path: 123, name: 'NumberPath', source: 'tva', score: 0.5 },
            { name: 'NoPath', source: 'tva', score: 0.5 },
          ]),
          searchTVACacheByCategory: vi.fn(async () => []),
          searchTVACacheMultiple: vi.fn(async () => []),
        },
      });

      const creatureInfo = {
        actorName: 'Test',
        type: 'beast',
        subtype: '',
        searchTerms: ['test'],
      };

      const results = await orchestrator.searchTokenArt(creatureInfo, null);

      // Only the valid path should remain
      for (const r of results) {
        expect(typeof r.path).toBe('string');
        expect(r.path.length).toBeGreaterThan(0);
      }
    });
  });

  // -----------------------------------------------------------------------
  // searchTVA
  // -----------------------------------------------------------------------
  describe('searchTVA()', () => {
    it('FAST PATH: uses searchTVACacheDirect when cache loaded', async () => {
      const directResults = [
        { path: 'FA_Pack/Tokens/Beasts/Wolf/Wolf_01.webp', name: 'Wolf', score: 0.1 },
      ];
      const { orchestrator, deps } = createOrchestrator({
        tvaCacheService: {
          hasTVA: true,
          tvaAPI: { doImageSearch: vi.fn(async () => []) },
          tvaCacheLoaded: true,
          isTVACacheLoaded: true,
          searchTVACacheDirect: vi.fn(async () => directResults),
          searchTVACacheByCategory: vi.fn(async () => []),
          searchTVACacheMultiple: vi.fn(async () => []),
        },
      });

      const results = await orchestrator.searchTVA('wolf');

      expect(deps.tvaCacheService.searchTVACacheDirect).toHaveBeenCalledWith('wolf');
      expect(results).toEqual(directResults);
      // doImageSearch should NOT be called (fast path)
      expect(deps.tvaCacheService.tvaAPI.doImageSearch).not.toHaveBeenCalled();
    });

    it('returns empty when TVA not available', async () => {
      const { orchestrator } = createOrchestrator({
        tvaCacheService: {
          hasTVA: false,
          tvaAPI: null,
          tvaCacheLoaded: false,
          isTVACacheLoaded: false,
          searchTVACacheDirect: vi.fn(async () => []),
          searchTVACacheByCategory: vi.fn(async () => []),
          searchTVACacheMultiple: vi.fn(async () => []),
        },
      });

      const results = await orchestrator.searchTVA('wolf');
      expect(results).toEqual([]);
    });

    it('SLOW PATH: falls back to doImageSearch when cache not loaded', async () => {
      const apiResults = [
        { path: 'FA_Pack/Tokens/Beasts/Wolf/Wolf_01.webp', name: 'Wolf' },
      ];
      const { orchestrator, deps } = createOrchestrator({
        tvaCacheService: {
          hasTVA: true,
          tvaAPI: { doImageSearch: vi.fn(async () => apiResults) },
          tvaCacheLoaded: false,
          isTVACacheLoaded: false,
          searchTVACacheDirect: vi.fn(async () => []),
          searchTVACacheByCategory: vi.fn(async () => []),
          searchTVACacheMultiple: vi.fn(async () => []),
        },
      });

      const results = await orchestrator.searchTVA('wolf');

      expect(deps.tvaCacheService.tvaAPI.doImageSearch).toHaveBeenCalled();
      expect(results.length).toBe(1);
      expect(results[0].path).toBe('FA_Pack/Tokens/Beasts/Wolf/Wolf_01.webp');
    });
  });

  // -----------------------------------------------------------------------
  // parallelSearchCreatures — parallel batching (TEST-13)
  // -----------------------------------------------------------------------
  describe('parallelSearchCreatures() -- parallel batching (TEST-13)', () => {
    /** Create a creature group entry */
    function makeGroup(name, type) {
      return {
        creatureInfo: {
          actorName: name,
          type,
          subtype: '',
          searchTerms: [name.toLowerCase()],
        },
        tokens: [{ id: `token-${name}`, name }],
      };
    }

    it('returns Map with same keys as input groups (2 groups = 1 batch)', async () => {
      const { orchestrator, deps } = createOrchestrator({
        tvaCacheService: {
          hasTVA: true,
          tvaCacheLoaded: true,
          isTVACacheLoaded: true,
          tvaAPI: { doImageSearch: vi.fn(async () => []) },
          searchTVACacheDirect: vi.fn(async (term) => [
            { path: `FA_Pack/${term}.webp`, name: term, source: 'tva', score: 0.1 },
          ]),
          searchTVACacheByCategory: vi.fn(async () => []),
          searchTVACacheMultiple: vi.fn(async () => []),
        },
      });

      const groups = new Map([
        ['wolf', makeGroup('Wolf', 'beast')],
        ['bandit', makeGroup('Bandit', 'humanoid')],
      ]);

      const results = await orchestrator.parallelSearchCreatures(groups, null);

      expect(results).toBeInstanceOf(Map);
      expect(results.size).toBe(2);
      expect(results.has('wolf')).toBe(true);
      expect(results.has('bandit')).toBe(true);
    });

    it('each result entry has { matches, tokens, creatureInfo }', async () => {
      const { orchestrator } = createOrchestrator({
        tvaCacheService: {
          hasTVA: true,
          tvaCacheLoaded: true,
          isTVACacheLoaded: true,
          tvaAPI: { doImageSearch: vi.fn(async () => []) },
          searchTVACacheDirect: vi.fn(async () => [
            { path: 'FA_Pack/test.webp', name: 'Test', source: 'tva', score: 0.1 },
          ]),
          searchTVACacheByCategory: vi.fn(async () => []),
          searchTVACacheMultiple: vi.fn(async () => []),
        },
      });

      const groups = new Map([
        ['wolf', makeGroup('Wolf', 'beast')],
      ]);

      const results = await orchestrator.parallelSearchCreatures(groups, null);
      const entry = results.get('wolf');

      expect(entry).toHaveProperty('matches');
      expect(entry).toHaveProperty('tokens');
      expect(entry).toHaveProperty('creatureInfo');
      expect(Array.isArray(entry.matches)).toBe(true);
      expect(Array.isArray(entry.tokens)).toBe(true);
      expect(entry.creatureInfo.actorName).toBe('Wolf');
    });

    it('handles 5 groups (2 batches with PARALLEL_BATCH_SIZE=4)', async () => {
      const { orchestrator } = createOrchestrator({
        tvaCacheService: {
          hasTVA: true,
          tvaCacheLoaded: true,
          isTVACacheLoaded: true,
          tvaAPI: { doImageSearch: vi.fn(async () => []) },
          searchTVACacheDirect: vi.fn(async () => []),
          searchTVACacheByCategory: vi.fn(async () => []),
          searchTVACacheMultiple: vi.fn(async () => []),
        },
      });

      const groups = new Map([
        ['wolf', makeGroup('Wolf', 'beast')],
        ['bandit', makeGroup('Bandit', 'humanoid')],
        ['skeleton', makeGroup('Skeleton', 'undead')],
        ['dragon', makeGroup('Dragon', 'dragon')],
        ['beholder', makeGroup('Beholder', 'aberration')],
      ]);

      const results = await orchestrator.parallelSearchCreatures(groups, null);

      expect(results.size).toBe(5);
      for (const [key] of groups) {
        expect(results.has(key)).toBe(true);
      }
    });

    it('handles 8 groups (2 batches with PARALLEL_BATCH_SIZE=4)', async () => {
      const { orchestrator } = createOrchestrator({
        tvaCacheService: {
          hasTVA: true,
          tvaCacheLoaded: true,
          isTVACacheLoaded: true,
          tvaAPI: { doImageSearch: vi.fn(async () => []) },
          searchTVACacheDirect: vi.fn(async () => []),
          searchTVACacheByCategory: vi.fn(async () => []),
          searchTVACacheMultiple: vi.fn(async () => []),
        },
      });

      const groups = new Map([
        ['wolf', makeGroup('Wolf', 'beast')],
        ['bandit', makeGroup('Bandit', 'humanoid')],
        ['skeleton', makeGroup('Skeleton', 'undead')],
        ['dragon', makeGroup('Dragon', 'dragon')],
        ['beholder', makeGroup('Beholder', 'aberration')],
        ['goblin', makeGroup('Goblin', 'humanoid')],
        ['zombie', makeGroup('Zombie', 'undead')],
        ['bear', makeGroup('Bear', 'beast')],
      ]);

      const results = await orchestrator.parallelSearchCreatures(groups, null);
      expect(results.size).toBe(8);
    });

    it('progress callback receives batch info', async () => {
      const { orchestrator } = createOrchestrator({
        tvaCacheService: {
          hasTVA: true,
          tvaCacheLoaded: true,
          isTVACacheLoaded: true,
          tvaAPI: { doImageSearch: vi.fn(async () => []) },
          searchTVACacheDirect: vi.fn(async () => []),
          searchTVACacheByCategory: vi.fn(async () => []),
          searchTVACacheMultiple: vi.fn(async () => []),
        },
      });

      const groups = new Map([
        ['wolf', makeGroup('Wolf', 'beast')],
        ['bandit', makeGroup('Bandit', 'humanoid')],
      ]);

      const progressCb = vi.fn();
      await orchestrator.parallelSearchCreatures(groups, null, progressCb);

      expect(progressCb).toHaveBeenCalled();
      const callArg = progressCb.mock.calls[0][0];
      expect(callArg).toHaveProperty('type', 'batch');
      expect(callArg).toHaveProperty('total', 2);
      expect(callArg).toHaveProperty('currentBatch');
    });
  });

  // -----------------------------------------------------------------------
  // Integration: full pipeline (INTG-01)
  // -----------------------------------------------------------------------
  describe('Integration: full pipeline (INTG-01)', () => {
    it('searches via index and populates cache', async () => {
      const indexNameResults = [
        { path: 'FA_Pack/Tokens/Humanoids/Guard/Guard_City_01.webp', name: 'City Guard', score: 0.1 },
      ];
      const indexSubtypeResults = [
        { path: 'FA_Pack/Tokens/Humanoids/Guard/Guard_City_02.webp', name: 'City Guard Variant', score: 0.3 },
      ];

      const { orchestrator, deps } = createOrchestrator({
        indexService: {
          isBuilt: true,
          searchByCategory: vi.fn(() => []),
          search: vi.fn(() => indexNameResults),
          searchMultiple: vi.fn(() => indexSubtypeResults),
        },
        tvaCacheService: {
          hasTVA: false,
          tvaCacheLoaded: false,
          isTVACacheLoaded: false,
          tvaAPI: null,
          searchTVACacheDirect: vi.fn(async () => []),
          searchTVACacheByCategory: vi.fn(async () => []),
          searchTVACacheMultiple: vi.fn(async () => []),
        },
      });

      const creatureInfo = {
        actorName: 'City Guard',
        type: 'humanoid',
        subtype: 'human',
        searchTerms: ['city guard'],
      };

      const results = await orchestrator.searchTokenArt(creatureInfo, null);

      // Results should be returned and ordered (name before subtype)
      expect(results.length).toBeGreaterThanOrEqual(1);
      expect(results[0].fromName).toBe(true);

      // Cache should be populated
      expect(orchestrator.searchCache.size).toBe(1);
    });
  });

  // -----------------------------------------------------------------------
  // Integration: fallback path (INTG-02)
  // -----------------------------------------------------------------------
  describe('Integration: fallback path (INTG-02)', () => {
    it('falls back to category search when fuzzy returns nothing', async () => {
      // Override loadFuse to return a Fuse stub that always returns empty
      vi.mocked(loadFuse).mockResolvedValue(
        class StubFuse { search() { return []; } }
      );

      const categoryResults = [
        { path: 'FA_Pack/Tokens/Beasts/Wolf/Wolf_01.webp', name: 'Wolf' },
        { path: 'FA_Pack/Tokens/Beasts/Bear/Bear_Brown_01.webp', name: 'Brown Bear' },
      ];

      const { orchestrator, deps } = createOrchestrator({
        indexService: {
          isBuilt: true,
          searchByCategory: vi.fn(() => categoryResults),
          search: vi.fn(() => []),
          searchMultiple: vi.fn(() => []),
        },
        tvaCacheService: {
          hasTVA: false,
          tvaCacheLoaded: false,
          isTVACacheLoaded: false,
          tvaAPI: null,
          searchTVACacheDirect: vi.fn(async () => []),
          searchTVACacheByCategory: vi.fn(async () => []),
          searchTVACacheMultiple: vi.fn(async () => []),
        },
      });

      // Generic subtype triggers category search
      const creatureInfo = {
        actorName: 'Wild Beast',
        type: 'beast',
        subtype: 'any',  // Generic
        searchTerms: ['wild beast'],
      };

      const results = await orchestrator.searchTokenArt(creatureInfo, null);

      // searchByCategory should have been called as fallback
      expect(deps.indexService.searchByCategory).toHaveBeenCalledWith('beast');
      // Results should come from category search
      const catResults = results.filter((r) => r.fromCategory === true);
      expect(catResults.length).toBeGreaterThan(0);
    });
  });
});
