# Phase 9: Type Safety - Research

**Researched:** 2026-03-06
**Domain:** JSDoc type annotations, TypeScript checkJs, fvtt-types declaration merging
**Confidence:** HIGH

## Summary

Phase 9 adds type safety to a JavaScript codebase that already has `jsconfig.json` with `checkJs: true` and `fvtt-types` installed. The current `tsc --noEmit` reports 97 errors. The goal is zero errors on service files by: (1) adding JSDoc `@typedef` definitions for shared data structures, (2) annotating all public service methods with `@param`/`@returns`, (3) creating a `settings.d.ts` for declaration merging with fvtt-types `SettingConfig`, and (4) fixing type errors through proper type annotations and `@ts-expect-error` suppressions where fvtt-types gaps exist.

The errors fall into clear categories: 13 are `"token-replacer-fa"` not assignable to `"core"` (fixed by `SettingConfig` declaration merging), 4 are `.api` not existing on module type (fixed by `ModuleConfig` declaration merging), 7 are D&D 5e `actor.system.details` (fixed by type assertions since fvtt-types uses `UnknownSystem` for unregistered systems), 3 are async `Promise` return type issues (fixed by correcting JSDoc `@returns` annotations), and the remainder are DOM type narrowing and Window property issues (fixed by casts or global declarations).

**Primary recommendation:** Create a `scripts/types/` directory with `.d.ts` files for declaration merging (SettingConfig, ModuleConfig, Window globals), add JSDoc `@typedef` blocks in a central `scripts/types/typedefs.js` file, then systematically annotate service public methods and fix remaining type errors file by file.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| TYPE-01 | jsconfig.json configured with allowJs, checkJs, noEmit | Already exists and working; needs typecheck script to remove `\|\| true` so failures are real |
| TYPE-02 | JSDoc @typedef definitions for all service interfaces and data structures | Create typedefs for CreatureInfo, TokenMatch, IndexedCache, ModuleError in central file |
| TYPE-03 | JSDoc @param and @returns annotations on all public service methods | 5 service classes need annotation; many already have partial JSDoc |
| TYPE-04 | tsc --noEmit script validates type correctness without producing output | Remove `\|\| true` from package.json typecheck script; fix 97 errors to reach zero |
| TYPE-05 | foundry-vtt-types integrated for Foundry API type definitions | Already installed (v13.346.0-beta); needs SettingConfig + ModuleConfig declaration merging to resolve errors |
| TYPE-06 | ClientSettings.Values declaration merging for typed settings access | Create settings.d.ts with SettingConfig interface declaring all 10 module settings |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| typescript | ^5.9.3 | Type checker via tsc --noEmit | Already installed; checkJs mode for JS projects |
| @league-of-foundry-developers/foundry-vtt-types | ^13.346.0-beta | Foundry API type definitions | Already installed; provides global types for game, canvas, Hooks etc. |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| (none needed) | - | All dependencies already installed | - |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| JSDoc typedefs | Full TypeScript migration | Explicitly out of scope (ADV-04/ADV-05), requires build step |
| Central typedef file | Inline typedefs per file | Central file is DRY and easier to maintain |

**Installation:** No new packages needed. All dependencies already in devDependencies.

## Architecture Patterns

### Recommended Project Structure
```
scripts/
├── types/
│   ├── settings.d.ts    # SettingConfig declaration merging (TYPE-06)
│   ├── modules.d.ts     # ModuleConfig for token-variants API (fixes .api errors)
│   ├── globals.d.ts     # Window augmentation (Fuse, TVA, TokenReplacerFA, forge)
│   └── typedefs.js      # JSDoc @typedef definitions (TYPE-02), imported by services
├── core/
│   ├── Constants.js
│   └── Utils.js
├── services/
│   ├── SearchOrchestrator.js  # Annotate public methods
│   ├── TokenService.js        # Annotate + fix D&D 5e system.details casts
│   ├── TVACacheService.js     # Annotate + fix Promise return types
│   ├── IndexService.js        # Annotate public methods
│   └── StorageService.js      # Annotate + fix EventTarget.result cast
└── ...
```

