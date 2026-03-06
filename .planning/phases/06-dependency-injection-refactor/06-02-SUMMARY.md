---
phase: 06-dependency-injection-refactor
plan: 02
subsystem: testing
tags: [dependency-injection, constructor-di, lazy-worker, singleton-pattern]

# Dependency graph
requires:
  - phase: 06-dependency-injection-refactor
    provides: createDefaultGetSetting factory, DI patterns from Plan 01
  - phase: 05-storage-tests
    provides: validated StorageService for DI injection
provides:
  - IndexService constructor DI (storageService, workerFactory, getSetting, getTvaAPI) with lazy Worker
  - SearchOrchestrator constructor DI (indexService, tvaCacheService, forgeBazaarService, getSetting, workerFactory)
  - DI smoke tests for both services (8 tests total)
affects: [07-search-tests, 08-integration-tests]

# Tech tracking
tech-stack:
  added: []
  patterns: [lazy-worker-factory, constructor-di-with-defaults, underscore-prefixed-di-properties]

key-files:
  created:
    - tests/services/IndexService.di.test.js
    - tests/services/SearchOrchestrator.di.test.js
  modified:
    - scripts/services/IndexService.js
    - scripts/services/SearchOrchestrator.js

key-decisions:
  - "IndexService Worker creation moved from eager (constructor) to lazy (_ensureWorker) via injected workerFactory"
  - "SearchOrchestrator _tryInternalCache simplified: removed game.modules.get call since tvaAPI already covers tvaModule.api paths"

patterns-established:
  - "Lazy Worker pattern: _ensureWorker() called before any this.worker usage, factory injected via constructor"
  - "Underscore-prefixed DI properties: this._tvaCacheService, this._forgeBazaarService, this._indexService"

requirements-completed: [DI-01, DI-04, DI-05]

# Metrics
duration: 5min
completed: 2026-03-06
---

# Phase 06 Plan 02: Dependent Service DI Summary

**Constructor DI for IndexService (storageService, workerFactory, getSetting, getTvaAPI with lazy Worker) and SearchOrchestrator (indexService, tvaCacheService, forgeBazaarService, getSetting, workerFactory) with backward-compatible singleton exports**

## Performance

- **Duration:** 5 min
- **Started:** 2026-03-06T07:14:32Z
- **Completed:** 2026-03-06T07:19:47Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- IndexService accepts injected deps and defers Worker creation to first use via _ensureWorker()
- SearchOrchestrator accepts injected deps; all game.settings.get, indexService, and Worker references replaced
- setDependencies() preserved for SearchService.init() singleton wiring
- 8 new DI smoke tests pass; full suite of 311 tests green with zero regressions

## Task Commits

Each task was committed atomically:

1. **Task 1: Refactor IndexService with constructor DI and lazy Worker initialization** - `d68b0b8` (feat)
2. **Task 2: Refactor SearchOrchestrator with constructor DI + Update SearchService wiring** - `b2202f8` (feat)

## Files Created/Modified
- `scripts/services/IndexService.js` - Constructor DI with storageService, workerFactory, getSetting, getTvaAPI deps; lazy Worker via _ensureWorker(); all bare global refs replaced
- `scripts/services/SearchOrchestrator.js` - Constructor DI with indexService, tvaCacheService, forgeBazaarService, getSetting, workerFactory deps; all bare global refs replaced; setDependencies() kept for backward compat
- `tests/services/IndexService.di.test.js` - 4 DI smoke tests for IndexService
- `tests/services/SearchOrchestrator.di.test.js` - 4 DI smoke tests for SearchOrchestrator

## Decisions Made
- IndexService Worker creation moved from eager (constructor) to lazy (_ensureWorker) via injected workerFactory -- prevents Worker creation during tests
- SearchOrchestrator _tryInternalCache simplified: removed separate game.modules.get('token-variants') call since tvaAPI (already the .api property) covers the same cache paths
- SearchService.js required no changes: setDependencies() bridge still sets _tvaCacheService and _forgeBazaarService on the singleton

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- All 4 services (TVACacheService, TokenService, IndexService, SearchOrchestrator) now have constructor DI
- Phase 6 complete; Phase 7 (search tests) can proceed with fully injectable services
- All 311 tests pass; no regressions from the refactoring

---
*Phase: 06-dependency-injection-refactor*
*Completed: 2026-03-06*
