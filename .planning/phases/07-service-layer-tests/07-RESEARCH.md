# Phase 7: Service Layer Tests - Research

**Researched:** 2026-03-06
**Domain:** Vitest unit/integration testing for 4 service classes with constructor DI
**Confidence:** HIGH

## Summary

Phase 7 writes comprehensive tests for TokenService, TVACacheService, IndexService, and SearchOrchestrator using the constructor DI seams created in Phase 6. All 4 services now accept `deps = {}` constructors, meaning tests create isolated instances with mock dependencies -- no Foundry globals needed at test time.

The project already has 311 passing tests across 9 test files, a mature mock infrastructure (foundry-mocks.js, mock-helpers.js), and 19 DI smoke tests across 4 `.di.test.js` files that will be merged into the new behavior test files. The testing patterns are well-established from Phases 4-6: Vitest 3.2.4, jsdom environment, fake-indexeddb, describe-per-method organization, fresh instances per test.

**Primary recommendation:** One test file per service (`tests/services/{Service}.test.js`), merging DI smoke tests as the first describe block. Use real Fuse.js for fuzzy search quality tests. Create shared `tests/helpers/mock-tva-cache.js` fixture covering all 3 TVA cache entry formats.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- TokenService: Full behavior coverage for all 3 methods (getSceneNPCTokens, extractCreatureInfo, groupTokensByCreature) -- various D&D 5e actor structures, missing fields, custom subtypes. ~20-30 tests.
- TVACacheService: All 3 cache entry formats (path, [path,name], [path,name,tags]) + edge cases (empty cache, malformed entries, category mapping). Also test init() and loadTVACacheFile. ~15-25 tests.
- IndexService: Full behavior -- build() with mock data, categorization logic, termIndex construction, cache round-trip via mock StorageService, AND Worker vs direct path parity (INTG-03). ~20-30 tests.
- SearchOrchestrator: All search paths (fuzzy, category fallback, parallel batching) tested in isolation AND as orchestrated flow. Full pipeline integration (INTG-01, INTG-02) included. ~25-35 tests.
- D&D 5e actors: Use Phase 2 `createMockActor` helper with extensions for edge cases (missing fields, custom subtypes). Consistent mock shape across project.
- TVA cache data: Shared fixture file (`tests/helpers/mock-tva-cache.js`) with realistic 20-50 entries across multiple creature categories, using all 3 entry formats. Single source of truth.
- Fuse.js: Use real Fuse.js instance (not a stub) for fuzzy search tests -- threshold changes actually affect results. Tests verify real matching behavior.
- Exception: For fallback path testing (INTG-02), mock Fuse to force no-match (inject stub returning empty array). Deterministic trigger for category fallback.
- Separate describe blocks for SearchOrchestrator: fuzzy search (TEST-11), category fallback (TEST-12), parallel batching (TEST-13)
- Full orchestration describe block: TVA cache load -> index build -> search -> results (INTG-01)
- Fallback orchestration: no fuzzy match -> category search -> results (INTG-02) -- mock Fuse for deterministic no-match
- Parallel batching: test result correctness with configurable batch sizes only -- no timing/concurrency assertions (fragile in CI)
- Integration tests live inside SearchOrchestrator.test.js, not in a separate integration directory
- Merge Phase 6 DI smoke tests (*.di.test.js) into single *.test.js per service -- DI constructor tests become first describe block
- One test file per service: TokenService.test.js, TVACacheService.test.js, IndexService.test.js, SearchOrchestrator.test.js
- Worker vs direct parity test (INTG-03) lives in IndexService.test.js
- Shared mock TVA cache fixture in tests/helpers/mock-tva-cache.js

### Claude's Discretion
- Exact test count per method (targets given above are ranges)
- Internal describe block structure within each test file
- Whether to add more helper functions to tests/helpers/mock-helpers.js or keep helpers inline
- Specific mock TVA cache entry data (creature names, paths, categories)
- How to handle async Worker message passing in tests (microtask-based MockWorker from Phase 2)

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope

