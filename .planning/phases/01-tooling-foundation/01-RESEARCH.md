# Phase 1: Tooling Foundation - Research

**Researched:** 2026-02-28
**Domain:** JavaScript dev tooling — Vitest, ESLint v10 flat config, Prettier, TypeScript (tsc --noEmit), fvtt-types
**Confidence:** HIGH (all versions verified via npm registry; configuration patterns verified via official docs)

---

<user_constraints>

## User Constraints (from CONTEXT.md)

### Locked Decisions

All tooling decisions delegated to Claude. The following constraints are derived from existing codebase conventions:

- **Formatting**: Match existing style — 2-space indentation, single quotes, semicolons, double quotes in templates
- **Test directory**: `tests/` mirror structure (e.g., `tests/core/Utils.test.js`, `tests/services/IndexService.test.js`) — keeps source clean
- **ESLint**: Start with `eslint:recommended` — avoid overly strict rules that would require reformatting the entire codebase
- **Package scope**: Dev dependencies only — no runtime dependencies added, no changes to module.json or build scripts
- **Package manager**: npm (standard, no preference expressed)
- **.gitignore**: Add `node_modules/` only — `.planning/` is tracked per config
- **Vitest environment**: jsdom (required for Foundry global mocking in Phase 2)
- **jsconfig.json**: `allowJs: true`, `checkJs: true`, `noEmit: true` — type checking without build step
- **fvtt-types**: Install as dev dependency for Foundry API type definitions

### Claude's Discretion

All tooling decisions not listed above.

### Deferred Ideas (OUT OF SCOPE)

None — discussion stayed within phase scope.
</user_constraints>

---

<phase_requirements>

## Phase Requirements

| ID      | Description                                                                           | Research Support                                                                         |
| ------- | ------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| TOOL-01 | Project has package.json with dev dependencies (Vitest, ESLint, Prettier, fvtt-types) | Package versions pinned; install command verified                                        |
| TOOL-02 | Vitest test runner configured with jsdom environment and working `npm test` command   | vitest.config.js pattern documented; jsdom package install confirmed                     |
| TOOL-03 | ESLint v9/v10 flat config with rules appropriate for Foundry VTT module development   | eslint.config.js pattern documented; Worker globals and Foundry globals handled          |
| TOOL-04 | Prettier formatting configured and integrated with ESLint                             | .prettierrc pattern documented; eslint-config-prettier flat config integration confirmed |

</phase_requirements>

---

## Summary

This phase bootstraps the developer tooling for a browser-only Foundry VTT module written in ES6 JavaScript (no build step, no TypeScript compilation). The goal is zero-error runs of four commands against the existing codebase: `npm test`, `npm run lint`, `npm run format:check`, and `npm run typecheck`. No tests need to exist yet — the runner must simply start and exit cleanly.

The standard approach is well-established: Vitest + jsdom for testing, ESLint v10 flat config for linting, Prettier for formatting (with eslint-config-prettier to eliminate rule conflicts), and `tsc --noEmit` via jsconfig.json for type checking. All four tools have stable, compatible current versions. The only notable complexity is ESLint configuration for the `scripts/workers/IndexWorker.js` file, which runs in a Web Worker context and needs `globals.dedicatedWorker` rather than `globals.browser`.

**Primary recommendation:** Install vitest@^3.2.4, eslint@^10.0.2, prettier@^3.8.1, typescript@^5.9.3, @league-of-foundry-developers/foundry-vtt-types as dev dependencies. Configure with flat eslint.config.js using `@eslint/js` recommended, globals package for browser/worker environments, and eslint-config-prettier last in array.

**Critical version note:** STATE.md references Vitest `^2.2.x` but that version range does not exist on npm (latest 2.x is `2.1.9`). Vitest 3.x (`^3.2.4`) is the correct stable choice — it has no jsdom compatibility issues (unlike Vitest 4.x which has active Blob constructor mismatch bugs). Use Vitest 3.x.

---

## Standard Stack

### Core

