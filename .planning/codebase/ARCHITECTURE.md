<!-- refreshed: 2026-05-27 -->
# Architecture

**Analysis Date:** 2026-05-27

## System Overview

```text
┌──────────────────────────────────────────────────────────────────────┐
│                     Foundry VTT Scene Controls                        │
│              (GM clicks "wand" button in Token layer)                 │
└──────────────────────────┬───────────────────────────────────────────┘
                           │ onClick / onChange
                           ▼
┌──────────────────────────────────────────────────────────────────────┐
│  scripts/main.js — TokenReplacerApp (singleton: tokenReplacerApp)     │
│  - Hooks.once('init'):  registerSettings(), loadModuleTemplates()     │
│  - Hooks.once('ready'): loadFuse(), tvaCacheService.loadTVACache(),   │
│                         indexService.build() [non-blocking IIFE]      │
│  - processTokenReplacement(): 3-phase orchestration                   │
└──────┬────────────────────┬────────────────────────┬─────────────────┘
       │                    │                        │
       ▼                    ▼                        ▼
┌─────────────┐  ┌────────────────────┐  ┌───────────────────────────┐
│TokenService │  │  SearchService     │  │     UIManager             │
│`scripts/    │  │  (thin facade)     │  │ `scripts/ui/UIManager.js` │
│ services/   │  │`scripts/services/  │  │  TokenReplacerDialog      │
│ TokenService│  │ SearchService.js`  │  │  (ApplicationV2 subclass) │
│ .js`        │  └────────┬───────────┘  └───────────────────────────┘
│ extractCrea-│           │ delegates
│ tureInfo()  │           ▼
│ groupTokens-│  ┌──────────────────────────────────────────────────┐
│ ByCreature()│  │        SearchOrchestrator                         │
└─────────────┘  │  `scripts/services/SearchOrchestrator.js`         │
                 │  - searchTokenArt()                                │
                 │  - parallelSearchCreatures() (batches of 4)        │
                 │  - searchByCategory() (FAST/SLOW mode)             │
                 │  - searchTVA() → TVA direct cache or API fallback  │
                 │  - searchLocalIndex() → Worker or main thread      │
                 └────────────────┬──────────────┬────────────────────┘
                                  │              │
            ┌─────────────────────▼──┐  ┌────────▼───────────────────┐
            │  TVACacheService       │  │    IndexService             │
            │`scripts/services/      │  │`scripts/services/           │
            │ TVACacheService.js`    │  │ IndexService.js`            │
            │ loadTVACache()         │  │ build() → IndexWorker.js    │
            │ searchTVACacheDirect() │  │ searchByCategory()          │
            │ searchTVACacheByCateg()│  │ termCategoryMap (O(1))      │
            └────────────┬───────────┘  └─────────────┬──────────────┘
                         │                            │
                         ▼                            ▼
            ┌────────────────────────┐  ┌────────────────────────────┐
            │   StorageService       │  │   IndexWorker.js           │
            │`scripts/services/      │  │`scripts/workers/           │
            │ StorageService.js`     │  │ IndexWorker.js`            │
            │ IndexedDB + localStorage│  │ background thread          │
            │ fallback (~4.5MB limit)│  │ indexPaths / fuzzySearch   │
            └────────────────────────┘  │ setSearchIndex command     │
                                        └────────────────────────────┘
```

## Component Responsibilities