### Pattern 1: SettingConfig Declaration Merging
**What:** Extend the global `SettingConfig` interface so fvtt-types knows about module settings
**When to use:** Any Foundry module that calls `game.settings.register()` / `game.settings.get()`
**Example:**
```typescript
// scripts/types/settings.d.ts
// Source: fvtt-types configuration.d.mts SettingConfig interface

interface SettingConfig {
  "token-replacer-fa.fuzzyThreshold": number;
  "token-replacer-fa.searchPriority": string;
  "token-replacer-fa.autoReplace": boolean;
  "token-replacer-fa.confirmReplace": boolean;
  "token-replacer-fa.fallbackFullSearch": boolean;
  "token-replacer-fa.additionalPaths": string;
  "token-replacer-fa.useTVACache": boolean;
  "token-replacer-fa.refreshTVACache": boolean;
  "token-replacer-fa.indexUpdateFrequency": string;
  "token-replacer-fa.debugMode": boolean;
}
```
This resolves all 13 `"token-replacer-fa" not assignable to "core"` errors.

### Pattern 2: ModuleConfig Declaration Merging
**What:** Extend the global `ModuleConfig` interface so fvtt-types knows about TVA's API
**When to use:** When accessing `game.modules.get("module-id")?.api`
**Example:**
```typescript
// scripts/types/modules.d.ts
// Source: fvtt-types configuration.d.mts ModuleConfig interface

interface ModuleConfig {
  "token-variants": {
    api: {
      cacheBypass: string[];
      doImageSearch: (name: string, options?: Record<string, unknown>) => Promise<unknown[]>;
      [key: string]: unknown;
    };
  };
}
```
This resolves all 4 `.api not existing on module type` errors.

### Pattern 3: Window Global Augmentation
**What:** Declare properties that exist on `window` at runtime but TypeScript does not know about
**When to use:** For `window.Fuse`, `window.TVA`, `window.TokenReplacerFA`, `game.forge`
**Example:**
```typescript
// scripts/types/globals.d.ts
interface Window {
  Fuse?: typeof import("fuse.js").default;
  TVA?: { debug: boolean; [key: string]: unknown };
  TokenReplacerFA?: Record<string, unknown>;
}
```

### Pattern 4: JSDoc @typedef in Separate File
**What:** Central file with `@typedef` JSDoc blocks that services import for type references
**When to use:** For shared data structures used across multiple files
**Example:**
```javascript
// scripts/types/typedefs.js
// This file is imported by services that need these types

/**
 * @typedef {Object} CreatureInfo
 * @property {string} tokenId - Foundry token ID
 * @property {string} tokenName - Token display name
 * @property {string} actorName - Actor name
 * @property {string} creatureType - D&D 5e creature type (e.g., "humanoid")
 * @property {string} creatureSubtype - Creature subtype (e.g., "human")
 * @property {string} currentImage - Current token image path
 */

/**
 * @typedef {Object} TokenMatch
 * @property {string} path - File path to token image
 * @property {string} name - Display name for the match
 * @property {string} category - Creature category
 * @property {number} [score] - Fuzzy match score (0-1, lower is better)
 */

/**
 * @typedef {Object} IndexedCache
 * @property {number} version - Index version number
 * @property {number} timestamp - Build timestamp
 * @property {number} lastUpdate - Last update timestamp
 * @property {Object<string, Object<string, Array<{path: string, name: string}>>>} categories - Hierarchical category index
 * @property {Object<string, {name: string, category: string, subcategories: string[]}>} allPaths - Path lookup map
 * @property {Object<string, string[]>} termIndex - Term to paths lookup
 */

/**
 * @typedef {Object} ModuleError
 * @property {string} errorType - Error category (e.g., "tva_cache", "index", "unknown")
 * @property {string} message - User-facing error message (localized)
 * @property {string} [details] - Technical details for debugging
 * @property {string[]} [recoverySuggestions] - Actionable recovery steps
 */
```

