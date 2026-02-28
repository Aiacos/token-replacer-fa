# Coding Conventions

**Analysis Date:** 2025-02-28

## Naming Patterns

**Files:**
- JavaScript modules use camelCase: `main.js`, `Constants.js`, `Utils.js`, `IndexWorker.js`
- Service files follow pattern: `{Feature}Service.js` (e.g., `SearchService.js`, `TokenService.js`)
- Handlebars templates use kebab-case: `match-selection.hbs`, `no-match.hbs`, `tva-cache.hbs`
- Test/verification scripts use camelCase: `console-test-script.js`, `test-worker.html`

**Classes:**
- Classes use PascalCase: `TokenService`, `SearchService`, `IndexService`, `TokenReplacerApp`, `TokenReplacerDialog`
- Singleton instances exported as camelCase: `tokenReplacerApp`, `searchService`, `indexService`, `scanService`, `storageService`
- Service classes follow naming pattern `{Name}Service` for consistency
- Each service exports both class and singleton: `export class IndexService {...}` followed by `export const indexService = new IndexService()`

**Constants:**
- Module-level constants use UPPER_SNAKE_CASE: `MODULE_ID`, `FUSE_CDN`, `PARALLEL_BATCH_SIZE`, `EXCLUDED_FOLDERS`
- Constants grouped in `scripts/core/Constants.js`
- Collection constants pre-compute derived forms: `EXCLUDED_FOLDERS` array + `EXCLUDED_FOLDERS_SET` (Set for O(1) lookups)
- Precompiled patterns (regexes) stored in module scope: `EXCLUDED_FILENAME_PATTERNS` array in `Utils.js`

**Functions:**
- Exported utility functions use camelCase: `loadFuse()`, `escapeHtml()`, `sanitizePath()`, `yieldToMain()`
- Private methods prefixed with underscore: `_debugLog()`, `_createError()`, `_prepareContext()`, `_renderHTML()`
- Helper functions (internal, not exported) use camelCase: `extractPathFromObject()`, `parseFilterTerms()`
- Event handler methods: `setupMatchSelectionHandlers()`, `setupNoMatchHandlers()`

**Variables:**
- Local variables and parameters: camelCase (`token`, `imagePath`, `creatureInfo`, `dialogEl`)
- Boolean variables use affirmative form: `isProcessing`, `hasCache`, `cacheLoaded`, `isTVACacheLoaded`
- Map/Set variables use plural nouns: `categoryMatches`, `folderSegments`, `selectedPaths`, `creatureGroups`
- Array variables use plural nouns: `terms`, `results`, `paths`, `tokens`, `suggestions`
- Cache variables: `i18nCache`, `excludedPathCache`, `termIndex`, `allPaths`
- Internal state properties: `_initialized`, `_onCloseCallback`, `_dialogContent`

**Module/Namespace:**
- No namespace nesting - all modules are at `scripts/{core,services,ui,workers}/`
- Services use Dependency Injection pattern rather than global access (except singleton exports)
- Error objects have structured property names: `errorType`, `message`, `details`, `recoverySuggestions`

## Code Style

**Formatting:**
- No explicit formatter detected (no .prettierrc or eslint config)
- Consistent 2-space indentation throughout
- Consistent quote style: single quotes for strings (`'string'`) in code, double quotes in templates (`"attribute"`)
- Semicolons used consistently at end of statements
- Blank lines used to separate logical sections within functions

**Linting:**
- No linter configuration detected
- Code follows implied standards: no unused variables, consistent error handling patterns

**Line Length:**
- Typical lines 80-120 characters, no hard limit enforced
- Longer comments and JSDoc allowed to exceed to improve readability

## Import Organization

**Order (enforced pattern):**
1. External imports from absolute paths: `import { MODULE_ID } from '../core/Constants.js'`
2. Relative imports from same package: `import { createDebugLogger } from '../core/Utils.js'`
3. Sibling service imports: `import { tvaCacheService } from './TVACacheService.js'`
4. Worker imports: `new Worker('modules/token-replacer-fa/scripts/workers/IndexWorker.js')`