| Component | Responsibility | File |
|-----------|----------------|------|
| `TokenReplacerApp` | Module singleton: settings, hooks, orchestration | `scripts/main.js` |
| `TokenService` | Extract creature type/subtype from D&D 5e actors, group tokens | `scripts/services/TokenService.js` |
| `SearchService` | Thin facade: init sub-services, validate inputs, delegate | `scripts/services/SearchService.js` |
| `SearchOrchestrator` | All search logic, LRU result cache, parallel batching, FAST/SLOW mode | `scripts/services/SearchOrchestrator.js` |
| `TVACacheService` | Load TVA static cache file, build searchable index, pre-built category cache | `scripts/services/TVACacheService.js` |
| `IndexService` | Hierarchical category index, IndexedDB caching, Worker lifecycle | `scripts/services/IndexService.js` |
| `IndexWorker` | Background thread: categorize paths, fuzzy search via Fuse.js | `scripts/workers/IndexWorker.js` |
| `StorageService` | IndexedDB wrapper with localStorage fallback | `scripts/services/StorageService.js` |
| `ScanService` | Fallback directory scanner when TVA is unavailable | `scripts/services/ScanService.js` |
| `ForgeBazaarService` | Non-functional stub — no public Forge API exists | `scripts/services/ForgeBazaarService.js` |
| `UIManager` | Create/update `TokenReplacerDialog`, render Handlebars templates, handle selection events | `scripts/ui/UIManager.js` |
| `Constants` | MODULE_ID, CREATURE_TYPE_MAPPINGS (14 categories), EXCLUDED_FOLDERS, performance tuning constants | `scripts/core/Constants.js` |
| `Utils` | loadFuse(), isExcludedPath(), sanitizePath(), escapeHtml(), createModuleError() | `scripts/core/Utils.js` |

## Pattern Overview

**Overall:** Foundry VTT Module with a Singleton Application Controller, Service Facade Pattern, and Web Worker offload.

**Key Characteristics:**
- All services are exported singletons instantiated at module load time (e.g., `export const searchService = new SearchService()`)
- Dependency injection via constructor `deps` objects — used in all services for testability
- Three-phase search strategy: (1) pre-built IndexedDB index (FAST), (2) TVA direct cache (FAST), (3) TVA `doImageSearch` API per-term (SLOW)
- Web Workers for non-blocking index build and fuzzy search; graceful main-thread fallback
- ApplicationV2-based dialog for Foundry VTT v12/v13 compatibility

## Layers

**Entry Layer:**
- Purpose: Module lifecycle, settings, Foundry hook registration, top-level error handling
- Location: `scripts/main.js`
- Contains: `TokenReplacerApp` class, `Hooks.once('init')`, `Hooks.once('ready')`, `Hooks.on('getSceneControlButtons')`
- Depends on: all services, UIManager, Constants, Utils
- Used by: Foundry VTT runtime

**Service Facade Layer:**
- Purpose: Validate inputs, initialize sub-services, delegate — no direct business logic
- Location: `scripts/services/SearchService.js`
- Contains: `SearchService.init()`, `clearCache()`, `searchByCategory()`, `parallelSearchCreatures()`
- Depends on: SearchOrchestrator, TVACacheService, ForgeBazaarService
- Used by: main.js

**Orchestration Layer:**
- Purpose: Implements all search strategies (FAST/SLOW), LRU caching, parallel batching
- Location: `scripts/services/SearchOrchestrator.js`
- Contains: `searchTokenArt()`, `searchByCategory()`, `parallelSearchCreatures()`, `searchTVA()`, `searchLocalIndex()`
- Depends on: IndexService, TVACacheService, ForgeBazaarService, IndexWorker (via Worker API), Fuse.js (CDN)
- Used by: SearchService

**Cache/Index Layer:**
- Purpose: Load and serve TVA image data at maximum speed; build and persist hierarchical index
- Location: `scripts/services/TVACacheService.js`, `scripts/services/IndexService.js`
- Contains: TVA cache loading, category pre-build (`_buildSearchableCache`), index build via Worker
- Depends on: StorageService, IndexWorker (via Worker API), Constants
- Used by: SearchOrchestrator

**Worker Thread:**
- Purpose: Off-main-thread categorization and fuzzy search — full speed, no UI blocking
- Location: `scripts/workers/IndexWorker.js`
- Contains: `handleIndexPaths()`, `handleFuzzySearch()`, `persistedSearchIndex` (shared across searches)
- Depends on: Fuse.js (CDN, loaded inside worker), duplicated `isExcludedPath()` / CDN validation
- Used by: IndexService (for indexPaths), SearchOrchestrator (for fuzzySearch)

