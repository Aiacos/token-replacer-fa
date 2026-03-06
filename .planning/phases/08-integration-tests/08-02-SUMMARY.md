---
phase: 08-integration-tests
plan: 02
subsystem: testing
tags: [vitest, vi.mock, singleton-mocking, facade-pattern]

requires:
  - phase: 07-service-layer-tests
    provides: service test patterns and mock infrastructure
provides:
  - SearchService facade unit tests (14 tests)
  - Singleton sub-service mocking pattern for facade tests
affects: [08-integration-tests]

tech-stack:
  added: []
  patterns: [vi.mock singleton factory for facade testing]

key-files:
  created:
    - tests/services/SearchService.test.js
  modified: []

key-decisions:
  - "Assert on details field (not message) since createModuleError uses i18n localization for message"
  - "Construct fresh SearchService instance per test (not singleton) for isolation"

patterns-established:
  - "Facade test pattern: mock all singleton dependencies via vi.mock factory, verify wiring and delegation"

requirements-completed: []

duration: 2min
completed: 2026-03-06
---

# Phase 08 Plan 02: SearchService Facade Tests Summary

**14 unit tests covering SearchService init wiring, idempotency, input validation, delegation, and error wrapping**

## Performance

- **Duration:** 2 min
- **Started:** 2026-03-06T09:34:19Z
- **Completed:** 2026-03-06T09:36:27Z
- **Tasks:** 1
- **Files modified:** 1

## Accomplishments
- Full coverage of all 4 public SearchService methods (init, clearCache, searchByCategory, parallelSearchCreatures)
- Verified init idempotency (second call is no-op)
- Validated input type checking (empty string, non-array, non-Map) with structured error responses
- Confirmed structured error passthrough vs unexpected error wrapping behavior

## Task Commits

Each task was committed atomically:

1. **Task 1: Create SearchService facade tests** - `9ae402e` (test)

## Files Created/Modified
- `tests/services/SearchService.test.js` - 14 unit tests for SearchService facade class

## Decisions Made
- Used `details` field assertions instead of `message` because `createModuleError` localizes `message` via `game.i18n.localize()`, putting the raw error text in `details`
- Fresh `new SearchService()` per test instead of importing singleton for cross-test isolation

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed error field assertions to match createModuleError shape**
- **Found during:** Task 1 (TDD RED phase)
- **Issue:** Plan assumed `message` contains raw error text, but `createModuleError` puts localized key in `message` and raw text in `details`
- **Fix:** Changed all `message: expect.stringContaining(...)` assertions to `details: expect.stringContaining(...)`
- **Files modified:** tests/services/SearchService.test.js
- **Verification:** All 14 tests pass
- **Committed in:** 9ae402e

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Necessary correction for test accuracy. No scope creep.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- SearchService facade fully tested, ready for remaining Phase 08 plans
- Full suite (471 tests) passes with no regressions

---
*Phase: 08-integration-tests*
*Completed: 2026-03-06*
