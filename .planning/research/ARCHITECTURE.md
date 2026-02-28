# Architecture Research

**Domain:** Foundry VTT module — quality refactor for testability and maintainability
**Researched:** 2026-02-28
**Confidence:** HIGH (codebase directly examined; Vitest + Foundry testing patterns verified via official docs and community packages)

## Standard Architecture

### System Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                    FOUNDRY VTT RUNTIME (browser)                     │
│  Provides: game, ui, canvas, Hooks, foundry.applications.api         │
├─────────────────────────────────────────────────────────────────────┤
│                     IMPERATIVE SHELL (Foundry-aware)                 │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────────┐  │
│  │  main.js     │  │  UIManager   │  │  TokenService            │  │
│  │  (hooks,     │  │  (dialogs,   │  │  (canvas.tokens,         │  │
│  │   settings,  │  │   templates) │  │   token.actor)           │  │
│  │   workflow)  │  │              │  │                          │  │
│  └──────┬───────┘  └──────┬───────┘  └───────────┬──────────────┘  │
│         │                 │                        │                 │
├─────────┼─────────────────┼────────────────────────┼─────────────────┤
│         │         SERVICE LAYER (mixed purity)      │                 │
│  ┌──────▼──────────┐  ┌───▼────────────────────┐   │                 │
│  │ TVACacheService │  │  SearchOrchestrator    │   │                 │
│  │ (game.modules,  │  │  (game.settings.get,   │   │                 │
│  │  StorageService)│  │   fuzzy logic, cache)  │   │                 │
│  └──────┬──────────┘  └───┬────────────────────┘   │                 │
│         │                 │                          │                 │
│  ┌──────▼──────────┐  ┌───▼────────────────────┐   │                 │
│  │  IndexService   │  │  ScanService           │   │                 │
│  │  (IndexedDB,    │  │  (FilePicker,          │   │                 │
│  │   Worker)       │  │   game.settings)       │   │                 │
│  └──────┬──────────┘  └────────────────────────┘   │                 │
│         │                                            │                 │
├─────────┼────────────────────────────────────────────┼─────────────────┤
│         │         FUNCTIONAL CORE (pure, testable)   │                 │
│  ┌──────▼──────────────────────────────────────────▼──────────────┐  │
│  │  Constants.js   Utils.js   (index/search algorithms)           │  │
│  │  - CREATURE_TYPE_MAPPINGS  - isExcludedPath() [pure]           │  │
│  │  - EXCLUDED_FOLDERS        - extractPathFromTVAResult() [pure] │  │
│  │  - EXCLUDED_FILENAME_*     - parseSubtypeTerms() [pure]        │  │
│  │  (no Foundry globals)      - buildTermCategoryMap() [pure]     │  │
│  └─────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
```

### Component Responsibilities and Testability Status

| Component | Responsibility | Foundry Globals Used | Testability (Current) |
|-----------|----------------|---------------------|-----------------------|
| `main.js` (TokenReplacerApp) | Workflow orchestration, settings registration, hooks | `game`, `ui`, `canvas`, `Hooks` | Not directly testable |
| `UIManager.js` | Dialogs, template rendering | `game.i18n`, `ui.notifications`, `foundry.applications.api` | Not directly testable |
| `TokenService.js` | Token extraction/grouping (static) | `canvas.tokens` | Partially: pure methods are testable with mock canvas |
| `SearchOrchestrator.js` | Fuzzy search, parallel processing, caching | `game.settings.get()` (3 settings) | Partially: logic is testable with mocked settings |
| `TVACacheService.js` | TVA integration, cache loading | `game.modules`, `game.settings` | Partially: pure cache parsing methods are testable |
| `IndexService.js` | Hierarchical index, Worker management | `game.settings.get()` (1 setting) | Partially: index build logic is testable |
| `ScanService.js` | Directory scanning | `game.settings`, `FilePicker` | Hard: FilePicker is Foundry-only |
| `StorageService.js` | IndexedDB / localStorage wrapper | `window.indexedDB` | Testable with jsdom (IndexedDB mock exists) |
| `Constants.js` | Configuration constants | None | Fully testable |
| `Utils.js` | Shared utility functions | `game.i18n`, `game.settings` (in 2 functions) | Mostly testable; 2 functions need extraction |
| `IndexWorker.js` | Background index building | None | Fully testable (Node-compatible) |

## Recommended Project Structure

The refactored structure separates tests without disrupting the existing build:

```
token-replacer-fa/
├── scripts/
│   ├── main.js                     # Imperative shell — Foundry hooks only
│   ├── core/
│   │   ├── Constants.js            # Pure: no changes needed
│   │   └── Utils.js                # Extract: createModuleError + createDebugLogger need Foundry-free versions
│   ├── services/
│   │   ├── SearchService.js        # Facade: wire up via constructor DI
│   │   ├── SearchOrchestrator.js   # Extract: settings read → inject via constructor
│   │   ├── TokenService.js         # Extract: canvas access → inject or wrap
│   │   ├── TVACacheService.js      # Extract: game.modules → inject tvaAPI
│   │   ├── IndexService.js         # Extract: game.settings → inject setting value
│   │   ├── ScanService.js          # Wrap: FilePicker behind adapter interface
│   │   ├── StorageService.js       # Clean: uses window.indexedDB (jsdom provides this)
│   │   └── ForgeBazaarService.js   # Stub: no changes needed
│   ├── ui/
│   │   └── UIManager.js            # Imperative shell: keep Foundry-dependent, test via integration
│   └── workers/
│       └── IndexWorker.js          # Already pure: no changes needed
├── tests/                          # Parallel test structure (mirrors scripts/)
│   ├── setup/
│   │   ├── foundry-mocks.js        # Global mock: game, ui, canvas, Hooks
│   │   └── vitest.setup.js         # vi.stubGlobal calls for Foundry globals
│   ├── core/
│   │   ├── Constants.test.js       # Pure: trivial tests
│   │   └── Utils.test.js           # Pure functions + mock for game.i18n
│   ├── services/
│   │   ├── SearchOrchestrator.test.js  # Inject mock settings, mock Fuse, assert search logic
│   │   ├── TokenService.test.js        # Inject mock canvas tokens, test grouping/extraction
│   │   ├── TVACacheService.test.js     # Inject mock tvaAPI, test cache parse logic
│   │   ├── IndexService.test.js        # Inject mock storage, test index build
│   │   └── StorageService.test.js      # jsdom provides IndexedDB
│   └── workers/
│       └── IndexWorker.test.js         # Pure: test via postMessage simulation
├── vitest.config.js                # Test configuration
├── package.json                    # Dev dependencies only (no runtime impact)
└── ...
```

### Structure Rationale

- **`tests/` as sibling to `scripts/`:** Keeps tests separate from production code shipped in the ZIP. Tests are excluded from the build (ZIP only includes `scripts/`, `templates/`, `lang/`, `styles/`, `module.json`). This matches the existing build.sh pattern which does NOT include a `tests/` folder.
- **`tests/setup/foundry-mocks.js`:** Single place to define all Foundry global mocks. Consumed by vitest `setupFiles`. Changes to mock fidelity happen in one file.
- **Mirror structure in tests/:** `tests/services/SearchOrchestrator.test.js` mirrors `scripts/services/SearchOrchestrator.js` — developers find the test by navigating the same mental map.

## Architectural Patterns

### Pattern 1: Constructor Dependency Injection for Settings

**What:** Services receive Foundry settings values as constructor parameters (or via a settings-reader function) instead of calling `game.settings.get()` directly inside methods.

**When to use:** Every service method that calls `game.settings.get()` at call time — `SearchOrchestrator.searchLocalIndexDirectly()`, `SearchOrchestrator.parallelSearchCreatures()`, `IndexService`.

**Trade-offs:** Slightly more wiring at startup; dramatically better testability. Settings do not change during a single workflow run, so reading once at init is semantically correct anyway.

**Example — current (untestable):**
```javascript
// SearchOrchestrator.js — current pattern
async searchLocalIndexDirectly(searchTerms, index, creatureType = null) {
  const threshold = game.settings.get(MODULE_ID, 'fuzzyThreshold') ?? 0.1;
  // ...
}
```

**Example — refactored (testable):**
```javascript
// SearchOrchestrator.js — refactored
export class SearchOrchestrator {
  constructor(settings = null) {
    // settings is a plain object injected at construction time
    // In production: { fuzzyThreshold: 0.4, searchPriority: 'name', ... }
    // In tests: { fuzzyThreshold: 0.1, searchPriority: 'name', ... }
    this._settings = settings;
    // ...
  }

