---
phase: 02-foundry-mock-infrastructure
plan: 01
subsystem: testing
tags: [vitest, vi.stubGlobal, foundry-vtt, mock-worker, jsdom]

# Dependency graph
requires:
  - phase: 01-tooling-foundation
    provides: Vitest + jsdom environment, vitest.config.js
provides:
  - Global Foundry VTT mock setup (game, ui, canvas, Hooks, Worker, foundry namespace)
  - In-memory settings store with register/get/set round-trip
  - MockWorker class with async _simulateMessage/_simulateError
  - Pre-registered module settings defaults (10 settings)
  - Per-test isolation via beforeEach reset
affects: [02-02, 04-core-utils-tests, 05-storage-tests, 06-di-refactor, 07-service-tests, 08-integration-tests]

# Tech tracking
tech-stack:
  added: []
  patterns: [vi.stubGlobal for Foundry globals, in-memory settings store, MockWorker with async dispatch, setupFiles for pre-import mock injection]

key-files:
  created:
    - tests/setup/foundry-mocks.js
    - tests/setup/foundry-mocks.smoke.test.js
  modified:
    - vitest.config.js

key-decisions:
  - "Hand-written mocks over @rayners/foundry-test-utils (gaps in settings/Worker/ApplicationV2, avoids GitHub Packages auth)"
  - "MockWorker uses async microtask dispatch matching real Worker behavior"
  - "Pre-register all 10 module settings defaults in setup file so import-time createDebugLogger calls succeed"

patterns-established:
  - "setupFiles pattern: tests/setup/foundry-mocks.js runs before all test imports"
  - "In-memory settings store: register stores default, get returns stored then default, set overrides"
  - "MockWorker._simulateMessage for async worker response simulation in tests"
  - "beforeEach reset: clear settings store values (not defaults), clear spies, reset canvas tokens"

requirements-completed: [MOCK-01, MOCK-02, MOCK-03, MOCK-04, MOCK-05]

# Metrics
duration: 3min
completed: 2026-03-01
---

# Phase 2 Plan 1: Global Foundry Mock Setup Summary

**Hand-written Foundry VTT global mock setup with in-memory settings store, MockWorker class, and 28 passing smoke tests verifying all 8 module files import without ReferenceError**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-01T07:33:56Z
- **Completed:** 2026-03-01T07:36:48Z
- **Tasks:** 3
- **Files modified:** 3

## Accomplishments
- Created comprehensive Foundry VTT mock infrastructure covering all 10 global objects (game, ui, canvas, Hooks, foundry, Worker, renderTemplate, loadTemplates, FilePicker, Dialog)
- In-memory settings store with full register/get/set round-trip and 10 pre-registered module defaults
- MockWorker class with async _simulateMessage/_simulateError, postMessage/terminate spies, and addEventListener support
- All 8 key module files (Constants, Utils, IndexService, SearchService, TVACacheService, StorageService, TokenService, ScanService) import cleanly in tests without ReferenceError

## Task Commits

Each task was committed atomically:

1. **Task 1: Create foundry-mocks.js with all global stubs and MockWorker** - `2375aac` (feat)
2. **Task 2: Update vitest.config.js with setupFiles and verify imports work** - `6c39df0` (chore)
3. **Task 3: Create smoke test that imports all singleton services without ReferenceError** - `0718e47` (test)

## Files Created/Modified
- `tests/setup/foundry-mocks.js` - Global Foundry VTT mock setup file loaded via Vitest setupFiles (252 lines)
- `tests/setup/foundry-mocks.smoke.test.js` - 28 smoke tests validating mock infrastructure and module imports
- `vitest.config.js` - Added setupFiles entry pointing to foundry-mocks.js

## Decisions Made
- Hand-written all mocks instead of using @rayners/foundry-test-utils (package has gaps in settings round-trip, Worker, ApplicationV2, and requires GitHub Packages auth)
- MockWorker uses async microtask dispatch (await Promise.resolve()) matching real Worker asynchronous behavior
- Pre-registered all 10 module settings defaults in setup file so createDebugLogger calls at import time receive real values
- Excluded UIManager and SearchOrchestrator from import smoke tests (complex initialization beyond ReferenceError scope)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None - all 28 tests passed on first run.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Mock infrastructure ready for Plan 02-02 (test helper utilities)
- All singleton services import cleanly, enabling service-level tests in Phases 4-8
- IndexedDB note: jsdom provides basic IndexedDB support but may need fake-indexeddb in Phase 5 (flagged in STATE.md)

## Self-Check: PASSED

All files verified present, all commit hashes found in git log.

---
*Phase: 02-foundry-mock-infrastructure*
*Completed: 2026-03-01*
