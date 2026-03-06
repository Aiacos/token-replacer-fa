# Phase 8: Integration Tests - Research

**Researched:** 2026-03-06
**Domain:** Vitest integration testing with real service instances (no mocked neighbors)
**Confidence:** HIGH

## Summary

Phase 8 adds true cross-service integration tests that wire real TVACacheService, IndexService, and SearchOrchestrator instances together without mocking their neighbors. This validates actual data flow across service boundaries, catching interface mismatches that Phase 7's mock-based tests would miss. Additionally, a SearchService facade test file validates the init/delegation/error-wrapping layer.

The existing test infrastructure (Vitest 3.x, jsdom, fake-indexeddb, MockWorker, mock-tva-cache fixture) is fully sufficient. No new libraries needed. The key technical challenge is constructing real service instances with the right DI overrides so they work in a test environment without Foundry VTT globals.

**Primary recommendation:** Wire real service instances via constructor DI, feed them MOCK_TVA_CACHE_JSON fixture data, and assert end-to-end data correctness across the full pipeline.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Phase 7 already has mock-based INTG-01/02/03 tests (orchestration-level with vi.fn() stubs) -- keep those as-is
- Phase 8 adds real-service integration tests that wire actual TVACacheService, IndexService, and SearchOrchestrator instances together
- Real Fuse.js for fuzzy search, real index building, real cache parsing -- no mocked neighbors
- Tests validate actual data flow across service boundaries, catching interface mismatches that mocks would hide
- New file: `tests/integration/SearchPipeline.test.js` -- clearly separates unit tests from integration tests
- SearchService facade tests: `tests/services/SearchService.test.js` -- follows existing convention
- Reuse existing `tests/helpers/mock-tva-cache.js` -- no new fixture files needed
- Cross-service flows to cover: full happy path, fallback path, cache round-trip, Worker vs direct parity
- SearchService facade: init + delegation (~8-12 tests)
- Keep existing Phase 7 mock-based INTG tests unchanged

### Claude's Discretion
- Exact test count per flow (targets above are guidance)
- Internal describe block structure within SearchPipeline.test.js
- How to construct real service instances with DI (which deps to inject vs let default)
- Whether to add helper functions for common integration setup patterns

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| INTG-01 | Full search pipeline tested: TVA cache load -> index build -> fuzzy search -> results | SearchPipeline.test.js wires real TVACacheService + IndexService + SearchOrchestrator with real Fuse.js; exercises searchTokenArt end-to-end |
| INTG-02 | Fallback path tested: no fuzzy match -> category search -> results | SearchPipeline.test.js test with generic subtype triggers searchByCategory via real IndexService.searchByCategory |
| INTG-03 | Worker path vs direct path produce identical index structures | SearchPipeline.test.js compares IndexService.indexPathsDirectly output with MockWorker-driven indexPathsWithWorker output |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| vitest | ^3.2.4 | Test runner | Already configured, all 457 tests passing |
| fuse.js | ^7.0.0 | Real fuzzy search in integration tests | Already a devDependency; vi.mock partial override pattern established in Phase 7 |
| fake-indexeddb | ^6.2.5 | IndexedDB for StorageService in integration tests | Already in setupFiles |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| (none needed) | -- | -- | All infrastructure exists |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Real fetch | Mock fetch via vi.stubGlobal | Integration tests should NOT hit network; mock fetch to return MOCK_TVA_CACHE_JSON |

**Installation:**
```bash
# No new packages needed
```

## Architecture Patterns

### Recommended Test Structure
```
tests/
  integration/
    SearchPipeline.test.js    # INTG-01, INTG-02, INTG-03 (real service wiring)
  services/
    SearchService.test.js     # SearchService facade (init, delegation, errors)
```

