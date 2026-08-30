# External Integrations

**Analysis Date:** 2026-05-27

## APIs & External Services

**Fuzzy Search CDN:**
- Fuse.js 7.0.0 — loaded at runtime via dynamic `import()` from jsdelivr CDN
  - URL: `https://cdn.jsdelivr.net/npm/fuse.js@7.0.0/dist/fuse.mjs`
  - Defined in: `scripts/core/Constants.js` (`FUSE_CDN`)
  - Loaded in: `scripts/core/Utils.js` (`loadFuse()`), duplicated in `scripts/workers/IndexWorker.js`
  - Security: post-load shape validation via `_validateFuseShape()` in both files; no SRI hash
  - Fallback: checks `window.Fuse` if CDN `import()` fails (see `scripts/core/Utils.js:49`)

**Forge Bazaar (The Forge hosting platform):**
- Integration: STUB only — no functional implementation
  - File: `scripts/services/ForgeBazaarService.js`
  - Decision: NO-GO — no public Forge Bazaar asset-discovery API exists
  - `ForgeBazaarService.isAvailable` is always `false`; all methods return empty arrays
  - `game.forge` API (Forge-hosted games only) is detected but not used
  - Forge CDN asset URLs (`https://assets.forge-vtt.com/bazaar/assets/...`) are handled in path filtering: `scripts/core/Utils.js` (`CDN_SEGMENTS` set) and `scripts/workers/IndexWorker.js`

## Foundry VTT Module Dependencies

**Token Variant Art (`token-variants`) — REQUIRED:**
- Purpose: Primary token image search and cache source
- Accessed via: `game.modules.get('token-variants')?.api` (see `scripts/main.js:149`)
- APIs used:
  - `tvaAPI.updateTokenImage(imagePath, {token, actor, imgName})` — apply token image
  - `tvaAPI.cacheImages()` — refresh TVA's static cache file
  - `TVA_CONFIG.staticCacheFile` — path to TVA's JSON cache file (read directly)
- Cache format read by `scripts/services/TVACacheService.js`:
  ```javascript
  // { category: [ path | [path, name] | [path, name, tags] ] }
  ```
- Cache key stored in IndexedDB: `tva-cache-v1`
- Presence check: `tokenReplacerApp.hasTVA` in `scripts/main.js:131`

**FA Nexus (`fa-nexus`) — OPTIONAL:**
- Purpose: Extends TVA with Forgotten Adventures token library
- Accessed via: `game.modules.get('fa-nexus')?.active` (see `scripts/main.js:140`)
- No direct API calls; FA Nexus extends TVA's search results automatically
- Presence check: `tokenReplacerApp.hasFANexus` in `scripts/main.js:141`

**D&D 5e System (`dnd5e`) — REQUIRED:**
- Minimum version: 3.0.0
- Purpose: Creature type and subtype extraction from actor data
- Accessed in: `scripts/services/TokenService.js` (actor system data)
- System-specific: module will not function correctly with other game systems

## Data Storage

**Databases:**
- IndexedDB (primary)
  - Database name: `token-replacer-fa`
  - Schema version: `DB_VERSION = 1` (defined in `scripts/services/StorageService.js:12`)
  - Object store: `index` with `keyPath: 'id'`
  - Keys used:
    - `token-replacer-fa-index-v3` — hierarchical creature index (see `scripts/services/IndexService.js:24`)
    - `tva-cache-v1` — TVA image cache (see `scripts/services/TVACacheService.js:18`)
  - Migration: incremental `switch(oldVersion)` in `StorageService.openDatabase()` — add `case` blocks for future schema changes
  - Anti-pollution: `_sanitizeData()` strips `__proto__`/`constructor`/`prototype` keys from loaded data
  - Timeout: blocked open requests rejected after 10 seconds

- localStorage (fallback when IndexedDB unavailable)
  - Size limit: ~4.5MB enforced in `scripts/services/StorageService.js:265`
  - JSON reviver strips prototype-polluting keys: `StorageService._jsonReviver()`
  - Forge Bazaar cache stub uses localStorage directly: key `token-replacer-fa-bazaar-cache` in `scripts/services/ForgeBazaarService.js:28`
  - Module-specific keys prefixed with `token-replacer-fa`

**File Storage:**
- Token images: accessed via Foundry VTT file picker and TVA cache (paths are string URLs)
- Forge CDN paths: `https://assets.forge-vtt.com/bazaar/assets/...`
- Local paths: relative paths under Foundry data directory (e.g., `modules/forgotten-adventures/...`)

**Caching:**
- In-memory: `TVACacheService._categoryCache` (category → images Map, built at cache load time)
- In-memory: `SearchOrchestrator.searchCache` (Map, max 200 entries)
- In-memory: `TokenReplacerApp.i18nCache` (localization string cache)
- In-memory: `Utils.excludedPathCache` (path exclusion results, max 20,000 entries with 25% LRU eviction)
- Persistent: IndexedDB via `scripts/services/StorageService.js`

## Web Workers

**IndexWorker (`scripts/workers/IndexWorker.js`):**
- Spawned by: `scripts/services/IndexService.js` via `workerFactory`
- URL: `modules/token-replacer-fa/scripts/workers/IndexWorker.js`
- Commands received: `indexPaths`, `setSearchIndex`, `fuzzySearch`, `cancel`, `ping`
- Messages sent: `progress`, `complete`, `searchResults`, `error`, `cancelled`, `pong`, `indexSet`
- Cannot share ES module imports with main thread — Fuse.js loading and CDN_SEGMENTS/isExcludedPath are duplicated
- Terminated on `beforeunload` in `scripts/main.js:1013`

**SearchOrchestrator Worker:**
- Spawned by: `scripts/services/SearchOrchestrator.js` via `workerFactory`
- Same `IndexWorker.js` script
- Also terminated on `beforeunload` in `scripts/main.js:1020`

## Authentication & Identity

**Auth Provider:**
- None — module has no authentication of its own
- Foundry VTT handles all user authentication; module checks `game.user.isGM` to restrict scene control button to GMs

## Monitoring & Observability

**Error Tracking:**
- None — no external error tracking service

**Logs:**
- All logging via `console.log/warn/error` with `${MODULE_ID} |` prefix
- Debug logging gated behind `debugMode` setting via `createDebugLogger()` in `scripts/core/Utils.js`
- i18n cache statistics logged on `ready` hook: `scripts/main.js:946`

## CI/CD & Deployment

**Hosting:**
- GitHub Releases (`https://github.com/Aiacos/token-replacer-fa`)
- Manifest URL: `https://github.com/Aiacos/token-replacer-fa/releases/latest/download/module.json`
- ZIP download URL pattern: `https://github.com/Aiacos/token-replacer-fa/releases/download/vX.Y.Z/token-replacer-fa-vX.Y.Z.zip`

**CI Pipeline:**
- None detected (no `.github/workflows/` directory)
- Manual release process via `build.sh` + `gh release create`

## Environment Configuration

**Required env vars:**
- None at runtime (Foundry module, all config is world settings)

**Secrets location:**
- `.auto-claude/.env` present (dev tooling, not loaded by module)

## Webhooks & Callbacks

**Incoming:**
- None

**Outgoing:**
- Fuse.js CDN fetch at runtime (`https://cdn.jsdelivr.net/npm/fuse.js@7.0.0/dist/fuse.mjs`)
- TVA cache file read (local Foundry file, not a network call in most setups)
- Forge CDN asset URLs referenced in token image paths (served by `https://assets.forge-vtt.com`)

---

*Integration audit: 2026-05-27*
