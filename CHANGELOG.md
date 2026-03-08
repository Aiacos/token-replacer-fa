# Changelog

All notable changes to Token Replacer - Forgotten Adventures are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Fixed

- **Promise.allSettled for parallel batches**: `SearchOrchestrator` parallel category search now uses `Promise.allSettled` instead of `Promise.all`, preventing one failed category from aborting the entire batch
- **isProcessing race condition**: `finally` block is now the sole owner of `isProcessing` reset in `processTokenReplacement()`, preventing TOCTOU race with `onClose` callback
- **Score fallback**: unscored fuzzy matches now default to score `0` instead of `0.8`, ensuring the selection dialog always appears for ambiguous results
- **Worker double-post on Fuse.js failure**: removed redundant `complete` message in `IndexWorker.js` when `loadFuse()` already posted an `error` message
- **Creature-type post-filter**: Worker search results now filtered by creature type after completion, preventing cross-category contamination
- **StorageService cycle guard**: `_sanitizeData()` now uses `WeakSet` to detect circular references from IndexedDB structured clone, preventing stack overflow
- **Silent failure logging**: added `console.warn` to 4 `IndexService` search catch blocks and `console.debug` to `StorageService.has()` and `UIManager.updateDialogContent()` — errors were previously invisible in production (only `_debugLog` which requires debug mode)
- **Duplicate creature mapping**: removed duplicate `'sea hag'` entry in fey category that inflated match weight
- **Worker stale exclusion patterns**: `compiledExcludedPatterns` and `compiledExcludedFolders` now reset on each `indexPaths` call, fixing silent pattern reuse across re-index operations
- **Worker zombie on timeout**: `searchLocalIndexWithWorker()` timeout now calls `worker.terminate()` to prevent zombie workers receiving subsequent messages
- **Worker null guard**: added `this.index` null check in Worker `complete` handler to prevent crash if build failed before message arrived
- **HEAD request timeout**: TVA cache freshness check now uses `AbortSignal.timeout(3000)` to prevent 30-300s hang on misconfigured proxies

### Security

- Replaced `obj[prop]` with `Object.prototype.hasOwnProperty.call(obj, prop)` in Utils.js to prevent prototype pollution
- Added `credentials: 'omit'` to HEAD fetch in `TVACacheService` cache freshness check
- Replaced `error.stack` with `error.message` in user-facing error display to prevent information disclosure
- Added post-load shape validation (`_validateFuseShape`) for Fuse.js CDN import in both `Utils.js` and `IndexWorker.js` — verifies constructor, `.search()` method, and array return type
- Added `_sanitizeData()` recursive prototype key stripping and `_jsonReviver` for all IndexedDB/localStorage loads in `StorageService`

### Changed

- **LRU cache eviction**: `SearchOrchestrator` search cache now has a 200-entry cap with 25% batch eviction on overflow (was unbounded)
- **LRU eviction in Utils.js**: `excludedPathCache` now evicts oldest 25% on overflow instead of full clear
- **Worker timeout**: `searchLocalIndexWithWorker()` now has a 60-second timeout with proper cleanup to prevent indefinite hangs
- **Pre-lowercase optimization**: `TVACacheService` now computes `_nameLower`/`_pathLower` once at parse time, eliminating O(n) string allocations per search on 50K+ entries
- **QuotaExceeded notification**: `IndexService` now shows `ui.notifications.warn()` when IndexedDB storage quota is exceeded
- Extracted `_buildSearchableCache()` helper in `TVACacheService` (DRY: eliminated duplicate filter+map chains)
- Extracted `_attachImageDelegation()` helper in `UIManager` (DRY: replaced 3 duplicate 20-line event delegation blocks)
- Added `SYNC:` markers to 4 duplicated functions in `IndexWorker.js` (`loadFuse`, `_validateFuseShape`, `CDN_SEGMENTS`, `isExcludedPath`) linking to their `Utils.js` counterparts
- **saveToCache size logging**: replaced blocking `JSON.stringify` (100-500ms at 30K+ images) with O(1) entry count estimation

## [2.12.4] - 2026-03-07

### Security

- Removed hardcoded credentials from environment files
- Added `.env` patterns to `.gitignore` to prevent credential leaks
- Added dangerous protocol rejection (`javascript:`, `data:`, `vbscript:`) in `sanitizePath()`
- Added prototype pollution key filtering (`__proto__`, `constructor`, `prototype`) in path extraction
- Added origin validation and `credentials: 'omit'` to TVA cache fetch requests
- Replaced inline event handlers (`onclick`, `onerror`) with `addEventListener` delegation for CSP compatibility
- Added input validation for Worker message handler
- Removed error stack traces from Worker `postMessage` responses
- Added strict regex validation for build script variables to prevent injection
- Added `console.warn` to all previously-silent `catch` blocks
- Added 200-character limit on localStorage filter term to prevent abuse

