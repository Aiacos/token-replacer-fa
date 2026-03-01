# Phase 2: Foundry Mock Infrastructure - Research

**Researched:** 2026-03-01
**Domain:** Vitest mock setup for Foundry VTT globals (game, canvas, ui, Hooks, Worker)
**Confidence:** HIGH

## Summary

Phase 2 creates a single setup file (`tests/setup/foundry-mocks.js`) that stubs all Foundry VTT globals before any test file imports module code. The critical challenge is that several services (IndexService, SearchService, SearchOrchestrator, TVACacheService, ForgeBazaarService) export singleton instances that call `createDebugLogger()` at module load time, which calls `game.settings.get()`. This means mocks **must** exist on `globalThis` before ES module evaluation begins -- `vi.stubGlobal` in a Vitest `setupFiles` entry achieves this because setupFiles run before test file imports.

The project initially considered `@rayners/foundry-test-utils` as primary mock source, but research reveals significant gaps: it provides only bare `vi.fn()` stubs for `game.settings` (no in-memory round-trip), lacks `foundry.applications.api.ApplicationV2`, lacks Worker mock, lacks `FilePicker`, and requires GitHub Packages authentication. **Recommendation: write all mocks from scratch**, using `@rayners/foundry-test-utils` as a reference but not a dependency.

**Primary recommendation:** Build a single `tests/setup/foundry-mocks.js` that uses `vi.stubGlobal` for all Foundry globals with an in-memory settings store, a MockWorker class, and exported helper utilities for per-test customization.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- The setup file provides **both** global stubs (via `vi.stubGlobal`) AND exported test helper utilities
- Tests can import helpers for common overrides (e.g., toggling settings, enabling/disabling modules)
- Tests can also use standard `vi.spyOn` for one-off overrides

### Claude's Discretion
The user granted Claude full discretion on all technical implementation decisions for this infrastructure phase. The following areas should be resolved during research and planning based on what downstream test phases (4-8) will actually need:

**Mock fidelity:**
- Depth of mock behavior (minimal crash-prevention stubs vs. behavioral mocks with real-shaped data)
- Whether optional modules (TVA, FA Nexus) are present or absent by default
- Whether ApplicationV2, renderTemplate, loadTemplates are stubbed in Phase 2 or deferred

**MockWorker:**
- Synchronous vs. async (microtask) message handling
- Whether MockWorker runs real IndexWorker logic or returns canned responses
- Whether error simulation (onerror, messageerror) is included now or deferred to Phase 10
- Whether postMessage is a vi.fn() spy for assertion purposes

**Per-test customization:**
- Override pattern: vi.spyOn, helper functions, or both
- Auto-reset between tests vs. manual cleanup
- Vitest globals enabled vs. explicit imports
- Scope of template-related stubs

**Mock data:**
- Default value for game.system.id ('dnd5e' vs neutral)
- Whether token/actor factory functions or static fixtures are included, or deferred
- Whether game.settings uses in-memory store (set/get round-trip) or static defaults
- Whether game.i18n.localize returns the key as-is or loads real translations

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| MOCK-01 | Global mock setup provides `game` object with settings, modules, i18n, and system stubs | In-memory settings store pattern; game.modules Map with token-variants/fa-nexus/forge-vtt entries; game.i18n.localize returns key passthrough; game.system.id = 'dnd5e' |
| MOCK-02 | Global mock setup provides `ui` object with notifications stub | ui.notifications.{info,warn,error} as vi.fn() spies |
| MOCK-03 | Global mock setup provides `canvas` object with tokens collection stub | canvas.tokens.{placeables,controlled} arrays; canvas.scene object |
| MOCK-04 | Global mock setup provides `Hooks` registration and trigger stubs | Hooks.{on,once,off,call,callAll} as vi.fn() spies |
| MOCK-05 | Mock Worker implementation for testing Worker-dependent code paths | MockWorker class with postMessage spy, onmessage handler, async message dispatch |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| vitest | ^3.2.4 | Test runner with `vi.stubGlobal` | Already installed in Phase 1; native global stubbing API |
| jsdom | ^28.1.0 | DOM environment for tests | Already installed; provides window, document, localStorage |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| (none needed) | - | - | All mocks are hand-written using vi.fn() |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Hand-written mocks | @rayners/foundry-test-utils | Requires GitHub Packages auth, gaps in settings/Worker/ApplicationV2 mocks, adds dependency |
| Custom MockWorker | @vitest/web-worker | Known jsdom compatibility issues with postMessage routing; designed for running real worker code, not testing worker-dependent main thread code |
| Custom MockWorker | jsdom-worker | Unmaintained since 2020; designed for Jest, not Vitest |

