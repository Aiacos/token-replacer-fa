# Project Research Summary

**Project:** Token Replacer FA — Quality Engineering Refactor
**Domain:** Foundry VTT module quality uplift (tests, type safety, linting, error handling)
**Researched:** 2026-02-28
**Confidence:** MEDIUM (ecosystem thin; tooling recommendations solid; Foundry-specific mocks are low-maturity)

## Executive Summary

Token Replacer FA (v2.12.3) is a working, production-grade Foundry VTT module that needs quality engineering uplift without any user-facing behavioral changes. The module has no build step, no test suite, and no type checking. The goal is to add automated testing, static analysis, and consistent error handling so that the codebase can be safely refactored and extended. The recommended approach follows the Functional Core / Imperative Shell pattern: isolate pure business logic (IndexService categorization, SearchOrchestrator fuzzy matching, TokenService creature extraction) behind constructor-injected dependencies so it can be tested in Node.js with Vitest, while leaving Foundry-dependent shell code (main.js hooks, UIManager dialogs) untested by automated tools.

The toolchain is well-defined: Vitest + jsdom for the test runner, JSDoc + `checkJs` via `tsconfig.json` for type safety without a build step, ESLint v9 (flat config) for linting, and Prettier for formatting. The critical dependency chain is: `package.json` must be created first (no npm tooling exists today), then the global Foundry mock setup, then pure-function tests, then service-layer tests with injected dependencies. The `@rayners/foundry-test-utils` package provides pre-built Foundry mocks and is the only practical option in the ecosystem, but it is low-maturity (single maintainer, 19 commits) and should be treated as an accelerator that may need supplementing with hand-written mocks.

The primary risks are execution-order risks, not tooling risks. Settings registration must remain the first operation in the `init` hook or the module will crash on load — a regression already experienced once. Web Worker tests silently run the fallback path in jsdom (jsdom has no Worker) unless `MockWorker` is explicitly added to the test setup. Cache key strings must never be renamed during cleanup or every existing user loses their cached index. ApplicationV2 dialogs require `{ force: true }` on every `render()` call or they silently fail to display. These four issues are known, documented, and have clear prevention strategies — following the phased refactoring order in ARCHITECTURE.md eliminates all of them systematically.

---

## Key Findings

### Recommended Stack

The module currently has no `package.json` and no dev tooling. All recommended tools are dev-only — nothing changes what is shipped in the module ZIP. The recommended test runner is **Vitest ^2.2.x** (not 4.x, which has breaking changes) with **jsdom ^25.x** for browser environment emulation. Foundry globals (`game`, `canvas`, `ui`, `Hooks`) are mocked via `vi.stubGlobal()` in a `setupFiles` script, optionally supplemented by `@rayners/foundry-test-utils`. Type checking uses **TypeScript ^5.7.x** in `noEmit + checkJs` mode against existing `.js` files — no `.ts` files, no build pipeline change. The `@league-of-foundry-developers/foundry-vtt-types` package (installed as `fvtt-types`) provides Foundry API types; v13 support is beta and will produce gaps. **ESLint ^9.x** with flat config and **Prettier ^3.8.x** run as separate tools. The Quench in-browser test runner exists and supports v12/v13 Foundry, but requires a live Foundry instance and cannot run in CI — treat it as a future option for integration smoke tests only.

**Core technologies:**

- **Vitest ^2.2.x** + **jsdom ^25.x**: Unit test runner with browser environment emulation — runs in Node.js, supports ESM natively, no build step required
- **@rayners/foundry-test-utils**: Pre-built Foundry VTT global mocks — saves writing 600+ lines of mock infrastructure; low maturity but the only option
- **TypeScript ^5.7.x** (`noEmit`, `checkJs`, `allowJs`): Type checker invoked as `tsc --noEmit` against JSDoc-annotated `.js` files — no compilation, no source file changes
- **fvtt-types** (`@league-of-foundry-developers/foundry-vtt-types`): Foundry API type definitions — v13 support is beta; use for common APIs, write local `@typedef` for v13-specific types
- **ESLint ^9.x** (flat config, `eslint.config.js`): Linting — catches undefined variables, unused imports, common JS pitfalls; uses recommended ruleset + `eslint-config-prettier`
- **Prettier ^3.8.x**: Formatting — run separately from ESLint, not via `eslint-plugin-prettier`

