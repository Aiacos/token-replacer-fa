# Phase 10: Error Handling and Worker Lifecycle - Research

**Researched:** 2026-03-06
**Domain:** Error handling patterns, Web Worker lifecycle, Foundry VTT notification API
**Confidence:** HIGH

## Summary

Phase 10 addresses two related concerns: (1) making all error exits consistent via `createModuleError()` and surfacing recovery suggestions to users, and (2) ensuring the Web Worker is properly managed (lazy init, clean termination, crash recovery). The codebase already has strong foundations -- `createModuleError()` exists in Utils.js, most services already use it, and IndexService/SearchOrchestrator already have lazy worker init and terminate methods. The remaining work is closing gaps: wrapping async hooks in main.js with try-catch, converting remaining bare `throw new Error()` and `console.error()` exit points, surfacing `recoverySuggestions` via permanent notifications, and adding module unload cleanup.

**Audit findings:** 8 bare `throw new Error()` calls remain (7 in IndexWorker.js which is acceptable since workers cannot access `game.i18n`, 1 in SearchOrchestrator.js). Multiple `console.error()` calls in services act as error exit points without user notification. The async IIFE in the `ready` hook has no top-level try-catch. No module unload hook exists for worker cleanup.

**Primary recommendation:** This is a targeted refactoring phase -- no new libraries or patterns needed. Use existing `createModuleError()` consistently, add `ui.notifications.error()` with `{ permanent: true }` for recovery suggestions, and add `window.addEventListener('beforeunload')` for worker termination.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| ERR-01 | All async hook handlers wrapped in try-catch with user-visible error reporting | Audit identified `ready` hook async IIFE and `getSceneControlButtons` hook lack try-catch. Pattern: wrap in try-catch calling `ui.notifications.error()` |
| ERR-02 | All services use consistent createModuleError pattern with recovery suggestions | Audit found 1 bare `throw new Error()` in SearchOrchestrator.js:340. Multiple `console.error()` in TokenService, StorageService act as silent exit points needing conversion |
| ERR-03 | IndexedDB transaction abort handlers prevent silent data loss | StorageService already has `transaction.onabort` handlers on all operations. Verify they surface errors rather than silently swallowing |
| ERR-04 | Worker error/messageerror handlers surface failures to user | IndexService has `errorHandler` but does not call `ui.notifications`. SearchOrchestrator similarly. Need to add user-facing notification |
| WORK-01 | Worker initialization is lazy (deferred to first use) | Already implemented via `_ensureWorker()` in both IndexService and SearchOrchestrator. Verify and document |
| WORK-02 | Worker termination is clean (no dangling listeners or references) | `terminate()` exists on both services but is never called. Need `beforeunload` listener or Foundry hook |
| WORK-03 | Worker crash recovery falls back to direct indexing with user notification | IndexService already falls back (line 733-738) but does not call `ui.notifications.warn()`. SearchOrchestrator crashes reject the promise but no user notification |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| createModuleError | N/A (Utils.js) | Structured error factory | Already exists, used by most services |
| ui.notifications | Foundry VTT API | User-facing error/warn/info messages | Standard Foundry notification system |

### Supporting
No new libraries needed. All patterns already exist in the codebase.

## Architecture Patterns

### Pattern 1: Structured Error with Recovery Suggestions
**What:** `createModuleError(errorType, details, recoveryKeys)` creates objects with `errorType`, `message` (localized), `details`, and `recoverySuggestions` array.
**When to use:** Every service error exit point.
**Example:**
```javascript
// Already exists in Utils.js
import { createModuleError } from '../core/Utils.js';

// In service methods:
throw createModuleError(
  'search_failed',
  `Technical details: ${error.message}`,
  ['reload_module', 'check_console']
);
```

