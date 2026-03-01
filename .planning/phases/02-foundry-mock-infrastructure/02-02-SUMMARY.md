---
phase: 02-foundry-mock-infrastructure
plan: 02
subsystem: testing
tags: [vitest, mock-helpers, tdd, d&d-5e, tva]

# Dependency graph
requires:
  - phase: 02-foundry-mock-infrastructure/01
    provides: "Global Foundry VTT mock stubs (game, canvas, ui, Hooks, Worker)"
provides:
  - "setTVAAvailable helper for toggling TVA module in tests"
  - "setFANexusAvailable helper for toggling FA Nexus module in tests"
  - "setSetting helper for per-test setting overrides"
  - "resetAllMocks helper for clearing all mock state"
  - "createMockActor helper for building D&D 5e actor objects"
  - "createMockToken helper for building token objects with actors"
  - "addMockTokens helper for populating canvas.tokens arrays"
affects: [04-constants-utils, 05-index-service, 06-search-service, 07-token-service, 08-ui-manager]

# Tech tracking
tech-stack:
  added: []
  patterns: [mock-helper-exports, actor-factory, token-factory]

key-files:
  created:
    - tests/helpers/mock-helpers.js
    - tests/helpers/mock-helpers.test.js
  modified: []

key-decisions:
  - "Mock helpers access game.settings._stores.values Map directly for per-test setting overrides"
  - "createMockActor uses destructured overrides with defaults matching TokenService's D&D 5e actor shape"
  - "addMockTokens replaces (not appends) canvas.tokens arrays for predictable test state"

patterns-established:
  - "Factory pattern: createMockActor/createMockToken with random IDs and overrides"
  - "State toggle pattern: setTVAAvailable(bool) for feature flag testing"
  - "Settings override pattern: setSetting(key, value) writes to internal store"

requirements-completed: [MOCK-01, MOCK-03, MOCK-05]

# Metrics
duration: 2min
completed: 2026-03-01
---

# Phase 02 Plan 02: Mock Helper Utilities Summary

**7 exported test helper functions (TVA toggle, settings override, actor/token factories, state reset) with 35 passing tests via TDD**

## Performance

- **Duration:** 2 min
- **Started:** 2026-03-01T07:39:27Z
- **Completed:** 2026-03-01T07:41:45Z
- **Tasks:** 1 (TDD: RED + GREEN)
- **Files modified:** 2

## Accomplishments
- Created 7 exported helper functions covering all common mock setup patterns
- Built D&D 5e actor factory matching TokenService's expected `system.details.type` shape
- TDD workflow: 35 tests written first (RED), then implementation (GREEN), all passing
- Total test suite: 63 tests (35 helper + 28 smoke) all green

## Task Commits

Each task was committed atomically:

1. **Task 1 (RED): Add failing tests for mock helpers** - `ba10091` (test)
2. **Task 1 (GREEN): Implement mock helper utilities** - `eb85dec` (feat)

_TDD task: two commits (test then feat)_

## Files Created/Modified
- `tests/helpers/mock-helpers.js` - 7 exported helper functions for per-test mock customization (206 lines)
- `tests/helpers/mock-helpers.test.js` - 35 tests covering all helper function behaviors (282 lines)

## Decisions Made
- Mock helpers access `game.settings._stores.values` Map directly rather than going through `game.settings.set()` — this is a deliberate choice to bypass the async API and provide synchronous per-test overrides
- `createMockActor` uses destructured overrides with sensible defaults, matching the exact `actor.system.details.type.value/subtype/custom` path that TokenService reads
- `addMockTokens` replaces arrays (spread into new array) rather than appending, ensuring each test starts with a predictable token set

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- All mock infrastructure (Phase 02) is complete: global stubs + helper utilities
- Phase 03 (CI), Phase 04 (Constants/Utils tests), and Phase 05 (IndexService tests) can now proceed
- Helper functions are imported directly — no additional setup needed beyond `tests/setup/foundry-mocks.js` in setupFiles

## Self-Check: PASSED

- [x] tests/helpers/mock-helpers.js exists (7 exported functions)
- [x] tests/helpers/mock-helpers.test.js exists (35 tests)
- [x] Commit ba10091 exists (TDD RED)
- [x] Commit eb85dec exists (TDD GREEN)
- [x] npm test: 63 tests passed (63)

---
*Phase: 02-foundry-mock-infrastructure*
*Completed: 2026-03-01*
