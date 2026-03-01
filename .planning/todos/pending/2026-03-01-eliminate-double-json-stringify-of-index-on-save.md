---
created: 2026-03-01T06:58:20.716Z
title: Eliminate double JSON stringify of index on save
area: performance
files:
  - scripts/services/IndexService.js:290-293
---

## Problem

`saveToCache()` calls `JSON.stringify(this.index)` to calculate size in KB for logging, then immediately calls `storageService.save(CACHE_KEY, this.index)` which serializes the same data again internally (structured clone for IndexedDB, or JSON.stringify for localStorage fallback). For 100K+ image indices, this is many megabytes serialized twice — pure waste on every save.

## Solution

Either compute the size inside `storageService.save()` and return it, or estimate size from `this.index.allPaths.length` without full serialization. The logging line should not trigger a redundant multi-megabyte serialization.
