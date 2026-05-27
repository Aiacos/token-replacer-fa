# Codebase Structure

**Analysis Date:** 2026-05-27

## Directory Layout

```
token_forgotten_adventures/          # Project root
├── scripts/                         # All JavaScript source code
│   ├── main.js                      # Entry point: Hooks, TokenReplacerApp, processTokenReplacement()
│   ├── core/
│   │   ├── Constants.js             # MODULE_ID, CREATURE_TYPE_MAPPINGS, EXCLUDED_FOLDERS, perf constants
│   │   └── Utils.js                 # Pure utilities: loadFuse(), isExcludedPath(), sanitizePath(), createModuleError()
│   ├── services/
│   │   ├── SearchService.js         # Thin facade: init sub-services, validate, delegate
│   │   ├── SearchOrchestrator.js    # All search logic, LRU cache, parallel batching, FAST/SLOW modes
│   │   ├── TVACacheService.js       # TVA cache load, searchable index, pre-built category map
│   │   ├── IndexService.js          # Hierarchical index: build (Worker), search, IndexedDB persist
│   │   ├── TokenService.js          # Extract CreatureInfo from D&D 5e actors, group tokens
│   │   ├── StorageService.js        # IndexedDB wrapper + localStorage fallback
│   │   ├── ScanService.js           # Directory scan via FilePicker (TVA-unavailable fallback)
│   │   └── ForgeBazaarService.js    # Non-functional stub (no public API)
│   ├── workers/
│   │   └── IndexWorker.js           # Web Worker: indexPaths, fuzzySearch, setSearchIndex commands
│   ├── types/
│   │   ├── typedefs.js              # JSDoc @typedef only: CreatureInfo, TokenMatch, IndexedCache, ModuleError
│   │   ├── globals.d.ts             # TypeScript ambient declarations for Foundry globals
│   │   ├── modules.d.ts             # TypeScript declarations for TVA / FA-Nexus module APIs
│   │   └── settings.d.ts            # TypeScript declarations for registered module settings
│   └── ui/
│       └── UIManager.js             # TokenReplacerDialog (ApplicationV2), template rendering, event handlers
├── templates/                       # Handlebars (.hbs) templates — preloaded in init hook
│   ├── error.hbs                    # Error message with recovery suggestions
│   ├── tva-cache.hbs                # TVA cache loading progress
│   ├── scan-progress.hbs            # Directory scanning progress
│   ├── search-progress.hbs          # Category search progress
│   ├── parallel-search.hbs          # Parallel token search progress
│   ├── progress.hbs                 # Final results summary
│   ├── match-selection.hbs          # Token variant selection dialog (main user UI)
│   └── no-match.hbs                 # No match found with category browser
├── tests/                           # Vitest test suite (509 tests)
│   ├── core/
│   │   ├── Constants.test.js
│   │   └── Utils.test.js
│   ├── services/
│   │   ├── IndexService.test.js
│   │   ├── SearchOrchestrator.test.js
│   │   ├── SearchService.test.js
│   │   ├── StorageService.test.js
│   │   ├── TokenService.test.js
│   │   └── TVACacheService.test.js
│   ├── integration/
│   │   └── SearchPipeline.test.js
│   ├── helpers/
│   │   ├── mock-helpers.js          # Shared mock factories for all tests
│   │   ├── mock-helpers.test.js
│   │   └── mock-tva-cache.js        # Fixture data: synthetic TVA cache JSON
│   └── setup/
│       ├── foundry-mocks.js         # Global Foundry API mocks (game, canvas, ui, Hooks)
│       └── foundry-mocks.smoke.test.js
├── lang/
│   ├── en.json                      # English localization (TOKEN_REPLACER_FA.* namespace)
│   └── it.json                      # Italian localization
├── styles/
│   └── styles.css                   # Module CSS (dialog layout, match-selection grid)
├── .planning/
│   ├── codebase/                    # GSD codebase map documents (this directory)
│   ├── milestones/
│   ├── phases/                      # Numbered phase plans (01–10)
│   └── todos/
├── .auto-claude/                    # Auto-Claude spec history and worktrees
├── releases/                        # Built ZIP archives (not in .gitignore — kept for history)
├── module.json                      # Foundry manifest: id, version, esmodules, languages
├── package.json                     # npm: vitest, eslint, prettier devDependencies
├── vitest.config.js                 # Test runner configuration
├── eslint.config.js                 # ESLint flat config
├── .prettierrc                      # Prettier formatting rules
├── jsconfig.json                    # JS project config for IDE type checking
├── build.sh / build.bat             # Build scripts (auto-sync version, create ZIP)
├── sync-version.sh / sync-version.bat  # Version sync helpers called by build scripts
└── CLAUDE.md                        # Project instructions for Claude Code
```

