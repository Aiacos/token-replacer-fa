# Feature Research

**Domain:** Foundry VTT module quality engineering — brownfield refactor (code quality uplift, no user-facing changes)
**Researched:** 2026-02-28
**Confidence:** MEDIUM — Foundry VTT module testing practices are genuinely sparse in the wild; findings from community patterns and ecosystem tooling verified against multiple sources.

---

## Context

This is not a product feature research file in the traditional sense. The "features" being mapped are **code quality engineering practices** for a Foundry VTT module refactor. The module (token-replacer-fa v2.12.3) already works. The goal is uplift: tests, type safety, error handling consistency, and code organization. No user-facing behavior changes.

The table stakes / differentiator / anti-feature framing is applied to **quality engineering choices**, categorized by what well-maintained Foundry VTT modules actually do vs what goes above and beyond vs what creates more problems than it solves.

---

## Feature Landscape

### Table Stakes (Quality Engineering Baseline)

Features that any maintained Foundry VTT module is expected to have. Missing these signals a module with low maintainability confidence.

| Feature                                                                   | Why Expected                                                                                                                                                                                                                               | Complexity                                                                                                                                   | Notes                                                                                                                |
| ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| Unit tests for pure logic (services)                                      | Pure business logic (IndexService categorization, StorageService key generation, TokenService creature extraction) is independently testable without Foundry runtime. Absence means silent regressions on every change.                    | MEDIUM                                                                                                                                       | Vitest + foundry-test-utils mocks is the current community answer. No package.json yet — this requires adding one.   |
| JSDoc type annotations on all public APIs                                 | Already partially present in codebase (JSDoc on exported functions). Completing coverage + adding `@typedef` for shared types costs little and provides IDE autocomplete and catch-at-write errors. Community wiki explicitly guides this. | LOW                                                                                                                                          | Already done for some methods; completing coverage is incremental.                                                   |
| Consistent error handling — structured error objects propagated uniformly | The codebase already has `createModuleError()` and structured `{errorType, message, details, recoverySuggestions}` pattern. Incomplete application across all services is the gap.                                                         | LOW                                                                                                                                          | Pattern exists; the work is auditing consistency.                                                                    |
| `ui.notifications` for user-facing errors                                 | Foundry provides `ui.notifications.error(msg, {permanent: true})` as the canonical way to surface errors to users. A module that only logs to console and shows custom dialogs is doing it the hard way.                                   | LOW                                                                                                                                          | Already used in some paths; confirm coverage in all error exit points.                                               |
| Debug logging conditional on module setting                               | The codebase already has `_debugLog()` via `createDebugLogger()` factory. This is the expected pattern — no debug statements ship active.                                                                                                  | LOW                                                                                                                                          | Already implemented; verify all services use factory pattern consistently (not raw console.log in production paths). |
| Module prefix on all console output                                       | `${MODULE_ID}                                                                                                                                                                                                                              | message` is the expected pattern. Two modules logging without prefix makes debugging user-reported issues in multi-module setups impossible. | LOW                                                                                                                  | Already implemented. Audit for any raw `console.log()` without prefix. |
| ESLint configuration                                                      | Community module templates (DFreds, Lazrius, League templates) all include ESLint. Without it, code style drift and common JS pitfalls go uncaught.                                                                                        | LOW                                                                                                                                          | No linter currently present. Adding ESLint flat config with minimal rule set is the baseline.                        |
| `jsconfig.json` for IDE type resolution                                   | Community wiki explicitly recommends `jsconfig.json` pointing at foundry-vtt-types for IntelliSense without a TypeScript build step. No `jsconfig.json` currently.                                                                         | LOW                                                                                                                                          | One config file; enables all type-awareness in the editor for free.                                                  |

---

### Differentiators (Above and Beyond for a Community Module)

Quality practices that set a module apart as exemplary. Most community modules don't have these; their presence signals serious engineering investment.