  _getSetting(key, fallback) {
    if (this._settings) return this._settings[key] ?? fallback;
    return game.settings.get(MODULE_ID, key) ?? fallback; // fallback for non-test use
  }

  async searchLocalIndexDirectly(searchTerms, index, creatureType = null) {
    const threshold = this._getSetting('fuzzyThreshold', 0.1);
    // ...
  }
}

// In main.js (production wiring):
const settings = {
  fuzzyThreshold: game.settings.get(MODULE_ID, 'fuzzyThreshold'),
  searchPriority: game.settings.get(MODULE_ID, 'searchPriority'),
  useTVACache: game.settings.get(MODULE_ID, 'useTVACache'),
};
const orchestrator = new SearchOrchestrator(settings);
```

### Pattern 2: Foundry Adapter / Provider Interface

**What:** Wrap `canvas.tokens` and `game.modules` access behind a thin adapter object passed at construction time. The adapter has the same shape as the real Foundry object but can be replaced with a mock in tests.

**When to use:** `TokenService.getSceneNPCTokens()` (uses `canvas.tokens`), `TVACacheService.init()` (uses `game.modules.get()`).

**Trade-offs:** One extra layer of indirection; makes the Foundry dependency boundary explicit. Worth the cost for `TokenService` because token grouping/extraction logic is complex enough to warrant unit tests.

**Example — TokenService adapter:**
```javascript
// TokenService.js — testable static methods with injected canvas
export class TokenService {
  /**
   * Get NPC tokens from scene
   * @param {Object} canvasTokens - The canvas.tokens object (or mock in tests)
   */
  static getSceneNPCTokens(canvasTokens = canvas?.tokens) {
    if (!canvasTokens?.placeables) return [];
    const selected = canvasTokens.controlled ?? [];
    if (selected.length > 0) {
      return selected.filter(t => t.actor?.type === 'npc' || t.actor?.type === 'creature');
    }
    return canvasTokens.placeables.filter(t => t.actor?.type === 'npc' || t.actor?.type === 'creature');
  }
}