</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| TEST-07 | TokenService creature info extraction tested with various D&D 5e actor structures | createMockActor helper with object/string/creatureType fallback variants; extractCreatureInfo handles 4 type formats |
| TEST-08 | TokenService groupTokensByCreature tested with mixed creature types | groupTokensByCreature uses extractCreatureInfo + getCreatureCacheKey; test with 3+ creature types, verify Map keys |
| TEST-09 | IndexService index building tested (categorization, termIndex construction, cache loading) | addImageToIndex, categorizeImage, tokenizeSearchText are pure-logic testable; loadFromCache uses mock StorageService |
| TEST-10 | TVACacheService cache parsing tested with all entry formats | 3 formats: string path, [path,name], [path,name,tags]; _loadTVACacheFromFile needs fetch mock; init() tests via getTvaAPI injection |
| TEST-11 | SearchOrchestrator fuzzy search tested with varying thresholds | searchLocalIndexDirectly uses real Fuse.js; inject getSetting to control fuzzyThreshold; verify score ordering |
| TEST-12 | SearchOrchestrator category-based fallback search tested | searchByCategory with mock _indexService.isBuilt=true and searchByCategory returning results; also test TVA cache path |
| TEST-13 | SearchOrchestrator parallel search batching tested | parallelSearchCreatures batches by PARALLEL_BATCH_SIZE (4); test result Map correctness, not timing |
| INTG-01 | Full search pipeline: TVA cache load -> index build -> fuzzy search -> results | SearchOrchestrator with real IndexService + mock TVACacheService data -> searchTokenArt flow |
| INTG-02 | Fallback path: no fuzzy match -> category search -> results | Inject Fuse stub that returns empty for fuzzy, verify category fallback triggers |
| INTG-03 | Worker path vs direct path produce identical index structures | IndexService.indexPathsWithWorker vs indexPathsDirectly with same input, compare categories+allPaths |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| vitest | ^3.2.4 | Test runner | Already installed, configured, 311 tests passing |
| fake-indexeddb | ^6.2.5 | IndexedDB simulation | Already installed, used by StorageService tests |
| fuse.js | 7.0.0 | Fuzzy search (real instance) | Already used by production code via CDN import |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| jsdom | ^28.1.0 | DOM environment | Already configured as Vitest environment |

### No Additional Dependencies Needed
All required infrastructure is already in place. Fuse.js needs to be imported in tests via `vi.doMock` of the CDN URL (pattern established in Phase 4, Utils.test.js).

## Architecture Patterns

### Test File Organization
```
tests/
├── services/
│   ├── TokenService.test.js          # NEW (absorbs TokenService.di.test.js)
│   ├── TVACacheService.test.js       # NEW (absorbs TVACacheService.di.test.js)
│   ├── IndexService.test.js          # NEW (absorbs IndexService.di.test.js)
│   ├── SearchOrchestrator.test.js    # NEW (absorbs SearchOrchestrator.di.test.js)
│   ├── StorageService.test.js        # EXISTING (unchanged)
│   ├── TokenService.di.test.js       # DELETE after merge
│   ├── TVACacheService.di.test.js    # DELETE after merge
│   ├── IndexService.di.test.js       # DELETE after merge
│   └── SearchOrchestrator.di.test.js # DELETE after merge
├── helpers/
│   ├── mock-helpers.js               # EXISTING (may add helpers)
│   ├── mock-helpers.test.js          # EXISTING
│   └── mock-tva-cache.js             # NEW shared fixture
├── setup/
│   └── foundry-mocks.js              # EXISTING (unchanged)
└── core/
    ├── Constants.test.js             # EXISTING
    └── Utils.test.js                 # EXISTING
```

### Pattern 1: Service Test File Structure
**What:** Each test file follows the same organization pattern
**When to use:** All 4 service test files

```javascript
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ServiceClass } from '../../scripts/services/ServiceClass.js';

describe('ServiceClass', () => {
  // DI smoke tests (merged from .di.test.js)
  describe('constructor DI', () => {
    it('instantiates with injected deps', () => { /* ... */ });
    it('default constructor does not throw', () => { /* ... */ });
  });

  // Method-level behavior tests
  describe('methodName()', () => {
    let service;
    beforeEach(() => {
      service = new ServiceClass({ dep1: mockDep1, dep2: mockDep2 });
    });

    it('does X when given Y', () => { /* ... */ });
    it('handles edge case Z', () => { /* ... */ });
  });

  // Integration tests (SearchOrchestrator only)
  describe('Integration: full pipeline', () => { /* ... */ });
});
```

