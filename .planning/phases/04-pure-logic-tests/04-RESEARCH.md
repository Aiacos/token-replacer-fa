# Phase 4: Pure Logic Tests - Research

**Researched:** 2026-03-01
**Domain:** Vitest unit testing for pure JavaScript functions (Constants.js, Utils.js)
**Confidence:** HIGH

## Summary

Phase 4 tests pure functions in `scripts/core/Constants.js` and `scripts/core/Utils.js`. These files have zero Foundry VTT runtime dependencies for their pure logic -- Constants.js exports only data structures, and Utils.js pure functions (escapeHtml, sanitizePath, parseFilterTerms, etc.) operate on primitive inputs. The two exceptions are `loadFuse()` (dynamic CDN import with fallback) and `isExcludedPath()` (memoization cache that needs clearing between tests).

The existing test infrastructure (Vitest 3.2.4, jsdom environment, foundry-mocks.js setupFile) is fully sufficient. No additional packages are needed. The mocking challenge is `loadFuse()` which uses a module-level `let FuseClass = null` cache and dynamic `import()` from a CDN URL. This requires `vi.resetModules()` + `vi.doMock()` to get fresh module state between tests. All other functions under test are stateless pure functions that can be imported once and tested directly.

**Primary recommendation:** Create two test files (`tests/core/Constants.test.js` and `tests/core/Utils.test.js`) using direct imports for pure functions, with `vi.resetModules()` isolated to the `loadFuse()` describe block only.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- CREATURE_TYPE_MAPPINGS: representative samples -- test 2-3 terms per category + verify all 14 categories exist and are non-empty arrays
- EXCLUDED_FOLDERS: category-based samples -- test entries from each logical group (generic assets, FA-specific, structures, nature) plus CDN path filtering with real Forge URLs
- Do NOT exhaustively assert every single term or folder -- structural correctness over enumeration
- Test file structure: mirror source layout -- `tests/core/Constants.test.js` and `tests/core/Utils.test.js`
- Fuse.js loader testing: mock `import()` via `vi.mock()` to intercept CDN dynamic import; test three paths (CDN success, CDN failure + window.Fuse fallback, total failure returns null); no real network calls; reset FuseClass cache between tests
- XSS tests (escapeHtml): OWASP standard XSS payloads -- `<script>`, event handlers, unicode entities, nested encoding, null/empty input
- Security tests (sanitizePath): path traversal -- `../`, `..\\`, null bytes, absolute paths, backslash normalization, double-encoding
- Both security functions: test empty, null, undefined, and non-string inputs

### Claude's Discretion
- Exact number of test cases per function (aim for meaningful coverage, not quantity)
- Whether to group describe blocks by function or by concern within each file
- Helper factory functions if test setup becomes repetitive
- Whether parseFilterTerms, matchesAllTerms, parseSubtypeTerms, hasGenericSubtype need their own describe blocks or can be grouped

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| TEST-01 | Constants.js CREATURE_TYPE_MAPPINGS categorization tested for all 14 categories | Direct import of CREATURE_TYPE_MAPPINGS, structural assertions on keys/values, representative term sampling per category |
| TEST-02 | Constants.js EXCLUDED_FOLDERS filtering tested with CDN and local paths | Import isExcludedPath from Utils.js + EXCLUDED_FOLDERS from Constants.js; test with real Forge CDN URLs and local paths; call clearExcludedPathCache() in beforeEach |
| TEST-03 | Utils.js path extraction functions tested with edge cases | Direct import of extractPathFromTVAResult + extractPathFromObject; test string/array/object/nested formats, CDN URLs, empty inputs |
| TEST-04 | Utils.js Fuse.js loader error handling tested | vi.resetModules() + vi.doMock() pattern to intercept dynamic import(FUSE_CDN); test success, fallback, and failure paths |
| TEST-05 | Utils.js escapeHtml and sanitizePath security functions tested | Direct import; OWASP XSS payloads for escapeHtml; path traversal + null bytes for sanitizePath; edge case inputs |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| vitest | ^3.2.4 | Test runner + assertion library + mocking | Already installed and configured; provides vi.mock, vi.doMock, vi.resetModules |
| jsdom | ^28.1.0 | Browser environment for `window` global | Already configured as Vitest environment; needed for window.Fuse fallback test |

