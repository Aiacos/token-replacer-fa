# Stack Research

**Domain:** Foundry VTT module quality tooling — testing, type safety, linting
**Researched:** 2026-02-28
**Confidence:** MEDIUM (testing ecosystem is thin; Foundry-specific mocks are low-maturity)

## Context

This is a brownfield Foundry VTT module (v2.12.3) written in vanilla ES6 JavaScript with no build step. The goal is quality tooling only — tests, type checking, linting — without adding a compilation pipeline. Every recommended tool must work with `.js` files loaded directly in a browser runtime.

---

## Recommended Stack

### Testing

| Technology                  | Version                  | Purpose                                | Why Recommended                                                                                                                                                                                                                                          |
| --------------------------- | ------------------------ | -------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Vitest                      | ^2.2.x                   | Test runner for unit tests             | Runs in Node.js with jsdom; no build step needed for test files; works standalone without Vite. v4.x exists but is a major release with breaking changes — v2.2.x is the stable LTS-equivalent.                                                          |
| jsdom                       | ^25.x                    | Browser DOM emulation for Vitest       | Ships separately from Vitest since v1.x; required for `environment: 'jsdom'`; emulates localStorage, IndexedDB stubs, Web Workers (partial).                                                                                                             |
| @rayners/foundry-test-utils | latest (GitHub Packages) | Pre-built Foundry VTT mocks for Vitest | Mocks `game`, `ui`, `canvas`, `Hooks`, `ApplicationV2`, document classes, `mergeObject`, `duplicate`. Saves writing every Foundry global from scratch. Low maturity (19 commits, June 2025) but the only Foundry-specific Vitest mock library available. |

**Note on Quench (the alternative):** Quench v0.10.0 (April 2025) runs Mocha tests inside a live Foundry VTT instance. It is verified for v12 and v13. It is the right choice for integration/end-to-end tests that need real Foundry APIs, but it requires a running Foundry instance, making it unsuitable for CI or fast unit test feedback. Use it only if integration tests against real Foundry are needed later.

### Type Safety

| Technology                                      | Version                        | Purpose                              | Why Recommended                                                                                                                                                                    |
| ----------------------------------------------- | ------------------------------ | ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| TypeScript                                      | ^5.7.x                         | Type checker only (no emit)          | Invoked as `tsc --noEmit` to check JSDoc-annotated `.js` files. No compilation step, no `.ts` files, no build pipeline change.                                                     |
| @league-of-foundry-developers/foundry-vtt-types | `fvtt-types` alias, ^13.x beta | Type definitions for Foundry VTT API | The only community type package for FVTT. v12 is "partially supported"; v13 is "in beta" (latest: 13.346.0-beta, August 2025). Imperfect but still catches class and API mistakes. |

**JSDoc + @ts-check is the correct approach.** The project has no build step and must not gain one. Adding TypeScript compilation would change `build.sh`, `module.json` esmodules list, and potentially break CDN-loaded Fuse.js dynamic import. JSDoc + `tsconfig.json` with `"allowJs": true, "checkJs": true, "noEmit": true` gives type checking in the IDE and via `tsc --noEmit` without touching any source files.

### Linting and Formatting

| Technology             | Version       | Purpose                                                      | Why Recommended                                                                                                                                                                              |
| ---------------------- | ------------- | ------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ESLint                 | ^9.x (9.39.x) | Code quality linting                                         | v9 is current stable; ESLint 10.x exists but is very new. Flat config (`eslint.config.js`) is the required format for v9+. No legacy `.eslintrc`.                                            |
| Prettier               | ^3.8.x        | Code formatting                                              | v3.8.1 is latest stable (February 2026). Opinionated, zero-config for JS. Run separately from ESLint — do not use `eslint-plugin-prettier` (causes slowdown and confusing double-reporting). |
| eslint-config-prettier | ^9.x          | Disables ESLint formatting rules that conflict with Prettier | Required when running both; turns off all ESLint style rules so Prettier wins formatting.                                                                                                    |

---

## Supporting Libraries

| Library                  | Version | Purpose                      | When to Use                                                                                                 |
| ------------------------ | ------- | ---------------------------- | ----------------------------------------------------------------------------------------------------------- |
| @vitest/coverage-v8      | ^2.2.x  | Code coverage via V8         | When you want a coverage report (`vitest run --coverage`). V8 native, no instrumentation overhead.          |
| vitest-localstorage-mock | ^0.1.x  | localStorage mock for Vitest | Only if `@rayners/foundry-test-utils` does not cover IndexService's localStorage interactions. Check first. |

---

## Development Tools

| Tool                        | Purpose                              | Notes                                                                                                             |
| --------------------------- | ------------------------------------ | ----------------------------------------------------------------------------------------------------------------- |
| `tsc --noEmit`              | Type checking without compile output | Run as `npm run typecheck`. Uses `jsconfig.json` or `tsconfig.json` pointing at `scripts/**/*.js`.                |
| `eslint scripts/`           | Lint all JS source files             | Use `eslint.config.js` flat config (ESLint v9 default). Point only at `scripts/`, not templates or build scripts. |
| `prettier --write scripts/` | Format source files                  | Run before commit; pipe through `prettier --check` in CI.                                                         |
| `vitest run`                | Run all tests once                   | For CI. Use `vitest` (watch mode) during development.                                                             |