### Pattern 1: Real Service Construction via DI
**What:** Construct real service instances with only environment-specific deps injected (fetch, Worker, settings), letting services wire to each other naturally.
**When to use:** Every integration test in SearchPipeline.test.js.
**Example:**
```javascript
// Create real TVACacheService with mocked fetch (no network)
const mockStorage = {
  load: vi.fn(async () => null),
  save: vi.fn(async () => true),
  remove: vi.fn(async () => true),
  needsMigration: vi.fn(async () => false),
  migrateFromLocalStorage: vi.fn(async () => {}),
};

const tvaCacheService = new TVACacheService({
  getTvaAPI: () => ({
    TVA_CONFIG: { staticCache: true, staticCacheFile: 'data/tva-cache.json' },
    isCaching: () => false,
  }),
  getSetting: vi.fn(),
  storageService: mockStorage,
});
tvaCacheService.init();

// Mock fetch to return fixture data
globalThis.fetch = vi.fn(async () => ({
  ok: true,
  status: 200,
  statusText: 'OK',
  json: async () => MOCK_TVA_CACHE_JSON,
  headers: {
    get: (h) => h === 'Content-Length' ? '1000' : null,
  },
}));

// Load cache (exercises real parsing code)
await tvaCacheService.loadTVACache();

// Create real IndexService with TVA API pointing to real cache
const indexService = new IndexService({
  storageService: mockStorage,
  workerFactory: vi.fn(),  // or () => new MockWorker(...)
  getSetting: vi.fn(),
  getTvaAPI: () => null,   // not needed when passing tvaCacheImages
});
indexService.index = indexService.createEmptyIndex();
await indexService.indexPathsDirectly(tvaCacheService.tvaCacheImages);
indexService.isBuilt = true;

// Create real SearchOrchestrator wired to real services
const orchestrator = new SearchOrchestrator({
  tvaCacheService,
  indexService,
  getSetting: (mod, key) => {
    if (key === 'fuzzyThreshold') return 0.3;
    if (key === 'searchPriority') return 'faNexus';
    if (key === 'useTVACache') return true;
    return undefined;
  },
  workerFactory: () => { throw new Error('No worker'); },
});
orchestrator.setDependencies(tvaCacheService, { isServiceAvailable: () => false });
```

### Pattern 2: SearchService Facade Testing with Mocked Singletons
**What:** Test SearchService class methods by importing the class and injecting mock sub-services via module-level singleton replacement.
**When to use:** SearchService.test.js.
**Example:**
```javascript
// SearchService imports singletons; use vi.mock to replace them
vi.mock('../../scripts/services/TVACacheService.js', () => ({
  tvaCacheService: {
    init: vi.fn(),
    hasTVA: true,
    /* ... */
  },
}));
vi.mock('../../scripts/services/ForgeBazaarService.js', () => ({
  forgeBazaarService: {
    init: vi.fn(),
    clearCache: vi.fn(),
    isServiceAvailable: () => false,
  },
}));
vi.mock('../../scripts/services/SearchOrchestrator.js', () => ({
  searchOrchestrator: {
    setDependencies: vi.fn(),
    clearCache: vi.fn(),
    searchByCategory: vi.fn(async () => []),
    parallelSearchCreatures: vi.fn(async () => new Map()),
  },
}));

import { SearchService } from '../../scripts/services/SearchService.js';
```

### Pattern 3: Worker Parity via MockWorker Simulation
**What:** Build index via `indexPathsDirectly`, then build via `indexPathsWithWorker` using MockWorker that simulates the worker's response, and compare structures.
**When to use:** INTG-03 parity test.
**Example:**
```javascript
// Build via direct path
const directService = createService();
directService.index = directService.createEmptyIndex();
await directService.indexPathsDirectly(parsedImages);
const directIndex = JSON.parse(JSON.stringify(directService.index));

// Build via worker path using MockWorker
const mockWorker = new MockWorker('test');
const workerService = createService({ workerFactory: () => mockWorker });
workerService.index = workerService.createEmptyIndex();

// Intercept worker postMessage and simulate response
mockWorker.postMessage.mockImplementation((msg) => {
  if (msg.command === 'indexPaths') {
    // Simulate worker completing with categorized results
    mockWorker._simulateMessage({
      type: 'complete',
      result: {
        categories: directIndex.categories,
        allPaths: directIndex.allPaths,
      },
    });
  }
});

await workerService.indexPathsWithWorker(parsedImages);
// Compare structures (termIndex is rebuilt on main thread after worker)
```