### Supporting
No additional libraries needed. The existing setup handles everything.

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| vi.doMock for Fuse.js | vi.mock with factory | vi.mock is hoisted and cannot reference test-scoped variables; vi.doMock is more flexible for per-test mock variants |

**Installation:**
```bash
# No new packages needed -- all dependencies already installed
```

## Architecture Patterns

### Recommended Project Structure
```
tests/
├── setup/
│   └── foundry-mocks.js        # [existing] Global mocks loaded via setupFiles
├── helpers/
│   └── mock-helpers.js          # [existing] Per-test mock helpers
└── core/
    ├── Constants.test.js        # [NEW] Tests for Constants.js exports
    └── Utils.test.js            # [NEW] Tests for Utils.js functions
```

### Pattern 1: Direct Import for Pure Functions
**What:** Import functions once at file top, call them in tests with various inputs
**When to use:** For stateless pure functions (escapeHtml, sanitizePath, parseFilterTerms, etc.)
**Example:**
```javascript
// Source: Established project pattern from tests/helpers/mock-helpers.test.js
import { describe, it, expect } from 'vitest';
import { escapeHtml, sanitizePath } from '../../scripts/core/Utils.js';

describe('escapeHtml', () => {
  it('escapes angle brackets', () => {
    expect(escapeHtml('<script>')).toBe('&lt;script&gt;');
  });
});
```

### Pattern 2: vi.resetModules + vi.doMock for Module-Level Cache
**What:** Reset module cache and re-import to get a fresh `FuseClass = null` state
**When to use:** For `loadFuse()` which caches result in module-level `let FuseClass`
**Example:**
```javascript
// Source: https://vitest.dev/api/vi.html (vi.resetModules, vi.doMock)
import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('loadFuse', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('returns Fuse constructor from CDN on success', async () => {
    const mockFuse = class MockFuse {};
    vi.doMock('https://cdn.jsdelivr.net/npm/fuse.js@7.0.0/dist/fuse.mjs', () => ({
      default: mockFuse,
    }));
    const { loadFuse } = await import('../../scripts/core/Utils.js');
    const result = await loadFuse();
    expect(result).toBe(mockFuse);
  });

  it('falls back to window.Fuse when CDN fails', async () => {
    vi.doMock('https://cdn.jsdelivr.net/npm/fuse.js@7.0.0/dist/fuse.mjs', () => {
      throw new Error('Network error');
    });
    const mockFuse = class WindowFuse {};
    window.Fuse = mockFuse;
    const { loadFuse } = await import('../../scripts/core/Utils.js');
    const result = await loadFuse();
    expect(result).toBe(mockFuse);
    delete window.Fuse;
  });

  it('returns null when both CDN and window.Fuse fail', async () => {
    vi.doMock('https://cdn.jsdelivr.net/npm/fuse.js@7.0.0/dist/fuse.mjs', () => {
      throw new Error('Network error');
    });
    delete window.Fuse;
    const { loadFuse } = await import('../../scripts/core/Utils.js');
    const result = await loadFuse();
    expect(result).toBeNull();
  });
});
```

### Pattern 3: Cache Clearing for Memoized Functions
**What:** Call `clearExcludedPathCache()` in `beforeEach` to prevent cross-test pollution
**When to use:** For `isExcludedPath()` which uses a `Map` cache limited to 20000 entries
**Example:**
```javascript
import { clearExcludedPathCache, isExcludedPath } from '../../scripts/core/Utils.js';

describe('isExcludedPath', () => {
  beforeEach(() => {
    clearExcludedPathCache();
  });

  it('excludes paths containing excluded folder names', () => {
    expect(isExcludedPath('some/props/token.png')).toBe(true);
  });
});
```