// In test:
const mockCanvas = {
  tokens: {
    controlled: [],
    placeables: [
      { actor: { type: 'npc', name: 'Goblin', system: { details: { type: { value: 'humanoid' } } } } }
    ]
  }
};
const tokens = TokenService.getSceneNPCTokens(mockCanvas.tokens);
```

### Pattern 3: vi.stubGlobal for Foundry Runtime Mocks

**What:** Use Vitest's `vi.stubGlobal()` in a `setupFiles` script to inject mock `game`, `ui`, and `canvas` objects into `globalThis` before tests run. This is the simplest approach for services that still call `game.settings.get()` directly and cannot be immediately refactored.

**When to use:** Services where refactoring DI is not yet complete; utility functions like `createDebugLogger` that call `game.settings.get()`; any test that exercises code paths touching Foundry globals.

**Trade-offs:** Mocks may drift from real Foundry API; test passes but production breaks. Mitigate by keeping mocks minimal and verified against real behavior.

**Example — `tests/setup/foundry-mocks.js`:**
```javascript
// tests/setup/foundry-mocks.js
import { vi } from 'vitest';

export function createMockGame(overrides = {}) {
  const settings = new Map();
  return {
    settings: {
      get: vi.fn((moduleId, key) => settings.get(`${moduleId}.${key}`) ?? null),
      set: vi.fn((moduleId, key, value) => settings.set(`${moduleId}.${key}`, value)),
      _set: (moduleId, key, value) => settings.set(`${moduleId}.${key}`, value), // test helper
    },
    i18n: {
      localize: vi.fn((key) => key), // return key as-is (predictable in tests)
    },
    modules: {
      get: vi.fn((id) => null), // no modules available by default
    },
    user: { isGM: true },
    ...overrides,
  };
}

export function createMockCanvas(overrides = {}) {
  return {
    tokens: {
      controlled: [],
      placeables: [],
    },
    scene: { name: 'Test Scene' },
    ...overrides,
  };
}

export function createMockUI() {
  return {
    notifications: {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    },
  };
}
```

**`tests/setup/vitest.setup.js`:**
```javascript
import { vi, beforeEach } from 'vitest';
import { createMockGame, createMockCanvas, createMockUI } from './foundry-mocks.js';

