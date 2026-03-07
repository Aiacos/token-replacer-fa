# Security Scan Report - Token Replacer FA v2.12.4

**Date:** 2026-03-07
**Scanner:** Claude Code Security Analysis (3-agent parallel scan + npm audit)
**Scope:** All JavaScript source files, Handlebars templates, build scripts, dependencies, environment files

---

## Executive Summary

| Severity | Count | Status |
|----------|-------|--------|
| Critical | 1     | PENDING |
| High     | 3     | PENDING |
| Medium   | 9     | PENDING |
| Low      | 5     | PENDING |

**Overall Risk: MEDIUM** — One critical finding (exposed GitHub token on disk). The source code demonstrates good security awareness with `escapeHtml()`, `sanitizePath()`, and proper input validation. Key areas for improvement are secrets management, CDN integrity, inline event handlers, and silent error handling patterns.

---

## CRITICAL

### CRIT-001: GitHub OAuth Token in Plaintext .env File
- **File:** `.auto-claude/.env:21`
- **Code:** `GITHUB_TOKEN=gho_[REDACTED]`
- **Risk:** CRITICAL
- **Description:** A live GitHub OAuth token (`gho_` prefix) is stored in plaintext. While `.auto-claude/` is gitignored, the token exists on disk and could leak via backup tools, file sharing, log aggregation, or if the `.gitignore` rule is accidentally removed.
- **Fix:**
  1. **Immediately revoke** the token at https://github.com/settings/tokens
  2. Generate a new token and store it in OS keychain or a secrets manager
  3. Add generic `.env` / `.env*` patterns to `.gitignore` as defense-in-depth
- **Status:** PENDING

---

## HIGH

### HIGH-001: CDN Dependency Without Subresource Integrity (SRI)
- **File:** `scripts/core/Constants.js:8`, `scripts/workers/IndexWorker.js:15`
- **Code:** `export const FUSE_CDN = 'https://cdn.jsdelivr.net/npm/fuse.js@7.0.0/dist/fuse.mjs';`
- **Risk:** HIGH
- **Description:** Fuse.js is loaded via dynamic `import()` from jsdelivr CDN without SRI hash verification. If the CDN is compromised (supply chain attack), malicious code executes in the Foundry VTT context with full module permissions in both main thread and Worker. Additionally, the CDN version (`7.0.0`) differs from the devDependency version (`^7.1.0` in package.json).
- **Fix:** Bundle Fuse.js locally within the module, or add post-load integrity verification.
- **Status:** PENDING

### HIGH-002: Inline Event Handlers in Dynamic HTML (CSP Bypass)
- **File:** `scripts/ui/UIManager.js:498`, `templates/match-selection.hbs:4,46`, `templates/no-match.hbs:4,12`
- **Code:** `onerror="this.src='icons/svg/mystery-man.svg'" onload="this.parentElement.classList.add('loaded')"`
- **Risk:** HIGH
- **Description:** Inline `onerror` and `onload` handlers are used in both dynamically generated `<img>` tags and Handlebars templates. This prevents Content Security Policy enforcement (requires `unsafe-inline`). The `onerror` handler also has a potential infinite loop if the fallback image fails to load.
- **Fix:** Replace inline handlers with `addEventListener()` via event delegation on the grid container. Apply to both UIManager.js and all HBS templates.
- **Status:** PENDING

### HIGH-003: .env Files Not Generically Excluded in .gitignore
- **File:** `.gitignore`
- **Risk:** HIGH
- **Description:** `.gitignore` excludes `.auto-claude/` as a directory but has no generic `.env` or `.env*` pattern. Any `.env` file created at the repo root would be tracked and potentially committed.
- **Fix:** Add `.env`, `.env.*`, `*.env` patterns to `.gitignore`.
- **Status:** PENDING

---

## MEDIUM

### MED-001: No URL Validation on TVA Cache File Path
- **File:** `scripts/services/TVACacheService.js:186`
- **Code:** `const response = await fetch(staticCacheFile);`
- **Risk:** MEDIUM
- **Description:** The TVA cache file path is fetched without URL validation. A compromised TVA config could point to an arbitrary external URL. Fetch requests also don't specify `credentials: 'omit'`, so cookies would be sent to any domain.
- **Fix:** Validate that `staticCacheFile` is a relative path or same-origin URL. Add `credentials: 'omit'`.
- **Status:** PENDING

