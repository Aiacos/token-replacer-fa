# Coding Conventions

**Analysis Date:** 2026-05-27

## Naming Patterns

**Files:**
- Services: PascalCase noun + `Service` suffix — `StorageService.js`, `TVACacheService.js`
- Entry point: lowercase — `main.js`
- Constants/utils: PascalCase — `Constants.js`, `Utils.js`
- Workers: PascalCase + `Worker` suffix — `IndexWorker.js`
- UI: PascalCase + `Manager` suffix — `UIManager.js`
- Tests: mirror source path + `.test.js` — `tests/services/StorageService.test.js`
- Test helpers: lowercase hyphenated — `mock-helpers.js`, `mock-tva-cache.js`

**Classes:**
- PascalCase — `StorageService`, `TVACacheService`, `SearchOrchestrator`, `TokenReplacerApp`
- Exported as both class and singleton: `export class StorageService` + `export const storageService = new StorageService()`

**Functions:**
- Public methods: camelCase — `extractCreatureInfo()`, `loadTVACache()`, `getSceneNPCTokens()`
- Private methods: leading underscore + camelCase — `_ensureWorker()`, `_validateFuseShape()`, `_sanitizeData()`
- Private fields: leading underscore — `this._tvaCacheService`, `this._debugLog`, `this._getSetting`
- Exported utilities: camelCase — `loadFuse()`, `escapeHtml()`, `sanitizePath()`, `createModuleError()`

**Variables:**
- camelCase throughout
- Constants: SCREAMING_SNAKE_CASE — `MODULE_ID`, `DB_VERSION`, `CACHE_KEY`, `INDEX_VERSION`
- Intentionally-unused parameters/catch variables: prefixed with `_` — `_error`, `_data` (suppresses ESLint `no-unused-vars`)

**Types:**
- JSDoc type annotations throughout (project is JavaScript, not TypeScript)
- `@param {Object}`, `@returns {Promise<boolean>}`, `@type {Map<string, Array>}`
- `@ts-expect-error` used sparingly for known fvtt-types gaps (5 occurrences in `scripts/`)

## Code Style

**Formatter:** Prettier

**Settings** (`.prettierrc`):
- `singleQuote: true` — all strings use single quotes
- `semi: true` — semicolons required
- `tabWidth: 2` — 2-space indentation
- `trailingComma: "es5"` — trailing commas in multi-line structures
- `printWidth: 100` — line length limit

**Linting:** ESLint (`eslint.config.js`) using `@eslint/js` recommended rules + `eslint-config-prettier` (last, disables formatting conflicts)

**Key ESLint rules:**
- `no-unused-vars: warn` with `argsIgnorePattern: '^_'` — `_error`, `_data` suppress warnings
- `no-useless-escape: warn`
- Worker files (`scripts/workers/**/*.js`) use `globals.worker` (not `globals.browser`) — `window`/`document` absent, intentionally not linted as browser globals

**Module system:** ES modules throughout (`"type": "module"` in `package.json`, `ecmaVersion: 2022`)

## Import Organization

**Order (observed pattern):**
1. Constants from `../core/Constants.js`
2. Utilities from `../core/Utils.js`
3. Sibling services from `./OtherService.js`

**Path style:** Relative paths, always explicit `.js` extension — `'../core/Utils.js'`, `'./StorageService.js'`

**Path aliases:** None — no `@/` or `~` shortcuts

**Example from `scripts/services/TVACacheService.js`:**
```javascript
import { MODULE_ID, CREATURE_TYPE_MAPPINGS } from '../core/Constants.js';
import { isExcludedPath, createModuleError, createDebugLogger } from '../core/Utils.js';
import { storageService } from './StorageService.js';
```

## Error Handling

**Structured error helper:** `createModuleError(errorType, details, recoveryKeys = [])` exported from `scripts/core/Utils.js` (lines 502–511).

Returns:
```javascript
{
  errorType,           // e.g., 'search_failed'
  message,             // game.i18n.localize(`TOKEN_REPLACER_FA.errors.${errorType}`)
  details,             // technical details string
  recoverySuggestions  // array of localized recovery strings
}
```

Services store it as `this._createError = createModuleError` and call `this._createError('type', details, ['recovery_key'])`.