### Expected Features

This refactor targets engineering quality, not user-visible product features. "Features" here are quality practices mapped to priority tiers.

**Must have — table stakes (P1, Phase 1 Foundation):**

- `package.json` created — unlocks all npm tooling; currently absent, blocks everything
- ESLint configured (flat config) — catches obvious bugs in changed code; no linter currently exists
- `jsconfig.json` + `foundry-vtt-types` installed — IDE IntelliSense for Foundry globals; currently absent
- Vitest + foundry-test-utils configured — test runner ready to run; zero tests exist today
- Unit tests for IndexService, TokenService, StorageService — highest-value pure logic, directly testable

**Should have — differentiators (P2, Phase 2-3):**

- Integration tests for TVA cache load → index build → search execution flows — catches the async lifecycle bugs that caused multiple recent fix cycles
- JSDoc `@typedef` for shared types (CreatureInfo, TokenMatch, IndexedCache, ErrorObject) — enables `tsc --noEmit` to catch type bugs
- `tsc --noEmit` as npm script — automated type checking on CI
- Consistent error handling audit — all service error exits use `createModuleError()` + structured object
- Worker lifecycle: terminate SearchOrchestrator worker on module unload (memory leak fix)
- Surface `recoverySuggestions` via `ui.notifications.error()` — existing error objects have the data; it is not surfaced to users

**Defer — not essential for initial uplift (P3, future):**

- AbortController timeout on Worker operations — defers until tests give confidence in Worker behavior
- Strict JSDoc type checking — defer until fvtt-types v13 stabilizes (currently beta with known issues)
- GitHub Actions CI pipeline — high value but not needed to establish local quality baseline first
- Quench integration tests inside live Foundry — reserved for smoke testing critical paths once unit tests are stable

**Anti-features (do not implement):**

- Full TypeScript migration (`.ts` files + build step) — breaks no-build-step constraint, changes `build.sh`, risks breaking CDN-loaded Fuse.js
- Prettier retroactive formatting of entire codebase — destroys `git blame` usefulness for code archaeology
- Exhaustive mock of entire Foundry API surface — becomes maintenance burden that drifts from real API
- E2E tests with Cypress + Foundry Docker — poor ROI for a small module with no CI today

### Architecture Approach

The codebase already has a natural Functional Core / Imperative Shell boundary. The pure core (`Constants.js`, most of `Utils.js`, `IndexWorker.js`) has zero Foundry globals and can be tested directly. The imperative shell (`main.js` hooks, `UIManager.js`) is correctly Foundry-dependent and should not be unit tested. The middle tier — `SearchOrchestrator`, `TokenService`, `TVACacheService`, `IndexService` — uses Foundry globals in 1-3 call sites each, all of which can be removed via constructor dependency injection. The refactoring strategy is: inject settings as a plain object at construction time (read once from `game.settings` in `main.js`), accept optional `canvasTokens` and `tvaAPI` parameters with `canvas?.tokens` and `game.modules.get()` as fallbacks, and stub global Foundry objects in `tests/setup/vitest.setup.js` for the remainder. No production behavior changes; only the testability boundary shifts.

**Major components and testability:**

1. **Functional Core** (`Constants.js`, `Utils.js` pure functions, `IndexWorker.js`) — zero Foundry globals; fully testable now with no changes
2. **Service Layer with DI** (`SearchOrchestrator`, `TokenService`, `TVACacheService`, `IndexService`) — testable after constructor parameter injection; logic is pure once Foundry call sites are extracted
3. **StorageService** — testable now via jsdom's IndexedDB implementation; uses `window.indexedDB` only
4. **Imperative Shell** (`main.js`, `UIManager.js`, `ScanService`) — correctly Foundry-dependent; verified via manual testing only
5. **Tests structure** — `tests/` parallel to `scripts/`, excluded from ZIP via `build.sh` (ZIP only includes `scripts/`, `templates/`, `lang/`, `styles/`, `module.json`)

