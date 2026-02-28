# Codebase Structure

**Analysis Date:** 2026-02-28

## Directory Layout

```
token-replacer-fa/
├── scripts/                    # Main application code (7920 lines)
│   ├── main.js                # Entry point: hooks, settings, workflow orchestration (865 lines)
│   ├── core/                  # Core utilities and configuration
│   │   ├── Constants.js       # Module ID, creature mappings, excluded folders, settings defaults (313 lines)
│   │   └── Utils.js           # Shared utilities: Fuse loading, path filtering, search parsing (446 lines)
│   ├── services/              # Domain services (5178 lines total)
│   │   ├── SearchService.js   # Search facade: initializes and delegates to orchestrator (168 lines)
│   │   ├── SearchOrchestrator.js # Complex search logic, parallel processing, caching (1025 lines)
│   │   ├── TokenService.js    # Token extraction, grouping, replacement (static) (213 lines)
│   │   ├── TVACacheService.js # TVA cache loading and direct access (561 lines)
│   │   ├── IndexService.js    # Hierarchical token index, worker integration (1573 lines)
│   │   ├── ScanService.js     # Directory scanning, local index building (286 lines)
│   │   ├── StorageService.js  # IndexedDB wrapper with localStorage fallback (532 lines)
│   │   └── ForgeBazaarService.js # Stub for future integration (434 lines)
│   ├── ui/                    # UI and presentation
│   │   └── UIManager.js       # Dialog creation, HTML generation, event handling (1048 lines)
│   └── workers/               # Web Worker threads
│       └── IndexWorker.js     # Background index building (456 lines)
├── templates/                 # Handlebars HTML templates (9 files)
│   ├── error.hbs              # Error message dialog
│   ├── tva-cache.hbs          # TVA cache loading progress
│   ├── scan-progress.hbs      # Directory scanning progress
│   ├── search-progress.hbs    # Category search progress
│   ├── parallel-search.hbs    # Parallel token search progress
│   ├── progress.hbs           # Final results summary
│   ├── match-selection.hbs    # Token variant selection dialog
│   ├── no-match.hbs           # No match found category browser
│   └── (other templates)
├── lang/                      # Localization files
│   ├── en.json               # English strings (TOKEN_REPLACER_FA.* namespace)
│   └── it.json               # Italian strings
├── styles/                    # CSS
│   └── styles.css            # Module styling
├── module.json               # Foundry VTT manifest (v2.12.3)
├── CLAUDE.md                 # Development guide (this file)
├── README.md                 # User documentation
├── MANUAL_TESTING_GUIDE.md   # QA testing procedures
├── SPECIFICATIONS.md         # Feature specifications
└── build.sh / build.bat      # Build scripts (package for release)
```

## Directory Purposes

**`scripts/`:**

- Purpose: All application logic organized by layer
- Contains: Main entry point, core utilities, domain services, UI layer, worker threads
- Key pattern: Layered architecture with clear separation of concerns

**`scripts/core/`:**

- Purpose: Shared constants and utilities used across services
- Contains: MODULE_ID, creature type mappings, folder exclusions, utility functions
- Key files: `Constants.js` (configuration), `Utils.js` (helpers)

**`scripts/services/`:**

- Purpose: Domain-specific services that implement business logic
- Contains: Search orchestration, token operations, cache management, index building, storage
- Pattern: Each service manages its own state and dependencies

**`scripts/ui/`:**

- Purpose: User interface and presentation layer
- Contains: Dialog creation, HTML generation, event handling
- Uses: Handlebars templates for XSS-safe rendering

**`scripts/workers/`:**

- Purpose: Web Worker thread for CPU-intensive operations
- Contains: Background index building logic
- Isolated: Runs in separate thread context, communicates via postMessage

**`templates/`:**

- Purpose: Handlebars template files for UI generation
- Contains: Dialog layouts, progress indicators, error messages, selection interfaces
- Consumed by: `UIManager.js` via `renderTemplate()` calls

**`lang/`:**

- Purpose: Localization strings
- Pattern: TOKEN_REPLACER_FA.\* namespace (e.g., TOKEN_REPLACER_FA.errors.tva_missing)
- Used by: `i18n()` helper functions throughout codebase

**`styles/`:**

- Purpose: CSS styling for module UI
- Applied to: Dialog windows, progress bars, match selection interface

## Key File Locations

**Entry Points:**

- `scripts/main.js`: Main module entry point (imported via module.json `esmodules`)
  - Exports: `TokenReplacerApp` class
  - Hooks: Registers `init` and `ready` hooks
  - Orchestrates: Entire token replacement workflow

- `module.json`: Foundry VTT manifest
  - Defines: Module ID, version, dependencies, styles, languages, scripts

**Configuration:**

- `scripts/core/Constants.js`: All configuration constants
  - CREATURE_TYPE_MAPPINGS: D&D creature types → search terms (14 categories)
  - EXCLUDED_FOLDERS: Asset folders to skip (props, decor, terrain, etc.)
  - DEFAULT_SETTINGS: Module setting defaults
  - Performance tuning: PARALLEL_BATCH_SIZE, INDEX_BATCH_SIZE, MAX_SCAN_DEPTH

- `module.json`: Foundry VTT configuration
  - Version: 2.12.3
  - Compatibility: Foundry v12-v13, D&D 5e v3.0.0+
  - Dependencies: Token Variant Art (required), FA Nexus (optional)

**Core Logic:**