---

## Installation

```bash
# Dev dependencies — testing
npm install -D vitest@^2.2 jsdom@^25

# Dev dependencies — Foundry VTT mocks (GitHub Packages registry)
# Requires .npmrc: @rayners:registry=https://npm.pkg.github.com
npm install -D @rayners/foundry-test-utils

# Dev dependencies — type checking
npm install -D typescript@^5.7
npm install -D fvtt-types@npm:@league-of-foundry-developers/foundry-vtt-types

# Dev dependencies — linting/formatting
npm install -D eslint@^9 prettier@^3.8 eslint-config-prettier@^9

# Optional — coverage
npm install -D @vitest/coverage-v8@^2.2
```

---

## Alternatives Considered

| Recommended                                     | Alternative               | When to Use Alternative                                                                                                                                                                                                                                                 |
| ----------------------------------------------- | ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Vitest + jsdom                                  | Quench (Mocha in-browser) | Use Quench when you need tests that run against live Foundry APIs, real module loading, or real TVA integration. Not a substitute for fast unit tests.                                                                                                                  |
| Vitest + jsdom                                  | Jest                      | Jest requires more configuration for ES modules; no native ESM support without Babel. Vitest handles ESM natively.                                                                                                                                                      |
| JSDoc + @ts-check                               | Full TypeScript migration | Use TypeScript migration only if a build step is added (Rollup/Vite). TypeScript gives stronger type expressions (non-null assertion `!`, complex generics), but requires compiling `.ts` → `.js` and updating `module.json`. Not worth it for a quality-only refactor. |
| ESLint v9 flat config                           | ESLint v8 `.eslintrc`     | Only if you cannot migrate config format. v8 is EOL. Flat config is simpler once written.                                                                                                                                                                               |
| Prettier standalone                             | `eslint-plugin-prettier`  | `eslint-plugin-prettier` makes ESLint run Prettier as a rule, causing double-reporting and slower lints. Run them as separate tools.                                                                                                                                    |
| @league-of-foundry-developers/foundry-vtt-types | foundry-vtt-dnd5e-types   | The dnd5e types package is abandoned (last release: October 2021, dnd5e v1.5.x). Do not use.                                                                                                                                                                            |

---

## What NOT to Use

| Avoid                                | Why                                                                                                                                                                                   | Use Instead                                                                   |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| `eslint-plugin-prettier`             | Causes ESLint and Prettier to conflict; double-reports formatting errors; slows linting significantly                                                                                 | Run `prettier --check` separately in CI                                       |
| `foundry-vtt-dnd5e-types`            | Abandoned since 2021, supports dnd5e v1.5.x only. Current dnd5e is v4.x                                                                                                               | Write manual `@typedef` for the specific `system.details.type` fields you use |
| TypeScript compilation (`.ts` files) | Requires adding a build step that changes `build.sh`, `module.json`, and `esmodules` list. The constraint is "no build step"                                                          | JSDoc + `checkJs` via `tsconfig.json` with `noEmit: true`                     |
| Vitest 4.x                           | Major release with breaking changes (released Oct 2025); browser mode stable in 4.x is for Playwright-based browser testing, not jsdom-style unit tests. Ecosystem adoption is early. | Vitest ^2.2.x (stable, proven)                                                |
| Jest                                 | Requires Babel or experimental `--experimental-vm-modules` for ES modules; extra configuration overhead; no native Vite/ESM support                                                   | Vitest (native ESM, simpler config)                                           |
| Cypress/Playwright for unit tests    | E2E tools need a running server; overkill for testing pure JavaScript logic in services                                                                                               | Vitest + jsdom                                                                |

---

## Stack Patterns by Variant

**If you add tests for pure logic (IndexService categorization, TokenService type extraction, SearchService fuzzy matching):**

- Use Vitest + jsdom + `@rayners/foundry-test-utils` for mocking Foundry globals
- These tests run in Node.js, are fast, and have no Foundry dependency

**If you add integration tests that need real module loading behavior:**

- Use Quench inside a running Foundry VTT instance
- Quench v0.10.0 supports Foundry v12 and v13

**If TypeScript's `checkJs` reports too many errors from fvtt-types beta gaps:**

- Suppress per-file with `// @ts-nocheck` at the top, or suppress per-line with `// @ts-ignore`
- Keep suppression localized — don't disable globally

**If the project later adds a build step (e.g., for bundling):**

- Migrate from `jsconfig.json` + `checkJs` to full TypeScript (`.ts` files)
- At that point, fvtt-types works as a standard `types` entry in `tsconfig.json`

---

## Key Configuration Files

### `jsconfig.json` (type checking, no emit)

```json
{
  "compilerOptions": {
    "allowJs": true,
    "checkJs": true,
    "strict": true,
    "noEmit": true,
    "target": "ESNext",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "types": ["fvtt-types"]
  },
  "include": ["scripts/**/*.js"],
  "exclude": ["node_modules", "releases"]
}
```

