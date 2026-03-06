---
phase: 10-error-handling-worker-lifecycle
plan: 02
subsystem: worker-lifecycle
tags: [web-worker, lifecycle, cleanup, beforeunload, notifications]

requires:
  - phase: 06-dependency-injection-refactor
    provides: lazy Worker initialization via _ensureWorker()
  - phase: 10-error-handling-worker-lifecycle plan 01
    provides: createModuleError structured errors in SearchOrchestrator
provides:
  - Worker fallback user notifications in IndexService and SearchOrchestrator
  - beforeunload cleanup handler for Worker termination
  - Tests for Worker fallback notification and terminate() lifecycle
affects: []

tech-stack:
  added: []
  patterns:
    - "ui.notifications.warn on Worker fallback with i18n localization"
    - "try-catch guard around ui.notifications for early-init safety"
    - "beforeunload handler with per-service try-catch for cleanup"

key-files:
  created: []
  modified:
    - scripts/services/IndexService.js
    - scripts/services/SearchOrchestrator.js
    - scripts/main.js
    - tests/services/IndexService.test.js
    - tests/services/SearchOrchestrator.test.js

key-decisions:
  - "SearchOrchestrator searchLocalIndex gets try-catch wrapper for Worker fallback (was missing)"
  - "beforeunload uses searchOrchestrator singleton directly (not searchService which lacks terminate())"
  - "WORK-01 verified: _ensureWorker() confirmed as sole Worker creation path in both services"

patterns-established:
  - "Worker fallback pattern: catch -> null worker -> notify user -> fallback to direct method"

requirements-completed: [WORK-01, WORK-02, WORK-03]

duration: 5min
completed: 2026-03-06
---

# Phase 10 Plan 02: Worker Lifecycle Summary

**Worker fallback notifications via ui.notifications.warn, beforeunload cleanup handler, and 7 new lifecycle tests**

## Performance

- **Duration:** 5 min
- **Started:** 2026-03-06T11:57:53Z
- **Completed:** 2026-03-06T12:03:12Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments
- Worker crash fallback now shows ui.notifications.warn to inform users when the slower direct method is used
- beforeunload handler terminates Workers on page unload, preventing dangling references
- SearchOrchestrator.searchLocalIndex now has a try-catch around Worker path with fallback to direct search
- Verified WORK-01: lazy init via _ensureWorker() is the sole Worker creation path in both IndexService and SearchOrchestrator
- 7 new tests covering fallback notification, terminate() lifecycle, and safety

## Task Commits

Each task was committed atomically:

1. **Task 1: Add Worker fallback notifications and beforeunload cleanup** - `14bb980` (feat)
2. **Task 2: Add tests for Worker fallback notification and termination** - `f970e08` (test)

## Files Created/Modified
- `scripts/services/IndexService.js` - Added ui.notifications.warn in Worker fallback catch block
- `scripts/services/SearchOrchestrator.js` - Added try-catch in searchLocalIndex for Worker fallback with notification
- `scripts/main.js` - Added beforeunload handler, imported searchOrchestrator singleton
- `tests/services/IndexService.test.js` - 4 new tests: fallback notification, worker null after fallback, terminate() cleanup/safety
- `tests/services/SearchOrchestrator.test.js` - 3 new tests: fallback notification, terminate() cleanup/safety

## Decisions Made
- SearchOrchestrator.searchLocalIndex needed a try-catch wrapper for Worker errors -- previously Worker failures would propagate uncaught. Added fallback to searchLocalIndexDirectly.
- Used searchOrchestrator singleton import in main.js for beforeunload (searchService doesn't have terminate()).
- WORK-01 confirmed: _workerFactory() only called inside _ensureWorker() in both IndexService (line 84) and SearchOrchestrator (line 62).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] SearchOrchestrator.searchLocalIndex missing try-catch for Worker errors**
- **Found during:** Task 1
- **Issue:** searchLocalIndex called searchLocalIndexWithWorker without a try-catch, so Worker failures would propagate as unhandled rejections instead of falling back to direct search
- **Fix:** Added try-catch around Worker call path with fallback to searchLocalIndexDirectly, worker null-out, and ui.notifications.warn
- **Files modified:** scripts/services/SearchOrchestrator.js
- **Verification:** New test confirms fallback works and returns results
- **Committed in:** 14bb980

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Essential fix for correct Worker fallback behavior. No scope creep.

## Issues Encountered
- Initial test for IndexService worker fallback used build() which requires getTvaAPI mock -- switched to calling buildFromTVA() directly with pre-loaded cache to isolate the Worker fallback path.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Phase 10 complete -- all error handling and worker lifecycle improvements implemented
- All 498 tests pass
- No blockers for future work

---
*Phase: 10-error-handling-worker-lifecycle*
*Completed: 2026-03-06*
