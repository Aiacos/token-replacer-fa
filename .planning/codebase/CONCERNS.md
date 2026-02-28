# Codebase Concerns

**Analysis Date:** 2025-02-28

## Tech Debt

**D&D 5e System-Specific Implementation:**

- Issue: Creature type extraction in `TokenService.getSceneNPCTokens()` is hardcoded for D&D 5e (`token.actor.system.details.type`)
- Files: `scripts/services/TokenService.js`
- Impact: Module cannot be used with other game systems; will silently fail or crash on incompatible systems
- Fix approach: Abstract creature type extraction into a system-agnostic interface; implement system-specific adapters; add system detection and fallback error handling

**ForgeBazaarService Is Non-Functional Stub:**

- Issue: Entire service returns empty results; lacks public API for Forge Bazaar asset discovery
- Files: `scripts/services/ForgeBazaarService.js` (434 lines of documentation, 0% functional)
- Impact: "forgeBazaar" and "both" search priority options provide no actual benefit; users get TVA-only results regardless
- Fix approach: Either remove from settings/UI entirely, or wait for Forge Bazaar to release public API (see detailed feasibility notes in ForgeBazaarService comments)

**localStorage Size Limit Hard Ceiling:**

- Issue: Index caching explicitly limited to ~4.5MB localStorage; larger indices silently fail to persist
- Files: `scripts/services/IndexService.js` (line 271), `scripts/services/StorageService.js` (line 228)
- Impact: Users with >4.5MB of token artwork will experience index rebuilds on every page load; no warning or fallback migration strategy
- Fix approach: Implement IndexedDB-only mode without localStorage fallback; add user notification of size limit exceeded; provide selective indexing (path filters) to reduce cache size

**Worker Error Handling Incomplete:**

- Issue: Worker errors in `searchLocalIndexWithWorker()` post structured error message to main thread, but some worker crash scenarios may not be caught
- Files: `scripts/services/SearchOrchestrator.js` (lines 311-387)
- Impact: Unhandled worker crashes could leave search hanging indefinitely if error event fires but message handler isn't attached
- Fix approach: Establish error handler BEFORE posting task; add timeout wrapper; implement health check ping before critical operations

**Index termIndex Rebuild on Cache Load:**

- Issue: Every time index is loaded from cache (first time after cache version bump), termIndex must be rebuilt from allPaths in main thread
- Files: `scripts/services/IndexService.js` (lines 226-244)
- Impact: User experiences UI pause on first load after version bump; termIndex not included in IndexedDB cache due to indexing complexity
- Fix approach: Either build and persist termIndex in IndexedDB as separate record, or build during worker phase (pass allPaths to worker for term indexing)

## Known Bugs

**TVA Cache Timeout May Mask Real Issues:**

- Symptoms: `loadTVACache()` waits up to 30 seconds for TVA caching to complete, then throws timeout error
- Files: `scripts/services/TVACacheService.js` (lines 49-92)
- Trigger: When TVA is slow to cache (large library, slow disk, network filesystem), or if cache never completes
- Workaround: Increase `maxWaitMs` parameter from 30000; disable TVA cache integration and use fallback scan
- Root cause: TVA's `isCaching()` function reliability depends on TVA implementation; no way to force completion or poll status

**Filter Term Persistence Can Break on Quota Exceeded:**

- Symptoms: Filter term saved to localStorage in UIManager fails silently when localStorage quota exceeded
- Files: `scripts/ui/UIManager.js` (lines 63-73)
- Trigger: After large index cached to localStorage, any attempt to save filter term fails without user notification
- Workaround: User must manually clear localStorage or reduce index size
- Root cause: `localStorage.setItem()` throws QuotaExceededError but try-catch only logs warning

**Race Condition in TVA Cache Load Promise Deduplication:**

- Symptoms: If `loadTVACache()` called multiple times concurrently, second call joins first promise but first caller may already return early
- Files: `scripts/services/TVACacheService.js` (lines 50-56)
- Trigger: Concurrent calls to `loadTVACache()` from different UI handlers
- Workaround: Calling code must handle the promise being already resolved before final assignment
- Root cause: Promise deduplication clears `_loadPromise` in `.finally()`, but concurrent caller may still be in promise chain

**SearchOrchestrator Worker Not Terminated on Module Unload:**

- Symptoms: Web Worker created in `SearchOrchestrator` is never explicitly terminated; threads accumulate if module reloaded
- Files: `scripts/services/SearchOrchestrator.js` (lines 40-54)
- Trigger: Module reload during development; reload world while searching
- Workaround: Close browser tab or restart Foundry to clean up workers
- Root cause: No cleanup hook in module lifecycle; `terminate()` method exists but never called

## Security Considerations

**No XSS Protection Validation in Dynamic Template Rendering:**