### Pattern 2: Mock TVA Cache Fixture
**What:** Shared data file with realistic TVA cache entries
**When to use:** TVACacheService, IndexService, SearchOrchestrator tests all need consistent mock data

```javascript
// tests/helpers/mock-tva-cache.js

/**
 * Mock TVA cache data covering all 3 entry formats.
 * Used by TVACacheService, IndexService, and SearchOrchestrator tests.
 */

// Format 1: plain string path
// Format 2: [path, name] tuple
// Format 3: [path, name, tags] triple
export const MOCK_TVA_CACHE_JSON = {
  'FA_Tokens/Humanoids': [
    'FA_Pack/Tokens/Humanoids/Bandit/Bandit_01.webp',                          // string
    ['FA_Pack/Tokens/Humanoids/Elf/Elf_Ranger_01.webp', 'Elf Ranger'],        // [path, name]
    ['FA_Pack/Tokens/Humanoids/Dwarf/Dwarf_Fighter.webp', 'Dwarf Fighter', ['dwarf', 'fighter']], // [path, name, tags]
  ],
  'FA_Tokens/Beasts': [
    'FA_Pack/Tokens/Beasts/Wolf/Wolf_01.webp',
    ['FA_Pack/Tokens/Beasts/Bear/Bear_Brown_01.webp', 'Brown Bear'],
  ],
  'FA_Tokens/Undead': [
    ['FA_Pack/Tokens/Undead/Skeleton/Skeleton_Warrior.webp', 'Skeleton Warrior'],
    ['FA_Pack/Tokens/Undead/Zombie/Zombie_01.webp', 'Zombie'],
  ],
  // ... more categories for ~20-50 total entries
};

// Pre-parsed expected results for verification
export const EXPECTED_IMAGE_COUNT = /* total entries */;
export const EXPECTED_CATEGORIES = ['FA_Tokens/Humanoids', 'FA_Tokens/Beasts', 'FA_Tokens/Undead'];
```

### Pattern 3: Fuse.js in Tests
**What:** Real Fuse.js for quality tests, stub for flow tests
**When to use:** SearchOrchestrator fuzzy search tests

```javascript
// Real Fuse.js -- install as dev dependency or use vi.doMock
// Phase 4 confirmed: vi.doMock with full CDN URL works for Fuse.js
import Fuse from 'fuse.js'; // direct import if installed, or mock the CDN

// For fuzzy search quality tests:
const fuse = new Fuse(index, { keys: ['name'], threshold: 0.1, includeScore: true });
const results = fuse.search('goblin');
// Assert actual matching behavior

// For flow/fallback tests (INTG-02):
// Mock loadFuse to return a stub Fuse that always returns []
vi.doMock('../../scripts/core/Utils.js', () => ({
  ...originalUtils,
  loadFuse: vi.fn(async () => class StubFuse { search() { return []; } }),
}));
```

### Pattern 4: MockWorker for Worker Parity Tests (INTG-03)
**What:** Use MockWorker's `_simulateMessage()` for async worker message simulation
**When to use:** IndexService worker vs direct path parity

```javascript
// MockWorker from foundry-mocks.js uses microtask dispatch
const mockWorkerFactory = vi.fn(() => {
  const worker = new Worker('test-worker.js');
  // Intercept postMessage to simulate worker response
  worker.postMessage.mockImplementation((msg) => {
    if (msg.command === 'indexPaths') {
      // Process same as direct path, then simulate response
      const result = processPathsDirectly(msg.data);
      queueMicrotask(() => worker._simulateMessage({ type: 'complete', result }));
    }
  });
  return worker;
});
```

