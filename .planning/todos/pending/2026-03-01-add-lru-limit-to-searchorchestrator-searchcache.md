---
created: 2026-03-01T07:01:00.498Z
title: Add LRU limit to SearchOrchestrator searchCache
area: performance
files:
  - scripts/services/SearchOrchestrator.js:33
  - scripts/services/SearchOrchestrator.js:771-772
---

## Problem

`this.searchCache` is a `Map` that grows unbounded within a session. Each entry holds arrays of `{ path, name, score }` objects — potentially thousands per creature type. The cache is cleared at the start of `processTokenReplacement()` but grows without bound during a single run across all creatures searched.

## Solution

Add an LRU or maximum-size limit (e.g., 50 entries) to prevent unbounded memory growth during large batch operations.
