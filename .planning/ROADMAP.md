# Roadmap: Token Replacer FA — Quality Refactor

## Overview

Starting from a working v2.12.3 production module with zero test infrastructure, this roadmap builds quality engineering practices in strict dependency order: tooling must exist before tests can run, mocks must exist before service tests can run, dependency injection must land before service tests are meaningful, and the type safety pass only becomes meaningful after DI cleanly separates pure logic from Foundry-dependent code. Every phase delivers a verifiable engineering capability. Zero user-facing behavior changes at any phase boundary.

## Phases

**Phase Numbering:**

- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [ ] **Phase 1: Tooling Foundation** - Create package.json, configure Vitest, ESLint, Prettier, and TypeScript checkJs
- [ ] **Phase 2: Foundry Mock Infrastructure** - Build global mock setup for all Foundry globals and MockWorker
- [ ] **Phase 3: CI Pipeline** - GitHub Actions workflow runs tests, linting, and type checking on every PR
- [ ] **Phase 4: Pure Logic Tests** - Write tests for Constants.js, Utils.js pure functions with zero Foundry dependencies
- [ ] **Phase 5: Storage Tests** - Write tests for StorageService IndexedDB operations via jsdom
- [x] **Phase 6: Dependency Injection Refactor** - Add constructor DI to all services with backward-compatible defaults (completed 2026-03-06)
- [ ] **Phase 7: Service Layer Tests** - Write tests for TokenService, TVACacheService, IndexService, SearchOrchestrator
- [x] **Phase 8: Integration Tests** - Write end-to-end pipeline tests covering the full search workflow (completed 2026-03-06)
- [x] **Phase 9: Type Safety** - Configure jsconfig.json, add JSDoc typedefs, run tsc --noEmit (completed 2026-03-06)
- [x] **Phase 10: Error Handling and Worker Lifecycle** - Standardize error patterns, surface recovery suggestions, clean up Worker lifecycle (completed 2026-03-06)

## Phase Details

### Phase 1: Tooling Foundation

**Goal**: Developers can run `npm test`, `npm run lint`, and `npm run typecheck` locally — all pass with zero tests (no failures)
**Depends on**: Nothing (first phase)
**Requirements**: TOOL-01, TOOL-02, TOOL-03, TOOL-04
**Success Criteria** (what must be TRUE):

1. `npm install` completes and installs Vitest, ESLint, Prettier, TypeScript, and fvtt-types as dev dependencies
2. `npm test` runs Vitest and reports "0 tests passed" with no errors (runner works, no tests yet)
3. `npm run lint` runs ESLint v9 flat config against scripts/ and reports results without crashing
4. `npm run format` runs Prettier check without crashing
5. `npm run typecheck` invokes `tsc --noEmit` against jsconfig.json without crashing (type errors expected, runner works)
   **Plans:** 1 plan
   Plans:

- [ ] 01-01-PLAN.md — Bootstrap dev tooling (package.json, Vitest, ESLint, Prettier, jsconfig.json)

### Phase 2: Foundry Mock Infrastructure

**Goal**: Any test file can import a Foundry-dependent module without ReferenceError — all Foundry globals are stubbed in test setup
**Depends on**: Phase 1
**Requirements**: MOCK-01, MOCK-02, MOCK-03, MOCK-04, MOCK-05
**Success Criteria** (what must be TRUE):

1. Importing `scripts/services/IndexService.js` in a test file does not throw ReferenceError on `game`, `canvas`, `ui`, or `Hooks`
2. A test can call `game.settings.get('token-replacer-fa', 'anyKey')` and receive a value without error
3. A test can construct `new Worker(url)` (via MockWorker) and call `postMessage` without crashing
4. `vi.stubGlobal` calls for all Foundry globals are consolidated in one `tests/setup/foundry-mocks.js` file loaded via Vitest `setupFiles`
   **Plans**: TBD

### Phase 3: CI Pipeline

**Goal**: Every pull request to the develop or main branch automatically runs the full quality gate without manual intervention
**Depends on**: Phase 2
**Requirements**: TOOL-05
**Success Criteria** (what must be TRUE):

1. A GitHub Actions workflow file exists and triggers on `push` and `pull_request` to develop and main branches
2. The workflow runs `npm test`, `npm run lint`, and `npm run typecheck` as separate steps
3. A failing test causes the workflow to report failure and block the PR status check
4. The workflow completes successfully on the current codebase (all steps green with existing zero tests)
   **Plans:** 1 plan
   Plans:

- [ ] 03-01-PLAN.md — Create GitHub Actions CI workflow with quality gate steps

### Phase 4: Pure Logic Tests