| Library                                         | Version                       | Purpose                                           | Why Standard                                                                                                                               |
| ----------------------------------------------- | ----------------------------- | ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| vitest                                          | ^3.2.4                        | Test runner with jsdom support                    | Vite-native, zero-config for ES modules, fast, actively maintained; 3.x is stable with no jsdom issues (4.x has active compatibility bugs) |
| jsdom                                           | ^28.1.0                       | Browser DOM simulation for Vitest                 | Required peer dependency when `environment: 'jsdom'` is set in Vitest config                                                               |
| eslint                                          | ^10.0.2                       | JavaScript linter                                 | Current stable; 10.x makes flat config mandatory, legacy .eslintrc removed                                                                 |
| @eslint/js                                      | ^10.0.1                       | Built-in ESLint recommended config                | Provides `js.configs.recommended` for flat config                                                                                          |
| globals                                         | ^17.3.0                       | Environment globals for ESLint flat config        | Replaces deprecated `env:` in .eslintrc; provides `globals.browser`, `globals.dedicatedWorker` etc.                                        |
| eslint-config-prettier                          | ^10.1.8                       | Disables ESLint rules that conflict with Prettier | Standard integration; use `/flat` import for ESLint 10 flat config                                                                         |
| prettier                                        | ^3.8.1                        | Opinionated code formatter                        | Industry standard; `--check` mode for CI/lint script                                                                                       |
| typescript                                      | ^5.9.3                        | Provides `tsc --noEmit` binary                    | No compilation, pure type-checking of JS via jsconfig.json                                                                                 |
| @league-of-foundry-developers/foundry-vtt-types | ^13.346.0-beta.20250812191140 | Foundry VTT API type definitions                  | Official community types; v13 support is in beta but functional for IDE support; `tsc --noEmit` type errors expected and acceptable        |

### Supporting

| Library             | Version | Purpose                | When to Use                                                                |
| ------------------- | ------- | ---------------------- | -------------------------------------------------------------------------- |
| @vitest/coverage-v8 | ^3.2.4  | Code coverage provider | Needed when coverage reports are added (Phase 3+); not required in Phase 1 |

### Alternatives Considered

| Instead of             | Could Use                            | Tradeoff                                                                                                                                          |
| ---------------------- | ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| vitest@^3.2.4          | vitest@^4.0.18                       | Vitest 4 has active jsdom Blob constructor mismatch bugs — avoid until resolved                                                                   |
| eslint@^10.0.2         | eslint@^9.39.3 (maintenance)         | ESLint 9 maintenance mode; ESLint 10 is identical config format with 3 additional recommended rules                                               |
| eslint-config-prettier | eslint-plugin-prettier               | Prettier docs explicitly recommend against eslint-plugin-prettier: "you end up with red squiggly lines, they are slower, unnecessary indirection" |
| typescript (tsc)       | @typescript-eslint/typescript-estree | tsc is the official checker; typescript-eslint is for linting only, not type verification                                                         |

**Installation:**

```bash
npm install --save-dev \
  vitest@^3.2.4 \
  jsdom@^28.1.0 \
  eslint@^10.0.2 \
  @eslint/js@^10.0.1 \
  globals@^17.3.0 \
  eslint-config-prettier@^10.1.8 \
  prettier@^3.8.1 \
  typescript@^5.9.3 \
  @league-of-foundry-developers/foundry-vtt-types@^13.346.0-beta.20250812191140
```

---

## Architecture Patterns

### Recommended Project Structure

```
token-replacer-fa/
├── package.json             # Dev dependencies + npm scripts
├── vitest.config.js         # Vitest: jsdom env, test dir, globals
├── eslint.config.js         # ESLint v10 flat config (NOT .eslintrc)
├── .prettierrc              # Prettier formatting rules
├── jsconfig.json            # TypeScript: allowJs + checkJs + noEmit
├── .gitignore               # Add node_modules/ (already has others)
├── scripts/                 # Source files (lint + typecheck target)
│   ├── core/
│   ├── services/
│   ├── workers/
│   │   └── IndexWorker.js   # Needs Worker globals, NOT browser globals
│   └── ui/
└── tests/                   # Mirror of scripts/ structure
    ├── core/
    └── services/
```