**Path Aliases:**
- No aliases configured
- Relative paths used: `../core/`, `../services/`, `../ui/`, `../workers/`
- Absolute paths for worker instantiation: `modules/{MODULE_ID}/scripts/workers/{file}.js`

**Module Dependencies:**
- Constants from `core/Constants.js` are dependency tree root
- Utils from `core/Utils.js` depend only on Constants
- Services depend on Constants and Utils, sometimes on each other (SearchService → SearchOrchestrator)
- Main entry point `main.js` imports all services and UI
- Circular dependencies avoided: services don't import main

## Error Handling

**Patterns:**
- Structured error objects with properties: `errorType`, `message`, `details`, `recoverySuggestions`
- Error creation via `createModuleError(type, details, recoveryKeys)` from Utils.js
- Try-catch blocks wrap potentially failing operations (async imports, settings access, storage operations)
- Silent failures with console.warn for non-critical operations (filter term storage, cache clear)
- Explicit error re-throw for structured errors: `if (error.errorType) { throw error; }`
- Unexpected errors wrapped in structured error object before throwing

**Error Type Categories (in `lang/en.json`):**
- `errors.{type}` - User-facing error messages
- `recovery.{key}` - Recovery suggestion messages
- Common types: `tva_missing`, `cache_load_failed`, `search_failed`, `fuse_load_failed`, `network_error`

**Logging Strategy:**
- `console.error()` for critical failures: module initialization, search failures, TVA problems
- `console.warn()` for recoverable issues: cache load failures, worker initialization, filter storage
- `console.log()` for informational: initialization steps, statistics, module readiness
- `_debugLog()` method (service or app level) for conditional debug output
- Debug logging only active when `debugMode` setting is enabled

**Debug Logging:**
- Created via `createDebugLogger(serviceName)` factory function
- Returns function `(message, ...args)` that checks settings before logging
- Wrapped in try-catch to handle cases where settings not yet registered
- Called as `this._debugLog('message', context)` in service methods
- Includes service prefix in output: `token-replacer-fa | [ServiceName] message`

## Logging

**Framework:** `console` object (browser DevTools)

**Patterns:**
- `console.log()` - Initialization milestones, module readiness checks, informational messages
- `console.warn()` - Recoverable errors, fallback activations, skipped operations
- `console.error()` - Critical failures requiring user attention
- Module prefix on all logs: `` `${MODULE_ID} | message` ``
- Service-specific debug logs use additional prefix: `${MODULE_ID} | [ServiceName] message`

**Log Examples:**
```javascript
console.log(`${MODULE_ID} | Module ready`);
console.warn(`${MODULE_ID} | TVA cache load failed, using fallback methods`);
console.error(`${MODULE_ID} | SearchService initialization failed:`, error);
this._debugLog('Loading TVA cache', stats);
```

## Comments

**When to Comment:**
- JSDoc for all exported functions and classes (comprehensive)
- Inline comments for non-obvious logic or workarounds
- Comments explaining why (not what the code does)
- Architecture decisions documented in module-level JSDoc
- Design notes in class comments (see `TokenService.js` for static method justification)

**JSDoc/TSDoc:**
- Used extensively on all public methods and exported functions
- Format: `@param {Type} name - Description`, `@returns {Type} Description`
- Example blocks included for complex utilities: `@example`
- Module-level docs: `@module path/to/module`
- Version tags: `@version X.Y.Z` in main.js entry point
- Includes parameter types, return types, and descriptions

**JSDoc Example Pattern:**
```javascript
/**
 * Extract creature information from a token
 * @param {Token} token - Foundry VTT token
 * @returns {Object|null} Creature info or null
 */
static extractCreatureInfo(token) {
```

**Architecture Comments:**
- Web Worker design notes in constructor
- Cache structure documentation at class level
- Memoization patterns explained inline
- Performance tuning rationale in constant definitions

## Function Design