**Storage Layer:**
- Purpose: Persist index and TVA cache to IndexedDB; localStorage fallback
- Location: `scripts/services/StorageService.js`
- Contains: `openDatabase()`, `get()`, `set()`, `has()`, `_sanitizeData()`, `_jsonReviver()`
- Depends on: browser IndexedDB API, localStorage API
- Used by: IndexService, TVACacheService

**Scan Layer:**
- Purpose: Directory scanning when TVA module is not installed
- Location: `scripts/services/ScanService.js`
- Contains: `discoverTokenPaths()`, `buildLocalTokenIndex()`, recursive `FilePicker.browse()`
- Depends on: Foundry VTT `FilePicker` API
- Used by: main.js (fallback path only)

**UI Layer:**
- Purpose: All dialogs, progress templates, match selection, event handling
- Location: `scripts/ui/UIManager.js`
- Contains: `TokenReplacerDialog` (ApplicationV2 subclass), `UIManager` class, i18n module-level cache
- Depends on: Foundry VTT `foundry.applications.api.ApplicationV2`, Handlebars templates, Constants, Utils
- Used by: main.js

**Core Utilities:**
- Purpose: Shared constants and pure functions used across all layers
- Location: `scripts/core/Constants.js`, `scripts/core/Utils.js`
- Contains: `MODULE_ID`, `CREATURE_TYPE_MAPPINGS`, `EXCLUDED_FOLDERS`, `EXCLUDED_FOLDERS_SET`, performance constants; `loadFuse()`, `isExcludedPath()`, `sanitizePath()`, `escapeHtml()`, `createModuleError()`

## Data Flow

### Primary Request Path (TVA + Index available)

1. **User triggers process** — GM clicks wand button → `tokenReplacerApp.processTokenReplacement()` (`scripts/main.js:293`)
2. **Load Fuse.js** — `loadFuse()` imports from jsdelivr CDN, validates shape (`scripts/core/Utils.js:32`)
3. **Get NPC tokens** — `tokenService.getSceneNPCTokens()` reads `canvas.scene.tokens`, filters NPC disposition (`scripts/services/TokenService.js`)
4. **Create dialog** — `uiManager.createMainDialog()` instantiates `TokenReplacerDialog` (ApplicationV2), renders with `{ force: true }` (`scripts/ui/UIManager.js`)
5. **Load TVA cache** — `tvaCacheService.loadTVACache()` fetches `TVA_CONFIG.staticCacheFile`, parses JSON, builds searchable category map (`scripts/services/TVACacheService.js`)
6. **Group tokens** — `tokenService.groupTokensByCreature()` maps actors to `CreatureInfo` objects with resolved search terms
7. **Parallel search** — `searchService.parallelSearchCreatures()` → `searchOrchestrator.parallelSearchCreatures()` runs batches of 4 creature types concurrently (`PARALLEL_BATCH_SIZE = 4`)
8. **Per-creature search** — `searchOrchestrator.searchTokenArt()`: checks IndexService (FAST), falls back to TVA direct cache, falls back to TVA API per-term (SLOW)
9. **UI selection** — `uiManager.createMatchSelectionHTML()` renders `templates/match-selection.hbs`; `setupMatchSelectionHandlers()` awaits user selection
10. **Apply replacement** — `tokenReplacerApp.replaceTokenImage()` calls `tvaAPI.updateTokenImage()` or `tokenService.replaceTokenImage()` for direct update

### Background Initialization (ready hook)

1. `Hooks.once('ready')` fires → non-blocking IIFE starts (`scripts/main.js:834`)
2. `tvaCacheService.loadTVACache()` — reads TVA static cache file, persists to IndexedDB via StorageService
3. `indexService.build()` — dispatches `indexPaths` to `IndexWorker.js`; Worker processes all paths, sends progress every 1000 items, returns `categories`, `allPaths`
4. `main.js` merges Worker results, rebuilds `termIndex` on main thread, persists to IndexedDB via `storageService.set(CACHE_KEY)`

### Worker Message Protocol