| Feature                                                    | Value Proposition                                                                                                                                                                                                                                                   | Complexity | Notes                                                                                                                                                                                                                    |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Type checking with `tsc --noEmit` on JSDoc annotations     | Runs TypeScript's type checker against existing `.js` files (checkJs) without any transpilation or build step change. Catches type errors at CI time, not at runtime. Eliminates an entire class of bugs. The foundry-vtt-types package provides Foundry globals.   | MEDIUM     | Requires `tsconfig.json` with `allowJs: true`, `checkJs: true`, `noEmit: true` + `foundry-vtt-types`. v13 support is beta but usable for core APIs.                                                                      |
| Integration tests for critical async workflows             | Testing the TVA cache load → index build → search flow as an integrated sequence catches promise lifecycle bugs (the actual bugs that have caused recent fix cycles). Vitest + foundry-test-utils mock the Foundry environment sufficiently to test service chains. | HIGH       | foundry-test-utils provides ApplicationV2 mocks. The hard part is wiring together real service instances against mock Foundry globals. Worth it for the three critical paths: cache load, index build, search execution. |
| Worker lifecycle management (terminate on module unload)   | CONCERNS.md identifies SearchOrchestrator worker never being terminated. Connecting to Foundry's module lifecycle hooks to clean up workers prevents thread accumulation. Not user-visible but prevents memory leaks in long sessions.                              | LOW        | Small fix with high impact. Register `Hooks.once('closeAll')` or equivalent for cleanup.                                                                                                                                 |
| Structured error recovery with `ui.notifications` + dialog | Rather than showing raw error text, surface structured `recoverySuggestions` from error objects to users via `ui.notifications.error()` with `{permanent: true}` for critical failures. Existing error structure already has the data; the gap is surfacing it.     | LOW        | Existing `recoverySuggestions` array in error objects is unused for user-visible messages.                                                                                                                               |
| Timeout wrapper on Worker operations                       | CONCERNS.md: SearchOrchestrator worker crash leaves search hanging indefinitely. AbortController-based timeout (5-10s) on worker operations degrades gracefully rather than freezing.                                                                               | MEDIUM     | Requires async timeout pattern around all Worker `postMessage` / `onmessage` flows.                                                                                                                                      |

---

### Anti-Features (Commonly Considered, Often Harmful in This Context)

Quality choices that seem appealing but create more problems than they solve for this specific project.

| Feature                                                    | Why Requested                                                                              | Why Problematic                                                                                                                                                                                                                                                                                                                                                    | Alternative                                                                                                                                                                |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Full TypeScript migration (`.ts` files + build step)       | TypeScript gives stronger type guarantees than JSDoc. Many modern module templates use it. | This module has no build step today. Adding TypeScript requires adding a build toolchain (Vite or esbuild or Rollup), changes the dev workflow, complicates the release process (`build.sh` would need update), and risks breaking the plain `.js` ES module loading that Foundry uses directly. The PROJECT.md constraint is explicit: "No build step currently." | Use `checkJs: true` + `foundry-vtt-types` + JSDoc `@typedef` for type safety without transpilation. Gets 85% of TypeScript benefit at 10% of the cost.                     |
| Quench in-browser testing (requires live Foundry instance) | Tests run in actual Foundry environment — no mocking needed.                               | Quench tests cannot run in CI without a running Foundry instance + Docker + license key. The xdxa.org analysis found even Quench itself has no tests. The maintenance burden is extremely high.                                                                                                                                                                    | Use Vitest + foundry-test-utils for unit/integration tests that run in CI. Reserve Quench for manual smoke tests only if desired.                                          |
| E2E tests with Cypress + Foundry Docker                    | Most thorough test coverage possible. Tests the full user workflow.                        | Requires Foundry license, Docker setup, GitHub secrets, and significant infrastructure investment. The xdxa.org article (the only documented example in the ecosystem) required weeks of setup. Return on investment is poor for a small module with no CI today.                                                                                                  | Focus on unit + integration tests first. E2E is a future consideration once CI baseline is established.                                                                    |
| Global state reset between tests (full Foundry mock reset) | Ensures test isolation.                                                                    | Over-engineering for this codebase. Services use explicit `init()` pattern and accept `setDependencies()` injection. Targeted per-test mock setup using `vi.fn()` in `beforeEach` is sufficient and less fragile than framework-level state management.                                                                                                            | Use `beforeEach` with explicit mock resets for affected services only.                                                                                                     |
| Prettier auto-formatting entire codebase                   | Enforces consistent style mechanically.                                                    | Running Prettier on the existing codebase as a one-shot "format everything" commit creates a massive diff that makes `git blame` useless for code archaeology. The existing codebase has consistent manual style (2-space indent, single quotes, semicolons).                                                                                                      | Add Prettier config but do NOT run it retroactively. Use ESLint formatting rules for new code. Or add Prettier with `--write` only on files touched in subsequent commits. |
| Full JSDoc coverage on private/internal methods            | IDE documentation for all internal details.                                                | Private methods prefixed with `_` are implementation details. Over-documenting internals adds noise and creates maintenance burden when implementations change.                                                                                                                                                                                                    | JSDoc on public exported API only (functions, classes, and public methods). Internal methods get inline comments for non-obvious logic only.                               |
| `@ts-strict` JSDoc enforcement on Foundry API calls        | Strict type checking catches more bugs.                                                    | foundry-vtt-types v13 support is beta with "known bugs, issues in ergonomics, and unfinished work." Strict checking against beta types produces false positives that require `@ts-ignore` suppressions — defeating the purpose.                                                                                                                                    | Use `strict: false` initially. Enable strict mode per-file for new code only. Upgrade to strict after v13 types stabilize.                                                 |