## Directory Purposes

**`scripts/core/`:**
- Purpose: Shared constants and pure utility functions with no Foundry runtime dependencies
- Key files: `Constants.js` (all module-wide constants), `Utils.js` (all shared pure functions)
- Rule: No Foundry API calls at module scope — safe to import in tests without mocking

**`scripts/services/`:**
- Purpose: Business logic organized by concern — each service owns one responsibility
- Key files: `SearchOrchestrator.js` (most complex, all search strategies), `TVACacheService.js` (TVA integration), `IndexService.js` (index build/persist)
- Rule: All services use DI via `constructor(deps = {})` for testability; exported as singletons

**`scripts/workers/`:**
- Purpose: Web Worker code that runs off the main thread
- Key files: `IndexWorker.js` (only file) — self-contained, no ES module imports from main bundle
- Rule: Functions duplicated from `scripts/core/Utils.js` carry `// SYNC: Keep in sync with ...` markers

**`scripts/types/`:**
- Purpose: Type definitions only — no runtime code
- Key files: `typedefs.js` (JSDoc `@typedef` for shared data structures), `globals.d.ts` (Foundry globals ambient), `modules.d.ts` (TVA API types)
- Rule: `typedefs.js` must have zero side effects; `export {}` at bottom is required

**`scripts/ui/`:**
- Purpose: All user interface: dialog, template rendering, DOM event handlers
- Key files: `UIManager.js` (only file) — contains `TokenReplacerDialog` (ApplicationV2 subclass) and `UIManager` class
- Note: File is `@ts-nocheck` due to 51 DOM type narrowing issues (pragmatic decision, Phase 9)

