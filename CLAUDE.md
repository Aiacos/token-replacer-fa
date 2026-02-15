# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Token Replacer FA is a Foundry VTT module that automatically replaces NPC token artwork with matching tokens from Forgotten Adventures and The Forge Bazaar. It requires Token Variant Art (TVA) module and optionally uses FA Nexus.

**Module ID:** `token-replacer-fa`
**Version:** 2.11.2
**System:** D&D 5e only
**Foundry VTT:** v12-v13

## Development Commands

**Testing:** Load the module in Foundry VTT and test via browser console. No automated tests.

## Build & Release

### Build the package

```bash
bash build.sh      # Linux/macOS
build.bat           # Windows
```

The build script auto-detects module ID, version, and GitHub URL from `module.json`. It creates a clean ZIP in `releases/{id}-v{version}.zip` with the download URL already set in the packaged module.json.

### Publish a new release

1. **Update `module.json`** - change these two fields:
   - `"version"`: bump to the new version (e.g. `"X.Y.Z"`)
   - `"download"`: update to match: `https://github.com/Aiacos/token-replacer-fa/releases/download/vX.Y.Z/token-replacer-fa-vX.Y.Z.zip`

2. **Build the package**:
   ```bash
   bash build.sh
   ```

3. **Commit and push**:
   ```bash
   git add module.json
   git commit -m "Bump version to X.Y.Z"
   git push
   ```

4. **Create GitHub release** (uploads both module.json manifest AND ZIP):
   ```bash
   gh release create vX.Y.Z releases/token-replacer-fa-vX.Y.Z.zip module.json --title "vX.Y.Z - Description" --latest
   ```

> **Why `module.json` is uploaded separately**: Foundry VTT downloads the standalone `module.json` first (via the manifest URL) to discover the module version and its download URL. The ZIP also contains a `module.json` but that's only used after installation.

### Foundry VTT Manifest URL

```
https://github.com/Aiacos/token-replacer-fa/releases/latest/download/module.json
```

## Architecture

```
scripts/
├── main.js              # Entry point: Hooks (init, ready), settings, processTokenReplacement()
├── core/
│   ├── Constants.js     # MODULE_ID, CREATURE_TYPE_MAPPINGS (14 categories), EXCLUDED_FOLDERS
│   └── Utils.js         # Path extraction from TVA results, Fuse.js loader
├── services/
│   ├── SearchService.js # Main search orchestrator - TVA direct cache access (FAST PATH)
│   ├── IndexService.js  # Hierarchical category index, localStorage caching with size limits
│   ├── TokenService.js  # Extract creature info from Foundry actors (static methods)
│   └── ScanService.js   # Directory scanning (fallback when TVA unavailable)
├── workers/
│   └── IndexWorker.js   # Web Worker for background index building (non-blocking)
└── ui/
    └── UIManager.js     # Dialog generation, match selection UI, progress tracking
templates/
├── error.hbs            # Error message dialog
├── tva-cache.hbs        # TVA cache loading progress
├── scan-progress.hbs    # Directory scanning progress
├── search-progress.hbs  # Category search progress
├── parallel-search.hbs  # Parallel token search progress
├── progress.hbs         # Final results summary
├── match-selection.hbs  # Token variant selection dialog
└── no-match.hbs         # No match found with category browser
```

### Key Data Flow

1. `main.js` → `processTokenReplacement()` triggered by scene control button
2. `TokenService` extracts creature type/subtype from selected tokens
3. `SearchService.loadTVACache()` reads TVA's static cache file directly
4. `IndexService.build()` creates hierarchical category index from cache
5. `UIManager` displays matches for user selection

### Template System

The module uses Handlebars templates (preloaded in `main.js` init hook) to separate presentation from logic:

**Template Rendering:**
- All UI generation methods in `UIManager.js` use `renderTemplate(path, data)`
- Methods are async and return `Promise<string>`
- Templates are preloaded via `loadTemplates()` in the init hook for performance

**XSS Protection:**
- Handlebars auto-escapes all variables by default (e.g., `{{name}}`)
- No manual escaping needed in template methods - just pass raw data
- `escapeHtml()` utility is only used for dynamic HTML generation outside templates (e.g., `innerHTML` assignments in event handlers)

**Template Conventions:**
- Template files are in `/templates` directory with `.hbs` extension
- Use `{{variable}}` for auto-escaped output
- Use `{{#if condition}}...{{/if}}` for conditionals
- Use `{{#each array}}...{{/each}}` for iteration
- All CSS classes and structure must match original inline HTML

### TVA Integration

The module reads TVA's cache file directly (`TVA_CONFIG.staticCacheFile`) rather than using the slower `doImageSearch` API. Cache format:
```javascript
// TVA cache JSON: { category: [ path | [path, name] | [path, name, tags] ] }
// Converted to: { path, name, category } objects in tvaCacheImages[]
```

### Web Worker Architecture

Index building uses Web Workers to prevent main thread blocking:

**IndexWorker.js** - Runs in background thread, processes thousands of images at full speed without UI freezing
- Receives `indexPaths` command with image paths and categorization rules
- Processes all paths without setTimeout yields (unlike main thread fallback)
- Sends progress updates every 1000 items via `postMessage`
- Returns categorized index structure when complete

**IndexService** - Manages worker lifecycle and fallback
- Initializes worker on construction: `new Worker('modules/token-replacer-fa/scripts/workers/IndexWorker.js')`
- Uses `indexPathsWithWorker()` when worker available (non-blocking)
- Falls back to `indexPathsDirectly()` with 10ms yields if worker unavailable
- Properly terminates worker with `terminate()` method

**Benefits:**
- Main thread remains completely responsive during large index builds
- Full-speed processing (no yield delays) in worker thread
- Graceful fallback for browsers without Worker support

### Critical: CDN Path Handling

`isExcludedPath()` must filter out CDN URL segments before checking EXCLUDED_FOLDERS:
```javascript
// Forge URLs: https://assets.forge-vtt.com/bazaar/assets/FA_Pack/...
// Must skip: 'https:', 'bazaar', 'assets' (CDN structure, not actual folders)
const cdnSegments = new Set(['https:', 'http:', '', 'bazaar', 'assets', 'modules', ...]);
```

**Note:** This CDN filtering logic exists in BOTH IndexService.js (main thread fallback) and IndexWorker.js (worker thread)

## Version Management

**Single Source of Truth:** The version is defined in `module.json` only. All other files are updated automatically.

**Automated Synchronization:** The `sync-version.sh` script reads the version from `module.json` and automatically updates:
1. `CLAUDE.md` - **Version:** field
2. `scripts/main.js` - JSDoc `@version` tag
3. `scripts/main.js` - Console log in `Hooks.once('init', ...)`

**How It Works:**
- `build.sh` (Unix) and `build.bat` (Windows) automatically call version sync scripts before packaging
- Developers only need to update `"version"` in `module.json`
- Version sync runs as step 1 of the build process
- All files remain consistent without manual updates

**To Update Version:** Edit `module.json` and change `"version": "X.Y.Z"` - the build script handles the rest.

## Localization

Files in `lang/en.json` and `lang/it.json`. All UI strings use `TOKEN_REPLACER_FA.*` namespace.

## Known Constraints

- Index caching limited to ~4.5MB localStorage - larger indices rebuild on page load
- D&D 5e system only (creature type extraction is system-specific)
- TokenService uses static methods (intentional for stateless token operations)
