# Phase 1: Tooling Foundation - Context

**Gathered:** 2026-02-28
**Status:** Ready for planning

<domain>
## Phase Boundary

Create package.json with dev dependencies, configure Vitest with jsdom, ESLint v9 flat config, Prettier, and jsconfig.json with checkJs. All four commands — `npm test`, `npm run lint`, `npm run format:check`, and `npm run typecheck` — must pass locally with zero tests and zero lint errors on the existing codebase.

</domain>

<decisions>
## Implementation Decisions

### Claude's Discretion

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

</decisions>

<specifics>
## Specific Ideas

No specific requirements — open to standard approaches. Research should determine exact package versions.

</specifics>

<code_context>

## Existing Code Insights

### Reusable Assets

- No existing tooling configuration to build on — clean slate

### Established Patterns

- 2-space indentation throughout all .js files
- Single quotes for strings, double quotes for HTML attributes
- Semicolons at statement ends
- camelCase functions, PascalCase classes, UPPER_SNAKE_CASE constants
- ES6 module syntax (import/export)
- No existing package.json — module runs purely in browser

### Integration Points

- `scripts/` directory contains all source code to lint/typecheck
- `scripts/workers/IndexWorker.js` runs in Web Worker context (may need special ESLint env)
- `build.sh` and `build.bat` must NOT be modified — tooling is dev-only
- `module.json` is the module manifest — do not add scripts/dependencies there

</code_context>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

_Phase: 01-tooling-foundation_
_Context gathered: 2026-02-28_