**`templates/`:**
- Purpose: Handlebars templates for all dialog states
- All 8 `.hbs` files are preloaded via `loadModuleTemplates()` in the `init` hook
- Rendered with `renderModuleTemplate(path, data)` (wraps Foundry's `renderTemplate()`)

**`tests/`:**
- Purpose: Full Vitest test suite — unit and integration tests
- Structure mirrors `scripts/` for service tests; `setup/` provides global Foundry API mocks
- Run with: `npm test` (all 509 tests), `npm run test:watch` (watch mode)

**`lang/`:**
- Purpose: i18n localization files
- Namespace: All keys prefixed with `TOKEN_REPLACER_FA.`
- Supported: `en` (English), `it` (Italian)

## Key File Locations

**Entry Points:**
- `scripts/main.js`: Module entry point, all Foundry hooks, `TokenReplacerApp` singleton
- `module.json`: Foundry manifest, declares `scripts/main.js` as the only ES module

**Configuration:**
- `module.json`: Version source of truth — never edit version anywhere else
- `vitest.config.js`: Test runner setup (references `tests/setup/foundry-mocks.js`)
- `eslint.config.js`: Linting rules
- `.prettierrc`: Code formatting

**Core Logic:**
- `scripts/services/SearchOrchestrator.js`: Main search engine, 1284 lines
- `scripts/services/TVACacheService.js`: TVA cache integration
- `scripts/services/IndexService.js`: Index build and persistence
- `scripts/workers/IndexWorker.js`: Background processing

**Type Definitions:**
- `scripts/types/typedefs.js`: `CreatureInfo`, `TokenMatch`, `IndexedCache`, `ModuleError`, `TVACacheEntry`, `SearchResult`

**Testing:**
- `tests/setup/foundry-mocks.js`: Global Foundry API mocks (`game`, `canvas`, `ui`, `Hooks`, `FilePicker`)
- `tests/helpers/mock-helpers.js`: Service-specific mock factories
- `tests/helpers/mock-tva-cache.js`: Synthetic TVA cache fixture data

## Naming Conventions

**Files:**
- PascalCase for class files: `SearchOrchestrator.js`, `UIManager.js`, `TokenService.js`
- PascalCase with `Service` suffix for services: `TVACacheService.js`, `StorageService.js`
- PascalCase for workers: `IndexWorker.js`
- camelCase for utilities: `Constants.js` is an exception (PascalCase but contains only constants)
- Test files mirror source: `SearchOrchestrator.test.js` alongside `SearchOrchestrator.js` (separate `tests/` tree)

**Directories:**
- lowercase: `scripts/`, `services/`, `workers/`, `core/`, `ui/`, `types/`, `templates/`, `tests/`
- Mirrors source structure: `tests/services/` mirrors `scripts/services/`

**Classes:**
- PascalCase: `TokenReplacerApp`, `SearchOrchestrator`, `TVACacheService`
- Dialog subclass: `TokenReplacerDialog extends foundry.applications.api.ApplicationV2`

**Constants:**
- SCREAMING_SNAKE_CASE: `MODULE_ID`, `CREATURE_TYPE_MAPPINGS`, `PARALLEL_BATCH_SIZE`, `FUSE_CDN`

**Exported singletons:**
- camelCase: `export const searchService = new SearchService()`, `export const tokenReplacerApp = new TokenReplacerApp()`

## Where to Add New Code

**New search source (e.g., a new token library API):**
- Create `scripts/services/NewLibraryService.js` following the DI pattern in `ForgeBazaarService.js` or `TVACacheService.js`
- Register in `SearchService.init()` (`scripts/services/SearchService.js:28-51`)
- Wire as dependency in `SearchOrchestrator.setDependencies()` (`scripts/services/SearchOrchestrator.js:78`)
- Add tests in `tests/services/NewLibraryService.test.js`

**New creature category:**
- Add category to `CREATURE_TYPE_MAPPINGS` in `scripts/core/Constants.js:406`
- Add to `PRIMARY_CATEGORY_TERMS` in `scripts/core/Constants.js:333`
- No other files need changes — the category propagates automatically through the index

**New Foundry setting:**
- Add `game.settings.register()` call in `TokenReplacerApp.registerSettings()` (`scripts/main.js:155`)
- Add to `DEFAULT_SETTINGS` in `scripts/core/Constants.js:896`
- Add TypeScript declaration in `scripts/types/settings.d.ts`

**New dialog state / UI step:**
- Create a `.hbs` template in `templates/`
- Add the template path to the `loadModuleTemplates()` call in `Hooks.once('init')` (`scripts/main.js:779`)
- Add a `createXxxHTML()` method in `UIManager` (`scripts/ui/UIManager.js`)
- Call `uiManager.updateDialogContent(await uiManager.createXxxHTML(...))` from `processTokenReplacement()`

**New utility function:**
- Pure function with no Foundry API deps → `scripts/core/Utils.js`
- If needed in `IndexWorker.js` → duplicate and add `// SYNC: Keep in sync with Utils.js` marker

**New test:**
- Unit test for service → `tests/services/ServiceName.test.js`
- Unit test for core utility → `tests/core/Utils.test.js` or `tests/core/Constants.test.js`
- Integration test → `tests/integration/`
- Use mock factories from `tests/helpers/mock-helpers.js`; use global Foundry mocks from `tests/setup/foundry-mocks.js`

## Special Directories

**`.planning/`:**
- Purpose: GSD planning docs (codebase maps, phase plans, milestones, todos)
- Generated: Partially (by GSD commands)
- Committed: Yes

**`.auto-claude/`:**
- Purpose: Auto-Claude spec history, worktrees, and session insights
- Generated: Yes (by Auto-Claude tooling)
- Committed: Yes (for historical record)

**`releases/`:**
- Purpose: Built ZIP archives for GitHub releases
- Generated: Yes (by `build.sh` / `build.bat`)
- Committed: Yes (kept for release history)

**`fix-todos/` and `security-scan/`:**
- Purpose: Planning artifacts for resolved TODO and security fixing sessions
- Generated: Yes (by previous Claude sessions)
- Committed: Yes (historical reference)

---

*Structure analysis: 2026-05-27*