### Pattern 5: D&D 5e System Type Assertions
**What:** Use `@ts-expect-error` or type casts for D&D 5e-specific `actor.system.details` access
**When to use:** fvtt-types uses `UnknownSystem` for unregistered game systems; D&D 5e actor data shape is not typed
**Example:**
```javascript
// In TokenService.js - accessing D&D 5e actor.system.details
/** @type {any} */
const system = actor.system;
const creatureType = system.details?.type?.value;
```
This resolves all 7 `details not existing on UnknownSystem` errors. The `any` cast is appropriate because this module is D&D 5e-only and the system data shape is not typed by fvtt-types.

### Pattern 6: Async Return Type Fix
**What:** Fix `@returns` JSDoc to use `Promise<Type>` instead of bare `Type` for async methods
**When to use:** When tsc reports TS1064 about async function return types
**Example:**
```javascript
// WRONG: causes TS1064
/** @returns {any[]} */
async function search() { ... }

// RIGHT: wrap in Promise
/** @returns {Promise<any[]>} */
async function search() { ... }
```

### Anti-Patterns to Avoid
- **Blanket @ts-ignore:** Never use `@ts-ignore` without explanation; use `@ts-expect-error` with a comment explaining WHY
- **Overly complex generics in JSDoc:** Keep typedefs simple. JSDoc generics are awkward; prefer concrete types
- **Typedef duplication:** Do NOT duplicate typedef definitions across files. Import from the central typedefs.js
- **Typing UIManager.js:** Out of scope for this phase. UIManager has 51 errors (mostly DOM type narrowing) and is NOT a service file. Focus on the 5 required services + core files only

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Foundry API types | Custom .d.ts for game/canvas/Hooks | fvtt-types (already installed) | 1000+ types already defined |
| Settings type safety | Runtime type checking | SettingConfig declaration merging | Compile-time safety, zero runtime cost |
| Module API types | Inline type assertions everywhere | ModuleConfig declaration merging | Single declaration, fixes all call sites |

## Common Pitfalls

### Pitfall 1: jsconfig.json include must cover .d.ts files
**What goes wrong:** Declaration merging `.d.ts` files are not picked up by tsc
**Why it happens:** Current `include` only has `"scripts/**/*.js"` - no `.d.ts` glob
**How to avoid:** Add `"scripts/**/*.d.ts"` to `include` array in jsconfig.json
**Warning signs:** Settings errors persist after creating settings.d.ts

### Pitfall 2: fvtt-types beta has incomplete coverage
**What goes wrong:** Some Foundry v13 APIs are not typed (e.g., `getSceneControlButtons` hook is commented out, `game.forge` does not exist)
**Why it happens:** fvtt-types v13 is still beta; gaps are expected
**How to avoid:** Use `@ts-expect-error` with comment for known fvtt-types gaps. Do NOT try to fix fvtt-types itself
**Warning signs:** Errors on valid Foundry API calls that work at runtime

### Pitfall 3: checkJs + strict: false means some errors are hidden
**What goes wrong:** Assuming zero tsc errors means fully type-safe code
**Why it happens:** With `strict: false`, many potential issues (implicit any, null checks) are not flagged
**How to avoid:** Accept this as intentional (requirement says strict is out of scope, ADV-05). Focus on what IS flagged
**Warning signs:** None; this is the correct approach for this project

### Pitfall 4: typecheck script has `|| true` - errors are swallowed
**What goes wrong:** CI never fails on type errors because script always exits 0
**Why it happens:** Added in Phase 1 when 128 errors existed and typecheck was informational
**How to avoid:** Remove `|| true` from package.json typecheck script AFTER fixing all errors
**Warning signs:** CI passes despite type errors

