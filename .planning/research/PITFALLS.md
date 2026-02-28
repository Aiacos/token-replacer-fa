# Pitfalls Research

**Domain:** Foundry VTT module quality refactor (tests, types, error handling, structure)
**Researched:** 2026-02-28
**Confidence:** HIGH (codebase read + verified with official Foundry docs, foundry-vtt-types, and community sources)

---

## Critical Pitfalls

### Pitfall 1: JSDoc Type Annotations Break at game.settings.get() Boundaries

**What goes wrong:**
Every call to `game.settings.get(MODULE_ID, key)` returns `unknown` or `any` from the foundry-vtt-types perspective because the return type cannot be statically inferred from the registration call. When JSDoc `@type` annotations are added naively, callers assume a typed return value but receive `unknown`, causing cascading type errors throughout the codebase — or worse, the developer uses `@ts-ignore` everywhere to suppress errors, defeating the purpose of adding types at all.

**Why it happens:**
The foundry-vtt-types FAQ explicitly documents this: `game.settings.get()` requires **declaration merging** into the `ClientSettings.Values` interface to produce correct types. Most developers skip this step, add annotations to the function body, and then find that callers still see `any`. The existing module has 9 settings registered; each needs its own type entry in a global `.d.ts` file for JSDoc checking to work end-to-end.

**How to avoid:**
Create a `scripts/types/settings.d.ts` file that declares module augmentation of `ClientSettings.Values`:

```typescript
declare global {
  namespace ClientSettings {
    interface Values {
      'token-replacer-fa.fuzzyThreshold': number;
      'token-replacer-fa.searchPriority': 'faNexus' | 'forgeBazaar' | 'both';
      'token-replacer-fa.autoReplace': boolean;
      // ... all 9 settings
    }
  }
}
```

This file must be included in `tsconfig.json`'s `include` or referenced via triple-slash directives.

**Warning signs:**

- JSDoc annotations on service methods say `@returns {boolean}` but callers receive `any` in IDE tooltips
- `@ts-check` reports no errors even when a number is passed where a boolean is expected
- `getSetting('fuzzyThreshold')` autocompletes without type narrowing

**Phase to address:** Type annotation phase (early) — must be done before annotating any service that calls `getSetting()`.

---

### Pitfall 2: Testing game, canvas, ui Globals Without Proper Mock Setup

**What goes wrong:**
Unit tests for services like `SearchService`, `IndexService`, and `TokenService` import files that reference `game.modules.get()`, `game.settings.get()`, `canvas.scene`, and `ui.notifications` at the top level or in constructor calls. In a Node/jsdom test environment, these are `undefined`, causing immediate ReferenceError or TypeError on module import — before a single test runs. The test file appears to "not compile" and the entire suite fails with a cryptic error unrelated to the code being tested.

**Why it happens:**
Foundry VTT globals are browser-injected at runtime. The module's services (e.g., `TVACacheService.init()` calls `game.modules.get(...)`) assume these exist. In test environments they do not. Without a global mock setup file that stubs `game`, `canvas`, `ui`, and `Hooks` before imports resolve, any test that imports a service will crash at import time, not test time.

**How to avoid:**
Use a Vitest `setupFiles` entry that runs before any test module is imported. The `rayners/foundry-test-utils` library provides 600+ lines of Foundry mock infrastructure for free. Alternatively, create `tests/setup/foundry-mocks.js` with:

```javascript
global.game = {
  modules: { get: vi.fn() },
  settings: { get: vi.fn(), register: vi.fn() },
  i18n: { localize: vi.fn((k) => k) },
};
global.canvas = { scene: null };
global.ui = { notifications: { warn: vi.fn(), info: vi.fn(), error: vi.fn() } };
global.Hooks = { once: vi.fn(), on: vi.fn(), call: vi.fn() };
```

Reference this in `vitest.config.js`:

```javascript
setupFiles: ['./tests/setup/foundry-mocks.js'];
```

**Warning signs:**

- Test output shows `ReferenceError: game is not defined` on the first import
- `vi.mock()` for a service file still fails because the dependency chain imports a Foundry global
- Tests pass individually but fail when the full suite runs (import side-effects)

