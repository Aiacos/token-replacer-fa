---
phase: 06-dependency-injection-refactor
plan: 01
subsystem: testing
tags: [dependency-injection, vitest, constructor-di, singleton-pattern]

# Dependency graph
requires:
  - phase: 02-foundry-mock-infrastructure
    provides: mock helpers (createMockActor, createMockToken, addMockTokens)
  - phase: 05-storage-tests
    provides: validated StorageService for DI injection
provides:
  - createDefaultGetSetting() factory in Utils.js for lazy settings access
  - TVACacheService constructor DI (getTvaAPI, getSetting, storageService)
  - TokenService instance class with canvas DI and singleton export
  - DI smoke tests for both services (11 tests total)
affects: [06-02, 07-search-tests, 08-integration-tests]

# Tech tracking
tech-stack:
  added: []
  patterns: [constructor-di-with-defaults, lazy-global-access, singleton-with-di-constructor]

key-files:
  created:
    - tests/services/TVACacheService.di.test.js
    - tests/services/TokenService.di.test.js
  modified:
    - scripts/core/Utils.js
    - scripts/services/TVACacheService.js
    - scripts/services/TokenService.js
    - scripts/main.js

key-decisions:
  - "Lazy global pattern: constructor defaults use arrow functions that defer global access until method call time"
  - "TokenService converted from static-only to instance class; singleton export preserves backward compatibility"

patterns-established:
  - "Constructor DI pattern: constructor(deps = {}) with destructured defaults pointing to real globals"
  - "Singleton export pattern: export const service = new Service() alongside export class Service"

requirements-completed: [DI-02, DI-03, DI-05]

# Metrics
duration: 3min
completed: 2026-03-06
---

# Phase 06 Plan 01: Leaf Service DI Summary

**Constructor DI for TVACacheService (getTvaAPI, getSetting, storageService) and TokenService (canvas) with lazy global defaults and singleton exports**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-06T07:07:57Z
- **Completed:** 2026-03-06T07:11:12Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments
- TVACacheService accepts injected getTvaAPI, getSetting, and storageService deps; falls back to Foundry globals when no injection provided
- TokenService converted from static class to instance class with canvas DI; all 4 main.js call sites updated
- 11 new DI smoke tests pass; full suite of 303 tests green with zero regressions

## Task Commits

Each task was committed atomically:

1. **Task 1: Add createDefaultGetSetting factory to Utils.js + Refactor TVACacheService with constructor DI** - `947164e` (feat)
2. **Task 2: Convert TokenService from static to instance class with DI + Update main.js call sites** - `cd0a4a0` (feat)

## Files Created/Modified
- `scripts/core/Utils.js` - Added createDefaultGetSetting() lazy factory function
- `scripts/services/TVACacheService.js` - Constructor DI with getTvaAPI, getSetting, storageService deps; all internal storageService refs use this._storageService
- `scripts/services/TokenService.js` - Converted from static to instance class with canvas DI; singleton export added
- `scripts/main.js` - Updated import and 3 call sites from TokenService.method() to tokenService.method()
- `tests/services/TVACacheService.di.test.js` - 5 DI smoke tests for TVACacheService
- `tests/services/TokenService.di.test.js` - 6 DI smoke tests for TokenService

## Decisions Made
- Lazy global pattern: constructor defaults use arrow functions (`() => game.modules.get(...)`) so globals are never accessed at construction time, only when methods are called
- TokenService converted from static-only to instance class; the singleton `export const tokenService = new TokenService()` preserves identical runtime behavior

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- TVACacheService and TokenService are DI-ready; Plan 02 can build on these patterns for IndexService and SearchOrchestrator
- All 303 tests pass; no regressions from the refactoring

---
*Phase: 06-dependency-injection-refactor*
*Completed: 2026-03-06*