### MED-002: Worker Message Handler Without Command Validation
- **File:** `scripts/workers/IndexWorker.js:32-73`
- **Risk:** MEDIUM
- **Description:** Worker message handler processes incoming messages without validating `event.data.command` type or `event.data.data` structure. Malformed data could cause unexpected behavior.
- **Fix:** Add type checking for `command` (must be string from allowed set) and `data` (must be object when present).
- **Status:** PENDING

### MED-003: Error Stack Traces Exposed
- **File:** `scripts/workers/IndexWorker.js:46,71`, `scripts/main.js:732`
- **Risk:** MEDIUM
- **Description:** Full stack traces are sent via Worker `postMessage` and shown in the error dialog UI. This leaks internal file paths, function names, and module structure.
- **Fix:** Only send/show `error.message` to users. Log full `error.stack` to console only.
- **Status:** PENDING

### MED-004: Dependency Vulnerability — tinymce XSS (Transitive)
- **File:** `package.json` (via `@league-of-foundry-developers/foundry-vtt-types`)
- **Risk:** MEDIUM (mitigated: dev dependency only, not shipped)
- **Advisory:** GHSA-5359-pvf2-pw78
- **Fix:** No action needed for production. `npm audit fix --force` to clear warnings.
- **Status:** PENDING (low priority)

### MED-005: No Protocol Validation on Image Paths
- **File:** `scripts/ui/UIManager.js:498`, `templates/match-selection.hbs:46`, `templates/no-match.hbs:4`
- **Risk:** MEDIUM
- **Description:** Image paths from TVA cache are used as `<img src>` without protocol validation. If cache data is corrupted via IndexedDB manipulation, `javascript:` or `data:` URIs could be injected. Modern browsers block script execution from `<img src>`, but defense-in-depth is lacking.
- **Fix:** Add protocol whitelist (`http:`, `https:`, `forge://`, relative paths). Reject `javascript:`, `data:`, `vbscript:`.
- **Status:** PENDING

### MED-006: Prototype Key Traversal in extractPathFromObject
- **File:** `scripts/core/Utils.js:298`
- **Risk:** MEDIUM
- **Description:** `Object.keys(obj)` iteration doesn't filter `__proto__`, `constructor`, or `prototype` keys. Crafted TVA cache data could cause traversal of prototype chains.
- **Fix:** Add: `if (key === 'data' || key === '__proto__' || key === 'constructor' || key === 'prototype') continue;`
- **Status:** PENDING

### MED-007: IndexedDB/localStorage Data Without Schema Validation
- **File:** `scripts/services/StorageService.js:255-316`, `scripts/services/TVACacheService.js:308-356`
- **Risk:** MEDIUM
- **Description:** Data from IndexedDB and localStorage is deserialized and used without schema validation. Individual image objects in the TVA cache are not validated, potentially producing entries with `undefined` paths. Another extension or devtools user could inject malicious data structures.
- **Fix:** Validate shape/types of loaded data. Sanitize paths through `sanitizePath()`. Consider `JSON.parse` reviver to strip `__proto__` keys.
- **Status:** PENDING

### MED-008: Build Script Variable Injection Risk
- **File:** `build.sh:38-41,153-155`, `sync-version.sh:58,73,76`, `build.bat:21-23,133-137`
- **Risk:** MEDIUM
- **Description:** Build scripts extract values from `module.json` via grep/sed and use them in shell/PowerShell commands. Malicious version strings with metacharacters could cause command injection. `build.bat` passes values directly into PowerShell commands via string interpolation.
- **Fix:** Validate extracted values against strict regex (e.g., `^[0-9]+\.[0-9]+\.[0-9]+$` for version) before use.
- **Status:** PENDING

### MED-009: Silent Error Handling Patterns (Multiple Locations)
- **Files:** `ScanService.js:53-54,265-266`, `UIManager.js:1016-1018,1085-1087`, `IndexService.js:284-286,596-598`, `TVACacheService.js:404`, `SearchOrchestrator.js:303-305`
- **Risk:** MEDIUM
- **Description:** Multiple empty catch blocks silently discard errors across the codebase. Key patterns include: (a) `ScanService` swallowing FilePicker and TVA API errors, making "no results" indistinguishable from "API failure"; (b) `UIManager` swallowing dialog update errors; (c) `IndexService` swallowing cache cleanup failures creating infinite failure loops; (d) `TVACacheService` `.catch(() => {})` on cache removal; (e) Fuse.js load failure returning empty results without warning. Some of these have existing TODO comments from Phase 10.
- **Fix:** At minimum, add `console.warn()` to every empty catch block. Propagate structured errors where callers need to distinguish "no results" from "search failed."
- **Status:** PENDING (partially tracked by existing TODOs)