**Phase to address:** Test infrastructure phase (must be first among testing phases) — no service test can run until global mocks exist.

---

### Pitfall 3: Web Worker Cannot Be Tested in jsdom — Silently Passes Nothing

**What goes wrong:**
`IndexWorker.js` and the `Worker` constructor calls in `IndexService.js` and `SearchOrchestrator.js` fail silently in jsdom. jsdom does not implement `Worker`. The constructor returns `undefined` or throws, the `try/catch` in `IndexService` catches it and sets `this.worker = null`, and all tests against the "worker enabled" code path run the fallback path instead — without any indication that the worker was never actually tested. The test suite reports green while 0% of the Worker code path is exercised.

**Why it happens:**
jsdom intentionally does not implement Web Workers. The module's graceful fallback (`this.worker = null` when Worker throws) hides this: the code degrades silently rather than failing loudly. When writing tests for `IndexService.indexPathsWithWorker()`, developers mock `Worker` as a class — but if the mock is incomplete (missing `postMessage`, `onmessage`, `terminate`), the IndexService hangs waiting for a message that never comes.

**How to avoid:**
Mock the `Worker` constructor explicitly in the test setup:

```javascript
class MockWorker {
  constructor(url) {
    this.url = url;
  }
  postMessage(data) {
    // Synchronously simulate worker response for unit tests
    setTimeout(() => this.onmessage?.({ data: { type: 'complete', result: {} } }), 0);
  }
  terminate() {}
  addEventListener() {}
}
global.Worker = MockWorker;
```

Test the worker-disabled fallback path separately by setting `indexService.worker = null` in the test setup. For the Worker code path, integration-test via Quench inside Foundry VTT where real Workers run.

**Warning signs:**

- `IndexService` unit tests run fast (< 10ms) for operations that should take longer — fallback path is being used
- `indexService.worker` is `null` in every test despite no explicit `null` setup
- Code coverage shows `indexPathsWithWorker()` at 0% even though it's "tested"

**Phase to address:** Test infrastructure phase — MockWorker must be added to the global mock setup file before IndexService tests are written.

---

### Pitfall 4: Refactoring File Paths Breaks Foundry's Module-Relative URL System

**What goes wrong:**
Foundry VTT resolves ES module imports and Handlebars template paths using its own URL system rooted at the server base. Moving a file — e.g., extracting a utility from `scripts/core/Utils.js` into `scripts/core/utils/PathUtils.js` — requires updating every `import` statement in every file that imports from the old path. Missing even one causes a browser-side `404` with a misleading error message that looks like a JavaScript syntax error, not a file-not-found. Additionally, template path strings in `main.js` (`'modules/token-replacer-fa/templates/error.hbs'`) are not relative imports — they are runtime URL strings that must match the actual file system layout.

**Why it happens:**
ES module imports in Foundry are browser `<script type="module">` tags. The browser fetches each imported path as a URL. Refactoring tools (rename symbol, move file) in an IDE update `import` statements in JS files but do not update string literals in `loadTemplates()` calls, `new Worker(path)` constructor calls, or CSS `url()` references. These string-literal paths only break at runtime, not at lint/check time.

**How to avoid:**

- Define all module-relative path strings as named constants in `Constants.js` rather than inline strings: `WORKER_PATH = 'modules/token-replacer-fa/scripts/workers/IndexWorker.js'`
- After any file move, search for the old filename in all `.js`, `.hbs`, `.css`, and `.json` files: `grep -r "OldFileName" scripts/ templates/ styles/`
- The `esmodules` entry in `module.json` is the single entry point — only `main.js` is listed there, and all other imports flow from it. Do not add additional `esmodules` entries; all files must be reachable through the existing import graph

**Warning signs:**

- Browser console shows `Failed to load module script` with a 404 on a `.js` file
- Handlebars template shows blank content without error (template path string was not updated)
- `Worker` fails silently (constructor exception caught, falls back to `null`)

**Phase to address:** File structure refactoring phase — run a path-integrity verification step after any file move.

---

### Pitfall 5: Foundry Settings Registration Order Breaks Everything That Follows

