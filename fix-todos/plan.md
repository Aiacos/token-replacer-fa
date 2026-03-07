# Fix Plan — Security Scan TODOs (Cycle 10)

Session: security-scan-todos
Total: 11 TODOs (2 HIGH, 6 MEDIUM, 2 LOW, 1 deferred)

## Fixable Now

### T1. SearchOrchestrator: Fuse.js silent failure [HIGH]
- **File:** SearchOrchestrator.js:302
- **Fix:** Add console.warn before returning empty results when Fuse is null
- **Status:** PENDING

### T2. main.js: Failed replacement warning [HIGH]
- **File:** main.js:689
- **Fix:** Replace _debugLog with ui.notifications.warn, fix misleading message
- **Status:** PENDING

### T3. main.js: loadFuse() unchecked return [MEDIUM]
- **File:** main.js:809
- **Fix:** Check return value, warn user if Fuse.js failed to load
- **Status:** PENDING

### T4. Utils.test.js: Protocol rejection tests [MEDIUM - Test]
- **File:** tests/core/Utils.test.js:218
- **Fix:** Add tests for javascript:/data:/vbscript: rejection
- **Status:** PENDING

### T5. Utils.test.js: Prototype pollution tests [MEDIUM - Test]
- **File:** tests/core/Utils.test.js:484
- **Fix:** Add tests for __proto__/constructor/prototype key filtering
- **Status:** PENDING

### T6. TVACacheService.test.js: Origin validation tests [MEDIUM - Test]
- **File:** tests/services/TVACacheService.test.js:413
- **Fix:** Add tests for cross-origin rejection and credentials:omit
- **Status:** PENDING

### T7. TokenService: Error propagation [MEDIUM]
- **File:** TokenService.js:225
- **Fix:** Throw structured error instead of returning false
- **Status:** PENDING

### T8. UIManager: AbortController in setupMatchSelectionHandlers [LOW]
- **File:** UIManager.js:591
- **Fix:** Add AbortController signal to image load/error listeners
- **Status:** PENDING

### T9. UIManager: AbortController in setupNoMatchHandlers [LOW]
- **File:** UIManager.js:772
- **Fix:** Add AbortController signal (same pattern as T8)
- **Status:** PENDING

## Deferred (Needs User Decision)

### HIGH-001. Fuse.js CDN integrity [HIGH - Architecture]
- **File:** Constants.js:8
- **Action:** User must decide: bundle locally vs SRI vs post-load verification
- **Status:** DEFERRED

### MED-007. StorageService schema validation [MEDIUM - Refactor]
- **File:** StorageService.js:250
- **Action:** Larger refactor — JSON.parse reviver + shape validation
- **Status:** DEFERRED