### Added

- User-facing warnings when Fuse.js fails to load or token replacement fails
- Security-focused tests for protocol rejection, prototype pollution, and cache origin validation (11 new tests)

## [2.12.0] - 2026-03-06

### Added

- **Automated test suite**: 498 tests via Vitest + jsdom + fake-indexeddb covering all services
- **GitHub Actions CI pipeline**: runs tests, lint, and type checking on every PR
- **JSDoc type safety**: declaration merging for typed settings access, JSDoc annotations on all services
- **Structured error handling**: `createModuleError()` pattern with error types, details, and recovery suggestions
- **Worker lifecycle management**: lazy initialization via `_ensureWorker()`, clean termination on page unload, crash fallback with user notification

### Changed

- All 5 services now use constructor dependency injection with backward-compatible defaults
- `TokenService` converted from static-only class to instance class with canvas DI
- `IndexService` Worker creation changed from eager (constructor) to lazy (`_ensureWorker()`) via injected `workerFactory`
- Error notifications now include recovery suggestions (e.g., "Try: Refresh the page")
- `beforeunload` handler terminates Worker cleanly to prevent orphaned threads

### Fixed

- `SearchOrchestrator.searchLocalIndex` now has try-catch for Worker fallback (was missing)

## [2.11.0] - 2026-02-25

### Added

- **ApplicationV2 dialog**: migrated from deprecated Foundry v1 Dialog API to `ApplicationV2` for v12-v13 compatibility
- **Service decomposition**: `SearchService` split into `SearchOrchestrator` (search logic) and `TVACacheService` (cache management)
- **SearchService facade**: thin facade delegating to specialized services

### Changed

- Dialog system uses `TokenReplacerDialog` extending `ApplicationV2` with `{ force: true }` for initial render
- Dialog content updates via DOM manipulation (`updateContent`) instead of full re-render

### Fixed

- Dialog not appearing on Foundry v13 (required `{ force: true }` parameter)
- Dialog not rendering when index searches returned 0 results
- `termIndex` empty when loaded from IndexedDB cache (rebuild from `allPaths`)
- Module crash when `_debugLog()` called before `registerSettings()` in init hook
- UI freeze from uncapped results (capped at 200, added lazy image loading)

## [2.10.0] - 2026-02-20

### Added

- **Handlebars templates**: extracted all inline HTML from `UIManager.js` into 8 `.hbs` template files with auto-escaping XSS protection
- **Web Worker index building**: `IndexWorker.js` processes image categorization in background thread without blocking UI
- **IndexedDB storage**: `StorageService` for persistent index caching beyond localStorage's 4.5MB limit
- **Skeleton loaders**: loading placeholder animations for token images during search
- **Search filter clear button**: one-click clear with filter term persistence in localStorage
- **O(1) search term index**: hash table lookups via `termIndex` replacing linear scans
- **Precompiled regex patterns**: `EXCLUDED_FILENAME_PATTERNS` compiled once at module load
- **Category term map**: `buildTermCategoryMap()` for reverse lookups from search terms to categories
- **i18n caching**: memoized localization lookups in both main app and UIManager
- **Version sync automation**: `sync-version.sh` / `sync-version.bat` reads version from `module.json` and updates all files
- **Build scripts**: `build.sh` / `build.bat` auto-detect module ID, version, and GitHub URL from `module.json`
- **Path sanitization**: `sanitizePath()` utility function for user-controlled paths
- **Debug mode setting**: toggleable debug logging via module settings
- **Cancel buttons**: cancellation support in all progress dialogs
- **ForgeBazaarService stub**: skeleton service for future Forge Bazaar direct API integration
- **Error templates**: structured error display with recovery suggestions via `error.hbs`

### Changed

- `categorizeImage()` uses Map lookup instead of nested loops
- `isExcludedPath()` uses precompiled RegExp array instead of runtime compilation
- `search()` method uses O(1) `termIndex` lookups instead of linear array scan
- `searchMultiple()` optimized to use `termIndex` directly for OR logic
- TVA cache fallback chain extracted into focused methods (`_tryPreloadedCache`, `_tryGameSettings`, etc.)

### Fixed

- Non-blocking TVA cache load (fixed heavy UI freeze on startup)
- TVA cache persisted in IndexedDB to avoid re-parsing on every startup
- Worker index structure mismatch with main thread
- CSS icon overlap in search filter
- Word boundary pattern in `EXCLUDED_FILENAME_PATTERNS`

## [2.9.0] - 2026-02-15

### Added

- Enhanced filtering: exclude environmental assets (maps, tiles, portraits) from token searches
- Comprehensive FA library filtering for non-token assets
- Category fallback: automatically falls back to broader category search when subtype returns no results

