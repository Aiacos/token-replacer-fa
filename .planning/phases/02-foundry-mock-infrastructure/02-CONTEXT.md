# Phase 2: Foundry Mock Infrastructure - Context

**Gathered:** 2026-03-01
**Status:** Ready for planning

<domain>
## Phase Boundary

Build a single Vitest setup file (`tests/setup/foundry-mocks.js`) that stubs all Foundry VTT globals so any module file can be imported in tests without ReferenceError. Also build a MockWorker class for testing Worker-dependent code paths. Phase delivers test infrastructure only — no actual tests are written (those come in Phases 4-8).

</domain>

<decisions>
## Implementation Decisions

### Setup file exports
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

</decisions>

<specifics>
## Specific Ideas

No specific requirements — the user trusts Claude's technical judgment on this infrastructure phase. The key constraint is that all decisions should be made with downstream testability in mind (Phases 4-8 will consume this mock infrastructure).

</specifics>

<code_context>
## Existing Code Insights

### Foundry Global Usage (148 references across 13 files)
- `main.js` (54 refs): Heaviest consumer — Hooks.once, game.settings, game.modules, game.i18n, ui.notifications, renderTemplate, loadTemplates, foundry.applications.api.ApplicationV2
- `IndexService.js` (19 refs): game.settings, Hooks, new Worker(), StorageService interaction
- `UIManager.js` (18 refs): renderTemplate, game.i18n, foundry.applications.api.ApplicationV2, Dialog
- `Utils.js` (12 refs): game.settings (debug logger), game.i18n
- `TokenService.js` (10 refs): canvas.tokens, game.system, game.modules (TVA API)
- `SearchOrchestrator.js` (10 refs): game.settings, new Worker()
- `TVACacheService.js` (7 refs): game.modules (TVA), game.settings
- `ScanService.js` (6 refs): FilePicker, game.settings
- `ForgeBazaarService.js` (6 refs): game.forge, game.modules (STUB — don't mock deeply)
- `Constants.js` (3 refs): game.i18n (creature type labels)

### Worker Usage
- Two files create Workers: `IndexService.js:65` and `SearchOrchestrator.js:53`
- Both use same pattern: `new Worker(path)` → `postMessage(command)` → `onmessage` callback
- Real Worker (`IndexWorker.js`) processes image paths into categorized index structure

### Established Patterns
- Service singleton exports: `export const indexService = new IndexService()`
- Singletons instantiate at module load time — mocks must exist before any import
- Debug logger factory: `createDebugLogger(name)` calls `game.settings.get()` which throws if unregistered
- Error objects use `createModuleError()` pattern from Utils.js

### Integration Points
- Vitest `setupFiles` config in `vitest.config.js` loads mock setup before any test
- Mock setup must run before ES module evaluation (import-time side effects)
- Phase 1 already configured Vitest with jsdom environment

</code_context>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 02-foundry-mock-infrastructure*
*Context gathered: 2026-03-01*
