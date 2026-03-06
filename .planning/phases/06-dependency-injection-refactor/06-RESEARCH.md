# Phase 6: Dependency Injection Refactor - Research

**Researched:** 2026-03-06
**Domain:** Constructor dependency injection for JavaScript ES module services
**Confidence:** HIGH

## Summary

This phase refactors all service constructors to accept optional injected dependencies via a uniform `constructor(deps = {})` pattern. The goal is testability -- every service must be instantiable in isolation without touching Foundry VTT globals (`game`, `canvas`, `ui`, `window.Worker`). All decisions are locked in CONTEXT.md: options object destructuring, lazy resolution of globals, `createDefaultGetSetting()` factory in Utils.js, and TokenService conversion from static to instance class.

The codebase currently has five services plus `main.js` that access Foundry globals directly. Each service's global access points have been audited below. The refactor is mechanical: wrap each global access in a lazy accessor, accept that accessor as an optional constructor parameter, and default to the real global when no injection is provided. No library is needed -- this is a pure refactoring pattern.

**Primary recommendation:** Refactor services one at a time in dependency order: Utils.js factory first, then leaf services (StorageService -- already clean, TVACacheService, TokenService), then dependent services (IndexService, SearchOrchestrator), then wiring in SearchService/main.js. Verify each step with `npm test` to catch regressions.

<user_constraints>

## User Constraints (from CONTEXT.md)

### Locked Decisions
- All services use uniform options object pattern: `constructor(deps = {})`
- Destructure deps inside constructor: `const { settings, indexService, ... } = deps`
- No positional parameters -- options object is self-documenting and order-independent
- No runtime validation of injected deps -- trust the caller, JSDoc types provide IDE safety
- Lazy resolution for all Foundry globals -- access `game.*` and `canvas.*` only when methods actually need them
- Pattern: `this._getSetting = deps.getSetting ?? createDefaultGetSetting()`
- TokenService: Convert from static-only class to instance class with DI, add singleton export, update ALL callers
- Settings access: Inject a shared `getSetting(moduleId, key)` accessor function, define `createDefaultGetSetting()` factory in Utils.js
- TVA API: Separate `getTvaAPI` dependency, lazy accessor function pattern: `getTvaAPI: () => game.modules.get('token-variants')?.api`
- Worker injection: `workerFactory: () => new Worker(path)` pattern
- Singleton export handling: Keep `export const x = new X()` pattern unchanged, no args = defaults

### Claude's Discretion
- Exact internal property naming for stored deps (e.g. `this._getSetting` vs `this._settings`)
- Order of dependency destructuring in constructors
- Whether to add a shared base class or keep DI pattern repeated per service
- How to handle `setDependencies()` method in SearchOrchestrator (merge with constructor DI or remove)

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope

</user_constraints>

<phase_requirements>

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| DI-01 | SearchOrchestrator accepts injected dependencies (IndexService, TVACacheService, Fuse, settings) | Global access audit shows 6 `game.settings.get()` calls, `indexService` singleton import, tvaCacheService via `setDependencies()`. All become constructor-injected deps. |
| DI-02 | TokenService accepts optional canvas injection for testability | `getSceneNPCTokens()` accesses `canvas.tokens.placeables` and `canvas.tokens.controlled`. Static-to-instance conversion with `this._canvas` dep. |
| DI-03 | TVACacheService accepts injected TVA API for testability | `init()` accesses `game.modules.get('token-variants')?.api`. Replace with `getTvaAPI` lazy accessor dep. |
| DI-04 | IndexService accepts injected StorageService and Worker factory | Constructor creates `new Worker(path)` eagerly. `build()` accesses `game.settings.get()` and `game.modules.get()`. StorageService imported as singleton. All become deps. |
| DI-05 | All DI changes are backward-compatible (defaults to Foundry globals when no injection) | Each dep destructured with `?? defaultFactory()` fallback. Singleton exports call `new X()` with no args. |

</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Vitest | ^3.2.4 | Test runner | Already installed, used in phases 1-5 |
| jsdom | (via Vitest) | DOM environment | Already configured in vitest.config.js |

### Supporting
No additional libraries needed. DI is implemented via plain JavaScript constructor patterns.

## Architecture Patterns

### Recommended Refactoring Order
```
1. Utils.js           # Add createDefaultGetSetting() factory
2. TVACacheService    # Leaf service, simple: getTvaAPI + getSetting deps
3. TokenService       # Static→instance conversion + canvas dep
4. IndexService       # Depends on StorageService + Worker + getSetting + getTvaAPI
5. SearchOrchestrator # Depends on IndexService + TVACacheService + getSetting + workerFactory
6. SearchService      # Thin facade, pass-through DI (optional)
7. main.js            # Update TokenService.method() → tokenService.method() calls
```

