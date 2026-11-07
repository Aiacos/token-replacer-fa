# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 🧠 Project Overview

Token Replacer FA is a Foundry VTT module that automatically replaces NPC token artwork with matching tokens from Forgotten Adventures and The Forge Bazaar. It requires Token Variant Art (TVA) module and optionally uses FA Nexus.

**Module ID:** `token-replacer-fa`
**Version:** 2.13.0
**System:** D&D 5e only
**Foundry VTT:** v13+ (verified v14)

## 📜 Constitution

These principles are binding for every change in this repository, human or agent
authored. They override convenience: when a shortcut conflicts with an article
below, the article wins. Each article ends with the check that enforces it —
a principle nothing verifies is a wish, not a rule.

**The one command:** `npm run check` runs lint → format → typecheck → validate →
tests (~10s). It is the gate for Articles I–V. The versioned pre-commit hook runs
it before every commit (Article IX.7); `npm run fix` repairs what is mechanically
repairable.

### Article I — 🧹 Code quality

1. New code matches the idiom of the file it lands in: naming, comment density,
   error handling, import order. Consistency beats personal preference.
2. No silent failures. Every `catch` either recovers meaningfully or logs —
   `console.warn`/`console.debug` at minimum. `_debugLog()` alone is not enough:
   it is off for users, so a swallowed error is invisible in production.
3. Comments explain _why_, never _what_. Code that needs a "what" comment gets
   rewritten instead.
4. Duplicated logic carries a `SYNC: Keep in sync with <path>` marker. This is
   mandatory for the main-thread ↔ `IndexWorker.js` pairs (`FuseLoader.load` ↔
   `loadFuse`, `_validateFuseShape`, `CDN_SEGMENTS`, `PathFilter.isExcluded` ↔
   `isExcludedPath`), which cannot share imports across the worker boundary.
5. Dead code is deleted, not commented out. Git remembers.
6. Simplicity, quality, correctness, security, readability and maintainability
   come before cleverness and delivery speed. Simplicity works inside Article XII:
   the simplest correct and secure design that is object-oriented and names its
   pattern; correctness and security are never traded for the rest.
7. Everything crossing a trust boundary is untrusted until validated: TVA cache
   contents, file paths, CDN code, persisted data. Secrets never enter the
   repository. `SECURITY.md` records the resulting guarantees and known limits.
8. **Enforced by:** `npm run lint`, `npm run format:check`, `npm run typecheck`,
   and review for 6–7.

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
6. Coverage may not regress. Baseline at the time of writing: **59% lines**.
   `npm run test:coverage` reports it.
7. A test must be able to fail. See it fail against the broken or reverted code
   before trusting it; one that passes whatever the code does is not coverage,
   however much it lifts the numbers.
8. Critical workflows — token replacement, index build, cache load, search and
   release — have automated tests for their success and their failure cases.
9. **Enforced by:** `npm test`, `npm run test:coverage`, CI on Node 20 and 22.

### Article III — 🎛️ User experience consistency