---

## LOW

### LOW-001: Hardcoded Fallback Image Path
- **File:** `scripts/ui/UIManager.js:498`
- **Risk:** LOW
- **Description:** Fallback image path `icons/svg/mystery-man.svg` is hardcoded. Part of the inline handler pattern from HIGH-002.
- **Fix:** Define as a constant and use via `addEventListener`.
- **Status:** PENDING

### LOW-002: Console Logging of Potentially Sensitive Paths
- **File:** `scripts/core/Utils.js:81,88,93`
- **Risk:** LOW
- **Description:** `sanitizePath()` logs rejected paths via `console.warn()`, exposing file path information.
- **Fix:** Use `_debugLog()` pattern instead.
- **Status:** PENDING

### LOW-003: Window Global Exposure
- **File:** `scripts/main.js:765`
- **Risk:** LOW
- **Description:** `window.TokenReplacerFA` exposes the full module instance. Standard Foundry practice but expands attack surface.
- **Fix:** Consider `Object.freeze()` or exposing a limited public API.
- **Status:** PENDING

### LOW-004: package.json Version Mismatch
- **File:** `package.json:3`
- **Risk:** LOW (operational)
- **Description:** `package.json` declares `2.12.3` while `module.json` declares `2.12.4`. The sync script doesn't update `package.json`.
- **Fix:** Include `package.json` in the version sync script.
- **Status:** PENDING

### LOW-005: Filter Term localStorage Without Length Limit
- **File:** `scripts/ui/UIManager.js:72-95`
- **Risk:** LOW
- **Description:** User filter terms persisted to localStorage without length validation. An extremely long string could slow filter operations.
- **Fix:** Add max length check (e.g., 200 chars) when reading from localStorage.
- **Status:** PENDING

---

## Positive Security Patterns Found

1. **XSS Protection:** `escapeHtml()` consistently used for all user-controlled data in `innerHTML` contexts
2. **Path Traversal Protection:** `sanitizePath()` with null byte, traversal, and absolute path checks
3. **No eval/Function:** Zero instances of `eval()`, `new Function()`, or string-based `setTimeout`
4. **Template Safety:** All Handlebars templates use `{{}}` (auto-escaped), zero `{{{}}}`  usage
5. **GM-Only Access:** Scene control button restricted to `game.user.isGM`
6. **Proper JSON Parsing:** All `JSON.parse`/`response.json()` wrapped in try-catch
7. **Worker Isolation:** Web Worker in isolated context with error handling and cancellation
8. **HTTPS Only:** All hardcoded URLs use HTTPS
9. **Recursion Limiting:** `extractPathFromObject` depth-limited to 3
10. **Clean Localization:** `lang/*.json` files contain only plain text, no HTML/scripts
11. **Structured Error Pattern:** `createModuleError`/`_createError` provides user-facing messages with recovery suggestions

---

## Recommendations (Priority Order)

1. **IMMEDIATELY revoke** the exposed GitHub token (CRIT-001)
2. **Add `.env` patterns** to `.gitignore` (HIGH-003) — 10 second fix
3. **Bundle Fuse.js locally** or add integrity verification (HIGH-001)
4. **Replace inline event handlers** with `addEventListener` (HIGH-002)
5. **Add URL/protocol validation** for TVA cache fetch and image paths (MED-001, MED-005)
6. **Filter prototype keys** in extractPathFromObject (MED-006)
7. **Validate storage data** from IndexedDB/localStorage (MED-007)
8. **Add logging to empty catch blocks** (MED-009)
9. **Validate build script variables** against strict patterns (MED-008)
10. **Gate stack trace exposure** behind debug flag (MED-003)

---

## Scan Metadata

- **Agents Used:** 3 parallel security agents (XSS/injection, dependency/config, silent failures)
- **Files Scanned:** 14 JS source files, 8 HBS templates, 2 build scripts, package.json, module.json, .env, .gitignore, lang/*.json
- **npm audit:** 2 moderate vulnerabilities (tinymce XSS, dev dependency only)
- **Patterns Checked:** XSS, injection, prototype pollution, path traversal, ReDoS, hardcoded secrets, unsafe parsing, CSP compliance, dependency vulnerabilities, worker security, silent failures, build pipeline injection
- **Clean Patterns:** eval/Function injection, prototype pollution (write), ReDoS, triple-brace templates, committed secrets
