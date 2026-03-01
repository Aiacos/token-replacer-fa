---
created: 2026-03-01T06:58:20.716Z
title: Inject indexService via setDependencies instead of static import
area: architecture
files:
  - scripts/services/SearchOrchestrator.js:25
  - scripts/services/SearchOrchestrator.js:512
  - scripts/services/SearchOrchestrator.js:794
---

## Problem

`SearchOrchestrator` receives `tvaCacheService` and `forgeBazaarService` via `setDependencies()` (explicit DI), but hard-imports `indexService` as a module-level singleton. This inconsistency means the orchestrator cannot be used with a mock index in tests and creates an implicit dependency that contradicts the injection pattern used for the other two services.

## Solution

Add `indexService` as a third parameter to `setDependencies()`:
```javascript
setDependencies(tvaCacheService, forgeBazaarService, indexService) {
  this.tvaCacheService = tvaCacheService;
  this.forgeBazaarService = forgeBazaarService;
  this.indexService = indexService;
}
```
Update `SearchService.init()` to pass it. Replace all `indexService.` references with `this.indexService.` in the orchestrator. This aligns with Phase 6 (DI Refactor) in the roadmap.
