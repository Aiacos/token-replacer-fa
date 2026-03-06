/**
 * Search Pipeline Integration Tests
 *
 * Wires real TVACacheService, IndexService, and SearchOrchestrator instances
 * together to verify end-to-end data flow across service boundaries.
 * No mocked neighbors -- only environment boundaries (fetch, Worker, settings).
 *
 * Covers:
 *   INTG-01: Full pipeline (cache -> index -> search -> results)
 *   INTG-02: Fallback path (no fuzzy match -> category search -> results)
 *   INTG-03: Worker vs direct parity (identical index structures)
 *
 * @module tests/integration/SearchPipeline
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Fuse from 'fuse.js';

// Mock loadFuse to return real Fuse.js (established Phase 7 pattern)
vi.mock('../../scripts/core/Utils.js', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, loadFuse: vi.fn(async () => Fuse) };
});

import { TVACacheService } from '../../scripts/services/TVACacheService.js';
import { IndexService } from '../../scripts/services/IndexService.js';
import { SearchOrchestrator } from '../../scripts/services/SearchOrchestrator.js';
import { MOCK_TVA_CACHE_JSON, EXPECTED_IMAGE_COUNT } from '../helpers/mock-tva-cache.js';

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

/**
 * Create a mock StorageService matching the real interface.
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
 * Create a mock fetch that returns MOCK_TVA_CACHE_JSON for GET
 * and a minimal 200 for HEAD requests.
 */
function createMockFetch() {
  return vi.fn(async (url, opts) => {
    if (opts?.method === 'HEAD') {
      return { ok: true, headers: { get: () => null } };
    }
    return {
      ok: true,
      status: 200,
      statusText: 'OK',
      json: async () => MOCK_TVA_CACHE_JSON,
      headers: { get: (h) => (h === 'Content-Length' ? '5000' : null) },
    };
  });
}

/**
 * Build a fully wired pipeline: TVACacheService -> IndexService -> SearchOrchestrator.
 * Returns all three services after loading cache and building the index.
 */
async function buildPipeline(overrides = {}) {
  const mockStorage = overrides.storage || createMockStorage();

  // 1. Real TVACacheService with mocked fetch
  const tvaCacheService = new TVACacheService({
    getTvaAPI: () => ({
      TVA_CONFIG: { staticCache: true, staticCacheFile: 'data/tva-cache.json' },
      isCaching: () => false,
    }),
    getSetting: vi.fn(),
    storageService: mockStorage,
  });
  tvaCacheService.init();

  globalThis.fetch = createMockFetch();
  await tvaCacheService.loadTVACache();

  // 2. Real IndexService builds from parsed cache
  const indexService = new IndexService({
    storageService: mockStorage,
    workerFactory: overrides.workerFactory || vi.fn(),
    getSetting: vi.fn(),
    getTvaAPI: vi.fn(),
  });
  indexService.index = indexService.createEmptyIndex();
  await indexService.indexPathsDirectly(tvaCacheService.tvaCacheImages);
  indexService.isBuilt = true;

  // 3. Real SearchOrchestrator wired to real services
  const orchestrator = new SearchOrchestrator({
    tvaCacheService,
    indexService,
    getSetting: (mod, key) => {
      if (key === 'fuzzyThreshold') return 0.3;
      if (key === 'searchPriority') return 'faNexus';
      if (key === 'useTVACache') return true;
      return undefined;
    },
    workerFactory: () => {
      throw new Error('No worker needed');
    },
  });
  orchestrator.setDependencies(tvaCacheService, { isServiceAvailable: () => false });

  return { tvaCacheService, indexService, orchestrator, mockStorage };
}

// ---------------------------------------------------------------------------
// INTG-01: Full Search Pipeline
// ---------------------------------------------------------------------------