### Pitfall 5: Circular typedef imports
**What goes wrong:** Importing typedefs.js from a service that typedefs.js also imports
**Why it happens:** typedefs.js is a new file; must be import-safe (no side effects, no circular deps)
**How to avoid:** typedefs.js should ONLY contain typedefs and no imports from service files. It can import from Constants.js (pure data) if needed
**Warning signs:** Module initialization errors, undefined imports

### Pitfall 6: IndexWorker.js runs in Worker scope, not Window scope
**What goes wrong:** Type declarations for `Window` properties do not apply in Worker context
**Why it happens:** Web Workers have `self` (WorkerGlobalScope), not `window`
**How to avoid:** IndexWorker.js has only 1 error (TS2351, constructing Function). Use `@ts-expect-error` for the Worker file. The Worker file is NOT in scope for the service annotations requirement
**Warning signs:** Worker-specific errors after fixing Window declarations

## Code Examples

### settings.d.ts - Complete Declaration Merging File
```typescript
// scripts/types/settings.d.ts
// Declaration merging for fvtt-types SettingConfig
// Maps "namespace.key" to the setting's value type

interface SettingConfig {
  "token-replacer-fa.fuzzyThreshold": number;
  "token-replacer-fa.searchPriority": "faNexus" | "forgeBazaar" | "both";
  "token-replacer-fa.autoReplace": boolean;
  "token-replacer-fa.confirmReplace": boolean;
  "token-replacer-fa.fallbackFullSearch": boolean;
  "token-replacer-fa.additionalPaths": string;
  "token-replacer-fa.useTVACache": boolean;
  "token-replacer-fa.refreshTVACache": boolean;
  "token-replacer-fa.indexUpdateFrequency": "daily" | "weekly" | "monthly" | "quarterly";
  "token-replacer-fa.debugMode": boolean;
}
```

### modules.d.ts - TVA Module API Types
```typescript
// scripts/types/modules.d.ts
// Declaration merging for TVA module API

interface ModuleConfig {
  "token-variants": {
    api: {
      cacheBypass: string[];
      doImageSearch: (name: string, options?: Record<string, unknown>) => Promise<unknown[]>;
      [key: string]: unknown;
    };
  };
}
```

### globals.d.ts - Window/Global Augmentations
```typescript
// scripts/types/globals.d.ts
// Global type augmentations for runtime properties

interface Window {
  Fuse?: new <T>(list: T[], options?: Record<string, unknown>) => {
    search: (pattern: string) => Array<{ item: T; score?: number }>;
  };
  TVA?: { debug: boolean; [key: string]: unknown };
  TokenReplacerFA?: Record<string, unknown>;
}

// Forge VTT platform extension
declare namespace foundry {
  interface Game {
    forge?: {
      bazaar?: {
        packages?: Record<string, unknown>;
      };
      [key: string]: unknown;
    };
  }
}
```

### AssumeHookRan Configuration
```typescript
// In globals.d.ts or a separate file
// Tells fvtt-types to assume hooks have run, simplifying game type
declare module "fvtt-types/configuration" {
  interface AssumeHookRan {
    init: true;
  }
}
```
Note: This may or may not work with the `.mts` module format of fvtt-types. Test and fall back to `@ts-expect-error` on specific `game` access if needed.

### Service Method Annotation Example
```javascript
// TokenService.js - annotated public method
/**
 * Extract creature information from a token
 * @param {object} token - Foundry VTT token document
 * @param {object} [token.actor] - Associated actor
 * @param {string} [token.id] - Token ID
 * @param {string} [token.name] - Token display name
 * @returns {import('../types/typedefs.js').CreatureInfo | null} Creature info or null
 */
extractCreatureInfo(token) { ... }
```