**What goes wrong:**
Any code that calls `game.settings.get(MODULE_ID, key)` before `game.settings.register(MODULE_ID, key, ...)` has been called throws: `Error: cannot access setting [key] before it is registered`. Refactoring that moves `registerSettings()` later in the init hook, or that introduces a new service which calls `getSetting()` in its constructor, crashes the entire module initialization with a cryptic error.

**Why it happens:**
The current codebase already solved this once (v2.11.1, documented in MEMORY.md): `registerSettings()` must be called as the very first operation in the `init` hook, before any `_debugLog()` call because `_debugLog` internally calls `getSetting('debugMode')`. A refactor that adds a new service singleton instantiated at module scope (outside a hook) could call `getSetting()` during module load — before any hook fires.

**How to avoid:**

- Never call `getSetting()` in a class constructor or at module scope. Only call it inside methods, hooks, or after `Hooks.once('init', ...)` has fired
- Write a test that verifies `registerSettings()` is the first statement inside the `init` hook
- If new services are added, enforce lazy initialization (only resolve `getSetting()` values when a method is called, not in the constructor)
- Add a guard in `getSetting()` itself: log a warning if called before the settings registration flag is set

**Warning signs:**

- `Error: cannot access setting [key] before it is registered` in browser console on module load
- Module works when loaded alone but fails when other modules load first (initialization race)
- A new service class instantiated at module scope calls any Foundry API in its constructor

**Phase to address:** Error handling and structure phase — enforce the settings ordering rule as a linting comment or a dedicated integration test.

---

### Pitfall 6: Changing Cache Keys Silently Corrupts Existing User Installations

**What goes wrong:**
The module stores its index in IndexedDB under the key `'token-replacer-fa-index-v3'` and a TVA cache under `'tva-cache-v1'`. Any refactor that changes these key strings (e.g., renaming the key as part of a cleanup pass) causes every existing user's cache to be ignored. The module silently rebuilds from scratch on every page load for every user. This is not data loss, but it causes a severe UX regression (minutes-long index rebuild on every session) that users will report as a bug.

**Why it happens:**
Cache key constants are defined in the service files as local `const` declarations (not exported from `Constants.js`). During a cleanup refactor, a developer might rename `CACHE_KEY` from `'token-replacer-fa-index-v3'` to `'token-replacer-fa-index'` for aesthetic reasons, or change `StorageService` method names, not realizing the string literal is the persistence identity.

**How to avoid:**

- Centralize ALL storage key strings in `Constants.js` as exported constants. Never use inline string literals for cache keys
- Treat cache keys like database table names: only change them when intentionally invalidating existing caches, and document this in the changelog
- If a key must change, add a migration: check for the old key, copy data to the new key, delete the old key
- The `INDEX_VERSION` constant already handles schema invalidation within a key — use it, don't rename the key

**Warning signs:**

- A refactor PR changes a string that looks like a key but isn't annotated as "persistent storage key"
- Index builds every time after a deploy even on machines that had a valid cache before
- `storageService.has('token-replacer-fa-index-v3')` returns `false` after a refactor

**Phase to address:** Structure cleanup phase — before any renaming pass, document all storage keys as explicitly protected constants.

---

## Moderate Pitfalls

### Pitfall 7: foundry-vtt-types v13 Support Is Incomplete — Type Errors Are False Negatives

**What goes wrong:**
The `@league-of-foundry-developers/foundry-vtt-types` package has only partial v12 support and beta/incomplete v13 support (as of early 2026). Adding JSDoc `@type` annotations that reference Foundry globals (`ApplicationV2`, `ClientSettings`, `game`) may produce zero type errors in the IDE while the actual runtime behavior is different. Developers see green checkmarks and assume their types are correct, but the type definitions are incomplete stubs.

**Why it happens:**
The foundry-vtt-types README explicitly states: "versions 0.7, 0.8, and 9 are fully supported with partial support for versions 10, 11, and 12. Work on support for version 13 is currently underway." The v13 branch "has known bugs, issues in ergonomics, and unfinished work." This means annotating code against these types gives false confidence.

**How to avoid:**