// Stub Foundry globals before every test file
beforeEach(() => {
  vi.stubGlobal('game', createMockGame());
  vi.stubGlobal('canvas', createMockCanvas());
  vi.stubGlobal('ui', createMockUI());
  vi.stubGlobal('Hooks', { on: vi.fn(), once: vi.fn(), call: vi.fn() });
});
```

### Pattern 4: Functional Core / Imperative Shell Separation

**What:** Identify and isolate pure functions (inputs → outputs, no side effects) in `scripts/core/`. Move any remaining Foundry-global references out of those files. The shell (main.js, hooks) calls Foundry APIs and passes results into the pure core as plain data.

**When to use:** `createModuleError()` in `Utils.js` currently calls `game.i18n.localize()` — this makes it untestable in isolation. Split into a pure error factory (accepts strings) and a Foundry-aware wrapper.

**Trade-offs:** Slightly more functions; the pure variants become trivially testable.

**Example — `Utils.js` extraction:**
```javascript
// Pure factory — no Foundry dependency
export function createModuleErrorRaw(errorType, message, details, recoverySuggestions = []) {
  return { errorType, message, details, recoverySuggestions };
}

// Foundry-aware wrapper — stays in Utils.js but tested indirectly
export function createModuleError(errorType, details, recoveryKeys = []) {
  const message = game.i18n.localize(`TOKEN_REPLACER_FA.errors.${errorType}`);
  const recoverySuggestions = recoveryKeys.map(key =>
    game.i18n.localize(`TOKEN_REPLACER_FA.recovery.${key}`)
  );
  return createModuleErrorRaw(errorType, message, details, recoverySuggestions);
}
```

### Pattern 5: Test Configuration Without Build Step

**What:** Vitest runs directly against the existing ES6 `.js` source files with no TypeScript compilation step required. A minimal `vitest.config.js` (not `vitest.config.ts`) uses `environment: 'jsdom'` and points `setupFiles` at the mock setup.

**When to use:** This project has no bundler today. Vitest uses Vite internally but does not require a full Vite config — a plain `vitest.config.js` suffices. No TypeScript is needed.

**Trade-offs:** JSDoc-only type safety (no compiler errors); test run is fast since no transpilation step. Aligns with the project constraint: "No build step currently."

**`vitest.config.js` (minimal):**
```javascript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./tests/setup/vitest.setup.js'],
    include: ['tests/**/*.test.js'],
    // Exclude the worker file from normal test runs (worker environment differs)
    exclude: ['tests/workers/**'],
  },
});
```

**`package.json` (dev-only, not shipped in ZIP):**
```json
{
  "name": "token-replacer-fa",
  "type": "module",
  "private": true,
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "devDependencies": {
    "vitest": "^3.0.0",
    "jsdom": "^26.0.0"
  }
}
```

## Data Flow

### Test-Time vs. Production Data Flow

**Production (unchanged):**
```
User clicks button
    ↓
main.js processTokenReplacement()
    ↓ reads game.settings → constructs services
SearchService.init() → injects TVACacheService, ForgeBazaarService into SearchOrchestrator
    ↓
TokenService.getSceneNPCTokens()  ← canvas.tokens
    ↓
TVACacheService.loadTVACache()    ← game.modules.get('token-variants').api
    ↓
SearchOrchestrator.parallelSearchCreatures()  ← game.settings per call
    ↓
UIManager.createMainDialog()      ← foundry.applications.api.ApplicationV2
```

**Test-time (after refactor):**
```
Test creates mock data
    ↓
Test calls service method directly with injected dependencies
SearchOrchestrator(mockSettings).searchLocalIndexDirectly(terms, index)
    ↓
Pure fuzzy search logic runs (Fuse.js)
    ↓
Returns results array — assert against expected output
```

### Settings Data Flow (refactored)

```
main.js reads all settings ONCE from game.settings
    ↓
Plain object { fuzzyThreshold, searchPriority, useTVACache, ... }
    ↓ injected into constructor
SearchOrchestrator._settings — no further game.settings calls
    ↓