### Anti-Patterns to Avoid
- **Mocking neighbor services in integration tests:** The whole point is real service wiring. Only mock environment boundaries (fetch, Worker, IndexedDB storage, game.settings).
- **Using singleton exports in integration tests:** Always construct fresh instances via `new ServiceClass({...})` to avoid cross-test contamination.
- **Calling build() directly in integration tests:** The `build()` method has complex caching/staleness logic. For integration tests, call `indexPathsDirectly()` with pre-parsed images to focus on the data flow.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| TVA cache fixture data | New fixture files | `MOCK_TVA_CACHE_JSON` + `createParsedImages()` from mock-tva-cache.js | Already has 33 entries across 6 categories with all 3 formats |
| Mock storage service | Custom storage mock | Same `createMockStorage()` pattern from Phase 7 tests | Consistent, covers all StorageService interface methods |
| Fuzzy search engine | Custom matcher | Real `Fuse` from fuse.js devDependency via vi.mock partial | Phase 7 established the pattern; `loadFuse` mock returns real Fuse |
| Worker simulation | Custom postMessage logic | MockWorker from foundry-mocks.js with `_simulateMessage` | Already handles async microtask dispatch correctly |

**Key insight:** All infrastructure for integration testing already exists in the codebase. The task is pure test authoring, not infrastructure building.

## Common Pitfalls

### Pitfall 1: TVACacheService.loadTVACache requires fetch mock
**What goes wrong:** Tests call `loadTVACache()` which calls `fetch(staticCacheFile)` internally. Without a fetch mock, jsdom's fetch may fail or behave unpredictably.
**Why it happens:** TVACacheService._loadTVACacheFromFile does a real `fetch()` call and also a HEAD request in `_tryRestoreFromIndexedDB`.
**How to avoid:** Always mock `globalThis.fetch` before calling `loadTVACache()`. Restore original fetch in afterEach.
**Warning signs:** "TypeError: fetch failed" or "NetworkError" in test output.

### Pitfall 2: IndexService.build() vs indexPathsDirectly() confusion
**What goes wrong:** Calling `build()` triggers cache loading, staleness checks, and buildFromTVA which tries multiple TVA API access strategies.
**Why it happens:** `build()` is the high-level orchestrator; integration tests need the lower-level `indexPathsDirectly()` for predictable behavior.
**How to avoid:** For integration tests, manually: (1) create empty index, (2) call `indexPathsDirectly(parsedImages)`, (3) set `isBuilt = true`.
**Warning signs:** Tests hanging or throwing "TVA API not available" errors.

### Pitfall 3: termIndex not built after Worker path
**What goes wrong:** IndexWorker builds `categories` and `allPaths` but NOT `termIndex`. After Worker results merge, `termIndex` may be empty.
**Why it happens:** This is documented in MEMORY.md as a critical architecture fact. Worker returns partial index; main thread must rebuild termIndex.
**How to avoid:** After `indexPathsWithWorker` completes, verify termIndex is populated. The service's merge logic should handle this, but tests should assert it.
**Warning signs:** search() and searchMultiple() returning empty results despite allPaths being populated.

### Pitfall 4: SearchOrchestrator needs setDependencies called
**What goes wrong:** SearchOrchestrator constructed via DI gets tvaCacheService and forgeBazaarService, but also has a `setDependencies()` method that SearchService.init() calls.
**Why it happens:** Constructor DI sets initial values, but `setDependencies()` can override them. The two paths can conflict.
**How to avoid:** In integration tests, pass tvaCacheService via constructor DI. Use `setDependencies()` only in SearchService facade tests (matching real call pattern).
**Warning signs:** `this._tvaCacheService` is null despite being passed to constructor.

### Pitfall 5: Singleton contamination between tests
**What goes wrong:** Importing singleton exports (`searchOrchestrator`, `tvaCacheService`) shares state between tests.
**Why it happens:** ES module singletons retain state across test files.
**How to avoid:** Always use `new ServiceClass({...})` in integration tests. Never import singleton instances.
**Warning signs:** Tests pass individually but fail when run together.

### Pitfall 6: TVACacheService name extraction differs from createParsedImages helper
**What goes wrong:** The `createParsedImages()` helper in mock-tva-cache.js extracts names differently than TVACacheService._loadTVACacheFromFile.
**Why it happens:** `createParsedImages` uses a regex approach (`replace(/[-_]/g, ' ')`) while TVACacheService just takes the filename without extension. The exact name strings may differ.
**How to avoid:** For integration tests, use real TVACacheService.loadTVACache() to parse the cache (produces authoritative names). Use `createParsedImages()` only when bypassing TVACacheService.
**Warning signs:** Search results not matching expected names in assertions.