### Pattern 1: vitest.config.js (ES module)

**What:** Vitest configuration as ES module (matches `"type": "module"` if set, or use .mjs extension)
**When to use:** Always — Vitest 3.x requires a config file to set jsdom environment

```javascript
// vitest.config.js
// Source: https://vitest.dev/guide/environment
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
    include: ['tests/**/*.test.js'],
    testTimeout: 10000,
  },
});
```

**Critical note:** Because the existing codebase has no `"type": "module"` in package.json (none exists yet), `vitest.config.js` must either use CommonJS syntax OR add `"type": "module"` to package.json. Since all source files use `import`/`export` (ES module syntax), add `"type": "module"` to package.json. This is the standard approach for browser modules.

### Pattern 2: eslint.config.js (ESLint v10 flat config)

**What:** Flat config array replacing legacy .eslintrc — mandatory in ESLint 10
**When to use:** Always — .eslintrc is completely removed in ESLint 10

```javascript
// eslint.config.js
// Source: https://eslint.org/docs/latest/use/configure/configuration-files
import js from '@eslint/js';
import globals from 'globals';
import eslintConfigPrettier from 'eslint-config-prettier/flat';

export default [
  // Main source files: browser environment + ES2022
  {
    files: ['scripts/**/*.js'],
    ignores: ['scripts/workers/**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        ...globals.browser,
        // Foundry VTT globals (not in browser globals package)
        game: 'readonly',
        ui: 'readonly',
        canvas: 'readonly',
        Hooks: 'readonly',
        foundry: 'readonly',
        renderTemplate: 'readonly',
        loadTemplates: 'readonly',
        CONFIG: 'readonly',
        CONST: 'readonly',
        Dialog: 'readonly',
        FormApplication: 'readonly',
        Application: 'readonly',
      },
    },
    rules: {
      ...js.configs.recommended.rules,
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
    },
  },
  // Web Worker files: dedicatedWorker environment (NOT browser)
  {
    files: ['scripts/workers/**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        ...globals.dedicatedWorker,
      },
    },
    rules: {
      ...js.configs.recommended.rules,
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
    },
  },
  // Disable formatting rules (Prettier handles these)
  eslintConfigPrettier,
];
```

**Critical note for IndexWorker.js:** The Web Worker context does NOT have `window`, `document`, etc. It has `self`, `postMessage`, `importScripts`, `WorkerGlobalScope`. Using `globals.browser` on the worker file will cause false-positive `no-undef` errors. Use `globals.dedicatedWorker` instead.

### Pattern 3: .prettierrc

**What:** Prettier config matching existing codebase style
**When to use:** Always — Prettier needs explicit config to match project conventions

```json
{
  "singleQuote": true,
  "semi": true,
  "tabWidth": 2,
  "trailingComma": "es5",
  "printWidth": 100
}
```

**Note on template double quotes:** Handlebars templates (.hbs files) use double quotes for HTML attributes. This is not a Prettier concern — Prettier handles HTML/HBS separately and defaults to double quotes for HTML attributes regardless of `singleQuote` setting.

### Pattern 4: jsconfig.json

**What:** TypeScript compiler config for JS type checking — no build output
**When to use:** Always — `tsc --noEmit` requires a config file

```json
{
  "compilerOptions": {
    "allowJs": true,
    "checkJs": true,
    "noEmit": true,
    "target": "ES2022",
    "module": "ES2022",
    "moduleResolution": "bundler",
    "lib": ["ES2022", "DOM", "DOM.Iterable", "WebWorker"],
    "types": ["@league-of-foundry-developers/foundry-vtt-types"],
    "strict": false,
    "skipLibCheck": true
  },
  "include": ["scripts/**/*.js"],
  "exclude": ["node_modules", "releases"]
}
```