- Use foundry-vtt-types for basic structure and common APIs only (e.g., `Actor`, `Token`, `Scene`), not for v13-specific APIs like `ApplicationV2`
- For v13-specific types, write local `@typedef` declarations in the module rather than relying on the third-party package
- Set realistic expectations: JSDoc types in this project provide IDE autocompletion and catch common mistakes, not full type safety
- Install from the `main` branch, not npm, to get the most current stubs: `npm add -D fvtt-types@github:League-of-Foundry-Developers/foundry-vtt-types#main`

**Warning signs:**

- IDE shows no errors on code that accesses non-existent properties of `ApplicationV2`
- Type-checking passes but the runtime throws `TypeError: app.render is not a function`
- Autocomplete suggests methods that don't exist in the Foundry v13 API

**Phase to address:** Type annotation phase — document explicitly that type coverage is "best effort" given the library's v13 gaps.

---

### Pitfall 8: Hooks Are Never Awaited — Async Handlers Silently Fail

**What goes wrong:**
Foundry VTT's `Hooks.on()` and `Hooks.once()` do not `await` async handler functions. If an async hook handler throws, the error is silently swallowed and execution continues. A refactor that makes a hook handler async (e.g., to use `await yieldToMain()` or `await dialog.render()`) will appear to work but any errors inside that handler are invisible.

**Why it happens:**
This is a documented architectural fact of Foundry: "Hooks do not await any registered callback that returns a Promise before moving on." The current codebase handles this correctly for the `getSceneControlButtons` hook (synchronous), and wraps the `ready` hook in an IIFE with its own error handling. A refactor that restructures these hooks could accidentally introduce an awaited call where synchronous code was expected.

**How to avoid:**

- All async operations triggered from hooks must have their own top-level `try/catch`
- The `getSceneControlButtons` hook handler must remain synchronous — never add `await` inside it
- When testing hook-triggered behavior, verify error handling by mocking a rejection and confirming the module doesn't silently swallow it
- Add JSDoc `@returns {void}` (not `@returns {Promise}`) to hook handlers to make the synchronous contract explicit

**Warning signs:**

- A hook handler becomes `async` without a corresponding `try/catch`
- `ui.notifications.error()` is never called even when a hook handler throws
- Tests show the handler was called but side effects never happened

**Phase to address:** Error handling standardization phase — audit all hook handlers for async/error handling correctness.

---

### Pitfall 9: ApplicationV2 render() Requires { force: true } for Initial Display

**What goes wrong:**
When `dialog.render()` is called without `{ force: true }`, ApplicationV2 silently exits — it returns a resolved Promise, `dialog.rendered` stays `false`, no DOM is created, and no visible dialog appears. The module then calls `uiManager.isDialogOpen()`, which checks `dialog.rendered`, gets `false`, and skips all UI updates. The token replacement process continues in the background with no user-facing feedback.

**Why it happens:**
This is documented in the project's MEMORY.md and was fixed in v2.11.3. ApplicationV2's `render()` is designed to be idempotent: calling `render()` on an already-rendered application is a no-op unless forced. On first render, the application has not yet been rendered, so the behavior is counterintuitive — you must force the first render explicitly. A refactor that changes how dialogs are created or that introduces a new dialog type will re-encounter this bug if `{ force: true }` is not applied consistently.

**How to avoid:**

- Create a module-internal wrapper `renderDialog(app)` that always passes `{ force: true }` and document why
- Write a test that verifies `dialog.rendered === true` after the creation call
- Add a linting rule or code comment at every `dialog.render()` call site explaining that `force: true` is required
- Never call `render()` without the options argument on a newly-created ApplicationV2 instance

**Warning signs:**

- Dialog is created but nothing appears on screen
- `uiManager.isDialogOpen()` returns `false` immediately after `createMainDialog()`
- `dialog.rendered` is `false` after `await dialog.render()` returns

**Phase to address:** Error handling and test infrastructure phases — a test that asserts `rendered === true` catches regressions automatically.

---

### Pitfall 10: JSDoc on Module Singletons Creates False "Tested" Confidence

**What goes wrong:**
The module exports singletons (`export const searchService = new SearchService()`). When writing unit tests, developers import this singleton and test it — but the singleton's constructor runs at import time, executing initialization code that calls Foundry globals. If global mocks are not comprehensive enough, the singleton is in a broken state when tests run. Developers see their test assertions pass (because the mock returns a value) but the initialization code path is actually broken, just silently.

