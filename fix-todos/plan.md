# Fix Plan — Combined Review/Predict/Security TODOs (Cycle 2)

Session: review-predict-todos
Total: 16 TODOs (5 HIGH, 7 MEDIUM, 1 LOW, 3 deferred)

## Quick Fixes (single-line or minimal changes)

### T1. SearchOrchestrator: Promise.all → Promise.allSettled [HIGH]

- **File:** SearchOrchestrator.js:1157
- **Fix:** Replace Promise.all with Promise.allSettled, filter fulfilled results
- **Status:** PENDING

### T4. main.js: Auto-replace score fallback 0.8 → 0 [MEDIUM]

- **File:** main.js:590
- **Fix:** Change fallback from 0.8 to 0 so unscored results always prompt user
- **Status:** PENDING

### T7. IndexWorker: Double-post on Fuse.js failure [MEDIUM]

- **File:** IndexWorker.js:294
- **Fix:** Remove redundant 'complete' post since loadFuse() already posted 'error'
- **Status:** PENDING

### T8. main.js: error.stack disclosure to GMs [MEDIUM]

- **File:** main.js:731
- **Fix:** Use error.message instead of error.stack
- **Status:** PENDING

### T9. TVACacheService: HEAD request credentials [MEDIUM]

- **File:** TVACacheService.js:345
- **Fix:** Add credentials: 'omit' to HEAD fetch options
- **Status:** PENDING

### T10. Utils.js: hasOwnProperty hardening [MEDIUM]

- **File:** Utils.js:282
- **Fix:** Use Object.prototype.hasOwnProperty.call() instead of direct access
- **Status:** PENDING

## Moderate Fixes (5-20 lines)

### T3. main.js: isProcessing race condition [HIGH]

- **File:** main.js:345
- **Fix:** Use AbortController pattern — onClose signals abort, finally block is sole owner of isProcessing reset
- **Status:** PENDING

### T5. SearchOrchestrator: searchCache LRU eviction [HIGH]

- **File:** SearchOrchestrator.js:43
- **Fix:** Add MAX_SEARCH_CACHE_SIZE and evict oldest entries when exceeded
- **Status:** PENDING

### T6. SearchOrchestrator: Worker timeout [MEDIUM]

- **File:** SearchOrchestrator.js:369
- **Fix:** Wrap Worker Promise with 60s timeout + cleanup
- **Status:** PENDING

### T11. IndexService: QuotaExceededError notification [MEDIUM]

- **File:** IndexService.js:317
- **Fix:** Add ui.notifications.warn call for user visibility
- **Status:** PENDING

## Larger Fixes (performance optimizations, 20+ lines)

### T2. SearchOrchestrator: Worker creature-type filter [HIGH]

- **File:** SearchOrchestrator.js:357
- **Fix:** Pass creatureType to Worker postMessage, add filter logic in Worker
- **Status:** PENDING

### T12. TVACacheService: O(n\*m) search optimization [HIGH]

- **File:** TVACacheService.js:463
- **Fix:** Pre-lowercase at parse time, build simple term index for O(1) lookups
- **Status:** PENDING

### T13. UIManager: innerHTML rebuild optimization [MEDIUM]

- **File:** UIManager.js:488
- **Fix:** Use CSS visibility toggling instead of full DOM rebuild
- **Status:** PENDING

### T14. Utils.js: Full-clear LRU eviction [LOW]

- **File:** Utils.js:402
- **Fix:** Implement proper LRU eviction (delete oldest 25% on overflow)
- **Status:** PENDING

## Deferred (Needs User Decision)

### HIGH-001. Fuse.js CDN bundling [HIGH - Architecture]

- **File:** Constants.js:8
- **Action:** User must decide: bundle locally vs SRI vs post-load verification
- **Status:** DEFERRED

### D2. StorageService schema validation [MEDIUM - Refactor]

- **File:** StorageService.js:250
- **Action:** Larger refactor — JSON.parse reviver + shape validation
- **Status:** DEFERRED