**Critical notes:**

- `strict: false` — with fvtt-types v13 beta, strict mode produces many false errors; acceptable per STATE.md flag
- `skipLibCheck: true` — fvtt-types v13 beta has known type definition gaps; this avoids false failures in lib types
- `lib: ["WebWorker"]` — includes `WorkerGlobalScope` and `DedicatedWorkerGlobalScope` types for IndexWorker.js
- Type errors from `tsc --noEmit` are **expected and acceptable** in Phase 1 — the runner just needs to not crash

### Pattern 5: package.json scripts

**What:** npm scripts that the phase requires
**When to use:** Always

```json
{
  "name": "token-replacer-fa",
  "version": "2.12.3",
  "description": "Foundry VTT module dev tooling",
  "type": "module",
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest",
    "lint": "eslint scripts/",
    "format": "prettier --write .",
    "format:check": "prettier --check .",
    "typecheck": "tsc --noEmit"
  },
  "devDependencies": {
    ...
  }
}
```

**Note:** `"type": "module"` enables ES module imports in config files (vitest.config.js, eslint.config.js) without renaming them to `.mjs`.

### Anti-Patterns to Avoid

- **Using .eslintrc.json**: Completely removed in ESLint 10. Will be silently ignored, not produce an error.
- **Using eslint-plugin-prettier**: Official Prettier docs say not to use it — creates red squiggly lines for every formatting issue, slower, unnecessary indirection.
- **Using Vitest 4.x**: Active jsdom Blob constructor mismatch bugs as of Feb 2026. Stick with 3.x.
- **Using `eslint --ext .js`**: Removed in ESLint 10 flat config; file patterns are configured via `files:` in the config array.
- **Using `globals.browser` for IndexWorker.js**: Web Workers don't have `window` or `document`. `globals.browser` will cause false `no-undef` errors for `self` and `postMessage`.
- **Setting `strict: true` in jsconfig.json**: With fvtt-types v13 beta, strict mode produces hundreds of false type errors. Phase 1 goal is runner works, not zero type errors.
- **Adding `"type": "module"` to module.json**: module.json is the Foundry manifest, not a Node.js package.json. Do not confuse them.

---

## Don't Hand-Roll

| Problem                          | Don't Build                  | Use Instead                                       | Why                                                                                                 |
| -------------------------------- | ---------------------------- | ------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Browser globals for ESLint       | Custom globals object        | `globals` npm package                             | globals package is maintained and comprehensive; CDN/browser/node/worker envs all covered           |
| Prettier/ESLint rule conflicts   | Manual rule disabling        | `eslint-config-prettier`                          | There are 40+ conflicting rules; config-prettier tracks them automatically across Prettier releases |
| Type definitions for Foundry API | Custom .d.ts files           | `@league-of-foundry-developers/foundry-vtt-types` | The community maintains thousands of lines of Foundry type declarations                             |
| Test environment setup           | Manual window/document mocks | jsdom package via Vitest `environment: 'jsdom'`   | jsdom is battle-tested; manual DOM mocking is hundreds of lines of fragile code                     |

**Key insight:** This phase is pure configuration — the entire value is selecting the right packages and wiring them together correctly. There is nothing to hand-roll.

---

## Common Pitfalls

### Pitfall 1: ESLint flat config lookup starts from linted file, not cwd (ESLint 10 change)

**What goes wrong:** In ESLint 10, the config lookup now starts from the directory of each linted file rather than cwd. If `eslint.config.js` is in the project root and you run `eslint scripts/`, it works correctly. But if the file structure is unusual, config resolution may differ from ESLint 9 behavior.
**Why it happens:** ESLint 10 changed lookup to improve monorepo support.
**How to avoid:** Keep `eslint.config.js` at project root. Run `eslint scripts/` with an explicit path.
**Warning signs:** ESLint runs but silently applies no rules (zero errors on obviously-broken code).

### Pitfall 2: Vitest 3.x requires explicit jsdom package install