**Why it happens:**
ES module singletons are initialized exactly once per module load. In tests, if the Foundry global mock is incomplete when the module is imported, the singleton captures the incomplete state and all subsequent tests use a broken instance. Resetting between tests requires re-importing the module, which requires cache-busting — non-trivial in Vitest without explicit module mocking.

**How to avoid:**

- Ensure the global mock setup file (`tests/setup/foundry-mocks.js`) is comprehensive before writing any service tests
- Use `vi.resetModules()` in `beforeEach` for service tests that need a fresh singleton: `const { searchService } = await import('../scripts/services/SearchService.js')`
- Alternatively, test service classes directly (not singletons): `new SearchService()` — add a factory or test-only constructor if needed
- The services are already class-based, making this approach viable without structural changes

**Warning signs:**

- Service singleton has unexpected state mid-test-suite that was set by a previous test
- Changing the order of tests changes whether they pass or fail
- Mock return values appear correct but the service method still returns wrong data

**Phase to address:** Test infrastructure phase — establish module reset patterns before writing the first service test.

---

### Pitfall 11: module.json Structure Must Not Change

**What goes wrong:**
Foundry VTT downloads `module.json` from the manifest URL to discover the module before installation. If fields are renamed, removed, or restructured (e.g., renaming `esmodules` to `scripts`, or changing the `relationships` format), Foundry cannot parse the manifest and the module becomes uninstallable or unloadable for existing users. The `download` URL must also remain in its exact format or auto-update breaks.

**Why it happens:**
A cleanup refactor might remove fields that look unused (e.g., `bugs`, `url`) or restructure nested objects for consistency. Foundry's manifest parser is strict about required fields and the `compatibility` object format. The `version` field must also remain a semver string matching the `download` URL path precisely.

**How to avoid:**

- Treat `module.json` as a read-only contract during refactoring — changes must be intentional (version bumps, new language files)
- The `sync-version.sh` script is the only approved mechanism for version field changes
- Never add or remove top-level fields without consulting Foundry's manifest documentation
- Verify the manifest is valid after any change using the Foundry package validator

**Warning signs:**

- Foundry shows "Module update available" but clicking Update does nothing
- Module fails to activate after a fresh install
- Console shows `Error parsing module.json` or manifest validation failure

**Phase to address:** Structure phase — explicitly flag `module.json` as protected in the refactoring scope document.

---

## Technical Debt Patterns

Shortcuts that seem reasonable but create long-term problems.

| Shortcut                                             | Immediate Benefit           | Long-term Cost                                                                 | When Acceptable                         |
| ---------------------------------------------------- | --------------------------- | ------------------------------------------------------------------------------ | --------------------------------------- |
| Skip declaration merging for `ClientSettings.Values` | Faster annotation           | Type errors on every `getSetting()` call, defeating the purpose                | Never — do it once up front             |
| Use `@ts-ignore` to silence type errors              | Unblocks progress           | Masks real issues; annotated code gives false safety                           | Never in refactor phase                 |
| Test only the happy path for async services          | Faster test writing         | Error recovery code (quota exceeded, worker crash, TVA timeout) stays untested | Only in initial spike, fix before merge |
| Add `any` cast to suppress TVACacheService types     | Unblocks other tests        | Cache data shape changes silently                                              | Only with `// TODO: fix type` comment   |
| Inline cache key strings instead of constants        | Saves one import            | Cache key changes during cleanup break all existing caches                     | Never for persistent storage keys       |
| Skip `{ force: true }` on `render()` during refactor | Seems to work in quick test | Dialog never appears for users on first load                                   | Never for ApplicationV2 instances       |

---

## Integration Gotchas

Common mistakes when connecting to external services.

