# Testing Patterns

**Analysis Date:** 2026-05-27

## Test Framework

**Runner:**
- Vitest 3.x
- Config: `vitest.config.js`

**Assertion Library:**
- Vitest built-in (expect / matchers)

**Run Commands:**
```bash
npm test              # Run all tests once (vitest run --passWithNoTests)
npm run test:watch    # Watch mode (vitest)
```

No coverage script is configured in `package.json`.

## Resolved: StorageService Collection Failure

_Historical note (fixed in commit `53ad614`, 2026-05-28)._ The polyfill IIFE in `tests/services/StorageService.test.js` previously guarded itself with bare `typeof localStorage.getItem === 'function'`, which threw `TypeError` at collection time when jsdom hadn't exposed `localStorage` on `globalThis`. All 31 StorageService tests were silently skipped (the suite reported 478 passing instead of 509). The guard now uses `typeof globalThis.localStorage?.getItem === 'function'` — full suite is 509/509.

## Test File Organization

**Location:** `tests/` directory, mirroring `scripts/` structure:
```
tests/
├── core/
│   ├── Constants.test.js      # Constants.js
│   └── Utils.test.js          # Utils.js
├── helpers/
│   ├── foundry-mocks.js       # Smoke tests for mock infrastructure
│   ├── foundry-mocks.smoke.test.js
│   ├── mock-helpers.js        # Re-usable helper factories (NOT a test file)
│   ├── mock-helpers.test.js   # Tests for the helpers themselves
│   └── mock-tva-cache.js      # Shared TVA cache fixture (NOT a test file)
├── integration/
│   └── SearchPipeline.test.js # End-to-end wiring tests
├── services/
│   ├── IndexService.test.js
│   ├── SearchOrchestrator.test.js
│   ├── SearchService.test.js
│   ├── StorageService.test.js  # 31 tests (was failing at collection — see Resolved note)
│   ├── TokenService.test.js
│   └── TVACacheService.test.js
└── setup/
    └── foundry-mocks.js        # Global mock setup (loaded via setupFiles)
```

**Naming:** `<SourceName>.test.js` — matches the source module name exactly.

**Test include glob:** `tests/**/*.test.js` (vitest.config.js line 6)

## Test Structure

**Suite Organization:**
```javascript
describe('ServiceName', () => {
  describe('constructor DI', () => {
    it('instantiates with injected deps without accessing Foundry globals', () => { ... });
  });

  describe('methodName()', () => {
    it('describes expected behavior', async () => { ... });
    it('handles error case', async () => { ... });
  });
});
```

**Vitest imports:** Always destructured from `'vitest'`:
```javascript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
```

**Setup/Teardown:**
- Global `beforeEach` in `tests/setup/foundry-mocks.js` resets all Foundry globals before every test
- Per-suite `beforeEach`/`afterEach` for local state (e.g., spy setup, mock overrides)
- `afterEach` used for `vi.restoreAllMocks()` when spies are created inline

## Environment Setup (`tests/setup/foundry-mocks.js`)

Loaded via `vitest.config.js` `setupFiles: ['fake-indexeddb/auto', 'tests/setup/foundry-mocks.js']`.

**Stubs established globally:**
- `game` — settings store (in-memory Map), `i18n.localize` passthrough, `modules` Map, `system.id: 'dnd5e'`, `user.isGM: true`
- `ui.notifications` — `info`, `warn`, `error` as `vi.fn()`
- `canvas` — `tokens.placeables`, `tokens.controlled` as resettable arrays
- `Hooks` — `on`, `once`, `off`, `call`, `callAll` as `vi.fn()`
- `foundry.applications.handlebars.renderTemplate` — returns `'<div>mock template</div>'`
- `foundry.applications.api.ApplicationV2` — minimal class stub
- `renderTemplate`, `loadTemplates` — v12 global fallbacks as `vi.fn()`
- `FilePicker.browse` — returns `{ files: [], dirs: [] }`
- `Dialog` — minimal class stub
- `Worker` — `MockWorker` class with `postMessage`, `terminate`, `addEventListener` as `vi.fn()` and `_simulateMessage`/`_simulateError` helpers

**Settings pre-registered** in setup file for all module keys: `fuzzyThreshold`, `searchPriority`, `autoReplace`, `confirmReplace`, `fallbackFullSearch`, `useTVACache`, `refreshTVACache`, `additionalPaths`, `indexUpdateFrequency`, `debugMode`.

**Global reset** in `beforeEach`: clears settings values store, empties `game.modules`, resets canvas arrays, clears all notification and Hooks spies.

## Mocking

**Framework:** Vitest `vi` — `vi.fn()`, `vi.spyOn()`, `vi.mock()`, `vi.stubGlobal()`

**Module-level mocking pattern** (used in SearchOrchestrator and SearchPipeline tests):
```javascript
// Mock loadFuse to return real Fuse.js from devDependency instead of CDN import
vi.mock('../../scripts/core/Utils.js', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, loadFuse: vi.fn(async () => Fuse) };
});
import { loadFuse } from '../../scripts/core/Utils.js'; // re-import to get mock
```

**Console spy pattern** (used in Utils.test.js):
```javascript
let warnSpy;
beforeEach(() => {
  warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => {
  warnSpy.mockRestore();
});
```

**What to mock:**
- All Foundry globals via `tests/setup/foundry-mocks.js` stubs (always present)
- External network calls: `vi.stubGlobal('fetch', vi.fn(...))` per test or suite
- CDN imports: `vi.mock('../../scripts/core/Utils.js', ...)` to replace `loadFuse`
- Worker behavior: `MockWorker._simulateMessage(data)` / `_simulateError(error)` in per-test setup