**No additional packages needed.** All mocks use Vitest's built-in `vi.fn()` and `vi.stubGlobal()`.

## Architecture Patterns

### Recommended Project Structure
```
tests/
├── setup/
│   └── foundry-mocks.js    # Global mock setup (loaded via setupFiles)
└── helpers/
    └── mock-helpers.js      # Exported utilities for per-test customization
```

### Pattern 1: Global Mock Setup via setupFiles
**What:** A single file that runs before every test file, establishing all Foundry globals on `globalThis`.
**When to use:** Always -- this is the foundation all test phases depend on.
**Why it works:** Vitest `setupFiles` execute before test file ES module evaluation. Since services like `IndexService`, `SearchService`, etc. instantiate singletons at module scope (calling `createDebugLogger()` which calls `game.settings.get()`), the mocks must exist before `import` statements resolve.

```javascript
// tests/setup/foundry-mocks.js
// Source: Vitest docs https://vitest.dev/config/setupfiles
import { vi } from 'vitest';

// --- In-memory settings store ---
const _settingsStore = new Map();
const _settingsDefaults = new Map();

const mockSettings = {
  get: vi.fn((moduleId, key) => {
    const fullKey = `${moduleId}.${key}`;
    if (_settingsStore.has(fullKey)) return _settingsStore.get(fullKey);
    if (_settingsDefaults.has(fullKey)) return _settingsDefaults.get(fullKey);
    return undefined;
  }),
  set: vi.fn(async (moduleId, key, value) => {
    _settingsStore.set(`${moduleId}.${key}`, value);
  }),
  register: vi.fn((moduleId, key, config) => {
    if (config?.default !== undefined) {
      _settingsDefaults.set(`${moduleId}.${key}`, config.default);
    }
  }),
};

// --- game object ---
vi.stubGlobal('game', {
  settings: mockSettings,
  i18n: {
    localize: vi.fn((key) => key),
    format: vi.fn((key, data) => key),
  },
  modules: new Map(),
  system: { id: 'dnd5e', version: '3.0.0' },
  user: { isGM: true, id: 'mock-user-id', name: 'Mock GM' },
  forge: null,
});

// --- ui object ---
vi.stubGlobal('ui', {
  notifications: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
});

// --- canvas object ---
vi.stubGlobal('canvas', {
  scene: { id: 'mock-scene-id', name: 'Mock Scene' },
  tokens: {
    placeables: [],
    controlled: [],
  },
  ready: true,
});

// --- Hooks ---
vi.stubGlobal('Hooks', {
  on: vi.fn(),
  once: vi.fn(),
  off: vi.fn(),
  call: vi.fn(),
  callAll: vi.fn(),
});

// --- foundry namespace ---
vi.stubGlobal('foundry', {
  applications: {
    api: {
      ApplicationV2: class MockApplicationV2 {
        constructor(options = {}) { this.options = options; }
        static DEFAULT_OPTIONS = {};
        render() { return Promise.resolve(); }
        close() { return Promise.resolve(); }
        get rendered() { return false; }
        get element() { return document.createElement('div'); }
      },
    },
    handlebars: {
      renderTemplate: vi.fn(async (path, data) => '<div>mock template</div>'),
      loadTemplates: vi.fn(async (paths) => {}),
    },
  },
  utils: {
    mergeObject: vi.fn((original, other) => ({ ...original, ...other })),
  },
});

// --- v12 global fallbacks ---
vi.stubGlobal('renderTemplate', vi.fn(async (path, data) => '<div>mock template</div>'));
vi.stubGlobal('loadTemplates', vi.fn(async (paths) => {}));

// --- FilePicker ---
vi.stubGlobal('FilePicker', {
  browse: vi.fn(async () => ({ files: [], dirs: [] })),
});

// --- MockWorker ---
class MockWorker {
  constructor(url) {
    this.url = url;
    this.onmessage = null;
    this.onerror = null;
    this.postMessage = vi.fn();
    this.terminate = vi.fn();
    this.addEventListener = vi.fn();
    this.removeEventListener = vi.fn();
  }
}
vi.stubGlobal('Worker', MockWorker);
```

