# Phase 8: Integration Tests - Context

**Gathered:** 2026-03-06
**Status:** Ready for planning

<domain>
## Phase Boundary

Write true end-to-end integration tests that wire real service instances together and verify data flows across service boundaries. Also test the SearchService facade (init, delegation, error handling). Covers requirements INTG-01, INTG-02, INTG-03. No changes to service source code.

</domain>

<decisions>
## Implementation Decisions

### Integration test depth
- Phase 7 already has mock-based INTG-01/02/03 tests (orchestration-level with vi.fn() stubs) — keep those as-is
- Phase 8 adds **real-service integration tests** that wire actual TVACacheService, IndexService, and SearchOrchestrator instances together
- Real Fuse.js for fuzzy search, real index building, real cache parsing — no mocked neighbors
- Tests validate actual data flow across service boundaries, catching interface mismatches that mocks would hide

### Test file location
- New file: `tests/integration/SearchPipeline.test.js` — clearly separates unit tests (mocked deps) from integration tests (real deps)
- SearchService facade tests: `tests/services/SearchService.test.js` — follows existing `tests/services/X.test.js` convention

### Fixture strategy
- Reuse existing `tests/helpers/mock-tva-cache.js` (33+ entries, 6 categories, all 3 entry formats) — proven realistic data
- No new fixture files needed

### Cross-service flows to cover
- **Full happy path**: TVACacheService parses cache → IndexService builds index → SearchOrchestrator fuzzy search → ranked results
- **Fallback path**: Fuzzy search returns nothing → category search via real index → results
- **Cache round-trip**: IndexService builds index → saves to mock StorageService → loads from cache → search produces same results
- **Worker vs direct parity**: Build index via MockWorker and via direct path → compare structures (upgrade existing INTG-03 to use real IndexService)

### SearchService facade testing
- Test depth: init + delegation (~8-12 tests)
- Verify init() wires TVACacheService and ForgeBazaarService into SearchOrchestrator
- Verify clearCache() propagates to sub-services
- Verify searchByCategory() and parallelSearchCreatures() delegate correctly
- Verify error wrapping (createModuleError) for invalid inputs and unexpected errors
- Verify idempotent init (second call is no-op)

### Relationship to Phase 7 tests
- Keep existing mock-based INTG-01/02 in SearchOrchestrator.test.js — they validate orchestration logic (call sequences, caching behavior)
- Keep existing INTG-03 in IndexService.test.js — validates structure comparison
- New real-service tests validate a different concern: actual data correctness across service boundaries

### Claude's Discretion
- Exact test count per flow (targets above are guidance)
- Internal describe block structure within SearchPipeline.test.js
- How to construct real service instances with DI (which deps to inject vs let default)
- Whether to add helper functions for common integration setup patterns

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `tests/helpers/mock-tva-cache.js`: 33+ entries across 6 categories — feeds TVACacheService and IndexService
- `tests/helpers/mock-helpers.js`: `createMockActor`, `setMockSetting`, `resetAllMocks` — may be useful for integration setup
- `tests/setup/foundry-mocks.js`: MockWorker for Worker parity tests
- Phase 6 DI constructors: `new TVACacheService({ ... })`, `new IndexService({ ... })`, `new SearchOrchestrator({ ... })`
- `createDefaultGetSetting()` factory in Utils.js for injectable settings

### Established Patterns
- Phase 7 convention: describe blocks by method/flow, real Fuse.js for search quality, StubFuse for fallback path
- Phase 6 DI pattern: `new ServiceClass({ dep1, dep2 })` with lazy defaults
- Test file mirrors source: `tests/services/X.test.js` maps to `scripts/services/X.js`
- Integration tests get their own directory: `tests/integration/`

### Integration Points
- TVACacheService.parseCacheEntries() converts raw cache JSON to normalized objects
- IndexService.build() takes parsed images and creates categorized index with termIndex
- SearchOrchestrator.searchTokenArt() is the main entry point exercising the full pipeline
- SearchService.init() wires singletons together via setDependencies()
- MockWorker in foundry-mocks.js simulates async Worker message dispatch

</code_context>

<specifics>
## Specific Ideas

- Requirements coverage: INTG-01, INTG-02, INTG-03
- Real-service integration tests should exercise actual TVACacheService cache parsing → IndexService index building → SearchOrchestrator search
- SearchService facade tests should verify the wiring layer that main.js depends on
- Cache round-trip test catches serialization bugs that unit tests with mocked StorageService would miss
- Worker parity upgrade verifies real IndexService behavior, not just simulated Worker response

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 08-integration-tests*
*Context gathered: 2026-03-06*