```
Main → Worker: { command: 'setSearchIndex', data: { index } }
Worker → Main: { type: 'indexSet', count: N }

Main → Worker: { command: 'fuzzySearch', data: { searchTerms, options } }
Worker → Main: { type: 'progress', current, total }
Worker → Main: { type: 'complete', result: [...] }

Main → Worker: { command: 'indexPaths', data: { paths, creatureTypeMappings, ... } }
Worker → Main: { type: 'progress', processed, total, imagesFound }
Worker → Main: { type: 'complete', result: { categories, allPaths } }

Main → Worker: { command: 'cancel' }
Worker → Main: { type: 'cancelled' }
```

**State Management:**
- `TokenReplacerApp.isProcessing` — boolean mutex preventing concurrent runs
- `TVACacheService.tvaCacheImages[]` — in-memory flat image array
- `TVACacheService._categoryCache{}` — pre-built category → images map
- `IndexService.index` — hierarchical `{ categories, allPaths, termIndex }` object
- `SearchOrchestrator.searchCache` — LRU Map (max 200 entries, 25% eviction)
- `UIManager.mainDialog` — singleton `TokenReplacerDialog` reference

## Key Abstractions

**CreatureInfo:**
- Purpose: Normalized creature data extracted from a Foundry actor for search
- Type definition: `scripts/types/typedefs.js` (`@typedef CreatureInfo`)
- Fields: `tokenId`, `actorName`, `type` (D&D 5e creature type), `subtype`, `searchTerms[]`

**TokenMatch:**
- Purpose: A single matched image result returned from any search source
- Type definition: `scripts/types/typedefs.js` (`@typedef TokenMatch`)
- Fields: `path`, `name`, `category`, `score` (Fuse score 0-1, lower is better)

**ModuleError (structured error):**
- Purpose: User-facing error with type, localized message, and recovery suggestions
- Created by: `createModuleError()` in `scripts/core/Utils.js`
- Pattern: All service methods throw structured errors; `main.js` catch block checks `error.errorType` to route to dialog vs. notification

**IndexedCache:**
- Type definition: `scripts/types/typedefs.js` (`@typedef IndexedCache`)
- Fields: `categories` (hierarchical: type → term → [{path, name}]), `allPaths` (flat path → metadata), `termIndex` (term → path[] for O(1) lookups)
- Critical note: `termIndex` is NOT built by the Worker — it is built on the main thread after Worker results are merged (`scripts/services/IndexService.js`)

## Entry Points

**Module Load:**
- Location: `scripts/main.js` (declared in `module.json` as `esmodules: ["scripts/main.js"]`)
- Triggers: Foundry VTT module system on page load
- Responsibilities: Import all services, register singletons, attach Foundry hooks

**init Hook:**
- Location: `scripts/main.js:770` — `Hooks.once('init', ...)`
- Triggers: Foundry VTT init lifecycle
- Responsibilities: `registerSettings()` (must be first), `loadModuleTemplates()` (preloads 8 `.hbs` files)

**ready Hook:**
- Location: `scripts/main.js:808` — `Hooks.once('ready', ...)`
- Triggers: Foundry VTT ready lifecycle (all modules loaded)
- Responsibilities: Load Fuse.js, initialize SearchService, fire non-blocking background IIFE for cache + index build

**processTokenReplacement:**
- Location: `scripts/main.js:293` — `TokenReplacerApp.processTokenReplacement()`
- Triggers: GM clicks scene control button
- Responsibilities: Full 3-phase workflow (index build → parallel search → UI selection + apply)

## Architectural Constraints

