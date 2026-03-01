---
created: 2026-03-01T06:58:20.716Z
title: Keep index in Worker instead of cloning per search
area: performance
files:
  - scripts/services/SearchOrchestrator.js:388-402
---

## Problem

`searchLocalIndexWithWorker()` posts the entire `index` array to the Web Worker via `postMessage` on every fuzzy search call. The structured-clone step serializes and copies 150K+ entries on the main thread, blocking the UI — defeating the purpose of using a Worker for non-blocking search. Each search call clones tens of megabytes and doubles memory usage.

## Solution

Send the index to the worker once on initialization (or when it changes) via a `setIndex` command. Subsequent `fuzzySearch` messages should only send `searchTerms` and `options`. The worker retains the index in its own memory space. This reduces per-search overhead from O(N) clone to O(1) message passing.