### Critical Pitfalls

1. **Foundry globals undefined in tests** — Services import `game`, `canvas`, `ui` at module scope; in jsdom they are `undefined`, causing `ReferenceError` on import before any test runs. Prevention: add `tests/setup/foundry-mocks.js` as a Vitest `setupFiles` entry with minimal stubs for `game`, `canvas`, `ui`, `Hooks` — this must be the very first thing done before writing any test.

2. **Web Worker silently runs fallback path in jsdom** — jsdom has no `Worker` implementation; `IndexService` gracefully catches the constructor exception and sets `this.worker = null`, so all tests run the synchronous fallback path. Worker code path gets 0% coverage while the test suite reports green. Prevention: add `MockWorker` to global test setup that simulates `postMessage`/`onmessage` synchronously.

3. **`game.settings.get()` returns `unknown` without declaration merging** — JSDoc type annotations on services look complete but callers still see `unknown` from every `getSetting()` call. All type checking becomes cosmetic. Prevention: create `scripts/types/settings.d.ts` with `ClientSettings.Values` declaration merging for all 9 module settings before annotating any service that reads settings.

4. **Settings registration order** — Any code that calls `getSetting()` before `registerSettings()` throws and crashes the entire module init. A refactor that moves settings registration or creates service singletons at module scope (outside hooks) will re-trigger this regression (already experienced in v2.11.1). Prevention: enforce `registerSettings()` as the first statement in the `init` hook; never call `getSetting()` in a constructor or at module scope.

5. **Cache key renamed during cleanup** — Renaming any `CACHE_KEY` or `TVA_CACHE_KEY` constant string silently discards every user's cached index; every user rebuilds from scratch on their next session. Prevention: move all storage key strings to `Constants.js` as exported constants; treat them as protected database identifiers, never rename for aesthetics.

---

## Implications for Roadmap

Based on research, the dependency graph and pitfall-prevention strategy dictate a clear 4-phase ordering. No phase can safely be skipped or reordered because each phase removes the risk that would otherwise corrupt the next.

### Phase 1: Tooling Foundation

**Rationale:** No tooling exists today. `package.json` is absent, which blocks every other quality action. All tools must be installed and verified working before any code changes are made. Zero production code changes in this phase — the risk is zero.
**Delivers:** A working `npm test`, `npm run lint`, and `npm run typecheck` pipeline. First green test run.
**Addresses:** Table stakes from FEATURES.md — `package.json`, ESLint, `jsconfig.json`, Vitest setup
**Avoids:** Pitfall 2 (globals undefined in tests) — the Foundry mock setup file is built here as part of test infrastructure, not discovered later when tests mysteriously fail

Key work items:

- Create `package.json` (private, `"type": "module"`, devDependencies only)
- Install Vitest ^2.2.x, jsdom ^25.x, @rayners/foundry-test-utils
- Create `vitest.config.js` with jsdom environment and setupFiles
- Create `tests/setup/foundry-mocks.js` with stubs for `game`, `canvas`, `ui`, `Hooks`
- Create `tests/setup/vitest.setup.js` with `vi.stubGlobal()` calls
- Add MockWorker to global setup (Pitfall 3 prevention)
- Install ESLint ^9.x, Prettier ^3.8.x, eslint-config-prettier
- Create `eslint.config.js` (flat config) and `.prettierrc`
- Install TypeScript ^5.7.x and fvtt-types; create `jsconfig.json`
- Verify `npm test` runs with 0 tests passing (no failures, test runner works)

### Phase 2: Pure Function Tests

**Rationale:** Zero production code changes required. `Constants.js`, the pure functions in `Utils.js` (`isExcludedPath`, `extractPathFromTVAResult`, `parseSubtypeTerms`), and `IndexWorker.js` have no Foundry dependencies and can be tested immediately. `StorageService.js` uses only `window.indexedDB` which jsdom provides. This phase builds test authoring confidence and establishes coverage patterns before any refactoring begins.
**Delivers:** Test coverage for the functional core. IndexWorker path processing logic, CDN path filtering, and creature type exclusion logic are all verified.
**Addresses:** P1 unit tests for pure logic from FEATURES.md
**Avoids:** Pitfall 1 (mocks drift) — by testing only code with no Foundry dependencies, mock fidelity is irrelevant here

