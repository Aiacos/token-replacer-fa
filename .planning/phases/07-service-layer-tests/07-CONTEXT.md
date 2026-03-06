# Phase 7: Service Layer Tests - Context

**Gathered:** 2026-03-06
**Status:** Ready for planning

<domain>
## Phase Boundary

Write comprehensive unit and integration tests for all 4 service classes (TokenService, TVACacheService, IndexService, SearchOrchestrator) using the constructor DI seams created in Phase 6. Covers requirements TEST-07 through TEST-13, INTG-01 through INTG-03. No changes to service source code.

</domain>

<decisions>
## Implementation Decisions

### Test depth per service
- TokenService: Full behavior coverage for all 3 methods (getSceneNPCTokens, extractCreatureInfo, groupTokensByCreature) — various D&D 5e actor structures, missing fields, custom subtypes. ~20-30 tests.
- TVACacheService: All 3 cache entry formats (path, [path,name], [path,name,tags]) + edge cases (empty cache, malformed entries, category mapping). Also test init() and loadTVACacheFile. ~15-25 tests.
- IndexService: Full behavior — build() with mock data, categorization logic, termIndex construction, cache round-trip via mock StorageService, AND Worker vs direct path parity (INTG-03). ~20-30 tests.
- SearchOrchestrator: All search paths (fuzzy, category fallback, parallel batching) tested in isolation AND as orchestrated flow. Full pipeline integration (INTG-01, INTG-02) included. ~25-35 tests.

### Mock complexity
- D&D 5e actors: Use Phase 2 `createMockActor` helper with extensions for edge cases (missing fields, custom subtypes). Consistent mock shape across project.
- TVA cache data: Shared fixture file (`tests/helpers/mock-tva-cache.js`) with realistic 20-50 entries across multiple creature categories, using all 3 entry formats. Single source of truth imported by TVACacheService, IndexService, and SearchOrchestrator tests.
- Fuse.js: Use real Fuse.js instance (not a stub) for fuzzy search tests — threshold changes actually affect results. Tests verify real matching behavior.
- Exception: For fallback path testing (INTG-02), mock Fuse to force no-match (inject stub returning empty array). Deterministic trigger for category fallback.

### SearchOrchestrator test strategy
- Separate describe blocks for: fuzzy search (TEST-11), category fallback (TEST-12), parallel batching (TEST-13)
- Full orchestration describe block: TVA cache load → index build → search → results (INTG-01)
- Fallback orchestration: no fuzzy match → category search → results (INTG-02) — mock Fuse for deterministic no-match
- Parallel batching: test result correctness with configurable batch sizes only — no timing/concurrency assertions (fragile in CI)
- Integration tests live inside SearchOrchestrator.test.js, not in a separate integration directory

### Test file organization
- Merge Phase 6 DI smoke tests (*.di.test.js) into single *.test.js per service — DI constructor tests become first describe block, behavior tests follow
- One test file per service: TokenService.test.js, TVACacheService.test.js, IndexService.test.js, SearchOrchestrator.test.js
- Worker vs direct parity test (INTG-03) lives in IndexService.test.js
- Shared mock TVA cache fixture in tests/helpers/mock-tva-cache.js

### Claude's Discretion
- Exact test count per method (targets given above are ranges)
- Internal describe block structure within each test file
- Whether to add more helper functions to tests/helpers/mock-helpers.js or keep helpers inline
- Specific mock TVA cache entry data (creature names, paths, categories)
- How to handle async Worker message passing in tests (microtask-based MockWorker from Phase 2)

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `tests/helpers/mock-helpers.js`: `createMockActor`, `addMockTokens`, `setMockSetting`, `resetAllMocks` — Phase 2 infrastructure
- `tests/setup/foundry-mocks.js`: Global stubs for `game`, `canvas`, `ui`, `Hooks`, `MockWorker` — loaded via Vitest setupFiles
- Phase 6 DI smoke tests: 19 tests across 4 files (TVACacheService.di.test.js, TokenService.di.test.js, IndexService.di.test.js, SearchOrchestrator.di.test.js) — to be merged into behavior test files
- `createDefaultGetSetting()` factory in Utils.js — used to create injectable settings accessor

### Established Patterns
- Phase 4/5 convention: describe blocks organized by method name, representative samples over exhaustive enumeration
- Phase 5 StorageService tests: fresh instances per test, `fake-indexeddb` for IndexedDB simulation
- Phase 6 DI pattern: `new ServiceClass({ dep1: mock1, dep2: mock2 })` — never import singletons in tests
- Test file mirrors source: `tests/services/X.test.js` maps to `scripts/services/X.js`

### Integration Points
- All 4 services now have `constructor(deps = {})` from Phase 6 — tests create isolated instances
- MockWorker in foundry-mocks.js simulates async microtask dispatch for Worker-dependent code
- StorageService tests (Phase 5) already pass — IndexService cache tests can rely on mock StorageService
- SearchOrchestrator depends on IndexService + TVACacheService — tests inject mock instances of both

</code_context>

<specifics>
## Specific Ideas

- Requirements coverage: TEST-07, TEST-08, TEST-09, TEST-10, TEST-11, TEST-12, TEST-13, INTG-01, INTG-02, INTG-03
- Phase 6 DI smoke tests absorbed into behavior test files — not deleted, just merged
- Shared mock TVA cache fixture should cover: Forgotten Adventures path patterns, Forge CDN URLs, multiple creature categories
- Real Fuse.js for search quality tests, mock Fuse for orchestration flow tests

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 07-service-layer-tests*
*Context gathered: 2026-03-06*