- `scripts/services/SearchOrchestrator.js`: Complex search orchestration
  - Fuzzy search via Fuse.js
  - Category-based fallback
  - Parallel creature processing
  - Result caching

- `scripts/services/TVACacheService.js`: TVA cache integration
  - Direct static cache file access (fast path)
  - Excluded path filtering
  - IndexedDB caching

- `scripts/services/IndexService.js`: Token index management
  - Hierarchical category index
  - Web Worker integration for background building
  - IndexedDB persistence with version control
  - Term index for O(1) search lookups

- `scripts/services/TokenService.js`: Token extraction and replacement
  - Static methods (stateless)
  - Creature info extraction from D&D 5e system
  - Token grouping by creature type
  - Direct TVA API integration

**Testing/Utilities:**

- `console-test-script.js`: Manual testing script for browser console
  - Provides: Test functions to invoke module directly
  - Usage: Paste into Foundry console for development testing

- `MANUAL_TESTING_GUIDE.md`: QA testing procedures
  - Covers: TVA cache, local scanning, fuzzy search, parallel processing

## Naming Conventions

**Files:**

- `[Name]Service.js`: Service classes that manage domain state/logic
  - Examples: `SearchService.js`, `TokenService.js`, `TVACacheService.js`
- `[Name]Worker.js`: Web Worker implementation
  - Examples: `IndexWorker.js`
- `[name].hbs`: Handlebars HTML templates
  - Examples: `match-selection.hbs`, `error.hbs`
- Constants and utilities: `Constants.js`, `Utils.js`
- Main entry point: `main.js`

**Functions:**

- CamelCase: `extractCreatureInfo()`, `loadTVACache()`, `groupTokensByCreature()`
- Private/internal: Prefixed with `_`, e.g., `_debugLog()`, `_createError()`, `_ensureWorker()`
- Async functions: Clear naming with `await` usage, e.g., `loadTVACache()`, `buildLocalTokenIndex()`

**Variables/Properties:**

- Camelcase for instance properties: `searchCache`, `tvaCacheLoaded`, `imageExtensions`
- UPPERCASE for constants: `MODULE_ID`, `CREATURE_TYPE_MAPPINGS`, `EXCLUDED_FOLDERS`
- Boolean properties: Prefix with `has`, `is`, e.g., `hasTVA`, `isProcessing`, `isBuilt`
- Prefix for private: `_`, e.g., `_initialized`, `_debugLog`, `_loadPromise`

**Classes:**

- PascalCase: `TokenReplacerApp`, `SearchService`, `SearchOrchestrator`, `IndexService`
- Pattern: Class per service/concern (single responsibility)

**Constants:**

- All UPPERCASE with underscores: `MODULE_ID`, `PARALLEL_BATCH_SIZE`, `INDEX_VERSION`
- Grouped logically in `Constants.js`

## Where to Add New Code

**New Feature (e.g., new search source):**

- Primary code: `scripts/services/SearchOrchestrator.js` (extend `parallelSearchCreatures()` or create new search method)
- Configuration: Add terms/mappings to `scripts/core/Constants.js`
- UI: Create new template in `templates/` if needed, add methods to `scripts/ui/UIManager.js`
- Tests: Add to `console-test-script.js` for manual testing

**New Component/Module:**

- Implementation: Create file in appropriate layer (`scripts/services/`, `scripts/ui/`, etc.)
- Naming: Follow existing pattern (`[Name]Service.js` for services, etc.)
- Dependencies: Use service injection via constructor or `setDependencies()` method
- Example: `scripts/services/NewFeatureService.js` with integration into `SearchService.init()`

**Utility Functions:**

- Shared helpers: Add to `scripts/core/Utils.js`
- Naming: Lowercase function name, descriptive, e.g., `extractPathFromTVAResult()`, `parseSubtypeTerms()`
- Pattern: Pure functions without side effects

**Localization Strings:**

- Add to: `lang/en.json` and `lang/it.json`
- Namespace: Always use `TOKEN_REPLACER_FA.` prefix
- Usage: Call `i18n('key.path')` in code, which expands to `game.i18n.localize('TOKEN_REPLACER_FA.key.path')`
- Examples: `TOKEN_REPLACER_FA.errors.tva_missing`, `TOKEN_REPLACER_FA.notifications.started`

**UI Templates:**

- Location: `templates/[name].hbs`
- Rendering: Call `renderModuleTemplate('templates/[name].hbs', data)` from UIManager
- Pattern: Handlebars syntax with `{{variable}}` (auto-escaped), `{{#if}}`, `{{#each}}`
- CSS: Style via classes in `styles/styles.css`

## Special Directories

**`releases/`:**

- Purpose: Build output directory (generated by `build.sh`/`build.bat`)
- Generated: Yes (ZIP package artifacts)
- Committed: No (in .gitignore)
- Contents: `token-replacer-fa-vX.Y.Z.zip` files ready for release

**`.planning/`:**

- Purpose: GSD codebase mapping (this directory)
- Generated: Yes (by GSD mapper)
- Committed: Yes
- Contents: ARCHITECTURE.md, STRUCTURE.md, CONVENTIONS.md, TESTING.md, etc.

**`.auto-claude/`:**

- Purpose: GSD task specifications and memory
- Generated: Yes (by GSD orchestrator)
- Committed: Yes
- Contents: Implementation plans, session logs, build history

**`fix-todos/`:**

- Purpose: Temporary directory for bug fix work
- Generated: Yes (as needed)
- Committed: Yes (during active work)

---

_Structure analysis: 2026-02-28_
