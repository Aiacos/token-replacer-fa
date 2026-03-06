---
phase: 10-error-handling-worker-lifecycle
plan: 01
subsystem: error-handling
tags: [error-handling, try-catch, createModuleError, localization, notifications]

# Dependency graph
requires:
  - phase: 06-dependency-injection-refactor
    provides: createModuleError utility in Utils.js
provides:
  - Standardized error handling across all main.js hooks
  - Consistent createModuleError usage in all service files (except IndexWorker.js)
  - Recovery suggestion surfacing in user notifications
  - New localization keys for error notifications
affects: [10-error-handling-worker-lifecycle]

# Tech tracking
tech-stack:
  added: []
  patterns: [hook-try-catch-with-notifications, recovery-suggestion-surfacing, createModuleError-in-services]

key-files:
  created: []
  modified:
    - scripts/main.js
    - scripts/services/SearchOrchestrator.js
    - scripts/services/TokenService.js
    - lang/en.json
    - lang/it.json

key-decisions:
  - "Recovery suggestions appended to notification text with 'Try: ' prefix, permanent flag only when suggestions present"
  - "StorageService abort handlers confirmed correct (all call reject()) -- no changes needed for ERR-03"
  - "token_replace_failed error key added for TokenService structured logging"

patterns-established:
  - "Hook error pattern: try-catch at top level, console.error + ui.notifications.error, permanent only with recovery suggestions"
  - "Service error pattern: throw createModuleError() instead of bare throw new Error()"

requirements-completed: [ERR-01, ERR-02, ERR-03, ERR-04]

# Metrics
duration: 3min
completed: 2026-03-06
---

# Phase 10 Plan 01: Error Handling Standardization Summary

**Standardized error handling with try-catch on all main.js hooks and createModuleError in all service files, with recovery suggestion surfacing in user notifications**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-06T11:51:49Z
- **Completed:** 2026-03-06T11:54:49Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments
- All three main.js hooks (init, ready IIFE, getSceneControlButtons) wrapped with top-level try-catch + ui.notifications.error
- Zero bare `throw new Error()` remaining in service files (excluding IndexWorker.js which is intentionally left as-is)
- Recovery suggestions from createModuleError are surfaced in user-visible notifications with permanent flag
- New localization keys (initFailed, backgroundFailed, workerFallback, token_replace_failed) in both en.json and it.json

## Task Commits

Each task was committed atomically:

1. **Task 1: Wrap main.js hooks with try-catch and surface recovery suggestions** - `a026681` (feat)
2. **Task 2: Convert remaining bare throws and silent error exits in services** - `89bfdbd` (feat)

## Files Created/Modified
- `scripts/main.js` - Added try-catch to all 3 hooks, recovery suggestion surfacing in processTokenReplacement notification fallback
- `scripts/services/SearchOrchestrator.js` - Converted 3 bare throws/rejects to createModuleError (import added)
- `scripts/services/TokenService.js` - Used createModuleError for structured error logging in replaceTokenImage (import added)
- `lang/en.json` - Added initFailed, backgroundFailed, workerFallback, token_replace_failed keys
- `lang/it.json` - Added matching Italian translations

## Decisions Made
- Recovery suggestions appended with "Try: " prefix and joined with ". " separator for readability
- StorageService abort handlers verified correct (all call reject()) -- ERR-03 confirmed without code changes
- Added token_replace_failed error key to localization files for TokenService createModuleError usage
- Init hook uses game.i18n directly (not tokenReplacerApp.i18n) since settings may not be registered yet on failure

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Added token_replace_failed localization key**
- **Found during:** Task 2 (TokenService createModuleError conversion)
- **Issue:** createModuleError uses game.i18n.localize for error type keys; token_replace_failed was not in localization files
- **Fix:** Added token_replace_failed key to both en.json and it.json
- **Files modified:** lang/en.json, lang/it.json
- **Verification:** Tests pass, key exists in both language files
- **Committed in:** 89bfdbd (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 missing critical)
**Impact on plan:** Essential for correctness -- createModuleError would produce unlocalizable error without the key.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Error handling standardized across all hooks and services
- Ready for Plan 02 (worker lifecycle management) which builds on this error handling foundation

---
*Phase: 10-error-handling-worker-lifecycle*
*Completed: 2026-03-06*
