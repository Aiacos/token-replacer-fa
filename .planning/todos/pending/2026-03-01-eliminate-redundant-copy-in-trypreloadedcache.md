---
created: 2026-03-01T07:01:00.498Z
title: Eliminate redundant copy in tryPreloadedCache
area: performance
files:
  - scripts/services/IndexService.js:422-432
---

## Problem

`_tryPreloadedCache()` creates a full `.map()` copy of 150K+ objects from `tvaCacheImages`, producing `{ path, name, category }` objects identical in shape to the originals. The source objects already have exactly those properties and are never mutated. This doubles peak memory for no purpose, and the copy is then cloned again via `postMessage` to the Worker.

## Solution

Return the array directly instead of mapping. If excluding extra properties like `tags` is intentional for transfer size, document that intent.