| Integration                                                                     | Common Mistake                                             | Correct Approach                                                                                            |
| ------------------------------------------------------------------------------- | ---------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| TVA cache file direct access                                                    | Assume `TVA_CONFIG.staticCacheFile` is always a valid path | Validate path exists before fetch; handle null/undefined gracefully                                         |
| TVA `isCaching()` polling                                                       | Trust the return value absolutely                          | Add a timeout (already 30s); but also handle "still caching" as a non-fatal recoverable state               |
| Fuse.js CDN load                                                                | Assume CDN is always available                             | The `loadFuse()` utility already handles this; do not bypass it during refactoring                          |
| IndexedDB in test environments                                                  | jsdom's IndexedDB is partially implemented                 | Mock `StorageService` entirely in unit tests; test real IndexedDB only via Quench integration tests         |
| Worker thread path (`modules/token-replacer-fa/scripts/workers/IndexWorker.js`) | Treat as a relative import string                          | It is a browser URL; must match the deployed file path exactly; never refactor without updating this string |

---

## Performance Traps

Patterns that work at small scale but fail as usage grows.

| Trap                                                                                       | Symptoms                                          | Prevention                                                                        | When It Breaks                                               |
| ------------------------------------------------------------------------------------------ | ------------------------------------------------- | --------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| Rebuild termIndex in main thread after every cache load                                    | UI pause on first load post-version bump          | Build termIndex in worker; or cache separately in IndexedDB                       | Libraries with >10k images                                   |
| Synchronous `indexOf`/`includes` search in categorizeImage() without pre-compiled patterns | Search gets slower as creature type mappings grow | Pre-compile regex at startup (already partially done); add to test coverage       | When CREATURE_TYPE_MAPPINGS exceeds ~30 entries per category |
| Unbounded `I18N_CACHE` Map in UIManager                                                    | Memory grows throughout session                   | Cap at 1000 entries; or accept current unbounded growth for module-lifetime scope | If module is run in very long sessions (12+ hours)           |
| Single Web Worker for both index building and search                                       | One long search blocks another                    | Current architecture is single-worker; acceptable for this module's scope         | When token library exceeds 100k images                       |

---

## Security Mistakes

Domain-specific security issues beyond general web security.

| Mistake                                                                   | Risk                                                     | Prevention                                                                                 |
| ------------------------------------------------------------------------- | -------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Adding `.innerHTML` assignments during refactoring without `escapeHtml()` | XSS via token names containing HTML                      | All dynamic HTML assignments must use `escapeHtml()`; templates use Handlebars auto-escape |
| Logging token image paths to console unconditionally in debug mode        | Path traversal disclosure in shared GM sessions          | Debug logs are already gated on `debugMode` setting; never log paths outside this gate     |
| Exposing internal service instances on `window.TokenReplacerFA`           | Direct manipulation of module state from browser console | Acceptable for a Foundry module in GM context; document that this is debug API only        |

---

## "Looks Done But Isn't" Checklist

Things that appear complete but are missing critical pieces.

- [ ] **JSDoc types added:** Verify `ClientSettings.Values` declaration merging exists — without it, `getSetting()` return types are still `unknown` even if everything else is annotated
- [ ] **Tests written:** Verify MockWorker is in global setup — without it, all IndexService Worker-path tests silently run the fallback path
- [ ] **Error handling standardized:** Verify all async hook handlers have top-level `try/catch` — Foundry does not await or catch Promise rejections from hooks
- [ ] **Dialog creation refactored:** Verify every `new SomeApp().render()` call includes `{ force: true }` — missing it causes silent no-show on first display
- [ ] **Storage keys unchanged:** Verify no cache key string was renamed during cleanup — run a diff on `CACHE_KEY`, `TVA_CACHE_KEY`, and `INDEX_VERSION` constants
- [ ] **module.json unchanged:** Verify structure and all required fields remain after any cleanup — compare with git diff before and after refactor
- [ ] **Template paths still valid:** Verify all 8 `loadTemplates()` path strings still match files on disk after any file moves

---

## Recovery Strategies

When pitfalls occur despite prevention, how to recover.