**Goal**: The functional core — Constants.js and Utils.js pure functions — has test coverage that verifies correctness of creature categorization, path exclusion, and CDN path filtering
**Depends on**: Phase 2
**Requirements**: TEST-01, TEST-02, TEST-03, TEST-04, TEST-05
**Success Criteria** (what must be TRUE):

1. `npm test` reports passing tests for all 14 CREATURE_TYPE_MAPPINGS categories in Constants.js
2. `npm test` reports passing tests for EXCLUDED_FOLDERS filtering behavior with both local paths and CDN URLs
3. `npm test` reports passing tests for Utils.js `extractPathFromTVAResult()` covering CDN URLs, nested paths, and empty input edge cases
4. `npm test` reports passing tests for Utils.js `escapeHtml()` and `sanitizePath()` covering XSS-relevant inputs
5. `npm test` reports passing tests for Fuse.js loader error handling covering CDN failure and fallback behavior
   **Plans:** 2 plans
   Plans:

- [ ] 04-01-PLAN.md — Constants.js structural and representative tests (CREATURE_TYPE_MAPPINGS, EXCLUDED_FOLDERS, data exports)
- [ ] 04-02-PLAN.md — Utils.js pure function, security, path extraction, CDN filtering, and Fuse.js loader tests

### Phase 5: Storage Tests

**Goal**: StorageService IndexedDB operations have test coverage that verifies save, load, delete, version checks, and error conditions
**Depends on**: Phase 2
**Requirements**: TEST-06
**Success Criteria** (what must be TRUE):

1. `npm test` reports passing tests for StorageService `saveIndex()` and `loadIndex()` round-trip using jsdom IndexedDB
2. `npm test` reports passing tests for StorageService version check — stale cached index is rejected and returns null
3. `npm test` reports passing tests for StorageService transaction abort scenario — no silent data loss
4. If jsdom IndexedDB gaps are found, `fake-indexeddb` is installed and StorageService tests pass using it
   **Plans:** 1 plan
   Plans:

- [ ] 05-01-PLAN.md — StorageService tests: all 11 methods, IndexedDB + localStorage fallback, migration, error scenarios

### Phase 6: Dependency Injection Refactor

**Goal**: All service constructors accept optional injected dependencies so they can be tested in isolation without Foundry globals
**Depends on**: Phase 2
**Requirements**: DI-01, DI-02, DI-03, DI-04, DI-05
**Success Criteria** (what must be TRUE):

1. `new SearchOrchestrator({ settings: mockSettings, indexService: mockIndex })` works in a test without any Foundry global access
2. `TokenService.getSceneNPCTokens(mockCanvasTokens)` works in a test using an injected token list, not `canvas.tokens`
3. `new TVACacheService({ tvaAPI: mockTVA })` works in a test using a mock TVA API object, not `game.modules.get()`
4. `new IndexService({ storageService: mockStorage, workerFactory: mockFactory })` works in a test with injected dependencies
5. Existing production behavior is unchanged — all services fall back to Foundry globals when no injection is provided
   **Plans:** 2/2 plans complete
   Plans:

- [ ] 06-01-PLAN.md — Leaf service DI: createDefaultGetSetting factory, TVACacheService + TokenService constructor injection
- [ ] 06-02-PLAN.md — Dependent service DI: IndexService + SearchOrchestrator constructor injection, SearchService wiring

### Phase 7: Service Layer Tests

**Goal**: SearchOrchestrator, TokenService, TVACacheService, and IndexService each have tests covering their core logic paths including error cases
**Depends on**: Phase 6
**Requirements**: TEST-07, TEST-08, TEST-09, TEST-10, TEST-11, TEST-12, TEST-13
**Success Criteria** (what must be TRUE):

1. `npm test` reports passing tests for TokenService creature info extraction covering all D&D 5e actor structure variants
2. `npm test` reports passing tests for TokenService `groupTokensByCreature()` with mixed creature types
3. `npm test` reports passing tests for TVACacheService cache parsing covering all three entry formats: path, [path,name], [path,name,tags]
4. `npm test` reports passing tests for IndexService index building including termIndex construction and cache loading
5. `npm test` reports passing tests for SearchOrchestrator fuzzy search with varying thresholds and result ordering
6. `npm test` reports passing tests for SearchOrchestrator category-based fallback search
7. `npm test` reports passing tests for SearchOrchestrator parallel search batching
   **Plans:** 3/4 plans executed
   Plans:

- [ ] 07-01-PLAN.md — Shared mock TVA cache fixture + TokenService full behavior tests
- [ ] 07-02-PLAN.md — TVACacheService full behavior tests (cache parsing, search methods)
- [ ] 07-03-PLAN.md — IndexService full behavior tests (index building, categorization, Worker parity)
- [ ] 07-04-PLAN.md — SearchOrchestrator full behavior tests (fuzzy search, category fallback, parallel batching)

### Phase 8: Integration Tests