### Pattern 2: In-Memory Settings Store with Round-Trip
**What:** `game.settings.register()` stores default values; `game.settings.get()` returns stored or default values; `game.settings.set()` updates the store.
**When to use:** This enables the actual module code path: `registerSettings()` sets defaults, then `getSetting()` reads them back. Without round-trip, `game.settings.get('token-replacer-fa', 'debugMode')` returns `undefined` and tests break.
**Why it matters:** 7 files call `createDebugLogger()` which calls `game.settings.get(MODULE_ID, 'debugMode')`. The `_debugLog()` function has a try-catch for unregistered settings, but downstream test phases will need proper settings values.

### Pattern 3: Helper Utilities for Per-Test Customization
**What:** Exported functions that modify mock state for specific test scenarios.
**When to use:** When a test needs TVA to be active, specific settings values, tokens on canvas, etc.

```javascript
// tests/helpers/mock-helpers.js
import { vi } from 'vitest';

/**
 * Enable or disable TVA module in the mock
 */
export function setTVAAvailable(available = true, api = {}) {
  if (available) {
    game.modules.set('token-variants', {
      active: true,
      api: {
        doImageSearch: vi.fn(async () => []),
        cacheImages: vi.fn(async () => {}),
        isCaching: vi.fn(() => false),
        TVA_CONFIG: {
          staticCache: true,
          staticCacheFile: 'mock-cache.json',
        },
        updateTokenImage: vi.fn(async () => {}),
        ...api,
      },
    });
  } else {
    game.modules.delete('token-variants');
  }
}

/**
 * Set a module setting value
 */
export function setSetting(key, value, moduleId = 'token-replacer-fa') {
  // Directly write to the internal store
  const store = game.settings.get.__internals?.store;
  if (store) store.set(`${moduleId}.${key}`, value);
}

/**
 * Reset all mock state to defaults
 */
export function resetMocks() {
  game.modules.clear();
  canvas.tokens.placeables = [];
  canvas.tokens.controlled = [];
  // Clear settings store, keep defaults
}
```

### Pattern 4: MockWorker with Async Message Dispatch
**What:** MockWorker that records postMessage calls as spies and can simulate async responses via `_simulateMessage()`.
**When to use:** Phase 7/8 tests that verify IndexService/SearchOrchestrator worker communication.
**Decision:** Use **async (microtask)** dispatch, not synchronous. Real Workers are asynchronous; tests should reflect this to avoid hiding timing bugs.

```javascript
class MockWorker {
  constructor(url) {
    this.url = url;
    this.onmessage = null;
    this.onerror = null;
    this.postMessage = vi.fn();
    this.terminate = vi.fn();
    this._listeners = { message: [], error: [] };
    this.addEventListener = vi.fn((type, handler) => {
      if (this._listeners[type]) this._listeners[type].push(handler);
    });
    this.removeEventListener = vi.fn((type, handler) => {
      if (this._listeners[type]) {
        this._listeners[type] = this._listeners[type].filter(h => h !== handler);
      }
    });
  }

  /**
   * Simulate a message from the worker (async via microtask)
   * @param {*} data - Message data
   */
  async _simulateMessage(data) {
    await Promise.resolve(); // microtask yield
    const event = { data };
    if (this.onmessage) this.onmessage(event);
    for (const handler of this._listeners.message) {
      handler(event);
    }
  }

  /**
   * Simulate a worker error (async via microtask)
   * @param {Error} error - Error to simulate
   */
  async _simulateError(error) {
    await Promise.resolve();
    if (this.onerror) this.onerror(error);
    for (const handler of this._listeners.error) {
      handler(error);
    }
  }
}
```

