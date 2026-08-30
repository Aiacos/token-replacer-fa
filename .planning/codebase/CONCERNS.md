# Codebase Concerns

**Analysis Date:** 2026-05-27

## Tech Debt

**Worker Code Duplication:**
- Issue: Four functions are duplicated verbatim between `scripts/core/Utils.js` and `scripts/workers/IndexWorker.js` because Web Workers cannot share ES module imports with the main thread. The duplicated functions are: `loadFuse()` (Utils.js:32 / IndexWorker.js:267), `_validateFuseShape()` (Utils.js:67 / IndexWorker.js:301), `CDN_SEGMENTS` constant (Utils.js:379 / IndexWorker.js:447), and `isExcludedPath()` (Utils.js:430 / IndexWorker.js:488).
- Files: `scripts/core/Utils.js:32,67,379,430`, `scripts/workers/IndexWorker.js:267,301,447,488`
- Impact: Any change to filtering logic must be applied in two places. SYNC JSDoc markers exist (`scripts/core/Utils.js:63`, `scripts/workers/IndexWorker.js:264,297,445,482`) but only warn — they do not enforce synchronization. Silent drift will cause the worker to filter paths differently from the main-thread fallback path.
- Fix approach: Extract shared logic into a plain `.js` file usable via `importScripts()` in classic Workers, or migrate to module Workers (requires Foundry VTT worker support verification). A lower-effort approach is an automated test that imports both copies and asserts identical behavior for the same inputs.

**ForgeBazaarService Non-Functional Stub:**
- Issue: `scripts/services/ForgeBazaarService.js` is entirely a stub. `isAvailable` is hardcoded to `false` at line 67. All three public methods (`browseCategory`, `search`, `getAllTokens`) immediately return empty results. The stub is wired into the live search pipeline via `scripts/services/SearchService.js:10,37,38` and `scripts/services/SearchOrchestrator.js:546,571,686`.
- Files: `scripts/services/ForgeBazaarService.js:41,67,239,246,286,326`, `scripts/services/SearchService.js:10,37`, `scripts/services/SearchOrchestrator.js:46,546`
- Impact: The `forgeBazaar` priority setting is exposed in the UI (`scripts/main.js:175`) and selectable by users but silently falls through to TVA search every time because `isServiceAvailable()` always returns `false`. No functionality is blocked today, but the dead-code branches in SearchOrchestrator add maintenance surface.
- Fix approach: Either remove the stub and the priority option entirely, or leave it dormant with clear documentation. Do NOT refactor into a functional service — no public Forge Bazaar API exists.

**StorageService Missing Schema Validation:**
- Issue: `StorageService._sanitizeData()` (line 376) strips prototype-polluting keys from loaded IndexedDB data, and `_jsonReviver` (line 360) does the same for `JSON.parse`. However, there is no structural/schema validation: a corrupted or tampered cache record with wrong field names, unexpected types, or missing required keys is returned as-is. Downstream consumers (`IndexService`, `TVACacheService`) do not validate the shape of data received from storage.
- Files: `scripts/services/StorageService.js:360,376`, `scripts/services/IndexService.js`, `scripts/services/TVACacheService.js`
- Impact: Structurally corrupt cache data propagates silently, potentially causing runtime errors deep in search logic that are hard to diagnose.
- Fix approach: Add a lightweight shape-check in `StorageService.load()` that validates required top-level keys against an expected schema (passed as an optional parameter), or have each consumer validate the returned object before use.

**IndexedDB DB_VERSION Stuck at 1:**
- Issue: `scripts/services/StorageService.js:11` defines `DB_VERSION = 1`. The migration handler at line 104 has a `case 0` branch for fresh installs and a comment stub for future `case 1` migrations.
- Files: `scripts/services/StorageService.js:11,104,113-121`
- Impact: Low risk today. Becomes a concern if the stored data structure changes — silently loading v1 data in a v2 schema will cause runtime errors unless a migration case is added.
- Fix approach: When adding future schema changes, increment `DB_VERSION` and add a `case 1:` branch with fallthrough in the switch block at line 113.

## Known Bugs

None currently outstanding.