### Anti-Patterns to Avoid
- **Testing private methods directly:** Test through public API (e.g., test `_loadTVACacheFromFile` through `loadTVACache`)
- **Timing-dependent assertions:** No `setTimeout` delays or `Date.now()` comparisons for parallel batching tests -- test correctness only
- **Shared mutable state between tests:** Always create fresh service instances in `beforeEach`
- **Mocking too much:** Use real Fuse.js where possible; only mock for deterministic flow control

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Fuzzy search | Custom string matching | Real Fuse.js instance | Threshold behavior must match production |
| IndexedDB storage | Custom indexedDB mocking | fake-indexeddb + mock StorageService | Already proven in Phase 5 |
| TVA cache parsing | Hardcoded test expectations | Shared mock-tva-cache.js fixture | Single source of truth across 3 test files |
| Worker simulation | Custom event system | MockWorker._simulateMessage() | Already built with microtask dispatch |

## Common Pitfalls

### Pitfall 1: Forgetting to mock `fetch` for TVACacheService
**What goes wrong:** `_loadTVACacheFromFile()` calls `fetch()` to load the TVA cache file. Without mocking, tests hit the network.
**Why it happens:** TVACacheService does file I/O internally.
**How to avoid:** Use `vi.stubGlobal('fetch', vi.fn())` or per-test `globalThis.fetch = vi.fn()` returning mock Response objects.
**Warning signs:** Tests hanging or failing with network errors.

### Pitfall 2: loadFuse CDN import in SearchOrchestrator
**What goes wrong:** `searchLocalIndexDirectly()` calls `loadFuse()` which does `import('https://cdn.jsdelivr.net/...')`. This fails in Vitest.
**Why it happens:** Dynamic import of CDN URL isn't available in Node.
**How to avoid:** Use `vi.doMock` on the Utils module to provide a real Fuse.js constructor (from node_modules or inline). Phase 4 confirmed this pattern works.
**Warning signs:** "Cannot find module" errors on CDN URLs.

### Pitfall 3: Stale singleton imports
**What goes wrong:** Importing `{ tokenService }` from the service file gives a singleton that uses global canvas, not the injected one.
**Why it happens:** Service files export both the class and a default singleton instance.
**How to avoid:** Always import the CLASS (`TokenService`, `TVACacheService`, etc.) and create instances with DI. Never use the exported singleton in tests.
**Warning signs:** Tests passing individually but failing when run together.

### Pitfall 4: Not awaiting MockWorker._simulateMessage
**What goes wrong:** Worker message handlers fire before test assertions.
**Why it happens:** `_simulateMessage` uses microtask dispatch (`await Promise.resolve()`).
**How to avoid:** Ensure test code awaits or flushes microtasks after triggering worker responses. Use `await vi.waitFor()` or `await new Promise(r => setTimeout(r, 0))`.
**Warning signs:** Assertions about worker results being undefined or stale.

### Pitfall 5: Missing `isExcludedPath` import in test context
**What goes wrong:** IndexService and TVACacheService call `isExcludedPath()` during parsing. If Utils.js imports fail, these methods break.
**Why it happens:** Utils.js depends on Constants.js EXCLUDED_FOLDERS_SET at module scope.
**How to avoid:** Constants.js and Utils.js are pure modules with no Foundry globals -- they import cleanly. Just ensure import paths are correct.
**Warning signs:** Module resolution errors on initial import.

### Pitfall 6: Fuse.js not installed as dependency
**What goes wrong:** `import Fuse from 'fuse.js'` fails because fuse.js is a CDN-only dependency in production.
**Why it happens:** Production code loads Fuse.js from CDN at runtime; it's not in package.json.
**How to avoid:** Install `fuse.js` as a devDependency (`npm install -D fuse.js`) so tests can import it directly.
**Warning signs:** "Cannot find module 'fuse.js'" in test output.

## Code Examples

### TokenService: extractCreatureInfo with object type
```javascript
// Source: scripts/services/TokenService.js lines 61-77
// The method handles 4 type formats:
// 1. Object with .value: { value: 'humanoid', subtype: 'Elf', custom: '' }
// 2. String: 'humanoid'
// 3. String with parens: 'Humanoid (Elf)'
// 4. Fallback: actor.system.details.creatureType

it('extracts type from object format with value property', () => {
  const actor = createMockActor({ type: 'humanoid', subtype: 'Elf' });
  const token = createMockToken({ actor });
  const service = new TokenService();
  const info = service.extractCreatureInfo(token);

  expect(info.type).toBe('humanoid');
  expect(info.subtype).toBe('Elf');
});

it('extracts type from string format "Type (Subtype)"', () => {
  const actor = {
    id: 'test', name: 'Test', type: 'npc',
    system: { details: { type: 'Humanoid (Tiefling)' } },
  };
  const token = createMockToken({ actor });
  const service = new TokenService();
  const info = service.extractCreatureInfo(token);

  expect(info.type).toBe('humanoid');
  expect(info.subtype).toBe('Tiefling');
});
```

