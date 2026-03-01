---
created: 2026-03-01T07:01:00.498Z
title: Add recency window to TVA cache HEAD validation request
area: performance
files:
  - scripts/services/TVACacheService.js:304-328
---

## Problem

Every time Foundry loads and cached TVA data exists in IndexedDB, a `fetch` HEAD request validates freshness against the TVA static cache file. This network roundtrip fires unconditionally on every page load, adding latency before the module is usable — even if nothing has changed.

## Solution

Store a `lastValidated` timestamp alongside the cache entry in IndexedDB. Skip the HEAD request if validated within a configurable recency window (e.g., 1 hour). Fall back to full HEAD check only when the threshold is exceeded.
