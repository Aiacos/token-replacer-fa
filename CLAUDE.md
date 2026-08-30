# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 🧠 Project Overview

Token Replacer FA is a Foundry VTT module that automatically replaces NPC token artwork with matching tokens from Forgotten Adventures and The Forge Bazaar. It requires Token Variant Art (TVA) module and optionally uses FA Nexus.

**Module ID:** `token-replacer-fa`
**Version:** 2.12.5
**System:** D&D 5e only
**Foundry VTT:** v13+ (verified v14)

## 📜 Constitution

These principles are binding for every change in this repository, human or agent
authored. They override convenience: when a shortcut conflicts with an article
below, the article wins. Each article ends with the check that enforces it —
a principle nothing verifies is a wish, not a rule.

**The one command:** `npm run check` runs lint → format → typecheck → validate →
tests (~10s). It is the gate for Articles I–V. Run it before every commit;
`npm run fix` repairs what is mechanically repairable.

### Article I — 🧹 Code quality

1. New code matches the idiom of the file it lands in: naming, comment density,
   error handling, import order. Consistency beats personal preference.
2. No silent failures. Every `catch` either recovers meaningfully or logs —
   `console.warn`/`console.debug` at minimum. `_debugLog()` alone is not enough:
   it is off for users, so a swallowed error is invisible in production.
3. Comments explain _why_, never _what_. Code that needs a "what" comment gets
   rewritten instead.
4. Duplicated logic carries a `SYNC: Keep in sync with <path>` marker. This is
   mandatory for the `Utils.js` ↔ `IndexWorker.js` pairs (`loadFuse`,
   `_validateFuseShape`, `CDN_SEGMENTS`, `isExcludedPath`), which cannot share
   imports across the worker boundary.
5. Dead code is deleted, not commented out. Git remembers.
6. **Enforced by:** `npm run lint`, `npm run format:check`, `npm run typecheck`.

### Article II — 🧪 Testing standards

1. Every bug fix begins with a test that fails for the reason being fixed. A fix
   without a regression test is incomplete work.
2. Every new public method of a service gets tests for the happy path, the empty
   input, and the failure path.
3. Tests assert observable behaviour, never private internals. Refactoring must
   not require rewriting the suite.
4. Async, worker and cache paths are tested for their _lifecycle_ too:
   termination, double-post, stale state between runs. Most historical bugs in
   this module lived there, not in the algorithms.
5. The suite stays fast (currently ~1.6s) and deterministic. No real network, no
   real timers, no test that depends on another test's order.
6. Coverage may not regress. Baseline at the time of writing: **49% lines**.
   `npm run test:coverage` reports it.
7. **Enforced by:** `npm test`, `npm run test:coverage`, CI on Node 20 and 22.

### Article III — 🎛️ User experience consistency

1. Every user-visible string goes through `lang/en.json` and is mirrored in
   `lang/it.json`. Hardcoded English in a template, a dialog or a notification
   is a defect. The one exception is a fallback for the window before
   `game.i18n` exists, and it must be _declared_ with `i18nOrEnglish(key,
english)` — never improvised as `localize(key) || 'English'`, which cannot
   work: Foundry returns the key itself for a missing key, so the fallback is
   unreachable and the user sees a raw `TOKEN_REPLACER_FA.…` string.
2. All UI is rendered from `/templates/*.hbs` via `renderTemplate()`. No HTML
   string concatenation in service or UI code; Handlebars auto-escaping is the
   XSS boundary.
3. Long operations always show progress, and progress is throttled (~10% steps)
   so notifications never flood the log.
4. Failures reach the user as a localized, actionable message — never a silent
   no-op and never a raw stack trace.
5. Terminology is stable across UI, README and settings: _token art_, _category_,
   _index_, _cache_, _match_. Do not invent synonyms.
6. **Enforced by:** `npm run validate` — i18n keys used vs. defined, translation
   parity, template reachability, no literal text in a template, and no
   untranslated prose handed to `ui.notifications.*`.

### Article IV — ⚡ Performance requirements

1. The main thread never blocks. Index building goes through
   `IndexWorker.js`; the direct path exists only as a fallback and must keep its
   yields.
2. Searches over the index are O(1)/O(log n) via `termIndex` and the category
   pre-cache — never a full scan of `allPaths` per query.
3. Paths are interned once in `index.pathList`; `allPaths`, `categories` and
   `termIndex` hold integer ids into it. Repeating the strings cost 44MB of
   structured clone per 50k images on the worker handoff — deserialized on the
   main thread, defeating the worker. Never store a path string in those
   structures again; `_resultForId()` resolves ids at the edge.
4. Anything computed once per build (lowercasing, category maps, compiled
   regexes) is computed at build time, not per search. Compiled patterns are
   reset on every re-index — stale reuse has bitten this codebase before.
