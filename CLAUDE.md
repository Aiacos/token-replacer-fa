# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Token Replacer FA is a Foundry VTT module that automatically replaces NPC token artwork with matching tokens from Forgotten Adventures and The Forge Bazaar. It requires Token Variant Art (TVA) module and optionally uses FA Nexus.

**Module ID:** `token-replacer-fa`
**Version:** 2.9.0
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
└── ui/
    └── UIManager.js     # Dialog generation, match selection UI, progress tracking
```

### Key Data Flow

1. `main.js` → `processTokenReplacement()` triggered by scene control button
2. `TokenService` extracts creature type/subtype from selected tokens
3. `SearchService.loadTVACache()` reads TVA's static cache file directly
4. `IndexService.build()` creates hierarchical category index from cache
5. `UIManager` displays matches for user selection

### TVA Integration

The module reads TVA's cache file directly (`TVA_CONFIG.staticCacheFile`) rather than using the slower `doImageSearch` API. Cache format:
```javascript
// TVA cache JSON: { category: [ path | [path, name] | [path, name, tags] ] }
// Converted to: { path, name, category } objects in tvaCacheImages[]
```

### Critical: CDN Path Handling

`isExcludedPath()` must filter out CDN URL segments before checking EXCLUDED_FOLDERS:
```javascript
// Forge URLs: https://assets.forge-vtt.com/bazaar/assets/FA_Pack/...
// Must skip: 'https:', 'bazaar', 'assets' (CDN structure, not actual folders)
const cdnSegments = new Set(['https:', 'http:', '', 'bazaar', 'assets', 'modules', ...]);
```

## Version Management

Update version in TWO places:
1. `module.json` - `"version": "X.Y.Z"`
2. `scripts/main.js` - Console log string in `Hooks.once('init', ...)`

## Localization

Files in `lang/en.json` and `lang/it.json`. All UI strings use `TOKEN_REPLACER_FA.*` namespace.

## Known Constraints

- Index caching limited to ~4.5MB localStorage - larger indices rebuild on page load
- D&D 5e system only (creature type extraction is system-specific)
- TokenService uses static methods (intentional for stateless token operations)