### Anti-Patterns to Avoid
- **Mocking in individual test files:** Every test file would need to duplicate 100+ lines of mock setup. Use setupFiles instead.
- **Using `unstubGlobals: true`:** This would reset all Foundry globals between tests, defeating the purpose of the setup file. The setup file runs before each test file, but `unstubGlobals` would undo it before each test *within* a file.
- **Relying on `@vitest/web-worker`:** Has known jsdom compatibility issues where `postMessage()` routes to jsdom's `window.postMessage` instead of the worker scope. A custom MockWorker is simpler and more predictable for this use case.
- **Making settings mocks return undefined:** The `createDebugLogger()` pattern has a try-catch, but actual test phases need `game.settings.get()` to return real values (thresholds, booleans, etc.).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| DOM environment | Custom DOM mock | jsdom via Vitest `environment: 'jsdom'` | Already configured in Phase 1; provides window, document, localStorage, indexedDB |
| Test function spies | Custom spy implementation | `vi.fn()` | Built into Vitest; supports mock implementation, return values, call tracking |
| Global stubbing | `globalThis.game = ...` directly | `vi.stubGlobal('game', ...)` | Tracks stubs for cleanup; integrates with Vitest lifecycle |

**Key insight:** The mock infrastructure itself should be hand-written (not a package), but the tooling used to build mocks (vi.fn, vi.stubGlobal, jsdom) should never be reimplemented.

## Common Pitfalls

### Pitfall 1: Module-Scope Side Effects Before Mocks Exist
**What goes wrong:** Importing `IndexService.js` crashes with `ReferenceError: game is not defined` because the constructor calls `createDebugLogger()` which calls `game.settings.get()`.
**Why it happens:** ES modules evaluate top-level code during import. Service singletons (`export const indexService = new IndexService()`) run their constructors immediately.
**How to avoid:** Mocks MUST be established in `setupFiles` which runs before test file imports. Never rely on `beforeEach` for globals needed at import time.
**Warning signs:** `ReferenceError: X is not defined` on first test run.

### Pitfall 2: IndexService Constructor Creates Worker Immediately
**What goes wrong:** `new IndexService()` calls `new Worker(path)` in its constructor (line 62-65). Without a Worker mock, this crashes.
**Why it happens:** IndexService is not lazy about Worker creation (unlike SearchOrchestrator which is lazy). The singleton `export const indexService = new IndexService()` runs the constructor at import time.
**How to avoid:** The Worker mock must be stubbed globally BEFORE any import of IndexService or any file that transitively imports it.
**Warning signs:** `TypeError: Worker is not a constructor` during import.

### Pitfall 3: createDebugLogger Try-Catch Masks Problems
**What goes wrong:** `createDebugLogger()` wraps `game.settings.get()` in try-catch, silently ignoring errors. Tests pass but settings mock is broken.
**Why it happens:** The try-catch was added to handle the case where settings aren't registered yet in the init hook. In tests, it masks a broken mock.
**How to avoid:** The in-memory settings store should return `undefined` for unregistered keys (not throw), matching real Foundry behavior after registration. Register default settings in the mock setup.
**Warning signs:** Debug logging never works in tests even when debugMode should be true.

### Pitfall 4: Vitest Module Caching Between Tests
**What goes wrong:** Singleton services keep state across tests. For example, `IndexService.isBuilt` stays `true` after one test builds an index, affecting all subsequent tests.
**Why it happens:** Vitest caches ES module imports. Singletons are module-scope state.
**How to avoid:** Don't try to re-import singletons. Instead, provide `resetMocks()` helpers that reset relevant state. Phase 6 (DI refactor) will solve this properly.
**Warning signs:** Tests pass individually but fail when run together.

### Pitfall 5: Mock game.modules Must Be a Real Map
**What goes wrong:** Code uses `game.modules.get('token-variants')?.active` which requires Map semantics.
**Why it happens:** `game.modules` is used with `.get()`, `.has()`, and `.set()` throughout the codebase (TVACacheService, main.js, ForgeBazaarService, ScanService).
**How to avoid:** Initialize `game.modules` as `new Map()`, not a plain object. Provide helper functions to add/remove module entries.
**Warning signs:** `TypeError: game.modules.get is not a function`.

### Pitfall 6: foundry.applications.api.ApplicationV2 Extends Chain
**What goes wrong:** `TokenReplacerDialog extends foundry.applications.api.ApplicationV2` crashes if ApplicationV2 is not a real class.
**Why it happens:** ES `class X extends Y` requires Y to be a constructor function. A plain object or `vi.fn()` won't work.
**How to avoid:** Mock ApplicationV2 as an actual class with a constructor and prototype methods.
**Warning signs:** `TypeError: Class extends value undefined is not a constructor or null`.