_Recently resolved: `StorageService.test.js` collection-time crash on bare `localStorage` — the polyfill IIFE dereferenced an undefined `localStorage` in its own "is it already functional?" guard. Fixed in commit `53ad614` (2026-05-28) by using `typeof globalThis.localStorage?.getItem === 'function'`. Full suite now reports 509/509 passing._

## Security Considerations

**Fuse.js CDN Without Subresource Integrity (SRI):**
- Risk: `scripts/core/Constants.js:8` defines `FUSE_CDN = 'https://cdn.jsdelivr.net/npm/fuse.js@7.0.0/dist/fuse.mjs'`. This URL is fetched at runtime via dynamic `import()` in both `scripts/core/Utils.js:36` and `scripts/workers/IndexWorker.js:271`. Dynamic `import()` does not support SRI `integrity` attributes, so the browser cannot cryptographically verify the CDN response.
- Files: `scripts/core/Constants.js:8`, `scripts/core/Utils.js:32-57`, `scripts/workers/IndexWorker.js:267-293`
- Current mitigation: Post-load shape validation via `_validateFuseShape()` in both files verifies the loaded module is a constructor, has a `.search()` method, and returns an array — catching obvious CDN substitution. This is an effective behavioral guard but not cryptographic. A sophisticated attacker serving a modified Fuse.js that passes these checks would not be detected.
- Recommendations: Bundle Fuse.js locally (copy to `scripts/vendor/fuse.mjs`) to eliminate the CDN dependency entirely. `security-scan/state.json` finding HIGH-001 is marked `fixed` (post-load validation added), but the underlying SRI limitation is an accepted residual risk.

**GitHub OAuth Token on Disk (User Action Required):**
- Risk: `security-scan/state.json` finding CRIT-001 has status `user_action_required`. A GitHub OAuth token was stored in plaintext in `.auto-claude/.env:21`. The file is now gitignored but remains on disk and the token has not been confirmed revoked.
- Files: `.auto-claude/.env` (gitignored, not committed), `security-scan/state.json:26-31`
- Current mitigation: `.gitignore` patterns `.env`, `.env.*`, `*.env`, and `.auto-claude/` are in place. The token is not in git history.
- Recommendations: Revoke the token at `github.com/settings/tokens`, verify revocation, then delete `.auto-claude/.env` from disk. This is the only remaining open action from the 20-finding security audit.

**Hardcoded `innerHTML` Spinner String (Accepted Risk):**
- Risk: `scripts/ui/UIManager.js:1097` assigns `cancelBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Cancelling...'`. This is a fully hardcoded string with no user data and is safe in isolation, but inconsistent with the codebase's `escapeHtml()` pattern for dynamic content. Recorded as INFO-002 in security scan with accepted risk status.
- Files: `scripts/ui/UIManager.js:1097`
- Current mitigation: No user input flows into this string.
- Recommendations: No immediate action. For consistency, replace with a template render call or add a lint-disable comment to suppress future warnings.

## Performance Bottlenecks

**localStorage Size Cap Blocks Large Index Caching:**
- Problem: `StorageService.js:265` enforces a 4.5MB ceiling on localStorage writes. When IndexedDB is unavailable (private browsing, storage quota exceeded), large TVA caches exceeding 4.5MB cannot be persisted.
- Files: `scripts/services/StorageService.js:264-270`
- Cause: Browser localStorage has a ~5MB total quota per origin. The 4.5MB per-key limit leaves some headroom but will still fail for large FA token packs.
- Improvement path: Compress JSON before the localStorage write (e.g., LZ-string), or selectively cache only the category index rather than all paths when using the fallback path.

**`MAX_DISPLAY_RESULTS` Cap in Match Selection UI:**
- Problem: The match-selection dialog is capped at 200 rendered results (`scripts/core/Constants.js:18`, applied at `scripts/ui/UIManager.js:337`). Results beyond 200 are silently truncated.
- Files: `scripts/core/Constants.js:18`, `scripts/ui/UIManager.js:337-338`
- Cause: Rendering more than 200 token thumbnails in the dialog causes noticeable DOM jank
- Improvement path: Virtual scrolling or pagination in `UIManager.js`