**What goes wrong:** `npm test` crashes with "Cannot find module 'jsdom'" even after installing Vitest.
**Why it happens:** jsdom is a peer dependency in Vitest 3.x — it's not bundled with the `vitest` package itself.
**How to avoid:** Explicitly install `jsdom` as a dev dependency alongside `vitest`.
**Warning signs:** Error: `Error: Failed to load custom environment 'jsdom'` at test startup.

### Pitfall 3: package.json needs `"type": "module"` for ESM config files

**What goes wrong:** `eslint.config.js` or `vitest.config.js` crash with "require is not defined" or "Cannot use import statement".
**Why it happens:** Node.js defaults to CommonJS; `.js` files use `require()`. Without `"type": "module"`, Node treats config files as CommonJS.
**How to avoid:** Add `"type": "module"` to package.json, OR rename config files to `.mjs`. Using `"type": "module"` is simpler.
**Warning signs:** `SyntaxError: Cannot use import statement in a module` when running `eslint` or `vitest`.

### Pitfall 4: fvtt-types v13 is beta with known gaps

**What goes wrong:** `npm run typecheck` produces dozens of type errors from fvtt-types declarations themselves (not from your code).
**Why it happens:** fvtt-types v13 beta has incomplete type declarations and known bugs.
**How to avoid:** Use `skipLibCheck: true` in jsconfig.json. Phase 1 only requires the runner not to crash — type errors are expected and acceptable.
**Warning signs:** Hundreds of errors all pointing to files inside `node_modules/@league-of-foundry-developers/`.

### Pitfall 5: ESLint 10 adds three new recommended rules

**What goes wrong:** `npm run lint` produces new errors on existing code from `no-unassigned-vars`, `no-useless-assignment`, and `preserve-caught-error` rules.
**Why it happens:** ESLint 10's `js.configs.recommended` includes three rules not in ESLint 9's recommended set.
**How to avoid:** Review existing code for violations before finalizing the ESLint config. If any of these rules produce errors on the existing codebase, add them as `"warn"` instead of error in the config. The goal is zero errors, not zero warnings.
**Warning signs:** `npm run lint` produces errors on files that haven't been changed.

### Pitfall 6: IndexWorker.js uses Worker globals, not browser globals

**What goes wrong:** `npm run lint` on `scripts/workers/IndexWorker.js` reports `no-undef` errors for `self`, `postMessage`, etc.
**Why it happens:** Web Workers don't have `window` or `document`. `globals.browser` doesn't include `self` as the global scope object.
**How to avoid:** Apply `globals.dedicatedWorker` specifically to `scripts/workers/**/*.js` in a separate config block.
**Warning signs:** `'self' is not defined` or `'postMessage' is not defined` lint errors in IndexWorker.js.

### Pitfall 7: Prettier and HTML template files

**What goes wrong:** `npm run format:check` reports Prettier violations on `.hbs` template files that use double quotes (per HTML convention).
**Why it happens:** Prettier formats HTML with double quotes by default, which matches the templates. But if `singleQuote: true` affects HTML, it could reformat attributes.
**How to avoid:** Prettier's `singleQuote` option only applies to JS/TS strings, not HTML attributes. HTML attributes always use double quotes in Prettier. No special config needed.
**Warning signs:** `format:check` shows violations on `.hbs` files unexpectedly.

---

## Code Examples

Verified patterns from official sources:

### Minimal package.json for this project

```json
{
  "name": "token-replacer-fa",
  "version": "2.12.3",
  "type": "module",
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest",
    "lint": "eslint scripts/",
    "format": "prettier --write .",
    "format:check": "prettier --check .",
    "typecheck": "tsc --noEmit"
  },
  "devDependencies": {
    "@eslint/js": "^10.0.1",
    "@league-of-foundry-developers/foundry-vtt-types": "^13.346.0-beta.20250812191140",
    "eslint": "^10.0.2",
    "eslint-config-prettier": "^10.1.8",
    "globals": "^17.3.0",
    "jsdom": "^28.1.0",
    "prettier": "^3.8.1",
    "typescript": "^5.9.3",
    "vitest": "^3.2.4"
  }
}
```