**Try/catch pattern:**
- All async operations wrapped in try/catch
- IndexedDB operations fall through to localStorage fallback on any catch — see `StorageService.save()`, `load()`, `remove()`
- Catch log level conventions: `console.error` for data loss, `console.warn` for recoverable fallback, `console.debug` for expected/noisy failures
- Unused catch bindings: `catch (_error) {` to suppress ESLint

**Null guards:**
- Functions return `null` early for invalid input rather than throwing
- Pattern: `if (!path || typeof path !== 'string') return null;`

## Logging

**Debug logger factory:** `createDebugLogger(servicePrefix)` exported from `scripts/core/Utils.js` (lines 519–529).

Each service instantiates its own logger in the constructor:
```javascript
this._debugLog = createDebugLogger('TVACacheService');
// Usage: this._debugLog('Cache loaded', count, 'images');
// Output: "token-replacer-fa | [TVACacheService] Cache loaded 42 images"
```

- Debug logs are gated behind `game.settings.get(MODULE_ID, 'debugMode')` with a try/catch for pre-registration safety (settings not yet registered on init)
- `console.log` for operational lifecycle events (IndexedDB open/close)
- `console.warn` for recoverable issues (fallback activated, connection blocked)
- `console.error` for data-loss failures
- All log messages prefixed: `${MODULE_ID} |` → `token-replacer-fa |`

## Comments

**When to Comment:**
- All exported functions have JSDoc blocks
- Private helpers have JSDoc blocks
- Performance decisions documented inline (memoization, Set vs Array, precompiled RegExp)
- Non-obvious branching logic gets a short inline comment

**JSDoc style:**
```javascript
/**
 * One-line summary sentence.
 * Optional follow-up context paragraph.
 * @param {string} key - Description of param
 * @returns {Promise<boolean>} What is returned
 */
```

**SYNC markers:** Functions duplicated between `scripts/core/Utils.js` and `scripts/workers/IndexWorker.js` carry `SYNC:` JSDoc comments:
```javascript
// SYNC: Keep in sync with IndexWorker.js _validateFuseShape()
```
Four marker pairs exist (lines 63 in Utils.js; lines 264, 297, 445, 482 in IndexWorker.js). When modifying one copy, search for the marker and update both.

## Function Design

**Size:** Functions are focused and single-purpose; orchestration code delegates to private helpers

**Dependency injection pattern:** All service constructors accept `deps = {}`:
```javascript
constructor(deps = {}) {
  const {
    storageService: injectedStorage = storageService,
    getSetting = createDefaultGetSetting(),
    getTvaAPI = () => game.modules.get('token-variants')?.api,
  } = deps;
}
```
Default values use lazy factory functions (`createDefaultGetSetting()` from `scripts/core/Utils.js`) to defer `game` global access until runtime, not at module load time.

**Return values:**
- Success/failure async methods: `Promise<boolean>`
- Data retrieval async methods: `Promise<T|null>` with `null` as the not-found sentinel
- Pure sync utilities: typed value or `null` for invalid input

## Module Design

**Exports:** Each service file exports the class and a default singleton:
```javascript
export class StorageService { ... }
export const storageService = new StorageService();
```

**Barrel files:** None — no `index.js` re-exports; all imports reference concrete module paths

**Worker code duplication:** `scripts/core/Utils.js` and `scripts/workers/IndexWorker.js` share duplicated implementations of `loadFuse`, `_validateFuseShape`, `CDN_SEGMENTS`, and `isExcludedPath` because Web Workers cannot use ES module imports from the main thread. Each duplicated function carries a `SYNC:` marker.

## XSS / Security Conventions

**Templates:** Rely on Handlebars auto-escaping. All `{{variable}}` output is escaped. Do not manually escape data passed to `renderModuleTemplate()`.

**Dynamic HTML only:** `escapeHtml()` from `scripts/core/Utils.js` (lines 84–92) is used **only** for strings assigned to `innerHTML` outside of Handlebars templates (e.g., event handler DOM mutations).

**Path sanitization:** `sanitizePath()` from `scripts/core/Utils.js` (lines 99–143) validates all user-supplied paths — rejects protocol injection (`javascript:`, `data:`), null bytes, absolute paths, and path traversal sequences.

**Storage sanitization:** `StorageService._sanitizeData()` strips `__proto__`, `constructor`, `prototype` keys from all IndexedDB-loaded objects. `StorageService._jsonReviver` does the same for localStorage JSON parsing. These run automatically on every `load()` call.

---

*Convention analysis: 2026-05-27*