### TVACacheService: Parsing all 3 entry formats
```javascript
// Source: scripts/services/TVACacheService.js lines 228-256
// Cache JSON format: { category: [ path | [path,name] | [path,name,tags] ] }

it('parses string path entries (format 1)', () => {
  // String entry: just a file path
  // Expected: { path: 'the/path.webp', name: 'extracted-from-filename', category: 'cat' }
});

it('parses [path, name] tuple entries (format 2)', () => {
  // Array[2] entry: [path, name]
  // Expected: { path: arr[0], name: arr[1], category: 'cat' }
});

it('parses [path, name, tags] triple entries (format 3)', () => {
  // Array[3] entry: [path, name, tags]
  // Expected: { path: arr[0], name: arr[1], tags: arr[2], category: 'cat' }
});
```

### IndexService: addImageToIndex with categorization
```javascript
// Source: scripts/services/IndexService.js lines 352-425
it('adds image to allPaths and termIndex', () => {
  const service = new IndexService({
    storageService: mockStorage,
    workerFactory: vi.fn(),
    getSetting: vi.fn(),
    getTvaAPI: vi.fn(),
  });
  service.index = service.createEmptyIndex();

  const added = service.addImageToIndex(
    'FA_Pack/Tokens/Beasts/Wolf/Wolf_01.webp',
    'Wolf'
  );

  expect(added).toBe(true);
  expect(service.index.allPaths['FA_Pack/Tokens/Beasts/Wolf/Wolf_01.webp']).toBeDefined();
  expect(service.index.termIndex['wolf']).toContain('FA_Pack/Tokens/Beasts/Wolf/Wolf_01.webp');
});
```