### Pattern 4: Structural Assertion for Data Exports
**What:** Verify structure (keys, types, non-empty arrays) rather than exhaustive value enumeration
**When to use:** For CREATURE_TYPE_MAPPINGS, EXCLUDED_FOLDERS, PRIMARY_CATEGORY_TERMS
**Example:**
```javascript
import { CREATURE_TYPE_MAPPINGS } from '../../scripts/core/Constants.js';

describe('CREATURE_TYPE_MAPPINGS', () => {
  const EXPECTED_CATEGORIES = [
    'humanoid', 'beast', 'undead', 'fiend', 'dragon',
    'elemental', 'fey', 'celestial', 'construct', 'aberration',
    'monstrosity', 'giant', 'plant', 'ooze',
  ];

  it('has exactly 14 categories', () => {
    expect(Object.keys(CREATURE_TYPE_MAPPINGS)).toHaveLength(14);
  });

  it.each(EXPECTED_CATEGORIES)('category "%s" exists and is non-empty array', (category) => {
    expect(CREATURE_TYPE_MAPPINGS[category]).toBeDefined();
    expect(Array.isArray(CREATURE_TYPE_MAPPINGS[category])).toBe(true);
    expect(CREATURE_TYPE_MAPPINGS[category].length).toBeGreaterThan(0);
  });
});
```

### Anti-Patterns to Avoid
- **Exhaustive value enumeration:** Testing every single entry in EXCLUDED_FOLDERS (236 entries) or CREATURE_TYPE_MAPPINGS arrays creates brittle tests that break on any addition/removal. Use structural + representative sample assertions.
- **Shared module state leaking between tests:** The `FuseClass` cache and `excludedPathCache` Map persist across test calls within the same import. Always use `vi.resetModules()` for loadFuse tests and `clearExcludedPathCache()` for isExcludedPath tests.
- **Using vi.mock for loadFuse:** `vi.mock` is hoisted and cannot use test-scoped variables. `vi.doMock` is the correct tool for per-test mock variations on the CDN URL.
- **Testing internal implementation:** Don't test CDN_SEGMENTS or EXCLUDED_FILENAME_PATTERNS directly -- they are unexported implementation details. Test through the public API (`isExcludedPath`).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Module cache reset | Manual variable reset hacks | `vi.resetModules()` | Vitest handles the full module graph reset correctly |
| XSS test payloads | Inventing custom XSS strings | OWASP standard payloads | Well-known attack vectors catch real vulnerabilities |
| CDN URL mocking | fetch/XMLHttpRequest interception | `vi.doMock(FUSE_CDN_URL)` | Vitest intercepts ESM dynamic import() natively |

**Key insight:** The only non-trivial testing challenge in this phase is `loadFuse()` due to its module-level cache. Everything else is straightforward pure function testing.

## Common Pitfalls

### Pitfall 1: FuseClass Cache Persists Across Tests
**What goes wrong:** `loadFuse()` returns the cached `FuseClass` from a previous test instead of exercising the CDN/fallback path
**Why it happens:** `FuseClass` is a module-level `let` variable. Once set by the first test, all subsequent tests in the same import context get the cached value.
**How to avoid:** Use `vi.resetModules()` in `beforeEach` within the loadFuse describe block, then `await import()` to get a fresh module
**Warning signs:** loadFuse tests pass individually but fail when run together

### Pitfall 2: isExcludedPath Memoization Cache Pollution
**What goes wrong:** A test for `isExcludedPath('some/props/file.png')` caches `true`, then a later test checking the same path but expecting different behavior gets stale results
**Why it happens:** The `excludedPathCache` Map persists across tests within the same module import
**How to avoid:** Call `clearExcludedPathCache()` in `beforeEach` for all isExcludedPath tests
**Warning signs:** Tests pass in isolation but fail when run in sequence

### Pitfall 3: EXCLUDED_FILENAME_PATTERNS Word Boundary Matching
**What goes wrong:** Expecting `isExcludedPath` to exclude a path like `FA_Pack/Tokens/Clifford_The_Dog.png` because "cliff" is an excluded term
**Why it happens:** The precompiled patterns use `\b` word boundaries, so "cliff" only matches when it appears as a standalone word, not as part of "Clifford"
**How to avoid:** Test word boundary behavior explicitly -- verify that partial matches in filenames do NOT trigger exclusion
**Warning signs:** False positives in exclusion filtering