---

## Feature Dependencies

```
[jsconfig.json]
    └──enables──> [IDE IntelliSense for JSDoc types]
                      └──improves──> [JSDoc type annotation coverage]

[foundry-vtt-types installed (npm)]
    └──enables──> [tsc --noEmit type checking]
    └──feeds──>   [jsconfig.json type resolution]

[package.json added]
    └──enables──> [npm scripts]
                      └──enables──> [Vitest test runner]
                      └──enables──> [ESLint]
                      └──enables──> [tsc --noEmit check script]

[Vitest + foundry-test-utils]
    └──enables──> [Unit tests for services]
                      └──enables──> [Integration tests for workflows]

[Consistent structured error objects]
    └──enables──> [ui.notifications surface of recoverySuggestions]

[ESLint configuration]
    └──enables──> [consistent code style for new code]
    └──enhances──> [debug log audit (catch raw console.log without MODULE_ID prefix)]
```

### Dependency Notes

- **package.json requires creation first:** All tooling (Vitest, ESLint, foundry-vtt-types) assumes npm. The module has no `package.json` currently. This is the single blocking prerequisite for all other tooling.
- **foundry-vtt-types must be dev-only:** It goes in `devDependencies`. Not bundled into the module ZIP (which only contains `scripts/`, `templates/`, `lang/`, `module.json`).
- **Vitest requires foundry-test-utils for useful tests:** Without mocked Foundry globals, service tests immediately fail on `game`, `ui`, `canvas` access.
- **Type checking (tsc --noEmit) is independent of test runner:** Can be set up as a separate npm script and run in parallel with tests.
- **ESLint and tests are independent:** Can be done in any order after package.json exists.

---

## MVP Definition

This is a quality refactor, not a product launch. "MVP" = the minimum quality baseline that makes the codebase meaningfully safer to change.

### Launch With (Phase 1 — Foundation)

Minimum viable quality uplift — what's needed before any refactoring begins.

- [ ] `package.json` created — unlocks all tooling
- [ ] ESLint configured (flat config, minimal rules) — catches obvious bugs in new/changed code
- [ ] `jsconfig.json` + `foundry-vtt-types` installed — IDE IntelliSense for Foundry globals
- [ ] Vitest + foundry-test-utils configured — test runner ready

### Add After Foundation (Phase 2 — Tests)

Once the tooling is in place, add actual test coverage.

- [ ] Unit tests for IndexService (categorizeImage, path exclusion logic) — highest-complexity pure logic
- [ ] Unit tests for TokenService (creature info extraction) — pure static methods, straightforward to test
- [ ] Unit tests for StorageService (key generation, version checks) — isolated from Foundry runtime
- [ ] Integration test for TVA cache load → index build flow — catches the class of bug that caused recent fix cycles
- [ ] Integration test for search execution with mocked cache — validates the critical search path

### Add After Tests (Phase 3 — Type Safety + Error Handling)

- [ ] Complete JSDoc `@typedef` for shared types (CreatureInfo, TokenMatch, IndexedCache, ErrorObject)
- [ ] `tsc --noEmit` as npm script — automated type checking
- [ ] Audit error handling consistency: all service error exits use `createModuleError()` + structured object
- [ ] Surface `recoverySuggestions` via `ui.notifications.error()` in UIManager (not just console)
- [ ] Worker lifecycle: terminate SearchOrchestrator worker on module unload

### Future Consideration (Phase 4 — Advanced)

- [ ] AbortController timeout on Worker operations — defers until basic tests give confidence in Worker behavior
- [ ] Strict JSDoc type checking (`strict: true`) — defer until foundry-vtt-types v13 stabilizes
- [ ] CI pipeline (GitHub Actions) running tests + type check on PR — sets up for ongoing safety net

---

## Feature Prioritization Matrix

| Feature                                     | Maintainability Value              | Implementation Cost | Priority |
| ------------------------------------------- | ---------------------------------- | ------------------- | -------- |
| package.json creation                       | HIGH (blocks everything)           | LOW                 | P1       |
| ESLint configuration                        | HIGH (prevents regressions)        | LOW                 | P1       |
| jsconfig.json + foundry-vtt-types           | HIGH (IDE ergonomics)              | LOW                 | P1       |
| Vitest + foundry-test-utils setup           | HIGH (enables all testing)         | LOW                 | P1       |
| Unit tests — IndexService                   | HIGH (complex pure logic)          | MEDIUM              | P1       |
| Unit tests — TokenService                   | HIGH (pure static methods)         | LOW                 | P1       |
| Unit tests — StorageService                 | MEDIUM (isolated but simpler)      | LOW                 | P1       |
| Integration test — cache load + index build | HIGH (catches async bugs)          | HIGH                | P2       |
| Integration test — search execution         | HIGH (critical path)               | MEDIUM              | P2       |
| JSDoc @typedef for shared types             | MEDIUM (IDE + type check)          | LOW                 | P2       |
| tsc --noEmit type checking                  | MEDIUM (catches type bugs)         | LOW                 | P2       |
| Consistent error handling audit             | MEDIUM (reliability)               | LOW                 | P2       |
| ui.notifications surfacing                  | LOW (polish)                       | LOW                 | P2       |
| Worker termination on unload                | MEDIUM (memory leak fix)           | LOW                 | P2       |
| Worker timeout (AbortController)            | MEDIUM (hang prevention)           | MEDIUM              | P3       |
| CI pipeline (GitHub Actions)                | HIGH (ongoing safety net)          | MEDIUM              | P3       |
| Strict type checking                        | LOW (high false-positive rate now) | HIGH                | P3       |

