# External Integrations

**Analysis Date:** 2026-02-28

## APIs & External Services

**Foundry VTT Core APIs:**
- Hooks system
  - `Hooks.once('init', ...)` - Module initialization
  - `Hooks.once('ready', ...)` - Post-load initialization
  - `Hooks.on('getSceneControlButtons', ...)` - Scene control UI
- Settings API - Module configuration persistence
- Module API - Check module availability and access APIs
- Dialog/UI - UI rendering and interaction
- Localization (game.i18n) - Multi-language support
- Token/Actor APIs - Token manipulation and data access

**Token Variant Art (TVA) - token-variants module:**
- SDK/Client: TVA module API accessed via `game.modules.get('token-variants')?.api`
- Auth: No authentication required (module-to-module)
- Methods used:
  - `tvaAPI.cacheImages()` - Refresh TVA's image cache
  - `tvaAPI.doImageSearch(...)` - Search TVA cache (fallback, slower)
  - `tvaAPI.updateTokenImage(imagePath, config)` - Update token images with TVA styling
  - `TVA_CONFIG.staticCacheFile` - Direct access to cache file path
- Implementation: `scripts/services/TVACacheService.js`
- Cache format: TVA cache JSON with category-based structure
- Integration type: Direct cache access (primary path) + API fallback

**FA Nexus - fa-nexus module (Optional):**
- SDK/Client: FA Nexus module API accessed via `game.modules.get('fa-nexus')?.active`
- Auth: No authentication required
- Purpose: Provides local Forgotten Adventures token library directory access
- Used by: IndexService for local file scanning when TVA unavailable

**Fuse.js - Fuzzy Search Library:**
- URL: `https://cdn.jsdelivr.net/npm/fuse.js@7.0.0/dist/fuse.mjs`
- Type: CDN-hosted JavaScript library
- Provider: jsDelivr CDN
- Auth: None (public CDN)
- Implementation: `scripts/core/Utils.js` - `loadFuse()` function
- Fallback: Falls back to `window.Fuse` if dynamic import fails
- Usage: Fuzzy string matching for token name searches

**The Forge - forge-vtt module (Optional):**
- SDK/Client: `game.forge` API (when available)
- Auth: Requires API key (only available on Forge-hosted games or with explicit auth)
- Status: STUB - No public Bazaar browsing API available
- Implementation: `scripts/services/ForgeBazaarService.js` (non-functional)
- Note: Service is disabled pending public API availability

## Data Storage

**Databases:**
- No external database - fully client-side application
- All data stored client-side in browser storage

**File Storage:**
- Local filesystem (Foundry VTT installation)
  - Token image paths from TVA cache
  - Local directories scanned via ScanService
- The Forge cloud storage (via TVA integration)
  - Accessed through TVA's cache file
  - Supports both local files and Forge URLs (forge://... protocol)

**Client-side Storage:**
- localStorage
  - TVA cache copy: `tva-cache-v1` - Serialized TVA image data
  - Image index cache: `token-replacer-fa-index-v3` - Categorized image index
  - Bazaar service cache: `token-replacer-fa-bazaar-cache` - Search results (stub)
  - Size limit: ~4.5MB (larger indices trigger rebuild)
- IndexedDB
  - Alternative persistent storage via StorageService (`scripts/services/StorageService.js`)
  - Used when localStorage capacity exceeded

**Caching:**
- TVA cache file (.fdb JSON) - Direct read access
  - Reduces search latency vs. API calls
  - Built-in caching by TVA module
- Hierarchical category index - Built and cached locally
  - Cached in localStorage/IndexedDB with version checks
  - Version: `INDEX_VERSION = 3`
- Memoization caches for path exclusion lookups
  - Cached for 50K+ lookups per search operation
  - Max cache size: 20,000 entries (auto-clear when exceeded)

## Authentication & Identity

**Auth Provider:**
- Custom: Foundry VTT's built-in user/GM authentication
- All operations scoped through `game.user` (current logged-in user)
- GM-only operations: Scene control button visible only to GMs
- No external identity provider needed

**Environment Configuration:**
- No API keys required (all module-to-module integration)
- All configuration stored in Foundry's settings system
  - Module ID: `token-replacer-fa`
  - Settings keys: `fuzzyThreshold`, `searchPriority`, `autoReplace`, `confirmReplace`, `fallbackFullSearch`, `useTVACache`, `refreshTVACache`, `indexUpdateFrequency`, `debugMode`, `additionalPaths`

## Monitoring & Observability

**Error Tracking:**
- None (no external service)
- Local error handling with user-friendly notifications
- Debug mode via setting: `debugMode` - Logs to browser console

**Logs:**
- Browser console (console.log, console.error, console.warn)
- All logs prefixed with module ID: `token-replacer-fa |`
- Debug-level logs: Conditional on `game.settings.get('token-replacer-fa', 'debugMode')`
- Structured error objects with localized messages and recovery suggestions

## CI/CD & Deployment

**Hosting:**
- GitHub (source code repository)
- GitHub Releases (module distribution)
- jsDelivr (Fuse.js CDN)

**Release Process:**
- GitHub releases with both module.json manifest and distributable ZIP
- Module discovery via Foundry's module installer (manifest URL in module.json)
- Manifest URL: `https://github.com/Aiacos/token-replacer-fa/releases/latest/download/module.json`
- Package URL: `https://github.com/Aiacos/token-replacer-fa/releases/download/vX.Y.Z/token-replacer-fa-vX.Y.Z.zip`

**CI Pipeline:**
- None detected (manual build + GitHub release)
- Build process: `bash build.sh` (Linux/macOS) or `build.bat` (Windows)
- Release command: `gh release create vX.Y.Z releases/token-replacer-fa-vX.Y.Z.zip module.json --title "..." --latest`

## Webhooks & Callbacks

**Incoming:**
- None detected (not a server-side application)

**Outgoing:**
- None detected (no external API calls beyond TVA/FA Nexus)

## External Network Requirements

**For Operation:**
- jsDelivr CDN access (Fuse.js) - Required on first use
- TVA cache file read (filesystem or Forge URLs) - Required
- Optional: The Forge cloud storage access (via TVA integration)

**For Updates:**
- GitHub Releases API (for checking/downloading new versions) - Optional
- Foundry module system auto-checks manifest URL periodically

## Performance Considerations

**TVA Cache Direct Access (Primary Path):**
- Reads TVA's static cache file directly instead of API
- Eliminates repeated API calls for every search operation
- Cache file location: `TVA_CONFIG.staticCacheFile`
- Significantly faster than `doImageSearch()` API fallback

**Image Index Caching:**
- Pre-built hierarchical category index reduces search time
- Cached in localStorage/IndexedDB with automatic version invalidation
- Web Worker processes large indices non-blocking
- Falls back to main-thread with 10ms yields if Worker unavailable

**Parallel Searching:**
- Multiple creature types searched concurrently (batch size: 4)
- SearchOrchestrator manages parallelization via Promise.all()

---

*Integration audit: 2026-02-28*