- **Threading:** Single-threaded event loop for all main-thread code; `yieldToMain(ms)` (`scripts/core/Utils.js`) used in SLOW mode search loops. Web Workers run in true parallel threads for index build (`IndexService`) and fuzzy search (`SearchOrchestrator`).
- **Worker code duplication:** `loadFuse()`, `_validateFuseShape()`, `CDN_SEGMENTS`, and `isExcludedPath()` are intentionally duplicated between `scripts/core/Utils.js` and `scripts/workers/IndexWorker.js`. Each copy carries a `// SYNC: Keep in sync with ...` JSDoc marker. Modifying one requires updating the other.
- **Global state:** `FuseClass` singleton in `scripts/core/Utils.js` (module scope); `I18N_CACHE` Map in `scripts/ui/UIManager.js` (module scope); `tokenReplacerApp` singleton on `window.TokenReplacerFA`.
- **Circular imports:** None detected. Dependency direction is strictly: `main.js` → services → core.
- **Worker scope:** `IndexWorker.js` cannot import ES modules from the main bundle — all needed logic is self-contained or duplicated within the worker file.
- **Foundry VTT v12/v13 compat:** `getSceneControlButtons` hook receives an array (v12) or object (v13); both formats handled in `scripts/main.js:955-1007`. `ApplicationV2.render({ force: true })` required for initial display.
- **D&D 5e only:** `TokenService.extractCreatureInfo()` accesses `actor.system.details.type` which is D&D 5e system-specific (`scripts/services/TokenService.js:65`).

## Anti-Patterns

### Calling `game.settings.get()` before `registerSettings()`

**What happens:** Any code that calls `getSetting('debugMode')` before the init hook completes throws.
**Why it's wrong:** Causes unhandled exception, crashing module load.
**Do this instead:** `registerSettings()` is always first in `Hooks.once('init')` (`scripts/main.js:775`). Wrap any `getSetting()` in constructors or early code with try-catch (pattern in `_debugLog` at `scripts/main.js:108-116`).

### Rendering ApplicationV2 without `{ force: true }`

**What happens:** `dialog.render()` resolves silently, `rendered` stays `false`, no DOM is created.
**Why it's wrong:** Dialog appears to succeed but is invisible; `updateContent()` calls are no-ops.
**Do this instead:** Always call `dialog.render({ force: true })` for initial display (`scripts/main.js:349`).

### Building `termIndex` inside the Worker

**What happens:** If someone adds termIndex to the Worker output and reads it directly.
**Why it's wrong:** `termIndex` must be built on the main thread after Worker results are merged — this is where the data is available in the correct merged form.
**Do this instead:** After receiving Worker `complete` message, rebuild termIndex on the main thread from `allPaths` in `scripts/services/IndexService.js`.

## Error Handling

**Strategy:** Structured errors (`ModuleError` typedef in `scripts/types/typedefs.js`) propagate up to `main.js` catch blocks. Services throw structured objects; unexpected errors are wrapped by `createModuleError()` in `scripts/core/Utils.js`.

**Patterns:**
- Services detect structured errors via `if (error.errorType && error.message && error.recoverySuggestions)` and re-throw without wrapping
- `scripts/main.js:695-751` inspects `error.errorType`, routes to dialog HTML (via `uiManager.createErrorHTML()`) if dialog is open, or `ui.notifications.error()` as fallback
- `_debugLog()` has try-catch guard for pre-registration calls; never throws

## Cross-Cutting Concerns

**Logging:** `console.log/warn/error` with `MODULE_ID` prefix (`token-replacer-fa |`). Debug-only messages gated by `_debugLog()` which reads `debugMode` setting. Module-scoped `createDebugLogger(name)` factory in `scripts/core/Utils.js` used by most services.

**Validation:** `sanitizePath()` in `scripts/core/Utils.js` blocks path traversal. `_sanitizeData()` + `_jsonReviver()` in `scripts/services/StorageService.js` sanitize all data loaded from IndexedDB. `_validateFuseShape()` in both `scripts/core/Utils.js` and `scripts/workers/IndexWorker.js` guards CDN-loaded Fuse.js against compromise.

**Authentication:** None — client-side Foundry module only. TVA accessed via `game.modules.get('token-variants').api`.

**Localization:** All user-facing strings use `game.i18n.localize('TOKEN_REPLACER_FA.*')`. Both `TokenReplacerApp` (`scripts/main.js:41`) and `UIManager` (`scripts/ui/UIManager.js:23`) maintain independent i18n caches (Map) to avoid repeated `localize()` calls.

---

*Architecture analysis: 2026-05-27*