5. Persisted state goes to IndexedDB first, `localStorage` only as a fallback
   (~4.5MB ceiling), and every load is sanitized.
6. A change that touches the search or index path reports before/after numbers
   (the index build already logs images/sec). "Feels faster" is not a result.
7. **Enforced by:** review + the timing logs in `IndexService`.

### Article V — 🔍 Automatic debug & validation system

1. Validation is a script, not a habit. `tools/validate-manifest.mjs` checks the
   manifest, version consistency, referenced files, runtime asset paths (the
   Web Worker and every `.hbs`), i18n key usage and translation parity.
2. Anything that can only fail at runtime in a user's world must be checked
   statically here. When a new class of runtime path appears, the validator
   grows a rule for it in the same commit.
3. The validator is itself covered by `tests/tools/`, and runs inside `npm test`
   — so a broken manifest fails locally in seconds, not in CI minutes.
4. Debug output is opt-in through the `debugMode` setting and `_debugLog()`,
   which must never throw when settings are not yet registered.
5. Release tooling (`tools/bump-version.mjs`, `tools/dependabot-triage.mjs`) is
   unit-tested code, because a release that fails _halfway_ is worse than one
   that never starts.
6. **Enforced by:** `npm run validate`, `tests/tools/*.test.js`.

### Article VI — 📚 Research & document SDKs and libraries

1. Before using a Foundry API, verify it against the target generation. Foundry
   generations differ in ways that fail silently — `ApplicationV2.render()`
   needs `{ force: true }` for the first display, and returns a resolved promise
   without it. Some defensive v12 paths remain (the notification element lookup,
   for one); they are harmless and cost nothing, but v13 is the supported floor.
2. External APIs get their source recorded next to the code: a doc URL in a
   JSDoc block, not tribal knowledge. This applies to the TVA cache format, the
   Foundry Package Release API and the Fuse.js options object.
3. Third-party code loaded at runtime is validated after loading. Fuse.js comes
   from a CDN without SRI, so `_validateFuseShape()` is the guard — never remove
   it, and keep both copies in sync (Article I.4).
4. New dependencies are justified in the PR: what it replaces, what it costs at
   load time, and why a ~50-line local helper is not enough. This module ships
   with zero runtime dependencies; keep it that way.
5. Version-pin everything reachable from CI.

### Article VII — 📖 Technical & user documentation

1. Docs ship in the same commit as the behaviour they describe. A merged feature
   with stale docs is an unfinished feature.
2. Division of labour, and it is strict:
   - `README.md` — for **users**: what it does, how to install, how to use, how
     to troubleshoot.
   - `CONTRIBUTING.md` — for **contributors**: setup, conventions, tests, PRs.
   - `CLAUDE.md` — for **agents**: architecture, invariants, constraints.
   - `CHANGELOG.md` — Keep a Changelog format; every user-visible change lands
     under `## [Unreleased]` as it is made, not at release time.
3. Architectural decisions with a non-obvious rationale are written down where
   the reader will hit them (the CDN path filtering, the worker/main-thread
   duplication, the ForgeBazaar stub).
4. Every documented command must actually run. If a doc says `npm run x`, `x`
   exists in `package.json`.

### Article VIII — 🧼 Repository hygiene

1. The repository root holds only what a user or contributor needs. Agent scratch
   output, scan reports and session state do not belong in version control.
2. One document per subject. Overlapping status files are consolidated or
   deleted, not accumulated.
3. Build artifacts (`releases/`, `coverage/`, `node_modules/`) are ignored, never
   committed.
4. `module.json` is the single source of truth for the version; `sync-version.sh`
   propagates it. Never hand-edit a version anywhere else.
5. Any file added to the root must be justified in the PR description.

### Article IX — 🔄 CI/CD, consistent and useful

1. The pipeline is code, and it is tested. Logic lives in `tools/*.mjs` with unit
   tests; YAML only wires steps together. Never bury decision-making in bash.
2. CI runs exactly what a developer runs locally (`npm run check`), so green
   locally means green in CI.
3. Four workflows, four jobs:
   - `ci.yml` — quality gate on Node 20/22, coverage, and a package smoke test
     that proves the ZIP contains every runtime asset.
   - `release.yml` — one dispatch bumps, validates, tags, builds, publishes the
     GitHub release and announces it to the Foundry package registry.
   - `foundry-compat.yml` — weekly watch that opens its own PR when Foundry
     ships a new generation.
   - `dependabot-auto-merge.yml` — merges green patch/minor updates, holds every
     major for a human.
4. `compatibility.maximum` stays unset. Pinning a maximum locks users out of
   every future Foundry release; the compat watch is the answer instead.