### `vitest.config.js`

```javascript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['@rayners/foundry-test-utils/helpers/setup.js'],
  },
});
```

### `eslint.config.js`

```javascript
import js from '@eslint/js';
import prettierConfig from 'eslint-config-prettier';

export default [
  js.configs.recommended,
  prettierConfig,
  {
    files: ['scripts/**/*.js'],
    rules: {
      'no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      'no-console': 'warn',
    },
  },
];
```

### `.prettierrc`

```json
{
  "singleQuote": true,
  "semi": true,
  "trailingComma": "es5",
  "printWidth": 100,
  "tabWidth": 2
}
```

---

## Version Compatibility

| Package                     | Compatible With                       | Notes                                                                                        |
| --------------------------- | ------------------------------------- | -------------------------------------------------------------------------------------------- |
| vitest@^2.2                 | jsdom@^25, Node.js >=18               | jsdom must be installed separately (`npm i -D jsdom`)                                        |
| fvtt-types (v13 beta)       | Foundry VTT v12 (partial), v13 (beta) | v12 coverage is partial; v13 is beta. Some APIs will have `any` fallback types.              |
| eslint@^9                   | eslint-config-prettier@^9             | Must use flat config (`eslint.config.js`) — `.eslintrc` format is not supported in ESLint v9 |
| prettier@^3.8               | eslint-config-prettier@^9             | Run as separate tool; do not use `eslint-plugin-prettier`                                    |
| @rayners/foundry-test-utils | vitest@^2.x                           | Requires `@rayners:registry=https://npm.pkg.github.com` in `.npmrc`                          |

---

## Confidence Assessment

| Area                          | Confidence | Reason                                                                                                                                                              |
| ----------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Vitest + jsdom for unit tests | HIGH       | Official Vitest docs, widely adopted pattern, confirmed working with ESM                                                                                            |
| @rayners/foundry-test-utils   | LOW        | Only 19 commits, single maintainer, GitHub Packages registry. May have gaps in mocks. Verify mocked APIs cover IndexService, SearchService needs before committing. |
| JSDoc + checkJs approach      | HIGH       | Well-documented pattern, multiple official TypeScript sources confirm. Works without build step.                                                                    |
| fvtt-types v13 beta           | MEDIUM     | Active development (59 releases, 6,700 commits), but v13 is explicitly "beta with known issues." Some Foundry v13 APIs may lack type coverage.                      |
| ESLint v9 flat config         | HIGH       | ESLint v9 is stable (9.39.x), flat config is default since v9.0.0                                                                                                   |
| Prettier v3                   | HIGH       | v3.8.1 is stable, actively maintained                                                                                                                               |
| Quench for in-browser tests   | MEDIUM     | v0.10.0 confirmed for Foundry v12 and v13, but requires live Foundry instance                                                                                       |

---

## Sources

- [foundry-test-utils GitHub](https://github.com/rayners/foundry-test-utils) — Mocked Foundry APIs, Vitest setup, June 2025 (MEDIUM confidence — thin commit history)
- [foundry-vtt-types GitHub](https://github.com/League-of-Foundry-Developers/foundry-vtt-types) — v13 beta status, installation alias, version 13.346.0-beta (MEDIUM confidence — beta for v13)
- [Quench on Foundry VTT packages](https://foundryvtt.com/packages/quench) — v0.10.0, Foundry v12 and v13 verified (HIGH confidence — official listing)
- [Vitest 4.0 announcement](https://vitest.dev/blog/vitest-4) — v4.0 released Oct 2025, v4.0.18 latest (HIGH confidence — official blog)
- [Prettier 3.7 release](https://prettier.io/blog/2025/11/27/3.7.0) — v3.8.1 current stable (HIGH confidence — official blog)
- [ESLint v9.39.x releases](https://eslint.org/blog/2025/12/eslint-v9.39.2-released/) — v9.39.x current stable, v10 exists but new (HIGH confidence — official blog)
- [Build-free JSDoc type annotations](https://luhr.co/blog/2024/01/25/build-free-type-annotations-with-jsdoc-and-typescript/) — `noEmit`, `checkJs`, `allowJs` pattern (HIGH confidence — matches official TypeScript docs)
- [JSDoc as alternative TypeScript syntax](https://alexharri.com/blog/jsdoc-as-an-alternative-typescript-syntax) — Non-null assertion limitation, checkJs requirement (MEDIUM confidence — respected community blog)
- [XDXA FoundryVTT test automation](https://xdxa.org/2023/foundryvtt-module-test-automation/) — Quench + Cypress pattern rationale, why mocks are insufficient for integration tests (MEDIUM confidence — practitioner writeup, 2023)
- [foundry-vtt-dnd5e-types](https://github.com/League-of-Foundry-Developers/foundry-vtt-dnd5e-types) — Abandoned October 2021, supports dnd5e v1.5.x only (HIGH confidence — last commit date visible)

---

_Stack research for: Foundry VTT module quality tooling (Token Replacer FA)_
_Researched: 2026-02-28_