### Pattern 1: Constructor DI with Lazy Defaults
**What:** Each service constructor accepts an options object with optional dependency overrides. Defaults are lazy functions that resolve Foundry globals only when called.
**When to use:** Every service in this phase.
**Example:**
```javascript
// Utils.js - add this factory
export function createDefaultGetSetting() {
  return (moduleId, key) => game.settings.get(moduleId, key);
}

// TVACacheService.js - refactored constructor
export class TVACacheService {
  constructor(deps = {}) {
    const {
      getTvaAPI = () => game.modules.get('token-variants')?.api,
      getSetting = createDefaultGetSetting(),
      storageService: injectedStorage = storageService,
    } = deps;

    this._getTvaAPI = getTvaAPI;
    this._getSetting = getSetting;
    this._storageService = injectedStorage;

    // Lazy: don't call getTvaAPI() here, call in init() or methods
    this.tvaAPI = null;
    this.hasTVA = false;
    this.tvaCacheLoaded = false;
    this.tvaCacheImages = [];
    this.tvaCacheSearchable = [];
    this.tvaCacheByCategory = {};
    this._loadPromise = null;
    this._createError = createModuleError;
    this._debugLog = createDebugLogger('TVACacheService');
  }

  init() {
    this.tvaAPI = this._getTvaAPI();
    this.hasTVA = !!this.tvaAPI;
  }
}
```

### Pattern 2: TokenService Static-to-Instance Conversion
**What:** Convert static methods to instance methods, inject `canvas` object, export singleton.
**When to use:** TokenService only.
**Example:**
```javascript
export class TokenService {
  constructor(deps = {}) {
    const {
      canvas: injectedCanvas,
    } = deps;
    this._getCanvas = () => injectedCanvas ?? canvas;
  }

  getSceneNPCTokens() {
    const c = this._getCanvas();
    if (!c?.tokens?.placeables) return [];
    const selectedTokens = c.tokens.controlled;
    // ... rest unchanged
  }

  // extractCreatureInfo: no globals needed, stays as instance method
  // groupTokensByCreature: calls this.extractCreatureInfo (no globals)
  // replaceTokenImage: no globals needed
}

export const tokenService = new TokenService();
```

### Pattern 3: Worker Factory Injection
**What:** Replace eager `new Worker(path)` with injectable factory function, lazily called.
**When to use:** IndexService and SearchOrchestrator.
**Example:**
```javascript
export class IndexService {
  constructor(deps = {}) {
    const {
      storageService: injectedStorage = storageService,
      workerFactory = () => new Worker(`modules/${MODULE_ID}/scripts/workers/IndexWorker.js`),
      getSetting = createDefaultGetSetting(),
      getTvaAPI = () => game.modules.get('token-variants')?.api,
    } = deps;

    this._storageService = injectedStorage;
    this._workerFactory = workerFactory;
    this._getSetting = getSetting;
    this._getTvaAPI = getTvaAPI;

    this.index = null;
    this.isBuilt = false;
    this.buildPromise = null;
    this.termCategoryMap = this.buildTermCategoryMap();
    // Lazy worker init -- don't create Worker in constructor
    this.worker = null;
    this._workerInitialized = false;
    this._createError = createModuleError;
    this._debugLog = createDebugLogger('IndexService');
  }

  _ensureWorker() {
    if (this._workerInitialized) return;
    this._workerInitialized = true;
    try {
      this.worker = this._workerFactory();
    } catch (error) {
      console.warn(`${MODULE_ID} | Failed to initialize Worker:`, error);
      this.worker = null;
    }
  }
}
```

### Pattern 4: SearchOrchestrator -- Subsume setDependencies()
**What:** Move `tvaCacheService` and `forgeBazaarService` from `setDependencies()` into constructor DI. Remove `setDependencies()` method. Update SearchService to pass them through.
**Example:**
```javascript
export class SearchOrchestrator {
  constructor(deps = {}) {
    const {
      tvaCacheService: injectedTVACache,
      forgeBazaarService: injectedForgeBazaar,
      indexService: injectedIndex = indexService,
      getSetting = createDefaultGetSetting(),
      workerFactory = () => new Worker(`modules/${MODULE_ID}/scripts/workers/IndexWorker.js`),
    } = deps;

    this._tvaCacheService = injectedTVACache ?? null;
    this._forgeBazaarService = injectedForgeBazaar ?? null;
    this._indexService = injectedIndex;
    this._getSetting = getSetting;
    this._workerFactory = workerFactory;
    // ... rest
  }
}
```