Key work items:

- Write `tests/core/Constants.test.js` — verify CREATURE_TYPE_MAPPINGS and EXCLUDED_FOLDERS structure
- Write `tests/core/Utils.test.js` — test `isExcludedPath()`, `extractPathFromTVAResult()`, CDN segment filtering
- Write `tests/services/StorageService.test.js` — test IndexedDB key generation, version checks, quota handling
- Write `tests/workers/IndexWorker.test.js` — test path categorization logic via direct function calls

### Phase 3: Service Layer Tests (with Dependency Injection Refactor)

**Rationale:** The highest-value test surface — SearchOrchestrator fuzzy matching, TokenService creature extraction, TVACacheService cache parsing, IndexService index building. Each requires minimal production code changes (optional constructor parameters with Foundry fallbacks). This phase contains the most test-writing effort and the most impactful coverage. The refactoring order is dependency-aware: SearchOrchestrator first (highest value), then TokenService and TVACacheService (build on same patterns), then IndexService and ScanService (hardest).
**Delivers:** Tests for the complete search pipeline: token extraction → cache load → index build → fuzzy search → result ranking. Catches the class of async lifecycle bugs that caused the v2.11.x fix cycle.
**Uses:** Constructor DI pattern from ARCHITECTURE.md (Pattern 1 and 2); vi.stubGlobal for remaining Foundry calls
**Implements:** The service layer boundary that enables Phase 4 type checking to be meaningful
**Avoids:** Pitfall 7 (singleton state between tests) — each test constructs its own service instance; Pitfall 4 (settings registration order) — settings injected as plain objects, no `game.settings.get()` in constructors

Key work items:

- Refactor `SearchOrchestrator`: add `settings` constructor parameter with `_getSetting()` helper
- Write `tests/services/SearchOrchestrator.test.js` — fuzzy threshold, search priority, parallel search, cache behavior
- Refactor `TokenService.getSceneNPCTokens()`: add optional `canvasTokens` parameter
- Write `tests/services/TokenService.test.js` — NPC extraction, creature type parsing, grouping logic
- Refactor `TVACacheService.init()`: accept optional `tvaAPI` parameter
- Write `tests/services/TVACacheService.test.js` — cache parse logic, path filtering, exclusion logic
- Refactor `IndexService`: inject `indexUpdateFrequency` setting via constructor
- Write `tests/services/IndexService.test.js` — index build, Worker fallback path, cache invalidation
- Write integration test: TVA cache load → index build → search execution chain

### Phase 4: Type Safety and Error Handling Consistency