5. A failing workflow is fixed or removed the same week. A permanently red badge
   teaches everyone to ignore CI.
6. Release requires no local steps: no manual ZIP, no manual tag, no manual
   upload.

### Article X — 🤖 Proper use of subagents

1. Delegate for **breadth**, not for thinking. Sweeping many files for a pattern
   is a subagent task; a design decision, a security judgement, or the final
   verdict on a diff is not.
2. Spawn a subagent when the search would flood the main context with file dumps
   and only the conclusion matters. For a known file or symbol, read it directly.
3. Independent subagents are launched in one batch so they run in parallel; one
   agent per file is over-spawning.
4. Give each subagent a scope, a deliverable and a stopping condition. "Look
   around" wastes a whole context window.
5. Subagent output is evidence, never authority. Verify claims against the code
   before acting on them, and never let a subagent report stand in for a passing
   `npm run check`.

### Article XI — 🎨 Consistent iconography

1. Documentation chapters use one shared icon vocabulary, so the same concept
   carries the same glyph in the README, CONTRIBUTING, CLAUDE.md and any future
   doc:

   | Icon | Chapter / concept                      |
   | ---- | -------------------------------------- |
   | ✨   | Features, capabilities                 |
   | 📦   | Requirements, dependencies             |
   | 🚀   | Installation, getting started          |
   | 🎮   | Usage, day-to-day operation            |
   | ⚙️   | Settings, configuration                |
   | 🧠   | How it works, architecture, internals  |
   | 🔌   | API, integration points                |
   | 🧪   | Testing                                |
   | 🧹   | Code quality, conventions, hygiene     |
   | ⚡   | Performance                            |
   | 🔍   | Debugging, validation, troubleshooting |
   | 🔄   | CI/CD, releases, versioning            |
   | 📚   | Documentation, research, references    |
   | 📜   | Changelog, license, governance         |
   | 🙌   | Credits, contributing, support         |

2. One icon per heading, at the start, on `##`/`###` chapter headings only. Never
   inside body text, never two in a row, never decorative.
3. A concept that is not in the table either reuses the closest entry or the
   table gains a row — in the same commit. The vocabulary does not fork.
4. Icons never carry meaning on their own: strip every icon and the document
   must read exactly the same. They are navigation aids, not content.

## 🎮 Development Commands

**One gate — run this before every commit:**

```bash
npm run check      # lint → format:check → typecheck → validate → test  (~10s)
npm run fix        # prettier --write + eslint --fix
```

| Command                           | What it does                                            |
| --------------------------------- | ------------------------------------------------------- |
| `npm test`                        | Full Vitest suite (534 tests, ~1.6s)                    |
| `npm run test:watch`              | Watch mode                                              |
| `npm run test:coverage`           | Coverage report into `coverage/` (baseline ~49% lines)  |
| `npm run lint` / `lint:fix`       | ESLint over `scripts/`, `tools/`, `tests/`              |
| `npm run format` / `format:check` | Prettier                                                |
| `npm run typecheck`               | `tsc --noEmit` against `jsconfig.json`                  |
| `npm run validate`                | Manifest, runtime assets, i18n keys, translation parity |
| `npm run build`                   | Package the release ZIP into `releases/`                |

Manual UI testing still requires a real Foundry VTT world — see
**Manual Testing in Foundry VTT** in `CONTRIBUTING.md`, and the acceptance test
cases in `docs/SPECIFICATIONS.md`.

## 🔄 Build & Release

### Build the package

```bash
bash build.sh      # Linux/macOS
build.bat           # Windows
```

The build script auto-detects module ID, version, and GitHub URL from `module.json`. It creates a clean ZIP in `releases/{id}-v{version}.zip` with the download URL already set in the packaged module.json.

### Publish a new release

Releasing is a single GitHub Actions dispatch — no local build, no manual tag,
no manual upload:

```
Actions → Release → Run workflow → bump: patch | minor | major | x.y.z
```

The workflow then, in order:

1. runs the quality gates (lint, format, typecheck, tests);
2. `tools/bump-version.mjs` — rewrites `module.json` (version + download URL) and
   `package.json`, and promotes `## [Unreleased]` in `CHANGELOG.md` to the new
   version;
3. `sync-version.sh` — propagates the version to `CLAUDE.md` and the `main.js`
   banner;
4. `npm run validate` — validates the manifest _as it will ship_;
5. commits `chore: release vX.Y.Z`, tags `vX.Y.Z` and pushes both;
6. `build.sh` — builds the ZIP, then verifies it actually contains
   `module.json`, `scripts/main.js`, `scripts/workers/IndexWorker.js`,
   `styles/styles.css`, every `.hbs` and every language file, and that the
   packaged version matches;
