# Phase 5: Storage Tests - Context

**Gathered:** 2026-03-06
**Status:** Ready for planning

<domain>
## Phase Boundary

Write tests for StorageService IndexedDB operations via jsdom. Covers all public methods: CRUD operations (has, save, load, remove, clear), connection management (openDatabase, testConnection, close), and migration (needsMigration, migrateFromLocalStorage). Includes localStorage fallback path testing and core error scenarios. No changes to StorageService source code.

</domain>

<decisions>
## Implementation Decisions

### Test scope
- Test ALL 11 methods on StorageService, not just the 5 in TEST-06
- Core behavior tested with fresh `new StorageService()` instances for isolation
- Separate small describe block verifying the exported `storageService` singleton works correctly
- Migration methods tested with full round-trip: seed localStorage, call migrateFromLocalStorage, verify data in IndexedDB, verify localStorage key removed
- Timestamp metadata verified: assert `timestamp` is a number and roughly current (within a few seconds)

### Fallback coverage
- Dedicated `describe('localStorage fallback')` block where `isIndexedDBSupported` is set to false
- All 5 CRUD operations tested through localStorage-only path, separate from IndexedDB tests
- localStorage `save()` size limit (~4.5MB) rejection path tested — verify save() returns false for oversized data
- `clear()` selective cleanup verified: seed localStorage with module keys + unrelated keys, call clear(), verify only `token-replacer-fa`-prefixed keys removed

### IndexedDB environment
- Research-first approach: let the research phase determine whether jsdom's IndexedDB is complete enough
- If jsdom has gaps, install `fake-indexeddb` as a dev dependency (approved by user)
- No manual IndexedDB mocking — use either jsdom's built-in or fake-indexeddb

### Error simulation
- Core errors only: transaction abort (TEST-06 requirement), open failure, save/load/remove errors
- Skip connection lifecycle events (onblocked, onversionchange, onclose) — deferred to Phase 10
- Silent fallthrough tested: simulate IndexedDB failure, verify operations still succeed via localStorage
- Dedicated `has()` tests: verify true for existing keys, false for missing keys, works via localStorage fallback

### Claude's Discretion
- Exact test count per method (aim for meaningful coverage)
- How to simulate IndexedDB failures (spy on openDatabase vs manipulate isIndexedDBSupported)
- Whether to use beforeEach/afterEach for database cleanup or fresh instances per test
- Test data shapes (simple strings vs complex nested objects for save/load round-trips)

</decisions>

<specifics>
## Specific Ideas

No specific requirements — open to standard Vitest testing patterns. Follow the Phase 4 convention of structural + representative testing.

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `tests/setup/foundry-mocks.js`: Global stubs for `game`, `window`, `localStorage` — already loaded via Vitest setupFiles
- `tests/helpers/mock-helpers.js`: `setSetting()`, `resetAllMocks()` — useful for debug logging tests
- Phase 4 test patterns: `tests/core/Constants.test.js` (72 tests) and `tests/core/Utils.test.js` (126 tests) as style reference

### Established Patterns
- Test file mirrors source: `tests/services/StorageService.test.js` maps to `scripts/services/StorageService.js`
- Describe blocks organized by method name: `describe('save()', () => { ... })`
- Vitest jsdom environment provides `window`, `localStorage` globals
- StorageService uses module-scope constants: `DB_NAME = 'token-replacer-fa'`, `DB_VERSION = 1`, `STORE_NAME = 'index'`

### Integration Points
- StorageService is consumed by IndexService (Phase 7) — tests here establish patterns reused in Phase 7
- StorageService exports singleton `storageService` used by IndexService at import time
- IndexService calls `storageService.save()`, `storageService.load()` for index caching with version checks

</code_context>

<deferred>
## Deferred Ideas

- Connection lifecycle event testing (onblocked, onversionchange, onclose) — Phase 10
- Error handling standardization (createModuleError pattern) — Phase 10
- IndexService integration with StorageService — Phase 7

</deferred>

---

*Phase: 05-storage-tests*
*Context gathered: 2026-03-06*