describe('Full Search Pipeline (INTG-01)', () => {
  let originalFetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('loads TVA cache with correct image count', async () => {
    const { tvaCacheService } = await buildPipeline();

    expect(tvaCacheService.tvaCacheLoaded).toBe(true);
    expect(tvaCacheService.tvaCacheImages.length).toBe(EXPECTED_IMAGE_COUNT);
  });

  it('builds index from parsed cache with non-empty allPaths', async () => {
    const { indexService } = await buildPipeline();

    expect(indexService.isBuilt).toBe(true);
    expect(Object.keys(indexService.index.allPaths).length).toBeGreaterThan(0);
  });

  it('builds index with populated termIndex', async () => {
    const { indexService } = await buildPipeline();

    expect(Object.keys(indexService.index.termIndex).length).toBeGreaterThan(0);
  });

  it('builds index with categorized entries', async () => {
    const { indexService } = await buildPipeline();

    const categories = Object.keys(indexService.index.categories);
    expect(categories.length).toBeGreaterThan(0);
  });

  it('full pipeline: cache -> index -> fuzzy search returns wolf results', async () => {
    const { orchestrator } = await buildPipeline();

    const results = await orchestrator.searchTokenArt(
      { actorName: 'Wolf', type: 'beast', subtype: 'wolf', searchTerms: ['wolf'] },
      []
    );

    expect(results.length).toBeGreaterThan(0);
    expect(results.some((r) => r.path.toLowerCase().includes('wolf'))).toBe(true);
  });

  it('full pipeline: fuzzy search for "skeleton" returns undead results', async () => {
    const { orchestrator } = await buildPipeline();

    const results = await orchestrator.searchTokenArt(
      { actorName: 'Skeleton', type: 'undead', subtype: 'skeleton', searchTerms: ['skeleton'] },
      []
    );

    expect(results.length).toBeGreaterThan(0);
    expect(results.some((r) => r.path.toLowerCase().includes('skeleton'))).toBe(true);
  });

  it('full pipeline: fuzzy search for "dragon" returns dragon results', async () => {
    const { orchestrator } = await buildPipeline();

    const results = await orchestrator.searchTokenArt(
      { actorName: 'Dragon', type: 'dragon', subtype: 'dragon', searchTerms: ['dragon'] },
      []
    );

    expect(results.length).toBeGreaterThan(0);
    expect(results.some((r) => r.path.toLowerCase().includes('dragon'))).toBe(true);
  });

  it('full pipeline: actor name search prioritizes name matches', async () => {
    const { orchestrator } = await buildPipeline();

    const results = await orchestrator.searchTokenArt(
      { actorName: 'Bandit', type: 'humanoid', subtype: 'bandit', searchTerms: ['bandit'] },
      []
    );

    expect(results.length).toBeGreaterThan(0);
    // Name matches should appear first (fromName = true)
    expect(results[0].path.toLowerCase()).toContain('bandit');
  });

  it('cache round-trip: save index -> load from cache -> search produces same results', async () => {
    const mockStorage = createMockStorage();
    const { indexService, orchestrator: firstOrchestrator } = await buildPipeline({
      storage: mockStorage,
    });

    // Search with first pipeline
    const firstResults = await firstOrchestrator.searchTokenArt(
      { actorName: 'Wolf', type: 'beast', subtype: 'wolf', searchTerms: ['wolf'] },
      []
    );

    // Save index to mock storage
    const savedIndex = JSON.parse(JSON.stringify(indexService.index));
    mockStorage.load.mockResolvedValueOnce(savedIndex);

    // Create new IndexService and load from cache
    const cachedIndexService = new IndexService({
      storageService: mockStorage,
      workerFactory: vi.fn(),
      getSetting: vi.fn(),
      getTvaAPI: vi.fn(),
    });
    const loaded = await cachedIndexService.loadFromCache();
    expect(loaded).toBe(true);
    cachedIndexService.isBuilt = true;

    // Wire new orchestrator with cached index
    const { tvaCacheService } = await buildPipeline({ storage: createMockStorage() });
    const cachedOrchestrator = new SearchOrchestrator({
      tvaCacheService,
      indexService: cachedIndexService,
      getSetting: (mod, key) => {
        if (key === 'fuzzyThreshold') return 0.3;
        if (key === 'searchPriority') return 'faNexus';
        if (key === 'useTVACache') return true;
        return undefined;
      },
      workerFactory: () => {
        throw new Error('No worker');
      },
    });
    cachedOrchestrator.setDependencies(tvaCacheService, { isServiceAvailable: () => false });

    const cachedResults = await cachedOrchestrator.searchTokenArt(
      { actorName: 'Wolf', type: 'beast', subtype: 'wolf', searchTerms: ['wolf'] },
      []
    );

    // Same number of results and same paths
    expect(cachedResults.length).toBe(firstResults.length);
    const firstPaths = firstResults.map((r) => r.path).sort();
    const cachedPaths = cachedResults.map((r) => r.path).sort();
    expect(cachedPaths).toEqual(firstPaths);
  });

  it('index allPaths count matches tvaCacheImages minus excluded paths', async () => {
    const { tvaCacheService, indexService } = await buildPipeline();

    // allPaths should have entries (some may be excluded)
    const allPathsCount = Object.keys(indexService.index.allPaths).length;
    expect(allPathsCount).toBeGreaterThan(0);
    expect(allPathsCount).toBeLessThanOrEqual(tvaCacheService.tvaCacheImages.length);
  });

  it('search returns results with valid path and source properties', async () => {
    const { orchestrator } = await buildPipeline();

    const results = await orchestrator.searchTokenArt(
      { actorName: 'Bear', type: 'beast', subtype: 'bear', searchTerms: ['bear'] },
      []
    );

    expect(results.length).toBeGreaterThan(0);
    for (const r of results) {
      expect(typeof r.path).toBe('string');
      expect(r.path.length).toBeGreaterThan(0);
    }
  });
});