### EventTarget.result Cast
```javascript
// StorageService.js - fix TS2339 on event.target.result
/** @type {IDBRequest} */
const request = event.target;
const result = request.result;
```

## Error Breakdown by Fix Strategy

### Strategy A: SettingConfig Declaration Merging (13 errors)
All `"token-replacer-fa" not assignable to "core"` errors in main.js, Utils.js, ScanService.js.
**Fix:** Create `scripts/types/settings.d.ts` with SettingConfig interface.

### Strategy B: ModuleConfig Declaration Merging (4 errors)
All `.api not existing on module type` in IndexService.js, ScanService.js, TVACacheService.js.
**Fix:** Create `scripts/types/modules.d.ts` with ModuleConfig interface.

### Strategy C: Window/Global Augmentation (5 errors)
`window.Fuse` (2), `window.TVA` (2), `window.TokenReplacerFA` (1).
**Fix:** Create `scripts/types/globals.d.ts` with Window interface.

### Strategy D: D&D 5e System Casts (7+ errors in TokenService)
`actor.system.details` not on UnknownSystem, `texture.src`, `toLowerCase` on `never`.
**Fix:** Cast `actor.system` to `any` at access point with JSDoc `@type`.

### Strategy E: Promise Return Type (3 errors in TVACacheService)
Async functions with `@returns {any[]}` instead of `@returns {Promise<any[]>}`.
**Fix:** Correct JSDoc `@returns` annotations.

### Strategy F: Remaining Fixes (misc)
- `StorageService.js`: Cast `event.target` to `IDBRequest` (1 error)
- `SearchOrchestrator.js`: `new this._FuseClass()` not constructable (1 error) - cast or `@ts-expect-error`
- `ForgeBazaarService.js`: `game.forge` not on Game (1 error) - `@ts-expect-error` (Forge platform-specific)
- `ScanService.js`: `.split` not on Setting (1 error) - cast setting value
- `IndexWorker.js`: Function not constructable (1 error) - `@ts-expect-error`

### Strategy G: Out of Scope (51 errors in UIManager.js, 14 in main.js hooks)
UIManager has DOM type narrowing issues (Element vs HTMLElement, `.value`, `.style`, `.dataset`).
main.js has hook registration errors (`getSceneControlButtons` not in HookConfig).
**These are NOT in the phase scope.** The success criteria only mention service files. These should be suppressed or excluded.

## Scope Decision: jsconfig.json include

Current: `"include": ["scripts/**/*.js"]`

**Option A (recommended):** Keep include as-is, add `"scripts/**/*.d.ts"` for declaration files. This means ALL .js files are checked including UIManager.js and main.js. Those 65 errors must be addressed (most via `@ts-expect-error`).

**Option B:** Narrow include to only service files: `"scripts/services/**/*.js", "scripts/core/**/*.js", "scripts/types/**/*"`. This misses main.js and UIManager.js but those aren't in the success criteria. However, this would mean typecheck no longer covers the full codebase.

**Recommendation:** Option A. Fix service file errors properly, suppress main.js and UIManager.js errors with targeted `@ts-expect-error` where fvtt-types gaps exist. The requirement says "zero errors" from `tsc --noEmit`, which means ALL files in include must pass.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `|| true` in typecheck script | Real exit code from tsc | This phase | CI catches type regressions |
| No JSDoc types | @typedef + @param/@returns | This phase | IDE autocomplete, refactoring safety |
| Bare `game.settings.get()` | Declaration-merged typed settings | This phase | Settings access returns specific types |

## Open Questions

1. **AssumeHookRan with .mts fvtt-types**
   - What we know: fvtt-types uses `.mts` modules; declaration merging pattern shows `declare module "fvtt-types/configuration"`
   - What's unclear: Whether this works from a `.d.ts` file in a JS project with jsconfig.json (not tsconfig.json)
   - Recommendation: Try it; fall back to casting `game` as needed. The `game` type union (`UninitializedGame | ReadyGame`) causes the `forge` error but most game access is already fine