7. creates the GitHub release with the ZIP **and** the standalone `module.json`;
8. `tools/publish-foundry.mjs` — announces the release to the Foundry package
   registry (needs the `FOUNDRY_PACKAGE_TOKEN` repository secret; pre-releases
   are validated in dry-run and never published).

Pushing a `vX.Y.Z` tag by hand still works and runs the same pipeline from
step 4, provided the tag matches `module.json`.

> **Why `module.json` is uploaded separately**: Foundry VTT downloads the standalone `module.json` first (via the manifest URL) to discover the module version and its download URL. The ZIP also contains a `module.json` but that's only used after installation.

### CI/CD workflows

| Workflow                    | Trigger                            | Purpose                                                                                                                                 |
| --------------------------- | ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `ci.yml`                    | push to `main`/`develop`, every PR | Quality gate on Node 20 + 22, coverage artifact, and a **package smoke test** that proves the ZIP carries every runtime asset           |
| `release.yml`               | manual dispatch, or a `v*` tag     | The release pipeline above                                                                                                              |
| `foundry-compat.yml`        | Mondays 06:17 UTC                  | Scrapes foundryvtt.com, and when a newer generation exists opens a PR bumping `compatibility.verified` with the suite re-run against it |
| `dependabot-auto-merge.yml` | daily 07:00 UTC                    | Merges green patch/minor Dependabot PRs; labels every major `needs-review`                                                              |

Supporting scripts live in `tools/` and are unit-tested in `tests/tools/` —
release logic is code, not YAML (Constitution, Article IX).

### Foundry VTT Manifest URL

```
https://github.com/Aiacos/token-replacer-fa/releases/latest/download/module.json
```

## 🧠 Architecture

```
scripts/
├── main.js              # Entry point: Hooks (init, ready), settings, processTokenReplacement()
├── core/
│   ├── Constants.js     # MODULE_ID, CREATURE_TYPE_MAPPINGS (14 categories), EXCLUDED_FOLDERS
│   └── Utils.js         # Path extraction from TVA results, Fuse.js loader
├── services/
│   ├── SearchService.js      # Thin facade delegating to SearchOrchestrator and TVACacheService
│   ├── SearchOrchestrator.js # Search logic: TVA search, category search, parallel batching
│   ├── TVACacheService.js    # TVA cache loading, direct cache search, IndexedDB persistence
│   ├── IndexService.js       # Hierarchical category index, Web Worker + IndexedDB caching
│   ├── TokenService.js       # Extract creature info from D&D 5e actors (instance class with DI)
│   ├── StorageService.js     # IndexedDB/localStorage abstraction layer
│   ├── ScanService.js        # Directory scanning (fallback when TVA unavailable)
│   └── ForgeBazaarService.js # Forge Bazaar API stub (non-functional, placeholder)
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
tools/                   # CI/CD logic — plain Node, unit-tested, no YAML branching
├── validate-manifest.mjs    # npm run validate: manifest, runtime assets, i18n, parity
├── bump-version.mjs         # Version bump + CHANGELOG promotion (exports pure helpers)
├── publish-foundry.mjs      # Foundry package registry announcement
├── check-foundry-version.mjs # Newest Foundry generation vs compatibility.verified
└── dependabot-triage.mjs    # merge/hold decision per Dependabot PR
.github/
├── dependabot.yml       # Weekly grouped updates: actions + npm dev deps
└── workflows/           # ci · release · foundry-compat · dependabot-auto-merge
tests/
├── core/ services/ integration/ helpers/ setup/   # Module suite
└── tools/               # CI tooling suite (bump, triage, manifest validation)
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

### Worker Code Duplication

Web Workers can't share ES module imports with the main thread, so several functions are duplicated between `Utils.js` and `IndexWorker.js`:

- `loadFuse()` / `_validateFuseShape()` — CDN loading + shape validation
- `CDN_SEGMENTS` / `isExcludedPath()` — path filtering

Each duplicated function has a `SYNC: Keep in sync with ...` JSDoc marker. When modifying one copy, search for the marker and update both.

## 🔄 Version Management

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

## 🎛️ Localization

Files in `lang/en.json` and `lang/it.json`. All UI strings use `TOKEN_REPLACER_FA.*` namespace.

## 📦 Known Constraints

- Index caching uses IndexedDB (primary) with localStorage fallback (~4.5MB limit)
- D&D 5e system only (creature type extraction is system-specific)
- ForgeBazaarService is a non-functional stub (no public Forge API exists)
- Fuse.js loaded from jsdelivr CDN (post-load shape validation guards against compromise, but not SRI)
- StorageService sanitizes all loaded data (`_sanitizeData` + `_jsonReviver`) but has no schema validation
- IndexedDB `DB_VERSION = 1` with versioned migration handler — add new `case` blocks in `openDatabase()` for future schema changes
