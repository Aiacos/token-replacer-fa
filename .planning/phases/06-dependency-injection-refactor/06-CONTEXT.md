# Phase 6: Dependency Injection Refactor - Context

**Gathered:** 2026-03-06
**Status:** Ready for planning

<domain>
## Phase Boundary

Refactor all service constructors to accept optional injected dependencies so they can be tested in isolation without Foundry globals. Zero production behavior changes — all services fall back to Foundry globals when no injection is provided.

</domain>

<decisions>
## Implementation Decisions

### Constructor signature style
- All services use uniform options object pattern: `constructor(deps = {})`
- Destructure deps inside constructor: `const { settings, indexService, ... } = deps`
- No positional parameters — options object is self-documenting and order-independent
- No runtime validation of injected deps — trust the caller, JSDoc types provide IDE safety

### Dependency resolution timing
- Lazy resolution for all Foundry globals — access `game.*` and `canvas.*` only when methods actually need them
- Pattern: `this._getSetting = deps.getSetting ?? createDefaultGetSetting()`
- Avoids init-order issues where globals aren't ready during module load
- Singletons created at module load time with no args — lazy defaults handle timing

### TokenService conversion
- Convert TokenService from static-only class to instance class with DI
- Follow same `constructor(deps = {})` pattern as other services
- Inject `canvas` object: `new TokenService({ canvas })` — methods access `this._canvas.tokens.controlled` etc.
- Add singleton export: `export const tokenService = new TokenService()`
- Update ALL callers in this phase (main.js, any service calling TokenService static methods) — no legacy static API left
- Clean cut: ~3-5 call sites to update from `TokenService.method()` to `tokenService.method()`

### Settings access pattern
- Inject a shared `getSetting(moduleId, key)` accessor function
- Module-aware: handles both own module settings (`MODULE_ID`) and foreign module settings (`'token-variants'`)
- Default implementation: `(mod, key) => game.settings.get(mod, key)`
- Define `createDefaultGetSetting()` factory in Utils.js — keeps it with other utility functions
- Each constructor defaults to calling this factory when no accessor injected
- Tests inject simple function: `(mod, key) => mockSettings[key]`

### TVA API access
- Separate `getTvaAPI` dependency — not bundled with settings (it's a module API object, not a setting)
- Lazy accessor function pattern: `getTvaAPI: () => game.modules.get('token-variants')?.api`
- Handles TVA not installed (returns undefined) without errors
- Both TVACacheService and IndexService receive this dep
- Consistent with lazy resolution pattern decided above

### Worker injection
- Worker factory injection: `workerFactory: () => new Worker(path)`
- Default factory creates real Worker at the standard module path
- Tests inject mock factory that returns MockWorker from Phase 2 mocks
- Matches DI-04 requirement: `new IndexService({ storageService: mockStorage, workerFactory: mockFactory })`
- Both IndexService and SearchOrchestrator use this pattern

### Singleton export handling
- Keep current pattern unchanged: `export const indexService = new IndexService()`
- No args = Foundry global defaults via lazy resolution
- Tests create separate instances: `new IndexService({ ...mocks })` — never import singletons
- Zero changes to production import sites (except TokenService caller updates)

### Claude's Discretion
- Exact internal property naming for stored deps (e.g. `this._getSetting` vs `this._settings`)
- Order of dependency destructuring in constructors
- Whether to add a shared base class or keep DI pattern repeated per service
- How to handle the `setDependencies()` method pattern already in some services (merge with constructor DI or remove)

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- Phase 2 MockWorker: async microtask dispatch matching real Worker — ready for workerFactory injection tests
- Phase 2 mock helpers: `createMockActor`, `addMockTokens`, `setMockSetting` — useful for TokenService DI tests
- `createDebugLogger(serviceName)` factory in Utils.js — similar factory pattern to new `createDefaultGetSetting()`

### Established Patterns
- Services already export class + singleton: `export class X {...}` then `export const x = new X()`
- Some services already have `setDependencies()` method (SearchOrchestrator) — DI refactor may subsume this
- `_debugLog` pattern wraps `game.settings.get()` in try-catch — DI accessor eliminates need for this

### Integration Points
- main.js: Primary caller of all services — TokenService static→instance migration updates happen here
- SearchService facade: Delegates to SearchOrchestrator — may need to pass through DI deps
- IndexService constructor: Creates Worker immediately — workerFactory moves this to lazy/injectable

</code_context>

<specifics>
## Specific Ideas

- Success criteria from ROADMAP.md are the contract:
  1. `new SearchOrchestrator({ settings: mockSettings, indexService: mockIndex })` works without Foundry globals
  2. `tokenService.getSceneNPCTokens(...)` works with injected canvas (note: instance method now, not static)
  3. `new TVACacheService({ tvaAPI: mockTVA })` works with mock TVA API
  4. `new IndexService({ storageService: mockStorage, workerFactory: mockFactory })` works with injected deps
  5. All production behavior unchanged — singletons use Foundry global defaults

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 06-dependency-injection-refactor*
*Context gathered: 2026-03-06*
