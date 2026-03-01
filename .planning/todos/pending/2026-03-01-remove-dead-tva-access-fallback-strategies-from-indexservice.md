---
created: 2026-03-01T06:58:20.716Z
title: Remove dead TVA access fallback strategies from IndexService
area: architecture
files:
  - scripts/services/IndexService.js:436-757
---

## Problem

`IndexService.buildFromTVA()` implements 5 fallback strategies (Methods 1-5) to probe undocumented TVA internals (`_tryCacheImagePaths`, `_tryGetSearchCache`, `_tryTVAConfig`, `_tryGameSettings`, `_tryInternalCache`). These 300+ lines of code are dead in the normal flow — Method 0 (preloaded cache from TVACacheService) always succeeds. The fallback methods probe internal TVA structures by brute-force inspection, are fragile, undocumented, and duplicate TVACacheService's purpose.

## Solution

Remove Methods 1-5 from `buildFromTVA()`. If Method 0 (TVACacheService preloaded cache) fails, fall back directly to `buildFromTVASearch()`. This removes 300+ lines of dead code and consolidates TVA access into TVACacheService where it belongs.