- Risk: While Handlebars auto-escapes by default, any dynamic HTML assignment via `.innerHTML` could introduce XSS
- Files: `scripts/ui/UIManager.js` (lines 150-200 for dialog wrapper; event handlers with innerHTML assignments)
- Current mitigation: `escapeHtml()` utility used in event handlers; Handlebars escaping in templates
- Recommendations: Audit all `.innerHTML` assignments for dynamic content; enforce Content Security Policy headers; add input validation for user-controlled filter terms

**Unvalidated File Paths in Token Image Replacement:**

- Risk: Token image paths come from search results without validation; could potentially point to arbitrary URLs if search service compromised
- Files: `scripts/main.js` (line 264 `replaceTokenImage()`), `scripts/services/TokenService.js`
- Current mitigation: TVA API handles path validation; paths filtered through `isExcludedPath()` for certain patterns
- Recommendations: Add whitelist validation for path prefixes; reject paths with suspicious patterns (parent directory traversal, protocol mismatches)

**localStorage Secrets Exposure:**

- Risk: If IndexedDB unavailable, cache falls back to localStorage which has no encryption
- Files: `scripts/services/StorageService.js` (line 221 localStorage fallback)
- Current mitigation: Only caches image metadata (paths, names, categories) - no sensitive data
- Recommendations: Document that cache contains no sensitive data; never store API keys or user tokens in cache

## Performance Bottlenecks

**IndexService.categorizeImage() CPU-Intensive on Large Datasets:**

- Problem: Linear scan through all creature type mappings (14 categories × ~20 terms each) for every image
- Files: `scripts/services/IndexService.js` (lines 138-174)
- Cause: Uses simple substring matching instead of pre-compiled regex; rebuilds match map for every image
- Improvement path: Pre-compile regex patterns for all terms at service initialization; batch categorization calls

**Main Thread Termination Missing for Worker Promise:**

- Problem: If worker crashes after task posted, rejection handler only logs error; search silently fails
- Files: `scripts/services/SearchOrchestrator.js` (lines 360-364)
- Cause: No timeout wrapper; relies entirely on worker to respond
- Improvement path: Add AbortController-based timeout (5-10s) to reject if worker doesn't respond; implement health check ping

**UIManager I18n Cache Unbounded Growth:**

- Problem: `I18N_CACHE` Map in UIManager has no eviction policy; grows indefinitely as strings are cached
- Files: `scripts/ui/UIManager.js` (lines 10-17)
- Cause: Used for optimization but never pruned; module lifetime = session duration for Foundry
- Improvement path: Implement LRU eviction at 1000 entries; or use `WeakMap` if keys are objects

**Index Build Blocking Even with Web Worker:**

- Problem: When worker unavailable, fallback uses `setInterval(_, 10)` yields; still blocks for small time slices during large index builds
- Files: `scripts/services/IndexService.js` (contains worker fallback with setTimeout)
- Cause: Main thread yields only in 10ms increments; large indices can accumulate blocking time
- Improvement path: Increase yield interval to 50-100ms; or move entire fallback to worker-like implementation using requestIdleCallback

## Fragile Areas

**Dialog Lifecycle Management with Multiple Hooks:**

- Files: `scripts/ui/UIManager.js`, `scripts/main.js` (lines 341-349)
- Why fragile: ApplicationV2 dialog creation requires `{ force: true }` on first render - without it fails silently; multiple UI hooks can cause race conditions in dialog creation
- Safe modification: Always call `dialog.render({ force: true })` on new dialogs; implement dialog queue to prevent concurrent creation; check `isDialogOpen()` before any DOM manipulation
- Test coverage: No automated tests; manual testing only via Foundry VTT interface

**TVACacheService Cache File Mutation During Fetch:**

- Files: `scripts/services/TVACacheService.js` (lines 138-150)
- Why fragile: Cache file path obtained from TVA config; if TVA changes path mid-operation, fetch fails silently; IndexedDB cache may have stale path stored
- Safe modification: Lock cache path once loaded; verify file mtime before using cached version; handle 404 gracefully
- Test coverage: No automated tests for file system edge cases

**SearchOrchestrator Parallel Batch Processing State:**

- Files: `scripts/services/SearchOrchestrator.js` (lines 556-592)
- Why fragile: Batch processing maintains `searchCount` counter across parallel Promise.allSettled calls; if batch rejected, counter may become inconsistent with actual progress
- Safe modification: Track actual completed results instead of counting batches; validate result count before incrementing progress
- Test coverage: Integration tests only; no unit tests for error paths

**Index Version Mismatch Recovery:**

- Files: `scripts/services/IndexService.js` (lines 214-219)
- Why fragile: If INDEX_VERSION bumped but cache deletion fails, service tries to use incompatible cache structure
- Safe modification: Verify cache structure after load; if incompatible, force deletion and rebuild; add version compatibility helper
- Test coverage: No tests for version mismatch scenarios