**Rationale:** Once tests exist and provide a regression safety net, this phase adds type checking and standardizes error handling without risk. The `tsc --noEmit` script will catch type errors introduced by Phase 3 refactoring. The error handling audit ensures all service exits surface structured errors to users via `ui.notifications`. Worker lifecycle cleanup (terminate on module unload) is a low-cost fix with a real user impact (prevents thread accumulation in long sessions).
**Delivers:** `tsc --noEmit` as `npm run typecheck`, complete JSDoc `@typedef` coverage for shared types, all service error exits standardized, Worker terminated on module unload, `recoverySuggestions` surfaced to users.
**Uses:** TypeScript `checkJs`, fvtt-types, ClientSettings.Values declaration merging
**Avoids:** Pitfall 1 (JSDoc types don't flow through `getSetting()`) — declaration merging for all 9 settings is the first task; Pitfall 6 (`render()` missing `force: true`) — test asserts `dialog.rendered === true`; Pitfall 8 (async hooks swallow errors) — audit all hook handlers

Key work items:

- Create `scripts/types/settings.d.ts` with `ClientSettings.Values` declaration merging for all 9 settings
- Complete JSDoc `@typedef` for `CreatureInfo`, `TokenMatch`, `IndexedCache`, `ModuleError`
- Add `tsc --noEmit` as `npm run typecheck`; fix initial type errors
- Audit all service error exits — ensure `createModuleError()` is used consistently
- Surface `recoverySuggestions` in `UIManager` via `ui.notifications.error({ permanent: true })`
- Add `Hooks.once('closeAll')` or equivalent to terminate SearchOrchestrator worker on module unload
- Add `renderDialog(app)` wrapper that enforces `{ force: true }` on all ApplicationV2 instances
- Audit all async hook handlers for top-level `try/catch`

### Phase Ordering Rationale

The sequence is dictated by dependencies, not preference:

- **Phase 1 before 2:** No tests can run without infrastructure. MockWorker must exist before any IndexService test.
- **Phase 2 before 3:** Pure function tests establish testing patterns with zero-risk code (no production changes). Discovering that the test setup is broken here is cheap. Discovering it during Phase 3 refactoring is expensive.
- **Phase 3 before 4:** Type checking against annotated code is only meaningful after DI refactoring cleanly separates Foundry-dependent code from pure logic. Annotating tightly-coupled code produces noise that obscures real type errors.
- **Phase 4 last:** The safety net from phases 1-3 makes error handling changes and type annotation work non-risky.

### Research Flags

Phases likely needing deeper research during planning:

- **Phase 3 (Service DI Refactor):** The SearchOrchestrator and TVACacheService integration with Fuse.js CDN loading is complex. Fuse.js is loaded dynamically via `loadFuse()` from a CDN URL — mocking this in tests requires either injecting Fuse directly or intercepting the dynamic import. The correct mocking strategy for dynamic CDN imports in Vitest needs validation before Phase 3 begins.
- **Phase 3 (IndexedDB in tests):** jsdom's IndexedDB implementation has known gaps. If StorageService tests reveal failures in jsdom's IndexedDB, the `fake-indexeddb` npm package may be needed as a drop-in replacement. Verify before writing IndexService tests that depend on storage.
- **Phase 4 (fvtt-types v13 gaps):** The type checking pass will encounter gaps in v13 type coverage. The strategy for handling these (local `@typedef`, `@ts-ignore` with comments, or `@ts-nocheck` per file) needs to be decided before annotating UIManager and main.js, which use v13-specific APIs heavily.

Phases with standard patterns (skip additional research):

- **Phase 1 (Tooling Foundation):** All tools are well-documented. Vitest, ESLint v9 flat config, Prettier v3, and jsconfig.json setup are standard. The `@rayners/foundry-test-utils` setup file pattern is documented in its README.
- **Phase 2 (Pure Function Tests):** No Foundry dependencies means standard Vitest patterns apply. No research needed.

---

## Confidence Assessment

| Area         | Confidence | Notes                                                                                                                                                                                                                                                                                 |
| ------------ | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Stack        | MEDIUM     | Core tools (Vitest, ESLint, Prettier, TypeScript checkJs) are HIGH confidence. `@rayners/foundry-test-utils` is LOW confidence — single maintainer, 19 commits, GitHub Packages registry. fvtt-types v13 is MEDIUM — active but explicitly beta.                                      |
| Features     | MEDIUM     | Quality engineering practices are well-understood. Foundry-specific testing adoption is genuinely sparse; the xdxa.org analysis is the only documented comprehensive example in the ecosystem.                                                                                        |
| Architecture | HIGH       | Codebase was directly examined. Foundry global call sites were inventoried per file. DI patterns are established software engineering with no Foundry-specific unknowns.                                                                                                              |
| Pitfalls     | HIGH       | Critical pitfalls are verified: settings registration order is a documented live regression (MEMORY.md v2.11.1); ApplicationV2 `force: true` is a documented live regression (MEMORY.md v2.11.3); cache key corruption and Worker jsdom gap are confirmed codebase analysis findings. |

**Overall confidence:** MEDIUM — the implementation path is clear and well-researched; execution risk is primarily in `@rayners/foundry-test-utils` API gaps and fvtt-types v13 coverage holes, both of which are bounded and recoverable.

### Gaps to Address

- **`@rayners/foundry-test-utils` API surface:** The library has 19 commits and minimal documentation. Before committing to it as the primary mock source, verify that its mocks cover `game.settings.get/register`, `game.modules.get`, `canvas.tokens`, `ui.notifications`, and `Hooks`. If coverage is insufficient, fall back to hand-written mocks in `tests/setup/foundry-mocks.js`. This validation should happen in Phase 1 before any service tests are written.

- **Fuse.js dynamic import mocking:** The module loads Fuse.js via `loadFuse()` from a CDN URL using a dynamic `import()`. Vitest can intercept dynamic imports but the correct approach (vi.mock with factory, or injecting Fuse as a constructor parameter) needs a spike test in Phase 3. If CDN mocking is too complex, inject Fuse as a parameter to SearchOrchestrator and load it in `main.js` once.

- **jsdom IndexedDB completeness:** StorageService uses IndexedDB with structured clone, version migrations, and cursor iteration. jsdom's IndexedDB is partially implemented. A Phase 2 spike test against `StorageService` will reveal any jsdom gaps. If found, switch to `fake-indexeddb` npm package for tests.

- **fvtt-types v13 error baseline:** Running `tsc --noEmit` for the first time will produce an unknown number of type errors from fvtt-types v13 gaps and existing un-annotated code. This count needs to be benchmarked in Phase 4 before committing to strict mode. Start with `strict: false`; tighten per-file for new code only.

---

## Sources

### Primary (HIGH confidence)

- Vitest official documentation — `vi.stubGlobal`, `environment: 'jsdom'`, `setupFiles` patterns: https://vitest.dev
- ESLint v9.39.x release notes and flat config documentation: https://eslint.org
- Prettier v3.8.1 changelog: https://prettier.io
- Foundry VTT official documentation — `ApplicationV2.render()`, hooks behavior, `ui.notifications` API: https://foundryvtt.com/api/
- Foundry VTT Community Wiki — `ClientSettings.Values` declaration merging, `jsconfig.json` IntelliSense guide: https://foundryvtt.wiki
- TypeScript JSDoc Reference — `allowJs`, `checkJs`, `noEmit` pattern: https://www.typescriptlang.org/docs/handbook/jsdoc-supported-types.html
- Project MEMORY.md — ApplicationV2 `force: true` requirement, settings init order regression (authoritative project context)
- Project CLAUDE.md — module architecture, cache key constants, build process (authoritative project context)
- Quench official Foundry listing — v0.10.0, Foundry v12/v13 confirmed: https://foundryvtt.com/packages/quench

### Secondary (MEDIUM confidence)

- `@rayners/foundry-test-utils` GitHub — Vitest Foundry mock infrastructure, ~600 lines: https://github.com/rayners/foundry-test-utils
- `@league-of-foundry-developers/foundry-vtt-types` GitHub — v13 beta status, installation alias: https://github.com/League-of-Foundry-Developers/foundry-vtt-types
- XDXA: FoundryVTT Module Test Automation (2023) — practitioner analysis of testing approaches, Quench limitations, mock reliability: https://xdxa.org/2023/foundryvtt-module-test-automation/
- Functional Core / Imperative Shell — well-established pattern applied to Foundry module structure: https://allarddewinter.net/blog/functional-core-imperative-shell-separating-logic-from-side-effects/
- Build-free JSDoc type annotations — `noEmit`, `checkJs`, `allowJs` pattern confirmation: https://luhr.co/blog/2024/01/25/build-free-type-annotations-with-jsdoc-and-typescript/

### Tertiary (LOW confidence)

- `@rayners/foundry-test-utils` — API coverage for IndexService, SearchService, TVACacheService not verified against this module's specific needs; requires validation spike in Phase 1
- How to test Web Workers with Jest — MockWorker pattern adapted for Vitest jsdom: https://vuedose.tips/how-to-test-web-workers-with-jest/

---

_Research completed: 2026-02-28_
_Ready for roadmap: yes_
