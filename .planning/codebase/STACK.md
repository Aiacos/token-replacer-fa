# Technology Stack

**Analysis Date:** 2026-02-28

## Languages

**Primary:**
- JavaScript (ES6 modules) - All source code in `scripts/`, HTML in templates
- Handlebars - UI templates in `templates/`
- JSON - Configuration and localization files

**Secondary:**
- CSS - Styling in `styles/styles.css`
- Shell Script - Build tooling (`build.sh`, `sync-version.sh`)
- Batch Script - Windows build tooling (`build.bat`, `sync-version.bat`)

## Runtime

**Environment:**
- Foundry VTT v12-v13 (browser runtime)
- Node.js (build scripts only, not runtime dependency)

**Module System:**
- ES6 modules (`esmodules` in `module.json`)
- Entry point: `scripts/main.js`

## Frameworks

**Core:**
- Foundry VTT Framework (v12-13 APIs)
  - Hooks system (init, ready, getSceneControlButtons)
  - Settings API (game.settings.register/get)
  - Dialog and UI systems
  - Module/actor/token systems
  - Game i18n localization

**UI:**
- Handlebars template engine - Precompiled and loaded via Foundry
  - Templates in `templates/*.hbs`
  - Auto-escaping for XSS protection
  - Preloading in init hook for performance

**Search & Matching:**
- Fuse.js 7.0.0 (CDN) - Fuzzy search library
  - Loaded dynamically via jsDelivr CDN
  - URL: `https://cdn.jsdelivr.net/npm/fuse.js@7.0.0/dist/fuse.mjs`
  - Fallback to window.Fuse if dynamic import fails

**Worker Processing:**
- Web Workers API - Background index building
  - Worker script: `scripts/workers/IndexWorker.js`
  - Prevents UI freezing during large index builds
  - Full-speed processing without setTimeout yields

## Key Dependencies

**Critical (External APIs):**
- Token Variant Art (TVA) - `token-variants` module
  - REQUIRED for token art replacement
  - Provides cache file and API for image search
  - Direct cache access: reads TVA's static cache file directly
  - API methods: `cacheImages()`, `doImageSearch()`, `updateTokenImage()`
  - TVA_CONFIG.staticCacheFile location

**Optional (External APIs):**
- FA Nexus - `fa-nexus` module
  - Optional local Forgotten Adventures token library access
  - Provides directory browsing for token assets

- The Forge - `forge-vtt` module
  - Optional, provides game.forge API
  - No public Bazaar browsing API available (stub service)

**Build Tools (Development only):**
- jq - JSON command-line processor (used in build.sh if available)
- git - Version control (implied for releases)
- gh - GitHub CLI (used for releasing)

## Configuration

**Environment:**
- No external .env file required
- Settings stored in Foundry game.settings API
  - Scope: 'world' (stored per-world in Foundry)
  - Settings registered in init hook via `registerSettings()`

**Build:**
- `module.json` - Foundry module manifest (single source of truth for version)
- `build.sh` / `build.bat` - Creates distributable ZIP
  - Auto-detects version from module.json
  - Calls sync-version scripts before packaging
- `sync-version.sh` / `sync-version.bat` - Keeps version in sync across files
  - Updates CLAUDE.md, scripts/main.js JSDoc and console logs
  - Runs automatically as step 1 of build process

**Module Manifest:**
- `module.json` contains:
  - Module ID: `token-replacer-fa`
  - Version (single source of truth)
  - Foundry compatibility (min: 12, verified: 13)
  - System compatibility (D&D 5e only)
  - Module relationships (requires TVA, optional FA Nexus)
  - GitHub repository and manifest URLs

## Storage

**Client-side Storage:**
- localStorage - Caching layer for indices
  - TVA cache cache: `tva-cache-v1`
  - Token image index: `token-replacer-fa-index-v3`
  - Bazaar service cache: `token-replacer-fa-bazaar-cache` (stub)
  - Size limit: ~4.5MB per origin (triggers rebuild on page load if exceeded)

- IndexedDB - Alternative persistent storage (via StorageService)
  - Used for larger index caches
  - Version: 3 (INDEX_VERSION constant)

## Platform Requirements

**Development:**
- Node.js (for build scripts)
- bash/zsh or Windows Command Prompt
- Git for version control
- GitHub CLI (gh) for releases

**Production:**
- Foundry VTT v12 or v13 running in web browser
- Token Variant Art module (required)
- Modern browser with:
  - ES6 module support
  - Web Worker support (graceful fallback available)
  - localStorage or IndexedDB support

**System Compatibility:**
- D&D 5e system only (creature type extraction is system-specific)
- Requires actor/token objects with `system.details.type` and `system.details.subtype` fields

---

*Stack analysis: 2026-02-28*