**Goal**: The full search pipeline — from TVA cache load through index build to fuzzy search results — is verified end-to-end in tests
**Depends on**: Phase 7
**Requirements**: INTG-01, INTG-02, INTG-03
**Success Criteria** (what must be TRUE):

1. `npm test` reports a passing integration test that exercises the full path: TVA cache load -> index build -> fuzzy search -> result list
2. `npm test` reports a passing integration test for the fallback path: no fuzzy match -> category search -> results
3. `npm test` reports a passing test that builds the index via Worker path and direct path and asserts both produce identical index structures
   **Plans:** 2/2 plans complete
   Plans:

- [ ] 08-01-PLAN.md — SearchPipeline integration tests (full pipeline, fallback, Worker parity)
- [ ] 08-02-PLAN.md — SearchService facade tests (init, delegation, validation, error wrapping)

### Phase 9: Type Safety

**Goal**: `npm run typecheck` (`tsc --noEmit`) reports zero errors on public service method signatures and shared data structure typedefs
**Depends on**: Phase 6
**Requirements**: TYPE-01, TYPE-02, TYPE-03, TYPE-04, TYPE-05, TYPE-06
**Success Criteria** (what must be TRUE):

1. `jsconfig.json` exists with `allowJs: true`, `checkJs: true`, `noEmit: true` and `tsc --noEmit` does not crash
2. JSDoc `@typedef` definitions exist for `CreatureInfo`, `TokenMatch`, `IndexedCache`, and `ModuleError` and are used in service files
3. All public methods on SearchOrchestrator, TokenService, TVACacheService, IndexService, and StorageService have `@param` and `@returns` JSDoc annotations
4. `scripts/types/settings.d.ts` exists with `ClientSettings.Values` declaration merging for all module settings — typed `getSetting()` calls return specific types, not `unknown`
5. fvtt-types is installed and Foundry API references in service files show IDE type information rather than `any`
   **Plans:** 2/2 plans complete
   Plans:

- [ ] 09-01-PLAN.md — Type infrastructure: declaration files (settings.d.ts, modules.d.ts, globals.d.ts), JSDoc typedefs, jsconfig.json update
- [ ] 09-02-PLAN.md — Service annotations: @param/@returns on all public methods, fix remaining tsc errors, enable typecheck gate

### Phase 10: Error Handling and Worker Lifecycle

**Goal**: All service error exits use a consistent structured pattern, error recovery suggestions are visible to users, and the Worker is cleanly terminated on module unload
**Depends on**: Phase 7
**Requirements**: ERR-01, ERR-02, ERR-03, ERR-04, WORK-01, WORK-02, WORK-03
**Success Criteria** (what must be TRUE):

1. All async hook handlers in main.js have top-level try-catch that calls `ui.notifications.error()` with the error message — unhandled rejections no longer silently swallow errors
2. All service error exits call `createModuleError()` — no bare `throw new Error()` or `console.error()` exit points remain in service files
3. Worker is initialized lazily on first use and terminated via a `Hooks.once('closeAll')` or module teardown hook — no dangling Worker references after module unload
4. Worker crashes fall back to direct indexing automatically and display a `ui.notifications.warn()` message to the user
5. `recoverySuggestions` from ModuleError objects are surfaced to users via `ui.notifications.error({ permanent: true })` rather than being discarded
   **Plans:** 2/2 plans complete
   Plans:

- [ ] 10-01-PLAN.md — Error handling standardization: hook try-catch, createModuleError consistency, recovery suggestion surfacing
- [ ] 10-02-PLAN.md — Worker lifecycle cleanup: fallback notifications, beforeunload termination, lifecycle tests

## Progress

**Execution Order:**
Phases execute in numeric order: 1 -> 2 -> 3 -> 4 -> 5 -> 6 -> 7 -> 8 -> 9 -> 10

| Phase                                   | Plans Complete | Status            | Completed |
| --------------------------------------- | -------------- | ----------------- | --------- |
| 1. Tooling Foundation                   | 0/1            | Planning complete | -         |
| 2. Foundry Mock Infrastructure          | 0/TBD          | Not started       | -         |
| 3. CI Pipeline                          | 0/1            | Planning complete | -         |
| 4. Pure Logic Tests                     | 1/2            | In progress       | -         |
| 5. Storage Tests                        | 0/1            | Planning complete | -         |
| 6. Dependency Injection Refactor        | 2/2 | Complete   | 2026-03-06 |
| 7. Service Layer Tests                  | 3/4 | In Progress|  |
| 8. Integration Tests                    | 2/2 | Complete   | 2026-03-06 |
| 9. Type Safety                          | 2/2 | Complete   | 2026-03-06 |
| 10. Error Handling and Worker Lifecycle | 2/2 | Complete   | 2026-03-06 |