1. Every user-visible string goes through `lang/en.json` and is mirrored in
   `lang/it.json`. Hardcoded English in a template, a dialog or a notification
   is a defect. The one exception is a fallback for the window before
   `game.i18n` exists, and it must be _declared_ with `localizer.orEnglish(key,
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
6. The same interaction behaves the same everywhere: dialogs, controls, feedback
   and error handling follow one pattern across every interface.
7. **Enforced by:** `npm run validate` — i18n keys used vs. defined, translation
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
7. Performance requirements are numbers against a named workload (images indexed,
   tokens processed), not adjectives. Optimize only a bottleneck a measurement has
   identified, and never at the expense of correctness or maintainability.
8. **Enforced by:** review + the timing logs in `IndexService`.

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
6. Every failure follows one path: reproduce it with an automated check, find the
   root cause before changing code, verify the fix against that reproduction, then
   keep a test or validator rule so the same class of failure cannot recur.
7. **Enforced by:** `npm run validate`, `tests/tools/*.test.js`.

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
6. SDKs, libraries and APIs are checked against their official documentation
   before integration, never against memory or a blog post. Record the version
   verified, its constraints and the decision taken next to the code that uses it.

### Article VII — 📚 Technical & user documentation

1. Docs ship in the same commit as the behaviour they describe. A merged feature
   with stale docs is an unfinished feature.
2. Division of labour, and it is strict:
   - `README.md` — for **users**: what it does, how to install, how to use, how
     to troubleshoot.
   - `CONTRIBUTING.md` — for **contributors**: setup, conventions, tests, PRs.
   - `CLAUDE.md` — for **agents**: architecture, invariants, constraints.
   - `CHANGELOG.md` — Keep a Changelog format; every user-visible change lands
     under `## [Unreleased]` as it is made, not at release time.
   - `TODO.md` — open work only, as a checklist with references; finished items
     are removed, because the changelog and git already remember them.
   - `SECURITY.md` — how to report a vulnerability, what is supported, the
     guarantees and known limits. Never an unfixed exploit's details.
3. Architectural decisions with a non-obvious rationale are written down where
   the reader will hit them (the CDN path filtering, the worker/main-thread
   duplication, the ForgeBazaar stub).
4. Every documented command must actually run. If a doc says `npm run x`, `x`
   exists in `package.json`.
5. Documentation describes what the code does today: implementation,
   configuration, workflows and known limitations. Keep `TODO.md`, `SECURITY.md`
   and `CHANGELOG.md` concise and easy to update, each to its own purpose.

### Article VIII — 🧹 Repository hygiene

1. The repository root holds only what a user or contributor needs. Agent scratch
   output, scan reports and session state do not belong in version control.
2. One document per subject. Overlapping status files are consolidated or
   deleted, not accumulated.
3. Build artifacts (`releases/`, `coverage/`, `node_modules/`) are ignored, never
   committed.
4. `module.json` is the single source of truth for the version; `sync-version.sh`
   propagates it. Never hand-edit a version anywhere else.
5. Any file added to the root must be justified in the PR description.
6. Cleanup is routine, not an event: find and remove dead code, unused
   dependencies, obsolete files and redundant implementations, then show with
   `npm run check` that expected behaviour survived.

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
7. Every commit passes formatting, lint, type checks and tests first, without
   anyone having to remember: `.githooks/pre-commit` runs `npm run check`, and
   `npm install` activates it. Fix the failure; `--no-verify` is not a way out.
   The module has no compile step, and the package build is proven by CI.
8. A change that fails the gate reaches neither `main` nor a release. Checks must
   be able to catch real faults; one that cannot fail is removed or repaired.

### Article X — 🤖 Proper use of subagents and agent tooling

1. Delegate for **breadth**, not for thinking. Sweeping many files for a pattern
   is a subagent task; a design decision, a security judgement, or the final
   verdict on a diff is not.
2. Spawn a subagent when the search would flood the main context with file dumps
   and only the conclusion matters. For a known file or symbol, read it directly.
3. Independent subagents are launched in one batch so they run in parallel; one
   agent per file is over-spawning.
4. Give each subagent a clearly bounded task with explicit responsibilities,
   sufficient context, a deliverable and a stopping condition. "Look around"
   wastes a whole context window.
5. Subagent output is evidence, never authority. Verify claims against the code
   before acting on them, and never let a subagent report stand in for a passing
   `npm run check`.
6. Use the Superpowers and Impeccable plugins and skills wherever they are
   available and fit the task: Superpowers for process (planning, debugging,
   test-driven development, verification), Impeccable for templates and styles.

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
   | 🎛️   | User experience, localization          |
   | 🔒   | Security                               |
   | 🤖   | Subagents, agent tooling               |
   | 🎨   | Iconography, visual consistency        |

2. One icon per heading, at the start, on `##`/`###` chapter headings only. Never
   inside body text, never two in a row, never decorative.
3. A concept that is not in the table either reuses the closest entry or the
   table gains a row — in the same commit. The vocabulary does not fork.
4. Icons never carry meaning on their own: strip every icon and the document
   must read exactly the same. They are navigation aids, not content.
5. The rule covers every document, `TODO.md` and `SECURITY.md` included: a section
   about the same concept carries the same icon wherever it appears.

### Article XII — 🧠 Architecture & design

1. Plan before implementing. Anything beyond a local fix starts from a stated
   design: responsibilities, data flow, failure modes, and the class that owns it.
2. Object-oriented design is mandatory for runtime code under `scripts/`. Every
   responsibility lives in a class with one reason to change; module-level
   functions and mutable module state are not allowed, except the duplicated
   worker helpers that Article I.4 pins byte-for-byte. State that outlives a call
   (a cache, a worker, a listener set) is owned and encapsulated by an instance.
3. Design patterns are mandatory and deliberate. Each class names the pattern it
   applies and the problem it solves in its JSDoc (`@pattern Strategy — …`). The
   catalogue in use: Facade (`SearchService`), Strategy (search sources), Chain of
   Responsibility (TVA path sources), Repository (persisted index and cache),
   Command (worker messages), Observer (progress), Factory (errors, workers),
   Singleton (module-wide services), Value Object (filter queries).
4. Composition over inheritance; dependencies are injected through constructors,
   so every class is testable without Foundry globals. Inheritance is reserved for
   true is-a relations (`ModuleError extends Error`, Foundry base classes).
5. Well-written means efficient too: a pattern must not add a hot-path cost. No
   per-call allocation of strategies, no wrapper layers on the search loop, and
   Article IV's numbers hold after every structural change.
6. **Enforced by:** review, Article II.3 — a design that cannot be tested through
   its public behaviour goes back to the drawing board — and the `@pattern` tag on
   every exported class.

## 🎮 Development Commands

**One gate — the pre-commit hook runs it before every commit:**

```bash
npm run check      # lint → format:check → typecheck → validate → test  (~10s)
npm run fix        # prettier --write + eslint --fix
```

| Command                           | What it does                                            |
| --------------------------------- | ------------------------------------------------------- |
| `npm test`                        | Full Vitest suite (~1.6s)                               |
| `npm run test:watch`              | Watch mode                                              |
| `npm run test:coverage`           | Coverage report into `coverage/` (baseline ~59% lines)  |
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
│   ├── ModuleError.js   # Error subclass + factories: of(type, details, keys), cancelled()
│   ├── DebugLogger.js   # Opt-in debugMode logger; never throws before settings exist
│   ├── Settings.js      # Settings.defaultGetter(): lazy default for injected getSetting
│   ├── Localizer.js     # localizer singleton: cached localize(), declared orEnglish() fallback
│   ├── FuseLoader.js    # fuseLoader singleton: lazy CDN load + _validateFuseShape (SYNC)
│   ├── PathFilter.js    # pathFilter singleton: isExcluded() with memo cache (SYNC)
│   ├── TvaResultParser.js # Adapter: TVA result shapes → path / display name
│   ├── FilterQuery.js   # Immutable AND-of-terms match filter (value object)
│   ├── CreatureTerms.js # Subtype terms, generic-subtype test, result cache key
│   ├── TemplateRenderer.js # templateRenderer singleton: facade over Foundry's template API
│   ├── HtmlSanitizer.js # escape() for innerHTML, sanitizePath() for scan paths
│   ├── Scheduler.js     # yieldToMain() for long main-thread loops
│   └── ManagedWorker.js # Worker lifecycle owner: ensure/post/teardown (not yet adopted)
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
├── install-hooks.mjs        # npm install: points git at the versioned .githooks/
└── dependabot-triage.mjs    # merge/hold decision per Dependabot PR
.github/
├── dependabot.yml       # Weekly grouped updates: actions + npm dev deps
└── workflows/           # ci · release · foundry-compat · dependabot-auto-merge
tests/
├── core/ services/ ui/ integration/ helpers/ setup/   # Module suite
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
- `HtmlSanitizer.escape()` is only used for dynamic HTML generation outside templates (e.g., `innerHTML` assignments in event handlers)

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
- Yields to its message queue every few thousand items, so a cancel can arrive mid-build
- Sends progress updates every 1000 items via `postMessage`
- Returns categorized index structure when complete

**IndexService** - Manages worker lifecycle and fallback

- Creates the worker lazily on first use (`_ensureWorker()`), never in the constructor
- Uses `indexPathsWithWorker()` when worker available (non-blocking)
- Falls back to `indexPathsDirectly()` with 10ms yields if worker unavailable
- Properly terminates worker with `terminate()` method

**Benefits:**

- Main thread remains completely responsive during large index builds
- Near full-speed processing in the worker: its rare yields carry no fixed delay
- Graceful fallback for browsers without Worker support

### Critical: CDN Path Handling

`PathFilter.isExcluded()` (and the worker's `isExcludedPath()`) must filter out CDN URL segments before checking EXCLUDED_FOLDERS:

```javascript
// Forge URLs: https://assets.forge-vtt.com/bazaar/assets/FA_Pack/...
// Must skip: 'https:', 'bazaar', 'assets' (CDN structure, not actual folders)
const cdnSegments = new Set(['https:', 'http:', '', 'bazaar', 'assets', 'modules', ...]);
```

**Note:** This CDN filtering logic exists in BOTH `core/PathFilter.js` (main thread) and IndexWorker.js (worker thread)

### Worker Code Duplication

Web Workers can't share ES module imports with the main thread, so several functions are duplicated between `scripts/core/` classes and `IndexWorker.js`:

- `FuseLoader.load()` ↔ `loadFuse()`, and `FuseLoader._validateFuseShape()` ↔ `_validateFuseShape()` — CDN loading + shape validation (`core/FuseLoader.js`)
- `CDN_SEGMENTS`, and `PathFilter.isExcluded()` ↔ `isExcludedPath()` — path filtering (`core/PathFilter.js`)
- `compileCategorizer()` / `categorizeWith()` — byte-identical between `IndexService.js` and the worker

The main-thread copies are methods because they own state (the Fuse constructor, the memo cache and precompiled patterns); the worker copies stay module functions and take their configuration as arguments. Each duplicate has a `SYNC: Keep in sync with ...` JSDoc marker, and `tests/core/worker-sync.test.js` fails when a marker goes missing or an identical pair drifts. When modifying one copy, search for the marker and update both.

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