2. **UIManager.js Error Suppression Volume**
   - What we know: 51 errors in UIManager.js, mostly DOM type narrowing (Element vs HTMLElement)
   - What's unclear: Whether bulk `@ts-expect-error` is acceptable or if UIManager should be excluded
   - Recommendation: Add `// @ts-nocheck` at the top of UIManager.js as a pragmatic choice. It is not a service file and full DOM typing is a large effort with no immediate value. Same for IndexWorker.js if needed

3. **game.forge Property**
   - What we know: The Forge VTT platform adds `game.forge` at runtime; fvtt-types does not type this
   - What's unclear: Whether augmenting the Game type via declaration merging is possible with fvtt-types' complex type hierarchy
   - Recommendation: Use `@ts-expect-error` on the single ForgeBazaarService.js line. ForgeBazaarService is a stub anyway

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest ^3.2.4 |
| Config file | vitest.config.js |
| Quick run command | `npx vitest run --passWithNoTests` |
| Full suite command | `npx vitest run && npx tsc --noEmit --project jsconfig.json` |

### Phase Requirements to Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| TYPE-01 | jsconfig.json exists with correct options | manual-only | Verify file contents | N/A |
| TYPE-02 | @typedef definitions exist and are used | smoke | `npx tsc --noEmit --project jsconfig.json` (zero errors) | N/A |
| TYPE-03 | Public methods have @param/@returns | smoke | `npx tsc --noEmit --project jsconfig.json` (zero errors) | N/A |
| TYPE-04 | tsc --noEmit validates types | smoke | `npm run typecheck` exits 0 | N/A |
| TYPE-05 | fvtt-types integrated | smoke | `npx tsc --noEmit --project jsconfig.json` (zero errors) | N/A |
| TYPE-06 | SettingConfig declaration merging | smoke | `npx tsc --noEmit --project jsconfig.json` (zero settings errors) | N/A |

### Sampling Rate
- **Per task commit:** `npx tsc --noEmit --project jsconfig.json 2>&1 | grep "error TS" | wc -l` (count should decrease toward 0)
- **Per wave merge:** `npm run typecheck` (must exit 0)
- **Phase gate:** `npm run typecheck && npx vitest run` both green

### Wave 0 Gaps
- [ ] `scripts/types/settings.d.ts` -- covers TYPE-06
- [ ] `scripts/types/modules.d.ts` -- covers TYPE-05 (ModuleConfig merging)
- [ ] `scripts/types/globals.d.ts` -- covers TYPE-05 (Window augmentation)
- [ ] `scripts/types/typedefs.js` -- covers TYPE-02
- [ ] Update `jsconfig.json` include to cover `.d.ts` files
- [ ] Remove `|| true` from typecheck script in package.json -- covers TYPE-04

## Sources

### Primary (HIGH confidence)
- fvtt-types source code (node_modules/@league-of-foundry-developers/foundry-vtt-types) - SettingConfig, ModuleConfig, HookConfig interfaces verified directly
- `tsc --noEmit` output - 97 errors categorized by file and error code
- Existing codebase - jsconfig.json, package.json, all service files examined

### Secondary (MEDIUM confidence)
- fvtt-types README.md - declaration merging patterns for SettingConfig and ModuleConfig

### Tertiary (LOW confidence)
- AssumeHookRan with jsconfig.json (untested in this project's setup)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - all packages already installed, versions verified
- Architecture: HIGH - declaration merging patterns verified in fvtt-types source code
- Pitfalls: HIGH - all 97 errors categorized, fix strategies verified against fvtt-types type definitions
- Error fix strategies: HIGH for A-F (30 service/core errors with clear fixes), MEDIUM for G (65 UI/main errors may need @ts-nocheck)

**Research date:** 2026-03-06
**Valid until:** 2026-04-06 (stable; fvtt-types beta may update but patterns are established)