| Pitfall                                                  | Recovery Cost | Recovery Steps                                                                                         |
| -------------------------------------------------------- | ------------- | ------------------------------------------------------------------------------------------------------ |
| Cache key changed, users lose caches                     | MEDIUM        | Deploy a one-time migration in `init` hook: check old key, copy to new key, delete old key             |
| `{ force: true }` missing, dialogs broken in prod        | LOW           | Single-line fix; hotfix release; users must reload once                                                |
| Settings registration order broken                       | LOW           | Move `registerSettings()` back to first line of `init` hook; hotfix release                            |
| module.json field removed, module uninstallable          | HIGH          | Restore field; requires new release AND users must reinstall (cannot auto-update from broken manifest) |
| Type annotations wrong, no actual errors caught          | MEDIUM        | Re-annotate with declaration merging; add integration tests to verify types catch real bugs            |
| Web Worker tests passing but covering fallback path only | MEDIUM        | Add MockWorker to global setup; re-run and fix tests that relied on fallback assumptions               |

---

## Pitfall-to-Phase Mapping

How roadmap phases should address these pitfalls.

| Pitfall                                       | Prevention Phase                  | Verification                                                                           |
| --------------------------------------------- | --------------------------------- | -------------------------------------------------------------------------------------- |
| JSDoc types don't flow through `getSetting()` | Type annotation phase             | Run `tsc --noEmit` with strict mode; verify `getSetting()` return has concrete type    |
| Foundry globals undefined in tests            | Test infrastructure phase (first) | `npm test` passes without `ReferenceError: game is not defined`                        |
| Worker tests cover fallback not Worker path   | Test infrastructure phase         | Code coverage shows `indexPathsWithWorker()` > 0%                                      |
| File paths break after file moves             | Structure refactoring phase       | Grep for old filenames; load module in Foundry after every move                        |
| Settings registration order                   | Error handling phase              | Integration test: module loads cleanly when `registerSettings()` is 2nd statement      |
| Cache keys renamed during cleanup             | Structure phase                   | Constants audit: all cache keys in `Constants.js`, reviewed in PR                      |
| module.json corrupted                         | All phases                        | Foundry package validator run before every release                                     |
| `render({ force: true })` missing             | Test infrastructure phase         | Test asserts `dialog.rendered === true` after creation                                 |
| Singleton state bleeds between tests          | Test infrastructure phase         | `vi.resetModules()` pattern documented in test README                                  |
| Async hook handlers swallow errors            | Error handling phase              | Verify all hook handlers have `try/catch`; mock rejection to confirm error is surfaced |

---

## Sources

- [foundry-vtt-types GitHub](https://github.com/League-of-Foundry-Developers/foundry-vtt-types) — v12/v13 support status, ClientSettings.Values declaration merging pattern (HIGH confidence)
- [foundry-vtt-types FAQ Wiki](https://github.com/League-of-Foundry-Developers/foundry-vtt-types/wiki/FAQ) — pre-init global access pitfall, declaration merging requirement (HIGH confidence)
- [foundry-test-utils GitHub](https://github.com/rayners/foundry-test-utils) — Foundry mock infrastructure patterns for Vitest, ~600 lines saved per module (MEDIUM confidence)
- [XDXA: FoundryVTT Module Test Automation](https://xdxa.org/2023/foundryvtt-module-test-automation/) — Quench integration test approach, tight coupling problem with mocking, race condition risks (MEDIUM confidence)
- [Foundry VTT Community Wiki: Hooks](https://foundryvtt.wiki/en/development/api/hooks) — hooks never await async callbacks (HIGH confidence, documented behavior)
- [Foundry VTT API: ApplicationV2](https://foundryvtt.com/api/classes/foundry.applications.api.ApplicationV2.html) — render() with force option behavior (HIGH confidence, official docs)
- [Foundry VTT Community Wiki: Settings](https://foundryvtt.wiki/en/development/api/settings) — ClientSettings.Values type registration pattern (HIGH confidence)
- [How to test Web Workers with Jest](https://vuedose.tips/how-to-test-web-workers-with-jest/) — MockWorker pattern for jsdom environments (MEDIUM confidence)
- Project MEMORY.md — ApplicationV2 `render({ force: true })` requirement, settings initialization order bug history (HIGH confidence, direct project experience)
- Project CONCERNS.md — Worker error handling gaps, StorageService quota exceeded, TVACacheService race conditions (HIGH confidence, codebase analysis)
- Project CLAUDE.md — module architecture, cache key constants, template path strings (HIGH confidence, authoritative project context)

---

_Pitfalls research for: Foundry VTT module quality refactor (token-replacer-fa)_
_Researched: 2026-02-28_