### Pitfall 4: vi.doMock URL Must Match Exactly
**What goes wrong:** The mock for the CDN URL doesn't intercept the dynamic import
**Why it happens:** `vi.doMock` path must match the exact string used in `import()` -- in this case `https://cdn.jsdelivr.net/npm/fuse.js@7.0.0/dist/fuse.mjs` (from FUSE_CDN constant)
**How to avoid:** Import FUSE_CDN from Constants.js and use it as the mock path, or hardcode the exact URL
**Warning signs:** loadFuse tests making real network requests instead of using mocks

### Pitfall 5: sanitizePath console.warn Side Effects
**What goes wrong:** Test output is polluted with warning messages from rejected paths
**Why it happens:** `sanitizePath()` calls `console.warn` for rejected paths (null bytes, absolute paths, traversal)
**How to avoid:** Either accept the noise or use `vi.spyOn(console, 'warn').mockImplementation(() => {})` in those test blocks
**Warning signs:** Noisy test output that obscures real failures

### Pitfall 6: Importing Utils.js Triggers Side Effects
**What goes wrong:** Importing Utils.js creates `EXCLUDED_FILENAME_PATTERNS` at module load time (line 22-24)
**Why it happens:** The precompiled RegExp array is created in module scope
**How to avoid:** This is fine -- the patterns are deterministic and don't depend on test state. Just be aware that import is not free.
**Warning signs:** None in practice -- this is informational

## Code Examples

Verified patterns from official sources and project conventions:

### Constants.js Structure Verification
```javascript
// Pattern: Verify data export shape, not exhaustive contents
import { CREATURE_TYPE_MAPPINGS, EXCLUDED_FOLDERS, EXCLUDED_FOLDERS_SET } from '../../scripts/core/Constants.js';

// Verify Set matches Array
expect(EXCLUDED_FOLDERS_SET.size).toBe(EXCLUDED_FOLDERS.length);
EXCLUDED_FOLDERS.forEach(folder => {
  expect(EXCLUDED_FOLDERS_SET.has(folder)).toBe(true);
});
```

### escapeHtml OWASP Payloads
```javascript
// Source: OWASP XSS Prevention Cheat Sheet standard test vectors
const XSS_PAYLOADS = [
  { input: '<script>alert("xss")</script>', contains: '&lt;script&gt;' },
  { input: '<img onerror="alert(1)" src=x>', contains: '&lt;img onerror' },
  { input: '<a onmouseover="alert(1)">hover</a>', contains: '&lt;a onmouseover' },
  { input: '"><svg onload=alert(1)>', contains: '&quot;&gt;&lt;svg' },
  { input: "'; DROP TABLE users;--", contains: '&#039;' },
];
```

### sanitizePath Attack Vectors
```javascript
// Source: Common path traversal attack patterns
const TRAVERSAL_ATTACKS = [
  '../../../etc/passwd',
  '..\\..\\windows\\system32',
  'valid/../../../etc/shadow',
  'path/../../secret',
  'normal\0.txt',              // null byte injection
  '/etc/passwd',               // absolute path
  '\\windows\\system32',       // Windows absolute path
];
// Each should return null
```

### extractPathFromTVAResult Formats
```javascript
// Source: TVA cache format documented in CLAUDE.md
// String path
expect(extractPathFromTVAResult('modules/fa-pack/tokens/goblin.png')).toBe('modules/fa-pack/tokens/goblin.png');

// CDN URL
expect(extractPathFromTVAResult('https://assets.forge-vtt.com/bazaar/assets/FA_Pack/Tokens/goblin.png'))
  .toBe('https://assets.forge-vtt.com/bazaar/assets/FA_Pack/Tokens/goblin.png');

// Array tuple [path, name]
expect(extractPathFromTVAResult(['modules/fa-pack/goblin.png', 'Goblin']))
  .toBe('modules/fa-pack/goblin.png');

// Array tuple [path, name, tags]
expect(extractPathFromTVAResult(['modules/fa-pack/goblin.png', 'Goblin', ['humanoid']]))
  .toBe('modules/fa-pack/goblin.png');

// Object with path property
expect(extractPathFromTVAResult({ path: 'modules/fa-pack/goblin.png' }))
  .toBe('modules/fa-pack/goblin.png');

// Null/undefined
expect(extractPathFromTVAResult(null)).toBeNull();
expect(extractPathFromTVAResult(undefined)).toBeNull();
```