## Code Examples

Verified patterns from project source code analysis:

### All Foundry Global References (Comprehensive Audit)

```
game.settings.get()       - 7 files (IndexService, SearchOrchestrator, ScanService, Utils, main.js, etc.)
game.settings.register()  - main.js (9 settings registered)
game.settings.set()       - not used in module code, but needed for test helpers
game.modules.get()        - 5 files (main.js, TVACacheService, ForgeBazaarService, ScanService, SearchOrchestrator)
game.i18n.localize()      - 4 files (main.js, UIManager, Utils, Constants)
game.i18n.format()        - not currently used, but part of standard Foundry API
game.system.id            - TokenService (D&D 5e check)
game.user.isGM            - main.js (scene control button visibility)
game.forge                - ForgeBazaarService (null check)

ui.notifications.info()   - main.js (progress notifications)
ui.notifications.warn()   - main.js (in-progress warning)
ui.notifications.error()  - main.js (error display)

canvas.scene              - main.js (active scene check)
canvas.tokens.placeables  - TokenService (getSceneNPCTokens)
canvas.tokens.controlled  - TokenService (selected tokens)

Hooks.once()              - main.js (init, ready hooks)
Hooks.on()                - main.js (getSceneControlButtons)

new Worker(url)           - IndexService constructor (EAGER), SearchOrchestrator._ensureWorker (LAZY)

foundry.applications.api.ApplicationV2 - UIManager (TokenReplacerDialog extends)
foundry.applications.handlebars.renderTemplate - Utils.js (v13 path)
foundry.applications.handlebars.loadTemplates  - Utils.js (v13 path)

renderTemplate()          - Utils.js (v12 fallback global)
loadTemplates()           - Utils.js (v12 fallback global)

FilePicker.browse()       - ScanService (directory scanning)
```

### Settings That Must Have Defaults
```javascript
// From main.js registerSettings() -- all settings with their defaults
const MODULE_SETTINGS_DEFAULTS = {
  fuzzyThreshold: 0.1,         // Number
  searchPriority: 'both',      // String
  autoReplace: false,          // Boolean
  confirmReplace: true,        // Boolean
  fallbackFullSearch: false,   // Boolean
  useTVACache: true,           // Boolean
  refreshTVACache: false,      // Boolean
  additionalPaths: '',         // String
  indexUpdateFrequency: 'weekly', // String
  debugMode: false,            // Boolean
};
```

### Vitest Config Update Required
```javascript
// vitest.config.js - add setupFiles
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
    include: ['tests/**/*.test.js'],
    setupFiles: ['tests/setup/foundry-mocks.js'],
  },
});
```

## Discretion Recommendations

Based on research into downstream test phases (4-8), here are the recommended decisions for areas under Claude's discretion:

### Mock Fidelity: Behavioral Mocks with Real Defaults
- **game.settings:** In-memory store with round-trip (register stores default, get returns stored/default, set updates). This is essential because 7 files call `game.settings.get()` at import time via `createDebugLogger()`.
- **game.i18n.localize:** Return the key as-is (passthrough). Sufficient for testing; avoids loading real translation files.
- **game.modules:** Start empty by default. TVA and FA Nexus are optional -- most tests shouldn't assume they're present. Provide `setTVAAvailable()` helper.
- **ApplicationV2, renderTemplate, loadTemplates:** Stub in Phase 2. UIManager.js imports and extends ApplicationV2 at module scope. Without it, any test importing UIManager (even transitively) crashes.

### MockWorker: Async Dispatch with Spy Methods
- **Async (microtask)** message handling -- matches real Worker behavior.
- **Does NOT run real IndexWorker logic** -- returns canned responses. Tests that need real worker behavior will use DI (Phase 6) or integration tests (Phase 8).
- **Error simulation (`_simulateError`)** included now -- it's only ~10 lines and Phase 7 IndexService tests will need it.
- **postMessage IS a vi.fn() spy** -- enables assertion on what messages were sent to the worker.