## Code Examples

### Integration Test: Full Happy Path (INTG-01)
```javascript
import { TVACacheService } from '../../scripts/services/TVACacheService.js';
import { IndexService } from '../../scripts/services/IndexService.js';
import { SearchOrchestrator } from '../../scripts/services/SearchOrchestrator.js';
import { MOCK_TVA_CACHE_JSON, EXPECTED_IMAGE_COUNT } from '../helpers/mock-tva-cache.js';
import Fuse from 'fuse.js';

// Mock loadFuse to return real Fuse.js
vi.mock('../../scripts/core/Utils.js', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, loadFuse: vi.fn(async () => Fuse) };
});

describe('Search Pipeline Integration', () => {
  let tvaCacheService, indexService, orchestrator;
  let originalFetch;

  beforeEach(async () => {
    originalFetch = globalThis.fetch;

    const mockStorage = {
      load: vi.fn(async () => null),
      save: vi.fn(async () => true),
      remove: vi.fn(async () => true),
      needsMigration: vi.fn(async () => false),
      migrateFromLocalStorage: vi.fn(async () => {}),
    };

    // Real TVACacheService with mocked fetch
    tvaCacheService = new TVACacheService({
      getTvaAPI: () => ({
        TVA_CONFIG: { staticCache: true, staticCacheFile: 'data/tva-cache.json' },
        isCaching: () => false,
      }),
      getSetting: vi.fn(),
      storageService: mockStorage,
    });
    tvaCacheService.init();

    globalThis.fetch = vi.fn(async (url, opts) => {
      if (opts?.method === 'HEAD') {
        return { ok: true, headers: { get: () => null } };
      }
      return {
        ok: true, status: 200, statusText: 'OK',
        json: async () => MOCK_TVA_CACHE_JSON,
        headers: { get: (h) => h === 'Content-Length' ? '5000' : null },
      };
    });

    await tvaCacheService.loadTVACache();

    // Real IndexService builds from parsed cache
    indexService = new IndexService({
      storageService: mockStorage,
      workerFactory: vi.fn(),
      getSetting: vi.fn(),
      getTvaAPI: vi.fn(),
    });
    indexService.index = indexService.createEmptyIndex();
    await indexService.indexPathsDirectly(tvaCacheService.tvaCacheImages);
    indexService.isBuilt = true;

    // Real SearchOrchestrator
    orchestrator = new SearchOrchestrator({
      tvaCacheService,
      indexService,
      getSetting: (mod, key) => {
        if (key === 'fuzzyThreshold') return 0.3;
        if (key === 'searchPriority') return 'faNexus';
        if (key === 'useTVACache') return true;
        return undefined;
      },
      workerFactory: () => { throw new Error('No worker'); },
    });
    orchestrator.setDependencies(tvaCacheService, { isServiceAvailable: () => false });
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('full pipeline: cache -> index -> fuzzy search -> results', async () => {
    // Verify cache was loaded
    expect(tvaCacheService.tvaCacheLoaded).toBe(true);
    expect(tvaCacheService.tvaCacheImages.length).toBe(EXPECTED_IMAGE_COUNT);

    // Verify index was built
    expect(indexService.isBuilt).toBe(true);
    expect(Object.keys(indexService.index.allPaths).length).toBeGreaterThan(0);

    // Search for "wolf" using real Fuse.js via searchTokenArt
    const results = await orchestrator.searchTokenArt(
      { actorName: 'Wolf', type: 'beast', subtype: 'wolf', searchTerms: ['wolf'] },
      []  // no local index
    );

    expect(results.length).toBeGreaterThan(0);
    expect(results.some(r => r.path.includes('Wolf'))).toBe(true);
  });
});
```

### Integration Test: Fallback Path (INTG-02)
```javascript
it('fallback path: no fuzzy match -> category search -> results', async () => {
  // Search with generic subtype triggers category fallback
  const results = await orchestrator.searchTokenArt(
    {
      actorName: 'Generic Beast',
      type: 'beast',
      subtype: '',  // generic/empty triggers category fallback
      searchTerms: ['xyznonexistent'],
    },
    []
  );

  // Category fallback should find beast-category results via index
  expect(results.length).toBeGreaterThan(0);
  // Results should come from category search, marked as fromCategory
  expect(results.some(r => r.fromCategory === true)).toBe(true);
});
```

