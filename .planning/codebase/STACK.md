# Technology Stack

**Analysis Date:** 2026-05-27

## Languages

**Primary:**
- JavaScript (ES2022) - All module source code under `scripts/`, Web Worker in `scripts/workers/`

**Secondary:**
- CSS - Module styles in `styles/styles.css`
- Handlebars (`.hbs`) - UI templates in `templates/`
- JSON - Localization (`lang/en.json`, `lang/it.json`), manifests (`module.json`)

## Runtime

**Environment:**
- Browser (Foundry VTT client) — no Node.js runtime at play time
- ECMAScript modules (`"type": "module"` in `package.json`, `esmodules` in `module.json`)
- Web Workers API used in `scripts/workers/IndexWorker.js` for non-blocking index builds

**Package Manager:**
- npm
- Lockfile: `package-lock.json` present

## Frameworks

**Core:**
- None — vanilla ES modules; Foundry VTT APIs (`Hooks`, `game`, `canvas`, `ui`, `Dialog`, `ApplicationV2`) are injected globals, not imported packages

**Testing:**
- Vitest ^3.2.4 — test runner and assertion library
- Config: `vitest.config.js`
- Environment: jsdom ^28.1.0 (simulates browser DOM in Node)
- IndexedDB simulation: fake-indexeddb ^6.2.5

**Build/Dev:**
- No bundler — source files are shipped directly as ES modules
- Build packaging: `build.sh` (Linux/macOS) and `build.bat` (Windows) shell scripts that ZIP the module
- Version sync: `sync-version.sh` and `sync-version.bat` update version strings across files

**Linting/Formatting:**
- ESLint ^10.0.2 with `@eslint/js` — config in `eslint.config.js`
  - Separate rule sets for `scripts/**/*.js` (browser + Foundry globals) and `scripts/workers/**/*.js` (worker globals, no `window`/`document`)
- Prettier ^3.8.1 — config in `.prettierrc` (singleQuote, semi, tabWidth: 2, printWidth: 100)
- eslint-config-prettier ^10.1.8 — disables ESLint formatting rules that conflict with Prettier

**Type Checking:**
- TypeScript ^5.9.3 — type-check only (`noEmit: true`), config in `jsconfig.json`
- Types: `@league-of-foundry-developers/foundry-vtt-types` ^13.346.0-beta

## Key Dependencies

**Critical (runtime, loaded from CDN):**
- Fuse.js 7.0.0 — fuzzy search library; loaded via dynamic `import()` from `https://cdn.jsdelivr.net/npm/fuse.js@7.0.0/dist/fuse.mjs`
  - CDN URL defined in `scripts/core/Constants.js` as `FUSE_CDN`
  - Post-load shape validation in `scripts/core/Utils.js` (`_validateFuseShape`) guards against CDN compromise
  - Fallback: checks `window.Fuse` if CDN import fails
  - Duplicated in `scripts/workers/IndexWorker.js` (Web Workers cannot share ES module imports)
  - devDependency `fuse.js` ^7.1.0 is installed locally for tests only

**Development Only:**
- `@league-of-foundry-developers/foundry-vtt-types` — Foundry VTT TypeScript type definitions
- `fake-indexeddb` — in-memory IndexedDB polyfill for unit tests
- `jsdom` — browser DOM simulation for Vitest
- `globals` — ESLint global variable lists

## Configuration

**Runtime settings (Foundry world settings, registered in `scripts/main.js`):**
- `fuzzyThreshold` — Number, default 0.1 (Fuse.js match threshold)
- `searchPriority` — String: faNexus/forgeBazaar/both (default: both)
- `autoReplace` — Boolean, default false
- `confirmReplace` — Boolean, default true
- `fallbackFullSearch` — Boolean, default false
- `additionalPaths` — String (extra scan directories)
- `useTVACache` — Boolean, default true
- `refreshTVACache` — Boolean, default false
- `indexUpdateFrequency` — String: daily/weekly/monthly/quarterly (default: weekly)
- `debugMode` — Boolean, default false

**Build:**
- `module.json` — single source of truth for version; `build.sh` reads it automatically
- `jsconfig.json` — TypeScript config for type checking (targets ES2022, module ES2022, bundler resolution)
- `eslint.config.js` — flat ESLint config (ESLint v9+ format)
- `.prettierrc` — Prettier options (singleQuote: true, semi: true, tabWidth: 2, printWidth: 100)

## Platform Requirements

**Development:**
- Node.js (no `.nvmrc`; version unspecified)
- npm for devDependency installation
- Bash (Linux/macOS) or Windows CMD for build/sync scripts

**Production:**
- Foundry VTT v12 (minimum) or v13 (verified/supported)
- D&D 5e system v3.0.0+
- Token Variant Art (`token-variants`) module — required dependency
- FA Nexus (`fa-nexus`) module — optional dependency
- Modern browser with IndexedDB, Web Workers, and dynamic `import()` support

---

*Stack analysis: 2026-05-27*
