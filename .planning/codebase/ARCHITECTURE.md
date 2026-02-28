# Architecture

**Analysis Date:** 2026-02-28

## Pattern Overview

**Overall:** Multi-layered service-based architecture with clear separation between orchestration, domain logic, and presentation.

**Key Characteristics:**

- Service layer delegates work to specialized components (TVA, Search, Index, Scan)
- Entry point (`main.js`) orchestrates entire token replacement workflow
- Stateless token operations vs. stateful search/caching operations
- Web Worker offloads expensive indexing to background thread
- Template-based UI generation with Handlebars for XSS safety

## Layers

**Application/Controller Layer:**

- Location: `scripts/main.js` (`TokenReplacerApp` class)
- Purpose: Main orchestrator - manages entire token replacement workflow, coordinates services, handles settings/UI updates
- Contains: Hook handlers (init, ready), settings registration, main workflow logic (`processTokenReplacement()`)
- Depends on: All services (SearchService, TokenService, TVACacheService, ScanService, UIManager)
- Used by: Foundry VTT hooks system

**Service Layer:**

- Location: `scripts/services/`
- Contains specialized domain services that coordinate lower layers
- Services: `SearchService.js` (facade), `SearchOrchestrator.js` (complex search logic), `TokenService.js` (token extraction), `TVACacheService.js` (TVA integration), `IndexService.js` (token index), `ScanService.js` (directory scanning), `StorageService.js` (database), `ForgeBazaarService.js` (stub for future)

**Data/Persistence Layer:**

- Location: `scripts/services/StorageService.js`, `scripts/services/TVACacheService.js`
- Purpose: Abstract data storage - IndexedDB with localStorage fallback (StorageService), direct TVA cache access (TVACacheService)
- Depends on: Browser IndexedDB API, Foundry TVA module

**Worker Layer:**

- Location: `scripts/workers/IndexWorker.js`
- Purpose: Background thread for non-blocking index building
- Processes: Converts flat image paths into hierarchical category index
- Uses: Same categorization logic as main thread (CREATURE_TYPE_MAPPINGS)

**Utility/Core Layer:**

- Location: `scripts/core/`
- Contains: Constants (MODULE_ID, CREATURE_TYPE_MAPPINGS, EXCLUDED_FOLDERS, batch sizes), Utils (Fuse.js loading, path filtering, search term parsing)

**UI Layer:**

- Location: `scripts/ui/UIManager.js`
- Purpose: Dialog and HTML generation using Handlebars templates
- Depends on: Template system (`templates/`), localization (`lang/`)
- Used by: Application layer to show progress, match selection, error dialogs

## Data Flow

**Token Replacement Workflow (main process):**

1. User clicks "Replace Tokens" button (registered via hook in init)
2. `TokenReplacerApp.processTokenReplacement()` starts
3. Validate scene and load Fuse.js library
4. Get all NPC tokens from scene: `TokenService.getSceneNPCTokens()`
5. Initialize SearchService (wires up TVACacheService, ForgeBazaarService, SearchOrchestrator)
6. **PHASE 1: Build token index**
   - If TVA available and setting enabled:
     - TVACacheService loads TVA's static cache file directly (fast path)
     - Cache structure: `{ category: [path | [path, name] | [path, name, tags]] }`
     - Converted to flat array: `[{ path, name, category }, ...]`
   - Else: ScanService discovers token paths and builds local index via FilePicker
7. Group tokens by creature type: `TokenService.groupTokensByCreature(tokens)` → Map<key, tokens[]>
8. **PHASE 2: Parallel search**
   - SearchService delegates to SearchOrchestrator
   - SearchOrchestrator performs parallel creature searches with configurable batch size
   - For each creature type:
     - SearchOrchestrator extracts search terms from creature info
     - Builds search terms list (actor name → token name → type/subtype → race)
     - Uses Fuse.js for fuzzy matching against TVA cache or IndexService index
     - If fuzzy search fails and fallback enabled: SearchOrchestrator performs category-based search
   - Returns Map<creatureKey, { matches, tokens, creatureInfo }>
9. **PHASE 3: Token replacement**
   - For each creature group with results:
     - If matches found: Show match selection dialog
     - If no matches: Show category browser (SearchOrchestrator category search with user selection)
     - Apply selected image to all tokens in group (sequential or random mode)
   - Track results (success/failure)
10. Show final summary with replacement statistics

**Search Data Flow (SearchOrchestrator):**

1. Receive creature group: `{ type, subtype, searchTerms }`
2. Build search candidates:
   - Try fuzzy search on TVA cache or local index
   - Extract top results based on threshold and category
3. If no fuzzy results and fallback enabled:
   - Use category terms to find all images in creature category
   - Use IndexService to look up category-based images
4. Return matches: `[{ path, name, category }, ...]`

**Index Building (Parallel/Worker Thread):**

1. IndexService receives image paths from TVA cache or ScanService
2. If Worker available: Send `indexPaths` command to IndexWorker
   - IndexWorker categorizes each path (1000 items/batch)
   - Sends progress updates
   - Returns categorized structure: `{ categories: {...}, allPaths: {...}, termIndex: {...} }`