Test replaces plain object with test fixture — same code path
```

## Component Boundaries: What Needs Refactoring vs. What Is Fine

### Must Refactor (blocks testability)

| Component | Issue | Refactoring Action |
|-----------|-------|-------------------|
| `SearchOrchestrator.js` | `game.settings.get()` called per search (3 locations) | Inject settings object via constructor; `_getSetting()` helper falls back to `game.settings` |
| `TokenService.getSceneNPCTokens()` | Hard-coded `canvas.tokens` | Add optional parameter `canvasTokens = canvas?.tokens` |
| `TVACacheService.init()` | `game.modules.get()` hardcoded | Accept optional `tvaAPI` parameter; fall back to `game.modules.get()` when null |
| `Utils.createModuleError()` | Calls `game.i18n.localize()` | Extract pure `createModuleErrorRaw()` without i18n |
| `Utils.createDebugLogger()` | Calls `game.settings.get()` | Keep try-catch wrapper (already has it); stub `game` in tests |
| `IndexService` | `game.settings.get()` once in `build()` | Inject as constructor parameter |
| `ScanService` | `FilePicker` (no mock available) | Define `FilePickerAdapter` interface; inject in constructor |

### Fine As-Is (no refactoring needed for testability)

| Component | Why It Is Fine |
|-----------|---------------|
| `Constants.js` | Zero Foundry globals, pure data — test directly |
| `Utils.js` (most functions) | `isExcludedPath()`, `extractPathFromTVAResult()`, `parseSubtypeTerms()` are pure — test directly |
| `IndexWorker.js` | No Foundry globals, uses postMessage — test with Worker mock or directly |
| `StorageService.js` | Uses `window.indexedDB` — jsdom environment provides this |
| `UIManager.js` | Correct to keep Foundry-dependent; verify via integration/manual testing |
| `main.js` hooks | Correct to keep as imperative shell; not unit tested |
| `ForgeBazaarService.js` | Intentional stub — leave alone |

## Refactoring Order (Dependency-Aware)

Build order matters because later phases depend on earlier ones:

```
Phase 1: Infrastructure (no code changes to production)
  ├── Add package.json (devDependencies: vitest, jsdom)
  ├── Add vitest.config.js
  ├── Create tests/setup/foundry-mocks.js
  └── Create tests/setup/vitest.setup.js
      (validates test runner works; zero risk)

Phase 2: Pure core tests (no production changes)
  ├── Write tests/core/Constants.test.js
  └── Write tests/core/Utils.test.js
      (stubs game via vi.stubGlobal, tests isExcludedPath, extractPathFromTVAResult)

Phase 3: StorageService tests (no production changes)
  └── Write tests/services/StorageService.test.js
      (jsdom provides IndexedDB; no mocking beyond setup)

Phase 4: Extract pure error factory in Utils.js
  ├── Add createModuleErrorRaw() to Utils.js
  └── Update createModuleError() to delegate
      (no callers change; additive change only)

Phase 5: Refactor SearchOrchestrator for settings injection
  ├── Add constructor settings parameter with _getSetting() helper
  └── Write tests/services/SearchOrchestrator.test.js
      (largest test surface; fuzzy search, category search, parallel processing)

Phase 6: Refactor TokenService for canvas injection
  ├── Add optional canvasTokens parameter to getSceneNPCTokens()
  └── Write tests/services/TokenService.test.js
      (token extraction, grouping, search term building)

Phase 7: Refactor TVACacheService for tvaAPI injection
  ├── Accept optional tvaAPI in constructor or init()
  └── Write tests/services/TVACacheService.test.js
      (cache parse logic, path filtering, exclusion logic)

Phase 8: IndexService and ScanService
  ├── Inject indexUpdateFrequency setting into IndexService
  ├── Define FilePickerAdapter interface for ScanService
  └── Write remaining tests