**Priority key:**

- P1: Required to establish quality baseline
- P2: Should add once foundation is in place
- P3: Future consideration, not needed for initial uplift

---

## Ecosystem Reality Check

**Testing adoption in Foundry VTT module ecosystem:** LOW. The xdxa.org analysis (the only documented comprehensive example) explicitly states seeing "no automated testing in the wild" and notes the irony that Quench itself has no tests. The SWADE system's GitLab issue requesting unit tests (from 2021) was never resolved at time of research. The `foundry-test-utils` package (2024) by rayners is the first serious attempt to provide reusable Foundry test infrastructure — its existence signals the ecosystem is maturing but testing is still the exception, not the rule.

**Implication:** Adding any automated testing to this module puts it ahead of the vast majority of community modules. Even a minimal Vitest suite for service-layer pure logic is a meaningful differentiator.

**Type safety in Foundry VTT ecosystem:** MEDIUM adoption. TypeScript module templates exist and are used by more serious module authors (DFreds, etc.). The `foundry-vtt-types` package is actively maintained but v13 support is beta. The JSDoc + `checkJs` path (no build step) is the practical choice for a module without an existing build pipeline. This is confirmed by the Foundry wiki's "Improving Intellisense" guide which uses `jsconfig.json` not TypeScript compilation.

**Error handling in Foundry VTT ecosystem:** LOW formal standardization. The `devMode` module established a pattern for debug logging that has community adoption. The `ui.notifications` API is the standard for user-facing messages. Beyond that, there is no community-standard structured error object pattern — the existing `createModuleError()` pattern in this codebase is already more sophisticated than most modules.

---

## Sources

- [foundry-test-utils — Vitest mocking utilities for Foundry VTT](https://github.com/rayners/foundry-test-utils) — MEDIUM confidence (active package, real solution)
- [Quench — in-browser testing with Mocha/Chai](https://github.com/Ethaks/FVTT-Quench) — HIGH confidence (official Foundry package listing)
- [XDXA — FoundryVTT Module Test Automation (2023)](https://xdxa.org/2023/foundryvtt-module-test-automation/) — MEDIUM confidence (practitioner writeup, single source)
- [foundry-vtt-types — Unofficial TypeScript types for Foundry](https://github.com/League-of-Foundry-Developers/foundry-vtt-types) — HIGH confidence (League of Foundry Developers, actively maintained)
- [League of Foundry Developers Module Template](https://github.com/League-of-Foundry-Developers/FoundryVTT-Module-Template) — HIGH confidence (official community org)
- [DFreds Module Template TS](https://www.dfreds-modules.com/developers/module-template-ts/) — MEDIUM confidence (popular module author's template)
- [JSDoc typings: all the benefits of TypeScript, with none of the drawbacks](https://gils-blog.tayar.org/posts/jsdoc-typings-all-the-benefits-none-of-the-drawbacks/) — MEDIUM confidence (well-regarded blog post on the pattern)
- [devMode — Foundry VTT Developer Mode module](https://github.com/League-of-Foundry-Developers/foundryvtt-devMode) — HIGH confidence (League org, widely used)
- [Foundry VTT Notifications API v13](https://foundryvtt.com/api/classes/foundry.applications.ui.Notifications.html) — HIGH confidence (official Foundry documentation)
- [Package Development Best Practices Checklist — Foundry VTT Community Wiki](https://foundryvtt.wiki/en/development/guides/package-best-practices) — HIGH confidence (official community wiki)
- [Improving Intellisense — Foundry VTT Community Wiki](https://foundryvtt.wiki/en/development/guides/improving-intellisense) — HIGH confidence (official community wiki)
- [TypeScript JSDoc Reference](https://www.typescriptlang.org/docs/handbook/jsdoc-supported-types.html) — HIGH confidence (official TypeScript documentation)

---

_Feature research for: Foundry VTT module quality engineering (brownfield refactor)_
_Researched: 2026-02-28_