3. If no Worker: Use fallback direct indexing with yields (10ms) to keep UI responsive
4. Merge result into IndexService.index
5. Save to IndexedDB with timestamp and version

**Cache Management:**

- TVA cache: Single load at workflow start, cached in memory for session
- Index cache: Stored in IndexedDB, checked timestamp against update frequency setting
- Search cache: In-memory Map in SearchOrchestrator, cleared when needed
- i18n cache: In-memory Map in UIManager and TokenReplacerApp to avoid repeated lookups

## Key Abstractions

**SearchService (Facade):**

- Purpose: Single entry point for search operations, hides dependency wiring
- Pattern: Simple delegation facade
- Examples: `scripts/services/SearchService.js`
- Methods: `init()`, `clearCache()`, `searchByCategory()`, `parallelSearchCreatures()`

**TokenService (Stateless):**

- Purpose: Extract creature info from Foundry tokens, group by type, perform replacements
- Pattern: Static utility class (no instance state)
- Examples: `scripts/services/TokenService.js`
- Methods: `extractCreatureInfo()`, `getSceneNPCTokens()`, `groupTokensByCreature()`, `replaceTokenImage()`

**SearchOrchestrator:**

- Purpose: Complex search logic - fuzzy search, categorization, parallel processing
- Pattern: Stateful service with caching
- Examples: `scripts/services/SearchOrchestrator.js`
- Stores: Search cache Map, Worker instance, dependencies
- Methods: `searchByCategory()`, `searchTokenArt()`, `parallelSearchCreatures()`, `searchLocalIndexWithWorker()`

**IndexService:**

- Purpose: Hierarchical index of token images organized by creature category
- Pattern: Lazy-loaded singleton with Worker integration
- Examples: `scripts/services/IndexService.js`
- Structure: `{ version, timestamp, lastUpdate, categories: {...}, allPaths: {...}, termIndex: {...} }`
- Includes: termIndex for O(1) search term lookups (maps "term" → ["path1", "path2", ...])

**TVACacheService:**

- Purpose: Direct access to TVA's static cache file, bypasses slow API calls
- Pattern: Initialization service with async load
- Examples: `scripts/services/TVACacheService.js`
- Stores: Flat tvaCacheImages array, tvaCacheByCategory structure, searchable subset (excluded paths filtered)

## Entry Points

**Module Entry:**

- Location: `scripts/main.js` (ES module)
- Triggers: Foundry `init` and `ready` hooks
- Responsibilities: Register settings, register UI buttons, initialize caches

**User Action:**

- UI button click → `TokenReplacerApp.processTokenReplacement()` method
- Scene control button added via hook

**Hook Listeners:**

- `Hooks.once('init')`: Register settings, preload templates, initialize IndexedDB
- `Hooks.once('ready')`: Setup scene controls, wire up event handlers

## Error Handling

**Strategy:** Structured error objects with localized messages and recovery suggestions

**Patterns:**

1. **Try-catch with structured errors:**

   ```javascript
   try {
     // operation
   } catch (error) {
     throw createModuleError('error_key', 'technical details', ['recovery_suggestion_1']);
   }
   ```

2. **Error structure:**

   ```javascript
   {
     errorType: 'tva_missing',
     message: 'Localized error message',
     details: 'Technical error details',
     recoverySuggestions: ['Localized suggestion 1', 'Localized suggestion 2']
   }
   ```

3. **Debug logging with try-catch:**
   - `_debugLog()` in TokenReplacerApp wraps `game.settings.get()` in try-catch (settings may not be registered yet)

4. **User feedback:**
   - Errors displayed in dialog via `createErrorHTML()` template
   - Notifications via `ui.notifications` (brief user messages)

## Cross-Cutting Concerns

**Logging:**

- Debug mode toggle via settings (`debugMode`)
- Each service has `createDebugLogger()` utility
- Pattern: `_debugLog('message', value)` checks setting before logging
- Console prefixed with MODULE_ID for easy filtering

**Validation:**

- Path validation: `sanitizePath()` checks for traversal, null bytes, absolute paths
- Type validation: Services validate category types, array inputs before processing
- XSS protection: Handlebars auto-escapes all variables; `escapeHtml()` for dynamic HTML

**Authentication:**

- N/A: Module operates within Foundry VTT ecosystem with its own auth

**Performance Optimization:**

- Web Workers: IndexService offloads index building to background thread
- Caching: Multiple layers (i18n, search, index, TVA cache)
- Precompiled RegExp: EXCLUDED_FILENAME_PATTERNS built once at module load for path filtering
- Batching: Parallel searches use configurable batch size (PARALLEL_BATCH_SIZE)
- Yields: `yieldToMain()` prevents UI freeze during long operations
- Fuse.js caching: Library loaded once and reused
- IndexedDB: Persistent cache to avoid rebuilding index on reload

---

_Architecture analysis: 2026-02-28_