### Vitest config with zero-test passing

```javascript
// vitest.config.js
// Source: https://vitest.dev/guide/environment
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
    include: ['tests/**/*.test.js'],
  },
});
```

Running `vitest run` with no test files in `tests/` prints "No test files found" and exits 0 (passes). This satisfies TOOL-02.

### ESLint config with Foundry + Worker globals

```javascript
// eslint.config.js
// Source: https://eslint.org/docs/latest/use/configure/configuration-files
import js from '@eslint/js';
import globals from 'globals';
import eslintConfigPrettier from 'eslint-config-prettier/flat';

// Foundry VTT global variables not in globals.browser
const foundryGlobals = {
  game: 'readonly',
  ui: 'readonly',
  canvas: 'readonly',
  Hooks: 'readonly',
  foundry: 'readonly',
  renderTemplate: 'readonly',
  loadTemplates: 'readonly',
  CONFIG: 'readonly',
  CONST: 'readonly',
  Dialog: 'readonly',
  FormApplication: 'readonly',
  Application: 'readonly',
  FilePicker: 'readonly',
  ChatMessage: 'readonly',
};

export default [
  {
    files: ['scripts/**/*.js'],
    ignores: ['scripts/workers/**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        ...globals.browser,
        ...foundryGlobals,
      },
    },
    rules: {
      ...js.configs.recommended.rules,
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
    },
  },
  {
    files: ['scripts/workers/**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        ...globals.dedicatedWorker,
        ...foundryGlobals,
      },
    },
    rules: {
      ...js.configs.recommended.rules,
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
    },
  },
  eslintConfigPrettier,
];
```

### .prettierrc matching existing code style

```json
{
  "singleQuote": true,
  "semi": true,
  "tabWidth": 2,
  "trailingComma": "es5",
  "printWidth": 100
}
```

### jsconfig.json for tsc --noEmit

```json
{
  "compilerOptions": {
    "allowJs": true,
    "checkJs": true,
    "noEmit": true,
    "target": "ES2022",
    "module": "ES2022",
    "moduleResolution": "bundler",
    "lib": ["ES2022", "DOM", "DOM.Iterable", "WebWorker"],
    "types": ["@league-of-foundry-developers/foundry-vtt-types"],
    "strict": false,
    "skipLibCheck": true
  },
  "include": ["scripts/**/*.js"],
  "exclude": ["node_modules", "releases"]
}
```

---

## State of the Art

| Old Approach                                       | Current Approach                                                             | When Changed                                       | Impact                                                               |
| -------------------------------------------------- | ---------------------------------------------------------------------------- | -------------------------------------------------- | -------------------------------------------------------------------- |
| .eslintrc.json / .eslintrc.js                      | eslint.config.js (flat config)                                               | ESLint 9 (2024), mandatory in ESLint 10 (Feb 2026) | .eslintrc files are silently ignored in ESLint 10                    |
| `env: { browser: true }` in .eslintrc              | `globals: { ...globals.browser }` in flat config                             | ESLint 9 flat config                               | env: key no longer exists in flat config                             |
| eslint-plugin-prettier (formatting as lint errors) | eslint-config-prettier (disable conflicting rules) + run Prettier separately | Prettier docs official recommendation              | Much faster, fewer false lint errors in editor                       |
| Vitest 2.x (last: 2.1.9)                           | Vitest 3.x (current stable: 3.2.4)                                           | Jan 2025                                           | Workspace renamed to projects; pool config simplified; 3.x is stable |
| fvtt-types for Foundry v12                         | fvtt-types 13.x beta for v13                                                 | Aug 2025 (beta)                                    | v13 types are in beta; many known gaps; use skipLibCheck             |

**Deprecated/outdated:**