**Note:** The singleton `searchOrchestrator` gets its TVA/ForgeBazaar deps from `SearchService.init()` which currently calls `setDependencies()`. Two options:
1. Keep `setDependencies()` as a compatibility bridge during this phase, document as deprecated.
2. Move to constructor injection in SearchService, which passes deps through.

**Recommendation:** Keep `setDependencies()` temporarily for the singleton (it's called at runtime from `SearchService.init()`), but have constructor DI take precedence. For tests, only use constructor injection.

### Anti-Patterns to Avoid
- **Eager global access in constructor:** Never call `game.settings.get()` or `game.modules.get()` in a constructor body -- use lazy accessor functions instead.
- **Importing singleton then using it directly:** After DI refactor, methods must use `this._storageService` not the imported `storageService` singleton.
- **Validating injected deps at runtime:** Per user decision, no runtime validation. Trust the caller + JSDoc types.
- **Creating a DI container or base class:** Keep it simple. Repeated pattern per service is fine for 5 services.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| DI container/framework | Custom container, service locator | Simple constructor injection | Only 5 services, a framework adds complexity with zero benefit |
| Type checking of injected deps | Runtime `instanceof` checks | JSDoc `@typedef` + IDE support | User decision: no runtime validation |

**Key insight:** This is a small codebase with 5 services. Constructor injection with defaults is the simplest pattern that works. DI frameworks (InversifyJS, etc.) are overkill.

## Common Pitfalls

### Pitfall 1: Init-Order Crash
**What goes wrong:** Services access `game.settings.get()` during module load (before settings are registered), causing crashes.
**Why it happens:** Singleton `export const x = new X()` runs at import time, which is before Foundry's `init` hook.
**How to avoid:** All global access must be lazy -- wrapped in functions called from methods, never from constructors. The `createDefaultGetSetting()` factory returns a function, it doesn't call `game.settings.get()` itself.
**Warning signs:** `TypeError: Cannot read property 'get' of undefined` during test imports.

### Pitfall 2: Circular Import with Singleton Defaults
**What goes wrong:** Service A's constructor default imports Service B's singleton, and Service B imports Service A.
**Why it happens:** ES module circular dependencies resolve to `undefined` for not-yet-initialized exports.
**How to avoid:** Check the import graph. Current code has: SearchOrchestrator imports `indexService` singleton, IndexService imports `storageService` singleton. No circular deps exist. TVACacheService also imports `storageService`. Keep it that way.
**Warning signs:** `undefined is not a function` on first method call of a service.

### Pitfall 3: Forgetting to Update All Call Sites After Static-to-Instance
**What goes wrong:** Some callers still use `TokenService.method()` (static) after conversion to instance methods, causing `TypeError`.
**Why it happens:** Easy to miss call sites in a large file like `main.js`.
**How to avoid:** Grep for all `TokenService.` references in the codebase. There are exactly 4 call sites:
1. `main.js` line 280: `TokenService.replaceTokenImage(token, imagePath)`
2. `main.js` line 330: `TokenService.getSceneNPCTokens()`
3. `main.js` line 432: `TokenService.groupTokensByCreature(npcTokens)`
4. `main.js` line 10: `import { TokenService } from './services/TokenService.js'`
All must change to `import { tokenService } from ...` and `tokenService.method()`.
**Warning signs:** `TypeError: TokenService.getSceneNPCTokens is not a function`

### Pitfall 4: SearchOrchestrator's Internal Property Name Collision
**What goes wrong:** SearchOrchestrator currently uses `this.tvaCacheService` as a public property (set by `setDependencies()`). The DI refactor stores injected dep in the same or similar name.
**Why it happens:** Name collision between old API and new DI pattern.
**How to avoid:** Use the convention `this._tvaCacheService` (underscore prefix) for the DI-stored reference, and update all internal references. Or simply reuse `this.tvaCacheService` since the constructor runs before `setDependencies()`.
**Warning signs:** Tests see stale/null references.

### Pitfall 5: IndexService Eager Worker Creation
**What goes wrong:** Current IndexService constructor creates `new Worker(path)` immediately. If this isn't changed to lazy, the singleton will still create a real Worker at import time.
**Why it happens:** The constructor runs at module scope when the singleton is exported.
**How to avoid:** Move Worker creation into `_ensureWorker()` method (lazy), called on first `build()` or `indexPathsWithWorker()`. The constructor should only store the factory. Note: SearchOrchestrator already has lazy worker init -- follow that pattern.

### Pitfall 6: game.settings.get() for Foreign Module Settings
**What goes wrong:** IndexService calls `game.settings.get('token-variants', 'staticCache')` -- note the module ID is `'token-variants'`, not the module's own ID.
**Why it happens:** The module reads TVA's settings directly.
**How to avoid:** The `getSetting(moduleId, key)` accessor is module-aware by design (takes moduleId as first param). This naturally handles both own settings and TVA settings. Tests mock it as `(mod, key) => mockSettings[key]` or with per-module logic.

## Code Examples

### createDefaultGetSetting Factory (Utils.js)
```javascript
// Add to Utils.js
/**
 * Create a default getSetting function that delegates to Foundry's game.settings.get
 * Lazy: does not access `game` until the returned function is called
 * @returns {function(string, string): *} Settings accessor function
 */
export function createDefaultGetSetting() {
  return (moduleId, key) => game.settings.get(moduleId, key);
}
```

### Test Usage -- SearchOrchestrator (DI-01)
```javascript
import { SearchOrchestrator } from '../../scripts/services/SearchOrchestrator.js';

describe('SearchOrchestrator with DI', () => {
  it('works without Foundry globals', () => {
    const mockSettings = {
      'token-replacer-fa.fuzzyThreshold': 0.1,
      'token-replacer-fa.searchPriority': 'both',
    };

    const orchestrator = new SearchOrchestrator({
      getSetting: (mod, key) => mockSettings[`${mod}.${key}`],
      indexService: { isBuilt: false, searchByCategory: () => [] },
      tvaCacheService: { hasTVA: false, tvaCacheLoaded: false },
      forgeBazaarService: { isServiceAvailable: () => false },
    });

    // No Foundry global access occurred
    expect(orchestrator).toBeDefined();
  });
});
```

### Test Usage -- TokenService (DI-02)
```javascript
import { TokenService } from '../../scripts/services/TokenService.js';
import { createMockActor, createMockToken } from '../helpers/mock-helpers.js';

describe('TokenService with DI', () => {
  it('getSceneNPCTokens uses injected canvas', () => {
    const mockToken = createMockToken({ actor: createMockActor({ name: 'Goblin' }) });
    const mockCanvas = {
      tokens: {
        placeables: [mockToken],
        controlled: [],
      },
    };

    const ts = new TokenService({ canvas: mockCanvas });
    const tokens = ts.getSceneNPCTokens();
    expect(tokens).toHaveLength(1);
  });
});
```

### main.js Caller Update
```javascript
// Before:
import { TokenService } from './services/TokenService.js';
// ...
const npcTokens = TokenService.getSceneNPCTokens();
const creatureGroups = TokenService.groupTokensByCreature(npcTokens);
const result = await TokenService.replaceTokenImage(token, imagePath);

// After:
import { tokenService } from './services/TokenService.js';
// ...
const npcTokens = tokenService.getSceneNPCTokens();
const creatureGroups = tokenService.groupTokensByCreature(npcTokens);
const result = await tokenService.replaceTokenImage(token, imagePath);
```

## Global Access Audit

Complete inventory of Foundry global access per service that must become injectable:

### TVACacheService
| Global | Location | Replacement Dep |
|--------|----------|-----------------|
| `game.modules.get('token-variants')?.api` | `init()` | `getTvaAPI` |
| `storageService` (imported singleton) | `_tryRestoreFromIndexedDB()`, `_persistToIndexedDB()`, `reloadTVACache()` | `storageService` dep |

### TokenService
| Global | Location | Replacement Dep |
|--------|----------|-----------------|
| `canvas.tokens.placeables` | `getSceneNPCTokens()` | `canvas` dep |
| `canvas.tokens.controlled` | `getSceneNPCTokens()` | `canvas` dep |

### IndexService
| Global | Location | Replacement Dep |
|--------|----------|-----------------|
| `new Worker(path)` | constructor (line 65) | `workerFactory` |
| `game.settings.get(MODULE_ID, 'indexUpdateFrequency')` | `needsUpdate()` (line 126) | `getSetting` |
| `game.settings.get('token-variants', 'staticCache')` | `_tryGameSettings()` (line 559) | `getSetting` |
| `game.settings.get('token-variants', name)` | `_tryGameSettings()` (line 577) | `getSetting` |
| `game.modules.get('token-variants')` | `_tryModuleAPI()` (line 605), `build()` (line 655) | `getTvaAPI` |
| `window.TVA?.cache` | `_tryGlobalObjects()` (line 615) | can keep as fallback or inject |
| `storageService` (imported singleton) | multiple methods | `storageService` dep |

### SearchOrchestrator
| Global | Location | Replacement Dep |
|--------|----------|-----------------|
| `new Worker(path)` | `_ensureWorker()` (line 53) | `workerFactory` |
| `game.settings.get(MODULE_ID, 'fuzzyThreshold')` | `searchLocalIndexDirectly()` (line 282), `searchLocalIndexWithWorker()` (line 386) | `getSetting` |
| `game.settings.get(MODULE_ID, 'searchPriority')` | `searchByCategory()` (lines 429, 509), `searchTokenArt()` (line 775) | `getSetting` |
| `game.settings.get(MODULE_ID, 'useTVACache')` | `searchTokenArt()` (line 776) | `getSetting` |
| `indexService` (imported singleton) | `searchByCategory()`, `searchTokenArt()` | `indexService` dep |

### SearchService (Facade)
| Global | Location | Replacement Dep |
|--------|----------|-----------------|
| `tvaCacheService` (imported singleton) | `init()` | Pass-through or keep as-is |
| `forgeBazaarService` (imported singleton) | `init()` | Pass-through or keep as-is |
| `searchOrchestrator` (imported singleton) | all delegate methods | Pass-through or keep as-is |

**Note:** SearchService is a thin facade. DI is optional here -- the important DI targets are the services it delegates to.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Static utility classes | Instance classes with DI | This phase | Enables unit testing in isolation |
| `setDependencies()` runtime wiring | Constructor injection | This phase | Cleaner, testable from instantiation |
| Eager Worker creation | Lazy factory pattern | This phase | Prevents import-time side effects |
| Direct `game.settings.get()` calls | Injected accessor function | This phase | Decouples from Foundry runtime |

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest ^3.2.4 |
| Config file | vitest.config.js |
| Quick run command | `npm test` |
| Full suite command | `npm test` |

### Phase Requirements to Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| DI-01 | SearchOrchestrator instantiates with injected deps, no Foundry globals | smoke | `npx vitest run tests/services/SearchOrchestrator.di.test.js -x` | No -- Wave 0 |
| DI-02 | TokenService.getSceneNPCTokens works with injected canvas | smoke | `npx vitest run tests/services/TokenService.di.test.js -x` | No -- Wave 0 |
| DI-03 | TVACacheService instantiates with mock TVA API | smoke | `npx vitest run tests/services/TVACacheService.di.test.js -x` | No -- Wave 0 |
| DI-04 | IndexService instantiates with injected StorageService + workerFactory | smoke | `npx vitest run tests/services/IndexService.di.test.js -x` | No -- Wave 0 |
| DI-05 | All singletons work with no args (backward compat) | smoke | `npm test` (existing tests must still pass) | Yes -- existing tests |

### Sampling Rate
- **Per task commit:** `npm test`
- **Per wave merge:** `npm test`
- **Phase gate:** Full suite green before verify

### Wave 0 Gaps
- [ ] DI smoke tests per requirement (DI-01 through DI-04) -- can be minimal, just verify instantiation + one method call without globals
- [ ] No new fixtures needed -- existing mock-helpers.js covers token/actor creation
- [ ] No new framework install needed

## Open Questions

1. **SearchService facade DI**
   - What we know: SearchService is a thin facade that imports singletons and delegates. It doesn't access Foundry globals directly (except via singletons).
   - What's unclear: Whether it needs full DI treatment or just updates to use DI-enabled sub-service singletons.
   - Recommendation: Minimal change -- update `init()` to pass deps through to SearchOrchestrator constructor if creating new instance, or keep using `setDependencies()` for the singleton. Full DI on SearchService is optional and can be deferred.

2. **window.TVA global in IndexService**
   - What we know: `_tryGlobalObjects()` in IndexService checks `window.TVA?.cache` as a fallback.
   - What's unclear: Whether to inject this or leave as a deep fallback.
   - Recommendation: Leave as-is. It's a last-resort fallback path and injecting `window` access adds complexity for minimal testability gain. The primary paths (TVA API, game.settings) are covered by DI.

## Sources

### Primary (HIGH confidence)
- Codebase audit: All 5 service files read in full, global access points catalogued
- CONTEXT.md: All decisions locked by user
- Existing test infrastructure: foundry-mocks.js, mock-helpers.js, vitest.config.js reviewed

### Secondary (MEDIUM confidence)
- JavaScript constructor DI pattern: Well-established pattern, no library needed

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - no new libraries needed, existing tooling sufficient
- Architecture: HIGH - pattern is simple and well-understood, all decisions locked
- Pitfalls: HIGH - derived from actual codebase audit of global access points

**Research date:** 2026-03-06
**Valid until:** 2026-04-06 (stable -- no external dependencies to change)