**Size:** Methods typically 20-50 lines, complex orchestration methods may reach 100+ lines
- Large methods are either orchestrators (main business logic) or have clear responsibility sections separated by blank lines
- No complex nested logic - branching is flat with early returns

**Parameters:**
- Single responsibility: methods take only parameters needed for their task
- Object parameters used when 3+ related values needed: `{ errorType, message, recoverySuggestions }`
- Optional parameters at end, with defaults documented in JSDoc
- Callbacks passed as optional final parameter: `progressCallback = null`

**Return Values:**
- Explicit null returns for "not found" cases
- Promise returns for async operations documented in JSDoc
- Structured objects returned for complex results: `{ success, stats, errors }`
- Early returns used to reduce nesting depth

**Function Types:**
- **Utility functions** (Utils.js): Pure functions, no side effects
- **Service methods** (services/): May access game state, perform I/O, maintain internal caches
- **Static utility methods** (TokenService): Pure functions, explicitly marked static
- **Instance methods** (classes): Access `this` state, use private methods with underscore prefix
- **Event handlers** (UIManager): Async methods returning Promises, use try-catch

## Module Design

**Exports:**
- Each service file exports class + singleton: `export class SearchService {...}` then `export const searchService = new SearchService()`
- Constants exported individually: `export const MODULE_ID = '...'`, `export const PARALLEL_BATCH_SIZE = 4`
- Utils exported as named functions: `export function loadFuse() {...}`
- No default exports (all named exports)

**Barrel Files:**
- Not used - imports specify exact module path
- Example: `import { searchService } from './services/SearchService.js'` (not from `./services/index.js`)

**Module Patterns:**
- **Service pattern**: Class with constructor (initialization), public methods (API), private methods (helpers)
- **Utility pattern**: Standalone functions, no state, pure logic
- **Singleton pattern**: Single instance exported, instantiated at module load time
- **Factory pattern**: `createDebugLogger(servicePrefix)` returns configured logger function
- **Facade pattern**: `SearchService` delegates to `SearchOrchestrator`, `TVACacheService`, `ForgeBazaarService`

**Initialization:**
- Services initialized via `init()` method (idempotent, safe to call multiple times)
- Dependencies injected via `setDependencies(...)` method when needed
- Web Worker created in constructor, stored as instance property
- Fallback strategies implemented when Worker unavailable (see IndexService)

## Special Patterns

**Caching:**
- Query result caching: `searchOrchestrator` caches search results by creature key
- Memoization: `excludedPathCache` Map with size limits (clears at 20K entries)
- localStorage: `filterTerm` persisted during session for category search
- IndexedDB: Index structures cached via `storageService` with version checking
- i18n caching: Both main app and UIManager maintain i18n string caches with hit/miss statistics

**Handlebars Templates:**
- Auto-escaping by default: `{{variableName}}` automatically escapes HTML
- No manual escaping needed in template rendering
- Manual escaping used only for innerHTML assignments: `el.innerHTML = escapeHtml(text)`
- Dynamic HTML generated in UIManager via `renderModuleTemplate(path, data)`
- All CSS and structure must match original inline HTML for consistency

**Error Object Structure:**
```javascript
{
  errorType: 'search_failed',
  message: 'Localized user message',
  details: 'Technical error details for console',
  recoverySuggestions: ['suggestion 1', 'suggestion 2']
}
```

**Dialog Pattern:**
- ApplicationV2-based custom dialog class: `TokenReplacerDialog extends foundry.applications.api.ApplicationV2`
- Requires `{ force: true }` parameter for initial render (v13+ behavior)
- Content updated via `updateContent(html)` method (DOM manipulation, not full re-render)
- Singleton instance managed by UIManager: `this.dialog`

**Versioning:**
- Single source of truth: `module.json` contains version
- Sync scripts (`sync-version.sh`, `sync-version.bat`) auto-update CLAUDE.md and main.js
- Build script runs sync before packaging
- Version sync is part of build process, not manual

---

*Convention analysis: 2025-02-28*
