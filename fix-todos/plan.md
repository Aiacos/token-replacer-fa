# Fix Plan — Review Findings (Cycle 9)

No TODO comments found. Fixing functional bugs from 4-agent review.

## Items to Fix

### R1. Dialog close race condition [HIGH - Logic]

- **File:** UIManager.js:930-936
- **Issue:** Old dialog close not awaited; \_onClose can resolve NEW dialog's \_pendingResolve
- **Fix:** Await old dialog close before creating new one
- **Status:** PENDING

### R2. Duplicate event delegation on initial render [MEDIUM - Perf]

- **File:** UIManager.js:644-673
- **Issue:** setupMatchSelectionHandlers sets up click/dblclick delegation, then \_renderMatchGrid sets up identical delegation again
- **Fix:** Remove duplicate block in setupMatchSelectionHandlers; let \_renderMatchGrid handle it
- **Status:** PENDING

### R3. \_wireCancelButton clones DOM on every progress update [MEDIUM - Perf]

- **File:** UIManager.js:993-1004
- **Issue:** cancelBtn cloneNode+replaceWith on every progress update causes reflows
- **Fix:** Use AbortController pattern, wire once
- **Status:** PENDING

### R4. StorageService.remove() resolves on request.onsuccess not transaction.oncomplete [MEDIUM - Logic]

- **File:** StorageService.js:325-344
- **Issue:** Inconsistent with save() which uses transaction.oncomplete
- **Fix:** Switch to transaction.oncomplete like save()
- **Status:** PENDING

### R5. Non-array TVA cache categories crash for...of loop [MEDIUM - Logic]

- **File:** TVACacheService.js:196-218
- **Issue:** If JSON contains metadata keys (non-array values), for...of throws TypeError
- **Fix:** Add Array.isArray guard before iterating category
- **Status:** PENDING

### R6. Migration check returns true every time (old data kept) [MEDIUM - Logic]

- **File:** IndexService.js:200-207
- **Issue:** needsMigration always true because localStorage backup is kept after migration
- **Fix:** After successful migration, remove old localStorage key
- **Status:** PENDING