### SearchOrchestrator: Fuzzy search with real Fuse.js
```javascript
// searchLocalIndexDirectly uses loadFuse() -> new Fuse(index, options)
// Need to mock loadFuse to return real Fuse constructor

it('returns results ordered by score with real Fuse.js', async () => {
  const Fuse = (await import('fuse.js')).default;
  const mockGetSetting = vi.fn(() => 0.3); // fuzzyThreshold

  const orchestrator = new SearchOrchestrator({
    getSetting: mockGetSetting,
    indexService: { isBuilt: false },
    workerFactory: vi.fn(() => null),
  });

  // Mock loadFuse to return real Fuse
  // ... vi.doMock pattern ...

  const index = [
    { path: '/wolf_01.webp', name: 'Wolf', category: 'beast' },
    { path: '/wolverine_01.webp', name: 'Wolverine', category: 'beast' },
  ];

  const results = await orchestrator.searchLocalIndexDirectly(['wolf'], index);
  expect(results.length).toBeGreaterThan(0);
  expect(results[0].path).toContain('wolf');
});
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Static methods (TokenService) | Instance methods with DI | Phase 6 (2026-03-06) | Tests can inject mock canvas |
| Global singleton access | Constructor `deps = {}` injection | Phase 6 | Full test isolation |
| No service tests | Phase 5 StorageService tests | Phase 5 (2026-03-01) | Established pattern for remaining services |
| Separate DI smoke test files | Merged into behavior test files | Phase 7 (this phase) | Single test file per service |

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 3.2.4 |
| Config file | vitest.config.js |
| Quick run command | `npm test` |
| Full suite command | `npm test` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| TEST-07 | TokenService extractCreatureInfo with D&D 5e variants | unit | `npx vitest run tests/services/TokenService.test.js -x` | Wave 0 |
| TEST-08 | TokenService groupTokensByCreature mixed types | unit | `npx vitest run tests/services/TokenService.test.js -x` | Wave 0 |
| TEST-09 | IndexService index building + termIndex + cache | unit | `npx vitest run tests/services/IndexService.test.js -x` | Wave 0 |
| TEST-10 | TVACacheService all 3 entry formats | unit | `npx vitest run tests/services/TVACacheService.test.js -x` | Wave 0 |
| TEST-11 | SearchOrchestrator fuzzy search thresholds | unit | `npx vitest run tests/services/SearchOrchestrator.test.js -x` | Wave 0 |
| TEST-12 | SearchOrchestrator category fallback | unit | `npx vitest run tests/services/SearchOrchestrator.test.js -x` | Wave 0 |
| TEST-13 | SearchOrchestrator parallel batching | unit | `npx vitest run tests/services/SearchOrchestrator.test.js -x` | Wave 0 |
| INTG-01 | Full search pipeline end-to-end | integration | `npx vitest run tests/services/SearchOrchestrator.test.js -x` | Wave 0 |
| INTG-02 | Fallback path (no fuzzy -> category) | integration | `npx vitest run tests/services/SearchOrchestrator.test.js -x` | Wave 0 |
| INTG-03 | Worker vs direct path parity | integration | `npx vitest run tests/services/IndexService.test.js -x` | Wave 0 |

### Sampling Rate
- **Per task commit:** `npm test`
- **Per wave merge:** `npm test`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `tests/helpers/mock-tva-cache.js` -- shared fixture for TVA cache data
- [ ] `tests/services/TokenService.test.js` -- covers TEST-07, TEST-08
- [ ] `tests/services/TVACacheService.test.js` -- covers TEST-10
- [ ] `tests/services/IndexService.test.js` -- covers TEST-09, INTG-03
- [ ] `tests/services/SearchOrchestrator.test.js` -- covers TEST-11, TEST-12, TEST-13, INTG-01, INTG-02
- [ ] `fuse.js` devDependency install -- needed for real fuzzy search tests

## Open Questions

1. **Fuse.js import strategy**
   - What we know: Production loads Fuse.js from CDN via dynamic import. Phase 4 confirmed `vi.doMock` works for mocking this import. Real Fuse.js needed for threshold tests.
   - What's unclear: Whether to install `fuse.js` as a devDependency (cleanest) or use `vi.doMock` to intercept the CDN import and replace with a local copy.
   - Recommendation: Install `fuse.js` as devDependency -- it's ~50KB, well-maintained, and allows direct `import Fuse from 'fuse.js'` in tests. Then mock `loadFuse()` in Utils.js to return this real Fuse class.

2. **INTG-03 Worker parity scope**
   - What we know: MockWorker in foundry-mocks.js simulates async message dispatch. IndexService has both `indexPathsWithWorker()` and `indexPathsDirectly()` methods.
   - What's unclear: Exact method to intercept MockWorker.postMessage and process the same algorithm, since IndexWorker.js runs its own categorization.
   - Recommendation: Test at the higher level -- call `build()` twice with identical input data, once with worker (MockWorker that simulates indexPaths response) and once with direct fallback (worker=null). Compare resulting `index.categories` and `index.allPaths` structures.

## Sources

### Primary (HIGH confidence)
- Project source code: `scripts/services/TokenService.js`, `TVACacheService.js`, `IndexService.js`, `SearchOrchestrator.js` -- full method analysis
- Existing test infrastructure: `tests/setup/foundry-mocks.js`, `tests/helpers/mock-helpers.js` -- established patterns
- Phase 6 DI smoke tests: 4 `.di.test.js` files with 19 tests -- merge targets confirmed
- `vitest.config.js` and `package.json` -- framework config verified

### Secondary (MEDIUM confidence)
- Phase 4-5 test patterns (Utils.test.js, StorageService.test.js) -- proven conventions for describe organization and mock patterns

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- all tools already installed and proven
- Architecture: HIGH -- patterns directly extrapolated from 311 existing tests
- Pitfalls: HIGH -- based on actual codebase analysis (CDN imports, fetch calls, singleton exports)
- Test coverage mapping: HIGH -- source code methods mapped line-by-line to test requirements

**Research date:** 2026-03-06
**Valid until:** 2026-04-06 (stable -- no external dependencies changing)
