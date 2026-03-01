---
created: 2026-03-01T07:01:00.498Z
title: Merge double iteration in extractPathsFromTVACache
area: performance
files:
  - scripts/services/IndexService.js:805-818
---

## Problem

`extractPathsFromTVACache()` iterates known `arrayProps` (6 names) first, then calls `Object.entries(cache)` which re-iterates all properties including those already processed. For 100K+ entries, every entry is visited twice. The final `[...new Set(paths)]` creates a third copy of every path string.

## Solution

Use a `Set` from the start and merge the two loops into one `Object.entries()` pass. This eliminates the redundant iteration and the final spread-copy.
