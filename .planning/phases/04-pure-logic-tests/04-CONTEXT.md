# Phase 4: Pure Logic Tests - Context

**Gathered:** 2026-03-01
**Status:** Ready for planning

<domain>
## Phase Boundary

Write unit tests for Constants.js and Utils.js pure functions — creature categorization, path exclusion, CDN path filtering, XSS helpers, and Fuse.js loader. Zero Foundry behavior dependencies (stubs from Phase 2 handle globals).

</domain>

<decisions>
## Implementation Decisions

### Coverage depth
- CREATURE_TYPE_MAPPINGS: representative samples — test 2-3 terms per category + verify all 14 categories exist and are non-empty arrays
- EXCLUDED_FOLDERS: category-based samples — test entries from each logical group (generic assets, FA-specific, structures, nature) plus CDN path filtering with real Forge URLs
- Do NOT exhaustively assert every single term or folder — structural correctness over enumeration

### Test file structure
- Mirror source layout: `tests/core/Constants.test.js` and `tests/core/Utils.test.js`
- Matches existing `scripts/core/` structure for 1:1 mapping
- Existing tests live in `tests/setup/` and `tests/helpers/` — new tests go in `tests/core/`

### Fuse.js loader testing
- Mock `import()` via `vi.mock()` to intercept CDN dynamic import
- Test three paths: (1) successful CDN load, (2) CDN failure + window.Fuse fallback, (3) total failure returns null
- No real network calls in tests — all mocked
- Reset FuseClass cache between tests to avoid cross-test leakage

### XSS and security tests
- escapeHtml(): OWASP standard XSS payloads — `<script>`, event handlers (`onerror`, `onload`), unicode entities, nested encoding, null/empty input
- sanitizePath(): path traversal attacks — `../`, `..\\`, null bytes (`\0`), absolute paths (`/etc/passwd`), backslash normalization, double-encoding
- Both functions: test empty, null, undefined, and non-string inputs

### Claude's Discretion
- Exact number of test cases per function (aim for meaningful coverage, not quantity)
- Whether to group describe blocks by function or by concern within each file
- Helper factory functions if test setup becomes repetitive
- Whether parseFilterTerms, matchesAllTerms, parseSubtypeTerms, hasGenericSubtype need their own describe blocks or can be grouped

</decisions>

<specifics>
## Specific Ideas

No specific requirements — open to standard Vitest testing patterns.

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `tests/setup/foundry-mocks.js`: Global stubs for `game`, `game.i18n`, `game.settings`, `foundry`, `window` — already loaded via Vitest setupFiles
- `tests/helpers/mock-helpers.js`: `setSetting()`, `resetAllMocks()` — useful for testing `createDebugLogger` which reads `debugMode` setting
- Vitest configured with jsdom environment and `--passWithNoTests`

### Established Patterns
- Smoke tests in `tests/setup/foundry-mocks.smoke.test.js` import all 8 module files successfully — confirms Constants.js and Utils.js are importable
- Helper tests use `describe`/`it` with clear naming: `describe('functionName', () => { it('should behavior', ...) })`

### Integration Points
- Constants.js: pure exports, no side effects — can be imported and tested directly
- Utils.js: most functions are pure; `loadFuse()` uses dynamic `import()` (needs mocking); `createModuleError()` uses `game.i18n` (stubbed); `createDebugLogger()` uses `game.settings` (stubbed via mock-helpers)
- `isExcludedPath()` has internal memoization cache — needs `clearExcludedPathCache()` between tests

</code_context>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 04-pure-logic-tests*
*Context gathered: 2026-03-01*