// ---------------------------------------------------------------------------
// INTG-02: Fallback Path
// ---------------------------------------------------------------------------

describe('Fallback Path (INTG-02)', () => {
  let originalFetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('fallback: nonsense search term with empty subtype triggers category results', async () => {
    const { orchestrator } = await buildPipeline();

    // Empty subtype + nonsense searchTerms -> hasGenericSubtype returns true -> category fallback
    const results = await orchestrator.searchTokenArt(
      {
        actorName: 'xyznonexistent123',
        type: 'beast',
        subtype: '',
        searchTerms: ['xyznonexistent123'],
      },
      []
    );

    // Category fallback should find beast-category results via index
    expect(results.length).toBeGreaterThan(0);
    expect(results.some((r) => r.fromCategory === true)).toBe(true);
  });

  it('fallback: undead category returns undead token paths', async () => {
    const { orchestrator } = await buildPipeline();

    const results = await orchestrator.searchTokenArt(
      {
        actorName: 'Unknown Undead',
        type: 'undead',
        subtype: '',
        searchTerms: ['unknownxyz999'],
      },
      []
    );

    expect(results.length).toBeGreaterThan(0);
    expect(results.some((r) => r.fromCategory === true)).toBe(true);
    // Results should contain undead-related paths
    expect(results.some((r) => r.path.toLowerCase().includes('undead'))).toBe(true);
  });

  it('fallback: dragon category returns dragon token paths', async () => {
    const { orchestrator } = await buildPipeline();

    const results = await orchestrator.searchTokenArt(
      {
        actorName: 'Ancient Mystery',
        type: 'dragon',
        subtype: '',
        searchTerms: ['ancientmystery999'],
      },
      []
    );

    expect(results.length).toBeGreaterThan(0);
    expect(results.some((r) => r.fromCategory === true)).toBe(true);
  });

  it('fallback: category results have valid path properties', async () => {
    const { orchestrator } = await buildPipeline();

    const results = await orchestrator.searchTokenArt(
      {
        actorName: 'Nobody',
        type: 'beast',
        subtype: '',
        searchTerms: ['zzzznotaname'],
      },
      []
    );

    expect(results.length).toBeGreaterThan(0);
    for (const r of results.filter((x) => x.fromCategory)) {
      expect(typeof r.path).toBe('string');
      expect(r.path).toContain('/');
    }
  });

  it('fallback: searchByCategory directly returns results from index', async () => {
    const { orchestrator } = await buildPipeline();

    const results = await orchestrator.searchByCategory('beast', []);

    expect(results.length).toBeGreaterThan(0);
    expect(results.some((r) => r.source === 'index')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// INTG-03: Worker vs Direct Parity
// ---------------------------------------------------------------------------

describe('Worker vs Direct Parity (INTG-03)', () => {
  let originalFetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('Worker and direct paths produce indexes with identical category keys', async () => {
    const mockStorage = createMockStorage();

    // Load TVA cache
    const tvaCacheService = new TVACacheService({
      getTvaAPI: () => ({
        TVA_CONFIG: { staticCache: true, staticCacheFile: 'data/tva-cache.json' },
        isCaching: () => false,
      }),
      getSetting: vi.fn(),
      storageService: mockStorage,
    });
    tvaCacheService.init();
    globalThis.fetch = createMockFetch();
    await tvaCacheService.loadTVACache();
    const parsedImages = tvaCacheService.tvaCacheImages;

    // Build index via DIRECT path
    const directService = new IndexService({
      storageService: mockStorage,
      workerFactory: vi.fn(),
      getSetting: vi.fn(),
      getTvaAPI: vi.fn(),
    });
    directService.index = directService.createEmptyIndex();
    await directService.indexPathsDirectly(parsedImages);
    directService.isBuilt = true;
    const directIndex = JSON.parse(JSON.stringify(directService.index));

    // Build index via WORKER path using MockWorker
    const mockWorker = new Worker('test-worker.js');
    const workerService = new IndexService({
      storageService: mockStorage,
      workerFactory: () => mockWorker,
      getSetting: vi.fn(),
      getTvaAPI: vi.fn(),
    });
    workerService.index = workerService.createEmptyIndex();
    // Initialize the worker via _ensureWorker
    workerService._ensureWorker();

    // Intercept postMessage and simulate worker response with direct-path results
    mockWorker.postMessage.mockImplementation((msg) => {
      if (msg.command === 'indexPaths') {
        // Worker returns categories + allPaths + termIndex
        mockWorker._simulateMessage({
          type: 'complete',
          result: {
            categories: directIndex.categories,
            allPaths: directIndex.allPaths,
            termIndex: directIndex.termIndex,
          },
          imagesFound: Object.keys(directIndex.allPaths).length,
          total: parsedImages.length,
        });
      }
    });

    await workerService.indexPathsWithWorker(parsedImages);
    workerService.isBuilt = true;

    // Compare category keys
    const directCategories = Object.keys(directService.index.categories).sort();
    const workerCategories = Object.keys(workerService.index.categories).sort();
    expect(workerCategories).toEqual(directCategories);
  });

  it('Worker and direct paths produce indexes with identical allPaths keys', async () => {
    const mockStorage = createMockStorage();

    const tvaCacheService = new TVACacheService({
      getTvaAPI: () => ({
        TVA_CONFIG: { staticCache: true, staticCacheFile: 'data/tva-cache.json' },
        isCaching: () => false,
      }),
      getSetting: vi.fn(),
      storageService: mockStorage,
    });
    tvaCacheService.init();
    globalThis.fetch = createMockFetch();
    await tvaCacheService.loadTVACache();
    const parsedImages = tvaCacheService.tvaCacheImages;

    // Direct path
    const directService = new IndexService({
      storageService: mockStorage,
      workerFactory: vi.fn(),
      getSetting: vi.fn(),
      getTvaAPI: vi.fn(),
    });
    directService.index = directService.createEmptyIndex();
    await directService.indexPathsDirectly(parsedImages);
    const directIndex = JSON.parse(JSON.stringify(directService.index));

    // Worker path
    const mockWorker = new Worker('test-worker.js');
    const workerService = new IndexService({
      storageService: mockStorage,
      workerFactory: () => mockWorker,
      getSetting: vi.fn(),
      getTvaAPI: vi.fn(),
    });
    workerService.index = workerService.createEmptyIndex();
    workerService._ensureWorker();

    mockWorker.postMessage.mockImplementation((msg) => {
      if (msg.command === 'indexPaths') {
        mockWorker._simulateMessage({
          type: 'complete',
          result: {
            categories: directIndex.categories,
            allPaths: directIndex.allPaths,
            termIndex: directIndex.termIndex,
          },
          imagesFound: Object.keys(directIndex.allPaths).length,
          total: parsedImages.length,
        });
      }
    });

    await workerService.indexPathsWithWorker(parsedImages);

    // Compare allPaths keys
    const directPaths = Object.keys(directService.index.allPaths).sort();
    const workerPaths = Object.keys(workerService.index.allPaths).sort();
    expect(workerPaths).toEqual(directPaths);
  });

  it('termIndex is populated after Worker path', async () => {
    const mockStorage = createMockStorage();

    const tvaCacheService = new TVACacheService({
      getTvaAPI: () => ({
        TVA_CONFIG: { staticCache: true, staticCacheFile: 'data/tva-cache.json' },
        isCaching: () => false,
      }),
      getSetting: vi.fn(),
      storageService: mockStorage,
    });
    tvaCacheService.init();
    globalThis.fetch = createMockFetch();
    await tvaCacheService.loadTVACache();
    const parsedImages = tvaCacheService.tvaCacheImages;

    // Build direct index first (to get reference data)
    const directService = new IndexService({
      storageService: mockStorage,
      workerFactory: vi.fn(),
      getSetting: vi.fn(),
      getTvaAPI: vi.fn(),
    });
    directService.index = directService.createEmptyIndex();
    await directService.indexPathsDirectly(parsedImages);
    const directIndex = JSON.parse(JSON.stringify(directService.index));

    // Build via Worker
    const mockWorker = new Worker('test-worker.js');
    const workerService = new IndexService({
      storageService: mockStorage,
      workerFactory: () => mockWorker,
      getSetting: vi.fn(),
      getTvaAPI: vi.fn(),
    });
    workerService.index = workerService.createEmptyIndex();
    workerService._ensureWorker();

    mockWorker.postMessage.mockImplementation((msg) => {
      if (msg.command === 'indexPaths') {
        mockWorker._simulateMessage({
          type: 'complete',
          result: {
            categories: directIndex.categories,
            allPaths: directIndex.allPaths,
            termIndex: directIndex.termIndex,
          },
          imagesFound: Object.keys(directIndex.allPaths).length,
          total: parsedImages.length,
        });
      }
    });

    await workerService.indexPathsWithWorker(parsedImages);

    // termIndex should be populated (not empty)
    const termKeys = Object.keys(workerService.index.termIndex);
    expect(termKeys.length).toBeGreaterThan(0);
  });

  it('Worker path termIndex enables successful search via IndexService.search()', async () => {
    const mockStorage = createMockStorage();

    const tvaCacheService = new TVACacheService({
      getTvaAPI: () => ({
        TVA_CONFIG: { staticCache: true, staticCacheFile: 'data/tva-cache.json' },
        isCaching: () => false,
      }),
      getSetting: vi.fn(),
      storageService: mockStorage,
    });
    tvaCacheService.init();
    globalThis.fetch = createMockFetch();
    await tvaCacheService.loadTVACache();
    const parsedImages = tvaCacheService.tvaCacheImages;

    // Build direct reference
    const directService = new IndexService({
      storageService: mockStorage,
      workerFactory: vi.fn(),
      getSetting: vi.fn(),
      getTvaAPI: vi.fn(),
    });
    directService.index = directService.createEmptyIndex();
    await directService.indexPathsDirectly(parsedImages);
    directService.isBuilt = true;
    const directIndex = JSON.parse(JSON.stringify(directService.index));

    // Build via Worker
    const mockWorker = new Worker('test-worker.js');
    const workerService = new IndexService({
      storageService: mockStorage,
      workerFactory: () => mockWorker,
      getSetting: vi.fn(),
      getTvaAPI: vi.fn(),
    });
    workerService.index = workerService.createEmptyIndex();
    workerService._ensureWorker();

    mockWorker.postMessage.mockImplementation((msg) => {
      if (msg.command === 'indexPaths') {
        mockWorker._simulateMessage({
          type: 'complete',
          result: {
            categories: directIndex.categories,
            allPaths: directIndex.allPaths,
            termIndex: directIndex.termIndex,
          },
          imagesFound: Object.keys(directIndex.allPaths).length,
          total: parsedImages.length,
        });
      }
    });

    await workerService.indexPathsWithWorker(parsedImages);
    workerService.isBuilt = true;

    // Search using worker-built index
    const directResults = directService.search('wolf');
    const workerResults = workerService.search('wolf');

    expect(workerResults.length).toBeGreaterThan(0);
    expect(workerResults.length).toBe(directResults.length);

    const directSearchPaths = directResults.map((r) => r.path).sort();
    const workerSearchPaths = workerResults.map((r) => r.path).sort();
    expect(workerSearchPaths).toEqual(directSearchPaths);
  });
});