### Pattern 2: Async Hook Try-Catch Wrapper
**What:** Top-level try-catch around all async operations in Foundry hooks.
**When to use:** `Hooks.once('init')`, `Hooks.once('ready')`, and any `Hooks.on()` with async callbacks.
**Example:**
```javascript
Hooks.once('ready', async () => {
  try {
    // ... existing code ...
  } catch (error) {
    console.error(`${MODULE_ID} | Error in ready hook:`, error);
    ui.notifications.error(
      `Token Replacer FA: Initialization failed. ${error.message || 'Check console for details.'}`,
      { permanent: true }
    );
  }
});
```

### Pattern 3: Recovery Suggestion Surfacing
**What:** When a `ModuleError` with `recoverySuggestions` is caught, display suggestions as permanent notifications.
**When to use:** At every catch boundary that handles ModuleError objects.
**Example:**
```javascript
catch (error) {
  if (error.recoverySuggestions?.length > 0) {
    const suggestions = error.recoverySuggestions.join('. ');
    ui.notifications.error(
      `${error.message}. ${suggestions}`,
      { permanent: true }
    );
  } else {
    ui.notifications.error(error.message || 'An error occurred.');
  }
}
```

### Pattern 4: Worker Crash Recovery with User Notification
**What:** When worker fails, fall back to direct processing AND notify user.
**When to use:** IndexService.build() worker fallback path, SearchOrchestrator worker search.
**Example:**
```javascript
try {
  return await this.indexPathsWithWorker(paths, onProgress);
} catch (error) {
  console.warn(`${MODULE_ID} | Worker failed, falling back:`, error);
  ui.notifications.warn(
    game.i18n.localize('TOKEN_REPLACER_FA.notifications.workerFallback') ||
    'Token Replacer FA: Background worker failed, using slower method.',
    { permanent: false }
  );
  this.worker = null;
  return await this.indexPathsDirectly(paths, onProgress);
}
```

### Pattern 5: Module Unload Cleanup
**What:** Clean termination of workers and DB connections on page unload.
**When to use:** In main.js, register once during init or ready.
**Example:**
```javascript
// In main.js, after ready hook
window.addEventListener('beforeunload', () => {
  indexService.terminate();
  searchOrchestrator.terminate();
  storageService.close();
});
```

### Anti-Patterns to Avoid
- **Silent swallow:** `catch (e) { /* empty */ }` -- always log and ideally notify
- **Bare throw in services:** `throw new Error('...')` -- use `createModuleError()` instead
- **console.error without user notification:** User never sees the error -- always pair with `ui.notifications`
- **Worker IndexWorker.js bare throws:** These are ACCEPTABLE -- worker cannot access `game.i18n`, and the outer try-catch in the message handler converts them to `{ type: 'error', message }` postMessages

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Error creation | Custom error classes | `createModuleError()` | Already standardized, includes i18n |
| User notifications | Custom dialog/toast | `ui.notifications.error/warn/info()` | Foundry standard, users expect it |
| Worker state machine | Complex worker manager | Simple `_ensureWorker()` + `terminate()` | Workers are simple in this module |

## Common Pitfalls

### Pitfall 1: Worker Context Cannot Access game.i18n
**What goes wrong:** Trying to use `createModuleError()` inside IndexWorker.js
**Why it happens:** Workers run in separate thread without access to Foundry globals
**How to avoid:** Keep bare `throw new Error()` in IndexWorker.js -- the main thread handler in `indexPathsWithWorker` wraps these into structured errors
**Warning signs:** `ReferenceError: game is not defined` in worker context

### Pitfall 2: Double Error Notification
**What goes wrong:** Both the service layer AND main.js catch block show error notifications
**Why it happens:** Service throws structured error, main.js catches and shows another notification
**How to avoid:** Services should throw errors (not notify). Only the top-level catch in main.js (or hook handlers) should call `ui.notifications`. Services use `console.error/warn` for logging only.
**Warning signs:** User sees two error popups for one failure

