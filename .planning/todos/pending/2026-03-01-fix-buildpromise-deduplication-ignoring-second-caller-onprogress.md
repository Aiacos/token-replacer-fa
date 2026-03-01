---
created: 2026-03-01T07:01:00.498Z
title: Fix buildPromise deduplication ignoring second caller onProgress
area: quality
files:
  - scripts/services/IndexService.js:1271-1354
---

## Problem

When `build()` is called concurrently, the second caller joins the existing `buildPromise`. However, the `onProgress` callback provided by the second caller is silently ignored because the IIFE uses the first caller's callback. The background build in `main.js` fires first without a progress callback, so when `processTokenReplacement()` calls `build()` with a progress callback, it joins the background promise and never receives progress updates.

## Solution

Maintain a list of progress callbacks and invoke all registered callbacks on progress updates, or separate the "is build needed?" check from the "build with progress" operation.