## Fragile Areas

**IndexWorker / Main Thread Parity:**
- Files: `scripts/workers/IndexWorker.js:447-514`, `scripts/core/Utils.js:379-465`
- Why fragile: `CDN_SEGMENTS` and `isExcludedPath()` exist in two independent copies. A difference in set members or filtering logic between copies produces silently different categorization results depending on whether the Worker is available or the fallback runs. No automated test exercises both code paths with the same inputs and asserts identical output.
- Safe modification: When modifying `CDN_SEGMENTS` or `isExcludedPath()` in either file, search for `SYNC:` markers and apply the identical change to the counterpart file. Run `npm test` after.
- Test coverage: No cross-copy parity test exists. `tests/core/Utils.test.js` covers the main-thread version only.

**StorageService IndexedDB Connection State:**
- Files: `scripts/services/StorageService.js:54-125`
- Why fragile: `openDatabase()` caches the connection in `this.db` and tracks an in-flight promise in `this.dbPromise`. On unexpected close (`db.onclose`, line 87) or version change (`db.onversionchange`, line 94), both are nulled. The `onblocked` handler has a 10-second timeout (line 70) before rejecting — in scenarios with multiple simultaneous tabs at different module versions, this may cascade silently into the localStorage fallback.
- Safe modification: All public methods wrap IndexedDB calls in `try/catch` with localStorage fallback. New storage operations must follow this same pattern.
- Test coverage: `tests/services/StorageService.test.js` covers both paths (31 tests, all passing as of commit `53ad614`).

## Scaling Limits

**localStorage (fallback path):**
- Current capacity: 4.5MB enforced per-write limit (`scripts/services/StorageService.js:265`)
- Limit: ~5MB total browser quota per origin; large FA packs will exceed per-key write limit
- Scaling path: IndexedDB (primary path) has no practical size limit; localStorage is fallback only

**Match Selection UI Results:**
- Current capacity: 200 results rendered (`scripts/core/Constants.js:18`)
- Limit: DOM jank above 200 thumbnails
- Scaling path: Virtual scrolling or lazy-loading thumbnails in `scripts/ui/UIManager.js`

## Dependencies at Risk

**Fuse.js 7.0.0 via jsdelivr CDN:**
- Risk: Version is pinned in the CDN URL (`scripts/core/Constants.js:8`, `scripts/workers/IndexWorker.js:15`). A CDN outage or compromise causes `loadFuse()` to return `null`, disabling fuzzy name matching entirely. The two copies of the CDN URL can also drift if one is updated without the other.
- Impact: Fuzzy name matching unavailable; only exact category matches work. Search continues but quality degrades silently.
- Migration plan: Bundle locally as `scripts/vendor/fuse.mjs` to remove the CDN dependency. Update both `Constants.js:8` and `IndexWorker.js:15`.

## Missing Critical Features

**Forge Bazaar Integration:**
- Problem: The `forgeBazaar` priority setting is selectable in the UI but has no functional implementation. Users selecting this priority receive TVA-backed results with no indication the setting has no effect.
- Blocks: True Forge Bazaar browsing/search cannot be implemented without a public API.

## Test Coverage Gaps

**Worker / Main-Thread Parity:**
- What's not tested: No test verifies that `isExcludedPath()` in `IndexWorker.js` and `Utils.js` produce identical results for the same inputs. `CDN_SEGMENTS` set equality is also untested.
- Files: `scripts/workers/IndexWorker.js:488`, `scripts/core/Utils.js:430`
- Risk: Silent behavioral divergence between worker and fallback code paths causes different token sets to be indexed depending on which path runs.
- Priority: Medium

**ForgeBazaarService:**
- What's not tested: No dedicated test file exists. The stub is only mocked (never called) in `tests/services/SearchOrchestrator.test.js` and `tests/services/SearchService.test.js`.
- Files: `scripts/services/ForgeBazaarService.js`
- Risk: Low today (always returns empty). Becomes high if the service is ever activated.
- Priority: Low

---

*Concerns audit: 2026-05-27*
