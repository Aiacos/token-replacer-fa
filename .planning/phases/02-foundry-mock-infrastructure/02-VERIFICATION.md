---
phase: 02-foundry-mock-infrastructure
verified: 2026-03-01T08:46:00Z
status: passed
score: 11/11 must-haves verified
re_verification: false
---

# Phase 2: Foundry Mock Infrastructure Verification Report

**Phase Goal:** Create comprehensive Foundry VTT mock infrastructure that enables isolated unit testing of module services without requiring a live Foundry server.
**Verified:** 2026-03-01T08:46:00Z
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

Combined from both plan must_haves (02-01 and 02-02):

| #  | Truth                                                                                                                   | Status     | Evidence                                                                                                    |
|----|-------------------------------------------------------------------------------------------------------------------------|------------|-------------------------------------------------------------------------------------------------------------|
| 1  | Importing any module file in a test does not throw ReferenceError on game, canvas, ui, Hooks, Worker, foundry, etc.    | VERIFIED  | 8 smoke tests in foundry-mocks.smoke.test.js confirm clean import of all singleton services — 28/28 pass    |
| 2  | game.settings.get('token-replacer-fa', 'debugMode') returns false (default) without throwing                           | VERIFIED  | foundry-mocks.js line 224 pre-registers debugMode default; smoke test line 77 confirms false returned       |
| 3  | game.settings.register() stores defaults that game.settings.get() can retrieve                                          | VERIFIED  | In-memory _settingsDefaults Map + smoke test "settings round-trip" describe block, 5/5 passing              |
| 4  | new Worker(url) returns a MockWorker instance with postMessage spy                                                       | VERIFIED  | foundry-mocks.js lines 168-203; smoke test "Worker constructor" test confirms url, postMessage, terminate    |
| 5  | game.modules is a real Map supporting .get(), .has(), .set(), .delete()                                                 | VERIFIED  | foundry-mocks.js line 50: `modules: new Map()`; smoke test asserts `toBeInstanceOf(Map)`                   |
| 6  | foundry.applications.api.ApplicationV2 is a class that can be extended with ES class syntax                             | VERIFIED  | foundry-mocks.js lines 100-117; smoke test extends it and asserts options.title === 'Test'                  |
| 7  | Tests can call setTVAAvailable(true) to add token-variants to game.modules and setTVAAvailable(false) to remove it      | VERIFIED  | mock-helpers.js lines 29-49; mock-helpers.test.js lines 23-65 verify both directions, 5 passing tests       |
| 8  | Tests can call setSetting('debugMode', true) to override a module setting for a single test                             | VERIFIED  | mock-helpers.js line 82; mock-helpers.test.js lines 90-113 verify round-trip via game.settings.get          |
| 9  | Tests can call resetAllMocks() to restore all mock state to clean defaults                                              | VERIFIED  | mock-helpers.js lines 96-118; mock-helpers.test.js lines 116-162 verify settings, modules, canvas, spies    |
| 10 | Tests can call addMockTokens([...]) to populate canvas.tokens.placeables for TokenService tests                         | VERIFIED  | mock-helpers.js lines 212-215; mock-helpers.test.js lines 253-280 verify placeables + controlled filtering  |
| 11 | Tests can call createMockActor({...}) to build a D&D 5e actor-shaped object for TokenService tests                      | VERIFIED  | mock-helpers.js lines 137-166 builds actor with system.details.type.value matching TokenService path         |

**Score:** 11/11 truths verified

### Required Artifacts

| Artifact                                     | Expected                                             | Status    | Details                                                                  |
|----------------------------------------------|------------------------------------------------------|-----------|--------------------------------------------------------------------------|
| `tests/setup/foundry-mocks.js`               | All Foundry VTT global stubs via vi.stubGlobal       | VERIFIED  | 252 lines (min: 100); contains all 10 required vi.stubGlobal calls       |
| `vitest.config.js`                           | setupFiles entry pointing to foundry-mocks.js        | VERIFIED  | Line 8: `setupFiles: ['tests/setup/foundry-mocks.js']`                  |
| `tests/helpers/mock-helpers.js`              | Exported test helper functions for per-test use      | VERIFIED  | 215 lines (min: 80); exports all 7 required functions                    |
| `tests/helpers/mock-helpers.test.js`         | Tests verifying all helper functions work correctly  | VERIFIED  | 281 lines (min: 60); 35 tests all passing                                |
| `tests/setup/foundry-mocks.smoke.test.js`    | Smoke tests validating mock infrastructure           | VERIFIED  | 197 lines; 28 tests all passing                                          |