### Pitfall 3: Permanent Notifications Accumulating
**What goes wrong:** Multiple permanent error notifications stack up and annoy users
**Why it happens:** Using `{ permanent: true }` too liberally
**How to avoid:** Only use `{ permanent: true }` for errors with recovery suggestions. Use default (dismissible) notifications for warnings and transient errors.

### Pitfall 4: beforeunload Handler Timing
**What goes wrong:** Worker terminate/DB close called during page navigation causes errors
**Why it happens:** `beforeunload` fires but Foundry may still be processing
**How to avoid:** Wrap cleanup in try-catch, don't await async operations in beforeunload (it's synchronous)

### Pitfall 5: StorageService console.error Inside Promise Callbacks
**What goes wrong:** StorageService has `console.error` inside `transaction.onerror/onabort` but these are inside Promise reject paths -- the error propagates correctly via reject
**Why it happens:** Looks like a bare error exit but is actually proper error propagation
**How to avoid:** Don't convert these to `ui.notifications` -- they are internal to the promise chain. The caller (IndexService, TVACacheService) handles user notification.

## Code Examples

### Existing createModuleError Usage (from SearchService.js)
```javascript
// This pattern is already correct -- services throw, callers catch
throw createModuleError(
  'search_failed',
  `Unexpected error: ${error.message || String(error)}`,
  ['check_console', 'reload_module']
);
```

### SearchOrchestrator.js Line 340 -- Needs Conversion
```javascript
// BEFORE (bare throw):
throw new Error('Web Worker not available');

// AFTER:
throw createModuleError(
  'worker_failed',
  'Web Worker not available for background search',
  ['reload_module']
);
```