### SearchService Facade Test Pattern
```javascript
import { SearchService } from '../../scripts/services/SearchService.js';

describe('SearchService', () => {
  it('init() wires sub-services and is idempotent', () => {
    const service = new SearchService();
    service.init();
    expect(tvaCacheService.init).toHaveBeenCalledOnce();
    expect(searchOrchestrator.setDependencies).toHaveBeenCalledWith(
      tvaCacheService, forgeBazaarService
    );

    // Second init is no-op
    service.init();
    expect(tvaCacheService.init).toHaveBeenCalledOnce(); // still 1
  });

  it('searchByCategory validates input and delegates', async () => {
    await expect(service.searchByCategory('', [], null)).rejects.toMatchObject({
      errorType: 'search_failed',
    });
  });
});
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Mock-based INTG tests (Phase 7) | Real-service integration tests (Phase 8) | Phase 8 | Catches interface mismatches mocks would hide |
| Static methods (TokenService) | Instance with DI (Phase 6) | Phase 6 | Enables constructor injection for testability |
| Singleton-only services | Constructor DI with lazy defaults (Phase 6) | Phase 6 | Fresh instances in tests, no cross-contamination |

**Deprecated/outdated:**
- None -- all established patterns are current

## Open Questions

1. **hasGenericSubtype behavior with empty string**
   - What we know: `hasGenericSubtype('')` determines whether category fallback triggers in searchTokenArt
   - What's unclear: Whether empty string counts as "generic" (likely yes based on the function name)
   - Recommendation: Test in integration and verify behavior matches expectations; adjust test input if needed

2. **IndexService.indexPathsWithWorker termIndex rebuild**
   - What we know: Worker returns categories + allPaths but not termIndex; main thread rebuilds it
   - What's unclear: Whether the existing code in indexPathsWithWorker properly triggers termIndex rebuild
   - Recommendation: INTG-03 parity test should explicitly check termIndex population after Worker path

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 3.2.4 |
| Config file | vitest.config.js |
| Quick run command | `npm test -- --run` |
| Full suite command | `npm test -- --run` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| INTG-01 | Full pipeline: cache load -> index build -> fuzzy search -> results | integration | `npx vitest run tests/integration/SearchPipeline.test.js` | No - Wave 0 |
| INTG-02 | Fallback: no fuzzy match -> category search -> results | integration | `npx vitest run tests/integration/SearchPipeline.test.js` | No - Wave 0 |
| INTG-03 | Worker vs direct path produce identical index structures | integration | `npx vitest run tests/integration/SearchPipeline.test.js` | No - Wave 0 |

### Sampling Rate
- **Per task commit:** `npm test -- --run`
- **Per wave merge:** `npm test -- --run`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `tests/integration/SearchPipeline.test.js` -- covers INTG-01, INTG-02, INTG-03 (real service wiring)
- [ ] `tests/services/SearchService.test.js` -- covers SearchService facade (init, delegation, errors)
- [ ] `tests/integration/` directory -- needs creation

## Sources

### Primary (HIGH confidence)
- Project source code: `scripts/services/SearchOrchestrator.js`, `TVACacheService.js`, `IndexService.js`, `SearchService.js`
- Existing Phase 7 tests: `tests/services/SearchOrchestrator.test.js`, `IndexService.test.js`, `TVACacheService.test.js`
- Test infrastructure: `tests/setup/foundry-mocks.js`, `tests/helpers/mock-tva-cache.js`
- Phase 8 CONTEXT.md: Locked decisions from user discussion

### Secondary (MEDIUM confidence)
- MEMORY.md: Critical Worker/termIndex data flow notes (validated against source code)

### Tertiary (LOW confidence)
- None

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - all libraries already installed and working (457 tests passing)
- Architecture: HIGH - DI patterns established in Phase 6, test patterns established in Phase 7
- Pitfalls: HIGH - derived from direct source code reading and documented MEMORY.md notes

**Research date:** 2026-03-06
**Valid until:** 2026-04-06 (stable infrastructure, no external dependencies changing)