```

**Why this order:**
- Phase 1-3 are zero-risk (no production code changes)
- Phase 4 is additive (new function, existing callers unchanged)
- Phase 5 is the highest-value test surface (search logic is the core feature)
- Phase 6-7 build on Phase 5's patterns
- Phase 8 last because ScanService (FilePicker) is the hardest to mock

## Anti-Patterns

### Anti-Pattern 1: Global Vitest Mocks for ALL Foundry APIs

**What people do:** Create an exhaustive mock of the entire Foundry API surface (ApplicationV2, Document classes, Canvas layers, Actor, Token, etc.) in the setup file.

**Why it is wrong:** The mock becomes a maintenance burden that drifts from real Foundry API. When Foundry v13 changes an API, tests continue to pass against the stale mock while production breaks. This was the "extremely unreliable" outcome documented by the Foundry testing community.

**Do this instead:** Mock only what services actually call — `game.settings.get`, `game.i18n.localize`, `game.modules.get`, `canvas.tokens` — and keep mocks minimal (return `null` by default, configure per test). For ApplicationV2 and Dialog interactions, rely on manual testing and the existing `MANUAL_TESTING_GUIDE.md`.

### Anti-Pattern 2: Testing the Imperative Shell

**What people do:** Write unit tests for `main.js` hook handlers, or for `UIManager.createMainDialog()`, trying to mock `foundry.applications.api.ApplicationV2`.

**Why it is wrong:** Hook handlers are glue code — they call services and await results. Testing glue tests the mock, not the logic. ApplicationV2 internals are framework behavior. The `MEMORY.md` already documents that `ApplicationV2.render({ force: true })` has non-obvious behavior that a mock would not capture.

**Do this instead:** Test the services that hooks call. Trust that hooks wire up correctly via manual testing (MANUAL_TESTING_GUIDE.md). Reserve test budget for pure logic.

### Anti-Pattern 3: Singleton Service Instances in Tests

**What people do:** Import the module-level singleton (`export const searchOrchestrator = new SearchOrchestrator()`) in tests and try to manipulate its state between test cases.

**Why it is wrong:** ES module singletons are shared across all tests in a test run. A previous test's side effects (mutated cache, loaded state) contaminate subsequent tests. This produces order-dependent, flaky tests.

**Do this instead:** Each test creates its own instance: `const orchestrator = new SearchOrchestrator(mockSettings)`. The singleton at module level is for production use. Tests bypass it by constructing instances directly. This is only possible if constructors accept injected dependencies (Patterns 1 and 2 above).

### Anti-Pattern 4: Skipping JSDoc During Refactor

**What people do:** Refactor constructor signatures without updating JSDoc `@param` annotations.

**Why it is wrong:** The project uses JSDoc as its type documentation strategy (no TypeScript compiler). Stale JSDoc silently removes the only type guidance available to editors and future developers.

**Do this instead:** Update `@param` annotations when adding optional parameters. Mark injected parameters clearly: `@param {Object|null} [settings=null] - Module settings object for testing; if null, reads from game.settings`.

## Integration Points

### External Services

| Service | Integration Pattern | Testability Notes |
|---------|---------------------|-------------------|
| Foundry `game` global | `vi.stubGlobal('game', mockGame)` in setup | Stub once; override per test where needed |
| Foundry `canvas` global | `vi.stubGlobal('canvas', mockCanvas)` in setup | Stub with minimal token placeables |
| TVA module (`token-variants`) | Inject `tvaAPI` object at construction time | Mock with `{ doImageSearch: vi.fn() }` |
| Fuse.js (dynamic CDN load) | Mock `loadFuse()` in tests to return a real Fuse instance | Import Fuse.js directly in test; inject |
| IndexedDB | jsdom v26 provides `window.indexedDB` | Fake-IndexedDB npm package as fallback |
| Web Workers | `Worker` is unavailable in jsdom | Test `indexPathsDirectly()` (the fallback path) directly |

### Internal Boundaries

| Boundary | Communication | Refactoring Implication |
|----------|---------------|------------------------|
| `main.js` ↔ Services | Direct method calls after `init()` | `main.js` is the wiring point; read settings once here, pass to constructors |
| `SearchService` ↔ `SearchOrchestrator` | `setDependencies()` already exists | Add settings parameter to `SearchOrchestrator` constructor; `SearchService.init()` reads and passes |
| `IndexService` ↔ `IndexWorker` | `postMessage` / `onmessage` | Test `IndexService` without Worker by checking fallback path; test Worker logic via direct function export |
| Services ↔ `StorageService` | Singleton import (`storageService`) | For tests, pass mock StorageService via constructor or use jsdom IndexedDB directly |

## Sources

- `@rayners/foundry-test-utils` (MEDIUM confidence) — Vitest + jsdom for FoundryVTT mocking, confirmed via GitHub README: https://github.com/rayners/foundry-test-utils
- Vitest official documentation — `vi.stubGlobal`, `environment: 'jsdom'`, `setupFiles` patterns (HIGH confidence): https://vitest.dev/guide/environment, https://vitest.dev/api/vi.html
- Foundry VTT test automation practices (MEDIUM confidence) — mocking is unreliable for Foundry framework internals; integration tests preferred for UI: https://xdxa.org/2023/foundryvtt-module-test-automation/
- Functional Core / Imperative Shell pattern (HIGH confidence — well-established software pattern): https://allarddewinter.net/blog/functional-core-imperative-shell-separating-logic-from-side-effects/
- League of Foundry Developers foundry-vtt-types (HIGH confidence — active package, v13 beta coverage): https://github.com/League-of-Foundry-Developers/foundry-vtt-types
- Direct codebase examination of `scripts/services/*.js`, `scripts/core/Utils.js` — Foundry global call sites inventoried (HIGH confidence)

---
*Architecture research for: Foundry VTT module testability and maintainability refactor*
*Researched: 2026-02-28*