## Scaling Limits

**Worker Thread Pool Size:**

- Current capacity: Single worker shared across all search operations (IndexService, SearchOrchestrator)
- Limit: Cannot parallelize independent searches; if one long search in progress, others queue
- Scaling path: Implement worker pool manager; maintain 2-3 workers for parallel index/search operations; queue overflow searches on main thread with yields

**TVA Cache Memory Footprint:**

- Current capacity: Entire cache loaded into memory as `tvaCacheImages` array; no streaming
- Limit: Large token libraries (>50k images) may cause memory pressure on slower devices
- Scaling path: Lazy-load cache chunks; implement pagination; stream file parsing instead of full JSON load

**Index Cache Storage:**

- Current capacity: ~4.5MB localStorage OR unlimited IndexedDB (browser-dependent, typically 50MB-2GB)
- Limit: Quota exceeded silently fails with no alternative; users on slow network or shared browsers hit this
- Scaling path: Implement selective indexing (whitelist/blacklist paths); compress cache (gzip); migrate to Service Worker CacheAPI

**Parallel Batch Search Limits:**

- Current capacity: PARALLEL_BATCH_SIZE (from Constants.js) searches executed concurrently
- Limit: Each search makes TVA API call; TVA rate limiting may throttle or reject
- Scaling path: Implement exponential backoff; add configurable rate limiting; cache TVA results more aggressively

## Dependency Risks

**Token Variant Art Module Required But Version Unconstrained:**

- Risk: TVA_CONFIG structure may change in future TVA versions; static cache file format not guaranteed
- Impact: Module breaks silently if TVA API incompatible; cache parsing fails on version mismatch
- Migration plan: Monitor TVA releases; add TVA version compatibility matrix; implement feature detection instead of version checks

**Fuse.js CDN-Loaded with No Fallback:**

- Risk: If jsdelivr CDN unavailable or returns 404, search cannot execute
- Impact: Search feature completely unavailable; module becomes unusable
- Migration plan: Bundle Fuse.js locally instead of CDN; or fall back to built-in String.includes() for basic search

**Foundry VTT v12-v13 Compatibility Boundary:**

- Risk: ApplicationV2 API changed between v12 and v13; dialog event handling differs
- Impact: Module tested on v12 and v13 but not guaranteed for intermediate builds
- Migration plan: Monitor Foundry release notes; add compatibility shim layer; deprecate v12 support after EOL

## Missing Critical Features

**No Offline Mode:**

- Problem: All search requires TVA module or live network fetch; no offline fallback or local-only mode
- Blocks: Users in offline mode cannot use module; air-gapped Foundry instances cannot build index

**No Batch Token Replacement:**

- Problem: Tokens processed sequentially through UI flow; no bulk operation mode
- Blocks: Replacing hundreds of tokens one-by-one is tedious; users must repeat entire process

**No Search Filter Persistence Across Sessions:**

- Problem: Filter term saved only during session; cleared on page reload
- Blocks: Users cannot maintain search preferences; must re-enter filter each session

**No Progress Cancellation Feedback:**

- Problem: Cancel button in dialog doesn't provide visual feedback; user unsure if cancel worked
- Blocks: For long operations, user may click cancel multiple times thinking first click failed

## Test Coverage Gaps

**No Unit Tests:**

- What's not tested: IndexService categorization logic, StorageService IndexedDB operations, SearchOrchestrator batch logic, Worker message handling
- Files: All service files (`scripts/services/*`)
- Risk: Changes to complex logic (categorizeImage, search batch processing) may introduce bugs undetected
- Priority: HIGH - Unit tests would catch ~80% of edge case bugs before runtime

**No Integration Tests:**

- What's not tested: TVA cache load → index build → search flow; error recovery scenarios; race conditions in promise chains
- Files: Cross-module interactions in `main.js`, service initialization chain
- Risk: Module-level bugs (missing event listeners, race conditions) only found through manual testing
- Priority: HIGH - Integration tests essential for detecting promise/async flow issues

**No E2E Tests:**

- What's not tested: Full user workflow (select tokens → run replacement → verify results); UI dialog lifecycle
- Files: `scripts/ui/UIManager.js`, `scripts/main.js` (full flow)
- Risk: UI freeze, dialog not appearing, click events not working only found through manual Foundry VTT testing
- Priority: MEDIUM - Would require Foundry VTT test harness; less critical than unit/integration

**No Error Scenario Testing:**

- What's not tested: TVA timeout, cache corruption, localStorage full, worker crash, network failure
- Files: `scripts/services/TVACacheService.js`, `scripts/services/SearchOrchestrator.js`, `scripts/services/StorageService.js`
- Risk: Error recovery code paths untested; real-world failures may not be handled gracefully
- Priority: MEDIUM - Manual testing with simulated failures would improve robustness

---

_Concerns audit: 2025-02-28_