### Fixed

- Category fallback results now filtered by category terms

## [2.8.0]

### Added

- **Direct TVA cache access**: fast path searching using TVA's static cache file directly
- CDN path handling: properly filter CDN URL segments from folder exclusion checks

### Changed

- Searches complete much faster by reading TVA cache directly instead of using API

## [2.7.0]

### Changed

- Improved parallelization and UI responsiveness during search
- Better cache key handling for progress notifications
- Index now stores all images for general search

## [2.6.0]

### Added

- Hierarchical JSON index with configurable update frequency

### Fixed

- Index initialization issues
- Improved index structure for faster lookups

## [2.5.0]

### Added

- localStorage caching for faster subsequent searches
- Extended folder exclusion filters
- Subtype parsing from string format (e.g., "Humanoid (Tiefling)")

### Changed

- Improved TVA cache integration
- Non-blocking index build

## [2.4.0]

### Added

- Pre-built keyword index for O(1) search performance via hash table lookups
- Asset folder exclusion from index

## [2.3.0]

### Changed

- Removed custom IndexService, uses TVA `doImageSearch` directly

### Fixed

- TVA Map result parsing to extract all results

## [2.2.0]

### Added

- Pre-built keyword index for O(1) searches
- Direct `CACHED_IMAGES` access for faster performance

## [2.1.0]

### Changed

- Subtype search now uses OR logic (shows all matching subtypes)
- Removed quick search buttons for cleaner interface

## [2.0.0]

### Changed

- **Major refactoring**: complete OOP architecture with modular services
- Separate services for Token, Search, Index, Scan, and UI
- O(1) Set lookups for improved performance
- Better handling of various TVA result formats
- Improved actor data parsing for creature type extraction

## [1.5.0]

### Added

- AND logic filter for multiple search terms
- Visual progress bar during category search
- Debounced search filter input with delimiter support

### Changed

- Taller dialog that adapts to content

## [1.4.0]

### Added

- Category browser dropdown when no fuzzy search matches found
- Creature type detection with pre-selected dropdown
- Multi-select in category browser with sequential/random assignment

## [1.3.0]

### Added

- Multi-select variations for artwork assignment
- Sequential and Random assignment modes
- Visual checkmark indicators for selected artwork
- Token count display showing affected tokens

### Changed

- Completely redesigned dialog layout with better sizing, scrolling, and visibility

## [1.2.1]

### Changed

- If tokens are selected, only processes selected NPC tokens instead of all NPCs on the scene

## [1.2.0]

### Fixed

- TVA result parsing: properly handles TVA's tuple format `[path, config]`
- Text visibility for failed/skipped items (was black text on dark backgrounds)

### Added

- Comprehensive debug logging for TVA integration

### Changed

- Refactored CSS styles for better dialog layout and visual consistency

## [1.1.0]

### Added

- **TVA cache integration**: skips manual directory scanning when Token Variant Art is available
- "Use TVA Cache" setting (enabled by default)
- "Refresh TVA Cache Before Search" setting
- Uses TVA's `updateTokenImage()` API to apply custom token configurations

### Changed

- Improved search logic when TVA cache mode is enabled

## [1.0.9]

### Fixed

- UI glitching from multiple dialog windows
- Refactored to use single dialog throughout replacement process

### Added

- Inline selection buttons for match selection
- Better user feedback when no tokens or matches found

## [1.0.8]

### Changed

- Code cleanup and removal of unused variables
- Added missing localization strings
- Removed verbose debug logging

## [1.0.7]

### Fixed

- TVA API path extraction (paths no longer show as numeric indices)
- Dialog auto-sizing issues

### Added

- Result validation to filter invalid paths
- Extensive debug logging for TVA responses
- Missing localization strings

## [1.0.6]

### Changed

- Made fallback full search optional (default: off)
- Added "Fallback to Full Search" setting

## [1.0.5]

### Added

- Category-based search optimization
- Creature type filtering to relevant folders

### Changed

- Improved performance for large token libraries

## [1.0.4]

### Added

- Parallel search for multiple creature types
- Identical creatures share search results
- Real-time progress display during processing

## [1.0.3]

### Fixed

- Browser freezing during directory scan

### Added

- Yielding to prevent UI blocking
- Throttled UI updates for better performance

## [1.0.2]

### Fixed

- Multiple dialog windows appearing
- Safe dialog closing mechanism

## [1.0.1]

### Fixed

- Settings localization
- Foundry v12/v13 compatibility for scene controls

### Added

- XSS protection

## [1.0.0]

### Added

- Initial release
- One-click NPC token art replacement
- Fuzzy search via Fuse.js
- FA Nexus and Forge Bazaar support via TVA
- Category-based creature type matching
- Interactive selection dialog with preview images
- English and Italian localization