**What NOT to mock:**
- Internal pure functions (`escapeHtml`, `sanitizePath`, `parseFilterTerms`) — test directly
- Fuse.js logic — use real Fuse.js from devDependency (`import Fuse from 'fuse.js'`) instead of CDN mock
- `fake-indexeddb` — used as a real in-memory IDB implementation (setupFiles)

## Fixtures and Factories

**Mock TVA cache fixture** (`tests/helpers/mock-tva-cache.js`):
```javascript
export const MOCK_TVA_CACHE_JSON = { /* all 3 TVA entry formats */ };
export const EXPECTED_IMAGE_COUNT = 25; // consistent count across suites
export const EXPECTED_CATEGORIES = ['Humanoids', 'Beasts', 'Undead', 'Dragons', 'Elementals'];
export function createParsedImages() { /* returns pre-parsed images array */ }
```

**Actor/token factories** (`tests/helpers/mock-helpers.js`):
```javascript
// Create a D&D 5e actor matching TokenService.extractCreatureInfo() shape
const actor = createMockActor({ name: 'Dragon', type: 'dragon', subtype: 'Red' });

// Create a token with nested actor
const token = createMockToken({ actor, controlled: true });

// Populate canvas.tokens with tokens
addMockTokens([token1, token2]);
```

**Mock storage factory** (repeated pattern across service test files):
```javascript
function createMockStorage() {
  return {
    load: vi.fn(async () => null),
    save: vi.fn(async () => true),
    remove: vi.fn(async () => true),
    needsMigration: vi.fn(async () => false),
    migrateFromLocalStorage: vi.fn(async () => {}),
  };
}
```

**Mock TVA API factory** (TVACacheService.test.js):
```javascript
function createMockTvaAPI(overrides = {}) {
  return {
    TVA_CONFIG: { staticCache: true, staticCacheFile: 'data/tva-cache.json', ...overrides.TVA_CONFIG },
    isCaching: vi.fn(() => false),
    ...overrides,
  };
}
```

**Mock fetch factory** (TVACacheService.test.js, SearchPipeline.test.js):
```javascript
function createMockFetchResponse(json, ok = true, status = 200) {
  return {
    ok, status, statusText: ok ? 'OK' : 'Not Found',
    json: vi.fn(async () => json),
    headers: { get: vi.fn((header) => { ... }) },
  };
}
```

**Settings helper** (from `tests/helpers/mock-helpers.js`):
```javascript
setSetting('debugMode', true);        // sets game.settings value for current test
setSetting('fuzzyThreshold', 0.3);
```

**Location of helpers:**
- `tests/helpers/mock-helpers.js` — per-test mock customization functions
- `tests/helpers/mock-tva-cache.js` — shared TVA cache data fixture
- `tests/setup/foundry-mocks.js` — global infrastructure (loaded once per suite run)

## Coverage

**Requirements:** None enforced — no coverage threshold configured, no `--coverage` in any script.

**Gaps:**
- `UIManager` — no test file exists for `scripts/ui/UIManager.js`
- `ScanService` — no test file exists for `scripts/services/ScanService.js`
- `ForgeBazaarService` — no test file (intentional — service is a stub with no public API)
- `main.js` (`TokenReplacerApp`, `processTokenReplacement`) — no unit tests; requires Foundry runtime

## Test Types

**Unit Tests (10 of 11 files):**
- Each service has one `*.test.js` file in `tests/services/`
- Core utilities have files in `tests/core/`
- Each test file is self-contained: creates the service under test via DI, injects all mocks
- All Foundry globals provided by setup stubs — no real Foundry needed

**Integration Tests:**
- `tests/integration/SearchPipeline.test.js` — wires real `TVACacheService`, `IndexService`, and `SearchOrchestrator` instances together
- Only environment boundaries are mocked: `fetch`, `Worker`, settings
- Covers: full pipeline (cache → index → search → results), fallback path, Worker vs direct parity

**Smoke Tests:**
- `tests/setup/foundry-mocks.smoke.test.js` — validates global mock infrastructure is correctly wired

**E2E Tests:** Not present — full UI flows require Foundry VTT runtime. Manual testing guide exists at `MANUAL_TESTING_GUIDE.md`.

## Common Patterns

**Async Testing:**
```javascript
it('stores data and returns true', async () => {
  const service = new StorageService();
  const result = await service.save('key', { value: 42 });
  expect(result).toBe(true);
});
```

**DI instantiation (standard pattern for all service tests):**
```javascript
const service = new IndexService({
  storageService: createMockStorage(),
  workerFactory: vi.fn(),
  getSetting: vi.fn(),
  getTvaAPI: vi.fn(),
});
```

**Error Testing:**
```javascript
it('returns null for invalid path', () => {
  expect(sanitizePath(null)).toBeNull();
  expect(sanitizePath('../escape')).toBeNull();
  expect(sanitizePath('javascript:void(0)')).toBeNull();
});
```

**Worker simulation:**
```javascript
it('processes results from worker message', async () => {
  const worker = new MockWorker('...');
  const promise = service.indexPathsWithWorker(paths);
  await worker._simulateMessage({ type: 'complete', data: { categories: {}, allPaths: {} } });
  const result = await promise;
  expect(result).toBeDefined();
});
```

**Fetch mock:**
```javascript
beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async () => ({
    ok: true, status: 200,
    json: async () => MOCK_TVA_CACHE_JSON,
    headers: { get: () => null },
  })));
});
afterEach(() => {
  vi.unstubAllGlobals();
});
```

---

*Testing analysis: 2026-05-27*