**All artifacts exist, are substantive, and are wired.**

### Key Link Verification

| From                              | To                               | Via                                             | Status    | Details                                                                                    |
|-----------------------------------|----------------------------------|-------------------------------------------------|-----------|--------------------------------------------------------------------------------------------|
| `vitest.config.js`                | `tests/setup/foundry-mocks.js`   | setupFiles config array                         | WIRED     | Line 8: `setupFiles: ['tests/setup/foundry-mocks.js']` — exact pattern match              |
| `tests/setup/foundry-mocks.js`    | `scripts/services/IndexService.js` | Worker global must exist before singleton       | WIRED     | Line 203: `vi.stubGlobal('Worker', MockWorker)` — confirmed by smoke test import success  |
| `tests/setup/foundry-mocks.js`    | `scripts/core/Utils.js`           | game.settings must exist before createDebugLogger | WIRED   | Line 44: `vi.stubGlobal('game', {...})` — confirmed by smoke test import success          |
| `tests/helpers/mock-helpers.js`   | `tests/setup/foundry-mocks.js`   | Accesses game.settings._stores internal state   | WIRED     | Line 82: `game.settings._stores.values.set(...)` — confirmed by helper tests              |
| `tests/helpers/mock-helpers.js`   | `scripts/services/TokenService.js` | createMockActor matches D&D 5e actor shape     | WIRED     | Lines 152-157 build `system.details.type.value` matching TokenService.extractCreatureInfo  |

### Requirements Coverage

| Requirement | Source Plan         | Description                                          | Status    | Evidence                                                                              |
|-------------|---------------------|------------------------------------------------------|-----------|---------------------------------------------------------------------------------------|
| MOCK-01     | 02-01, 02-02        | game object with settings, modules, i18n, system     | SATISFIED | vi.stubGlobal('game', {...}) at line 44 with all required sub-objects                 |
| MOCK-02     | 02-01               | ui object with notifications stub                    | SATISFIED | vi.stubGlobal('ui', {...}) at line 60 with info/warn/error vi.fn() spies              |
| MOCK-03     | 02-01, 02-02        | canvas object with tokens collection stub            | SATISFIED | vi.stubGlobal('canvas', {...}) at line 72 with placeables/controlled arrays          |
| MOCK-04     | 02-01               | Hooks registration and trigger stubs                 | SATISFIED | vi.stubGlobal('Hooks', {...}) at line 85 with on/once/off/call/callAll vi.fn() spies |
| MOCK-05     | 02-01, 02-02        | Mock Worker implementation for Worker-dependent code | SATISFIED | MockWorker class at lines 168-201 with postMessage spy and _simulateMessage method    |

**All 5 phase requirements (MOCK-01 through MOCK-05) are satisfied. No orphaned requirements found.**

**Requirements.md traceability check:** All five MOCK-* requirements are marked `[x]` (complete) in REQUIREMENTS.md traceability table — consistent with verification findings.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `tests/setup/foundry-mocks.js` | 121, 134 | `async (_paths) => {}` empty body | Info | Intentional no-op mocks for loadTemplates — correct behavior for test stubs |
| `tests/helpers/mock-helpers.js` | 36, 42 | `async () => {}` empty body | Info | Intentional no-op mocks for cacheImages/updateTokenImage TVA API stubs — correct |

No blockers. No warnings. Empty async functions are intentional mock stubs, not implementation gaps.

### Human Verification Required

None. All phase 2 deliverables are programmatically verifiable:
- Test execution confirms all 63 tests pass
- File existence and content are directly inspectable
- Key links are confirmed by grep and test execution

### Gaps Summary

No gaps. All 11 observable truths are verified. All 5 artifacts exist and pass the three-level check (exists, substantive, wired). All 5 key links are confirmed wired. All 5 requirements are satisfied. The test suite exits 0 with 63/63 tests passing.

**Test run output:**
```
Test Files  2 passed (2)
     Tests  63 passed (63)
  Start at  08:45:14
  Duration  930ms
```

**Commit hashes verified:**
- `2375aac` — feat(02-01): create foundry-mocks.js with all Foundry VTT global stubs
- `6c39df0` — chore(02-01): add setupFiles entry for foundry-mocks.js in vitest config
- `0718e47` — test(02-01): add smoke tests validating mock infrastructure
- `ba10091` — test(02-02): add failing tests for mock helper utilities (TDD RED)
- `eb85dec` — feat(02-02): implement mock helper utilities for per-test customization (TDD GREEN)

---

_Verified: 2026-03-01T08:46:00Z_
_Verifier: Claude (gsd-verifier)_