### Per-Test Customization: Auto-Reset + Helpers
- **Vitest globals: already enabled** (`globals: true` in Phase 1 config).
- **Auto-reset:** Use `beforeEach` in the setup file to clear settings store and reset notification spies. Do NOT use `unstubGlobals` (it would undo the mock setup).
- **Override pattern:** Both `vi.spyOn` and helper functions. Helpers for common patterns (TVA toggle, adding tokens), `vi.spyOn` for one-off overrides.

### Mock Data: D&D 5e Default, No Fixtures Yet
- **game.system.id:** Default to `'dnd5e'` -- the module only supports D&D 5e.
- **Token/actor factories:** Defer to Phase 7 (TEST-07, TEST-08). Phase 2 is infrastructure only.
- **game.settings:** In-memory store with the 10 default settings pre-registered.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `@rayners/foundry-test-utils` | Hand-written mocks | Phase 2 research | Package has gaps (no Worker, no ApplicationV2, GitHub Packages auth required) |
| `@vitest/web-worker` for Worker tests | Custom MockWorker | Phase 2 research | jsdom compatibility issues; MockWorker is simpler for testing worker-dependent code |
| `globalThis.game = {...}` | `vi.stubGlobal('game', {...})` | Vitest 3.x | stubGlobal integrates with cleanup lifecycle |
| `unstubGlobals: true` | Keep `false` (default) | Phase 2 research | unstubGlobals would undo setupFiles mocks; not appropriate for persistent global mocks |

## Open Questions

1. **IndexedDB in jsdom completeness**
   - What we know: jsdom ^28 provides basic IndexedDB support. StorageService uses IndexedDB with localStorage fallback.
   - What's unclear: Whether jsdom's IndexedDB implementation handles `IDBKeyRange.only()`, transaction abort handlers, and object store operations correctly.
   - Recommendation: Phase 2 does NOT need to resolve this -- StorageService tests are in Phase 5 (TEST-06). Phase 2 just needs the global `indexedDB` to exist (jsdom provides it). If gaps surface in Phase 5, `fake-indexeddb` can be added then.
   - **Already flagged in STATE.md:** "Phase 5: jsdom IndexedDB completeness unknown -- may need `fake-indexeddb` package"

2. **Singleton state reset between tests**
   - What we know: Services like IndexService, TVACacheService export singletons with internal state. Module caching means re-importing won't create fresh instances.
   - What's unclear: How much state leakage will affect Phase 4-8 tests in practice.
   - Recommendation: Phase 2 provides `resetMocks()` helper for mock state. Phase 6 (DI refactor) is the proper solution for service state -- it allows injecting fresh instances per test.

3. **fetch() mock for TVACacheService**
   - What we know: TVACacheService calls `fetch()` for cache file loading and HEAD requests.
   - What's unclear: Whether jsdom provides a working `fetch` or if tests need `vi.stubGlobal('fetch', ...)`.
   - Recommendation: Do NOT mock `fetch` in Phase 2 setup. It's service-specific and belongs in individual test files (Phase 7). jsdom may or may not provide `fetch`; if not, tests will mock it per-suite.

## Sources

### Primary (HIGH confidence)
- Vitest docs: setupFiles - https://vitest.dev/config/setupfiles
- Vitest docs: vi.stubGlobal - https://vitest.dev/guide/mocking/globals
- Vitest docs: unstubGlobals - https://vitest.dev/config/unstubglobals
- Project source code audit: 13 files, 148 Foundry global references (from CONTEXT.md code_context)

### Secondary (MEDIUM confidence)
- @rayners/foundry-test-utils GitHub repo - https://github.com/rayners/foundry-test-utils (verified mock structure via raw source)
- @vitest/web-worker npm package - https://www.npmjs.com/package/@vitest/web-worker (jsdom compatibility issues documented)

### Tertiary (LOW confidence)
- None -- all findings verified against primary sources

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - Vitest + hand-written mocks, no additional dependencies needed
- Architecture: HIGH - setupFiles pattern is well-documented, global audit is comprehensive from source code
- Pitfalls: HIGH - All pitfalls identified from actual source code analysis (import-time side effects, eager Worker creation, Map vs object)
- MockWorker design: HIGH - Requirements clear from IndexService.js and SearchOrchestrator.js source analysis
- Discretion recommendations: HIGH - Based on complete audit of downstream phases 4-8 requirements

**Research date:** 2026-03-01
**Valid until:** 2026-04-01 (stable domain -- Vitest setupFiles API is mature)