### isExcludedPath CDN vs Local Path Testing
```javascript
// Source: CDN_SEGMENTS definition in Utils.js + CLAUDE.md CDN Path Handling section
// CDN URL -- "assets" and "bazaar" are CDN segments, not excluded folders
expect(isExcludedPath('https://assets.forge-vtt.com/bazaar/assets/FA_Pack/Tokens/Goblin/goblin.png')).toBe(false);

// CDN URL with excluded folder in actual path
expect(isExcludedPath('https://assets.forge-vtt.com/bazaar/assets/FA_Pack/props/barrel.png')).toBe(true);

// Local path with excluded folder
expect(isExcludedPath('modules/fa-pack/tiles/floor-01.png')).toBe(true);

// Local path with non-excluded folder
expect(isExcludedPath('modules/fa-pack/tokens/goblin.png')).toBe(false);
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| vi.mock only | vi.doMock for non-hoisted mocking | Vitest 1.x+ | Enables per-test mock variations without hoisting constraints |
| Manual module cache clearing | vi.resetModules() | Vitest 0.x+ | Clean module registry reset for fresh imports |
| jest.mock | vi.mock/vi.doMock | N/A (project uses Vitest) | Same API surface, Vitest-native |

**Deprecated/outdated:**
- None relevant to this phase

## Open Questions

1. **vi.doMock with full CDN URL as module path**
   - What we know: vi.doMock accepts module paths and should intercept dynamic import() calls to that path
   - What's unclear: Whether Vitest 3.2.4 correctly intercepts `import('https://cdn.jsdelivr.net/...')` when mocked via `vi.doMock('https://cdn.jsdelivr.net/...')`
   - Recommendation: If CDN URL mocking via vi.doMock doesn't work, the fallback strategy is to mock the entire Utils.js module using vi.mock with importActual, replacing only the internal import call. Alternatively, test loadFuse indirectly by mocking `window.Fuse` and verifying the fallback path works. The CDN success path can be verified by checking that `loadFuse()` caches the result (call twice, second call should return same reference).

2. **EXCLUDED_FILENAME_PATTERNS precompiled RegExp testing**
   - What we know: These patterns are internal to Utils.js (not exported) and used by isExcludedPath
   - What's unclear: Whether word boundary matching behaves identically across jsdom and real browsers
   - Recommendation: Test through isExcludedPath public API only. jsdom RegExp is V8-native, so behavior is identical.

## Sources

### Primary (HIGH confidence)
- Project source: `scripts/core/Constants.js` -- all exported constants, 14 creature categories, 236 excluded folders
- Project source: `scripts/core/Utils.js` -- all exported functions, module-level FuseClass cache, CDN_SEGMENTS, excludedPathCache
- Project source: `vitest.config.js` -- test environment and setup configuration
- Project source: `tests/setup/foundry-mocks.js` -- existing mock infrastructure
- Project source: `tests/helpers/mock-helpers.test.js` -- established test patterns
- [Vitest vi API](https://vitest.dev/api/vi.html) -- vi.mock, vi.doMock, vi.resetModules, vi.hoisted documentation

### Secondary (MEDIUM confidence)
- [Vitest Mocking Modules Guide](https://vitest.dev/guide/mocking/modules) -- module mocking patterns
- [Vitest v3 Mocking Guide](https://v3.vitest.dev/guide/mocking) -- current version mocking docs

### Tertiary (LOW confidence)
- CDN URL interception via vi.doMock -- no direct documentation confirms this works with full URLs (needs validation during implementation)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- Vitest 3.2.4 already installed and working, no new dependencies
- Architecture: HIGH -- test file layout mirrors source, patterns verified against existing tests
- Pitfalls: HIGH -- FuseClass cache and excludedPathCache identified through source code analysis; mocking patterns verified against Vitest docs
- Fuse.js mocking: MEDIUM -- vi.doMock with CDN URL path is the recommended approach but needs validation

**Research date:** 2026-03-01
**Valid until:** 2026-04-01 (stable domain, no fast-moving dependencies)