- **eslint-plugin-prettier**: Not deprecated per se but officially not recommended by Prettier team
- **Vitest 2.x**: Was on maintenance, now superseded by 3.x and 4.x
- **`--ext .js` ESLint flag**: Removed in ESLint 10 flat config; use `files:` in config
- **`ESLINT_USE_FLAT_CONFIG` env var**: Removed in ESLint 10 (no longer needed — flat config is the only option)

---

## Open Questions

1. **Existing code ESLint errors on `npm run lint`**
   - What we know: The codebase was written without ESLint. `js.configs.recommended` may produce errors.
   - What's unclear: Which rules will fire, and how many violations exist.
   - Recommendation: Run `eslint scripts/ --max-warnings=0` after setup to get a baseline count. If errors are numerous, consider adding specific rule overrides to keep the build clean. Phase 1 requires "reports results without crashing" — lint errors are acceptable, crashes are not. The planner should include a task that audits lint output and adds necessary overrides.

2. **fvtt-types `types` field behavior in jsconfig.json**
   - What we know: `"types": ["@league-of-foundry-developers/foundry-vtt-types"]` should make Foundry globals available globally.
   - What's unclear: Whether `skipLibCheck: true` fully suppresses the beta type errors or if some errors still propagate.
   - Recommendation: Phase 1 acceptance criterion for typecheck is "runner does not crash" — individual type errors are expected. Document expected output as "X errors" for team awareness.

3. **STATE.md references Vitest `^2.2.x`**
   - What we know: Vitest 2.2.x does not exist on npm. Latest 2.x is 2.1.9. Vitest 3.x is the stable choice.
   - What's unclear: Whether the STATE.md reference was a typo for `^2.1.x` or premature for `^3.x`.
   - Recommendation: Use Vitest `^3.2.4`. The constraint was "not 4.x due to breaking changes" — 3.x satisfies this. Confirm with user if uncertainty remains.

---

## Sources

### Primary (HIGH confidence)

- npm registry (via `npm view`) — all package versions verified directly
- [Vitest Environment Guide](https://vitest.dev/guide/environment) — jsdom configuration pattern
- [ESLint Configuration Files](https://eslint.org/docs/latest/use/configure/configuration-files) — flat config structure, globals pattern
- [ESLint v10.0.0 Release Blog](https://eslint.org/blog/2026/02/eslint-v10.0.0-released/) — breaking changes confirmed
- [Prettier: Integrating with Linters](https://prettier.io/docs/integrating-with-linters) — eslint-config-prettier recommendation
- [GitHub: prettier/eslint-config-prettier](https://github.com/prettier/eslint-config-prettier) — `/flat` import pattern for flat config
- [GitHub: League-of-Foundry-Developers/foundry-vtt-types](https://github.com/League-of-Foundry-Developers/foundry-vtt-types) — v13 beta status confirmed

### Secondary (MEDIUM confidence)

- [Vitest Migration Guide](https://vitest.dev/guide/migration.html) — Vitest 3.x breaking changes summary; verified via WebFetch
- [ESLint: Configure Language Options](https://eslint.org/docs/latest/use/configure/language-options) — globals package usage pattern
- [Vitest GitHub Issue #9279](https://github.com/vitest-dev/vitest/issues/9279) — Vitest 4.x jsdom compatibility issue; multiple reporters confirming

### Tertiary (LOW confidence)

- WebSearch: "globals.dedicatedWorker" for Web Worker ESLint config — pattern is logical but could not find authoritative benchmark; treat as standard

---

## Metadata

**Confidence breakdown:**

- Standard stack: HIGH — all versions verified via npm registry; no assumptions made
- Architecture: HIGH — configuration patterns verified against official docs for ESLint 10, Vitest 3.x, Prettier 3.x
- Pitfalls: HIGH (most) / MEDIUM (Pitfall 6 Worker globals) — most pitfalls verified from official changelogs or active GitHub issues

**Research date:** 2026-02-28
**Valid until:** 2026-03-28 (30 days — packages are stable; fvtt-types beta could change faster)