### Ready Hook IIFE -- Needs Try-Catch
```javascript
// BEFORE (no try-catch around entire IIFE):
(async () => {
  // Phase 1: Load TVA cache
  try { ... } catch { ... }
  // Phase 2: Build index
  try { ... } catch { ... }
})();

// AFTER: Single top-level try-catch
(async () => {
  try {
    // Phase 1 + Phase 2 with existing inner try-catches
  } catch (error) {
    console.error(`${MODULE_ID} | Background initialization failed:`, error);
    ui.notifications.error(
      `Token Replacer FA: Background setup failed. ${error.message || ''}`,
      { permanent: false }
    );
  }
})();
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Bare `throw new Error()` | `createModuleError()` structured errors | Phase 6-7 | Most services converted |
| Silent `console.error` | Error + user notification | Phase 10 | Users see actionable messages |
| Eager worker init | Lazy `_ensureWorker()` | Phase 6 | Worker created on first use |

## Detailed Audit

### Bare `throw new Error()` Locations
| File | Line | Context | Action |
|------|------|---------|--------|
| IndexWorker.js | 94, 97, 100, 103, 282, 285, 288 | Input validation in worker | KEEP -- worker cannot access game.i18n |
| SearchOrchestrator.js | 340 | `searchLocalIndexWithWorker` guard | CONVERT to createModuleError |

### console.error as Error Exit Points (Services Only)
| File | Line | Context | Action |
|------|------|---------|--------|
| TokenService.js | 225 | replaceTokenImage catch | Already returns false; add createModuleError for consistency |
| SearchService.js | 45 | init() failure | Already throws createModuleError after console.error -- OK |
| StorageService.js | 71, 208, 212, etc. | IndexedDB operations | Inside Promise reject chains -- OK, callers handle |
| IndexService.js | 962, 987 | Worker error handlers | Already creates structured errors -- OK |

### Async Hooks Without Top-Level Try-Catch
| Hook | File | Line | Action |
|------|------|------|--------|
| `Hooks.once('init')` | main.js | 762 | Wrap body in try-catch with ui.notifications.error |
| `Hooks.once('ready')` async IIFE | main.js | 806 | Wrap entire IIFE in top-level try-catch |
| `Hooks.on('getSceneControlButtons')` | main.js | 908 | Synchronous but should have try-catch for safety |

### Worker Lifecycle Gaps
| Gap | Location | Action |
|-----|----------|--------|
| No unload cleanup | main.js | Add `beforeunload` or Foundry hook to call terminate() |
| Worker crash no user notification | IndexService.js:733-738 | Add `ui.notifications.warn()` |
| SearchOrchestrator worker crash no notification | SearchOrchestrator.js:386-391 | Add `ui.notifications.warn()` |

### Recovery Suggestions Not Surfaced
| Location | Issue | Action |
|----------|-------|--------|
| main.js:740 | `ui.notifications.error()` shows message but not recovery suggestions | Append suggestions to notification text |
| main.js:734 (error dialog) | Error dialog shows recovery via template -- OK | No change needed |

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 3.2.x |
| Config file | vitest.config.js |
| Quick run command | `npx vitest --run` |
| Full suite command | `npx vitest --run` |

### Phase Requirements to Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| ERR-01 | Async hooks have try-catch with ui.notifications | unit | `npx vitest --run tests/main.test.js -t "hook error"` | No -- Wave 0 |
| ERR-02 | All service error exits use createModuleError | unit | `npx vitest --run tests/services/ -t "createModuleError"` | Partial -- existing tests cover some |
| ERR-03 | IndexedDB abort handlers prevent silent data loss | unit | `npx vitest --run tests/services/StorageService.test.js -t "abort"` | Yes |
| ERR-04 | Worker error handlers surface to user | unit | `npx vitest --run tests/services/IndexService.test.js -t "worker error"` | Partial |
| WORK-01 | Worker init is lazy | unit | `npx vitest --run tests/services/IndexService.test.js -t "lazy"` | Yes |
| WORK-02 | Worker termination is clean | unit | `npx vitest --run tests/services/IndexService.test.js -t "terminate"` | Partial |
| WORK-03 | Worker crash fallback with notification | unit | `npx vitest --run tests/services/IndexService.test.js -t "fallback"` | Partial |

### Sampling Rate
- **Per task commit:** `npx vitest --run`
- **Per wave merge:** `npx vitest --run`
- **Phase gate:** Full suite green before verify

### Wave 0 Gaps
- [ ] Tests for main.js hook error handling (ERR-01) -- may need main.js test file or integration test
- [ ] Tests verifying `ui.notifications.warn()` is called on worker fallback (WORK-03)
- [ ] Tests verifying recovery suggestions are included in notifications (ERR-02)

## Open Questions

1. **Main.js hook testing approach**
   - What we know: main.js registers hooks globally; testing hook error handling requires mocking Hooks
   - What's unclear: Whether to create a main.test.js or test via integration tests
   - Recommendation: Since main.js hooks are already tested implicitly via integration tests, verify ERR-01 via manual inspection + type checking rather than unit tests. The async IIFE pattern is simple enough that try-catch correctness is self-evident.

2. **Localization keys for new notifications**
   - What we know: lang/en.json and lang/it.json need new keys for worker fallback messages
   - What's unclear: Exact key naming convention
   - Recommendation: Add keys under `TOKEN_REPLACER_FA.notifications.workerFallback` and `TOKEN_REPLACER_FA.notifications.initFailed`

## Sources

### Primary (HIGH confidence)
- Direct codebase audit of all .js files in scripts/ directory
- Existing createModuleError pattern in Utils.js (line 453-462)
- Existing IndexService worker lifecycle code (lines 80-121, 898-1000)
- Foundry VTT ui.notifications API (from codebase usage patterns)

### Secondary (MEDIUM confidence)
- Foundry VTT v12-v13 API documentation for notification options (`{ permanent: true }`)
- Web Worker API standard for terminate() and beforeunload cleanup

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - all patterns already exist in codebase, no new libraries
- Architecture: HIGH - direct audit of every error exit point in every file
- Pitfalls: HIGH - identified from actual code patterns and Foundry VTT specifics

**Research date:** 2026-03-06
**Valid until:** 2026-04-06 (stable domain, no external dependencies)
