---
created: 2026-03-01T07:01:00.498Z
title: Fix O(N2) progress counting in createProgressHTML
area: performance
files:
  - scripts/ui/UIManager.js:402-433
---

## Problem

`createProgressHTML()` receives the full `results` array and calls `results.reduce()` + `results.map()` on every token processed. The array grows by one entry per token. For N tokens, total iterations are O(N^2) — 500 tokens = 125,000 array iterations, all on the main thread.

## Solution

Maintain running counters (`successCount`, `failedCount`, `skippedCount`) and the transformed results array incrementally in `processTokenReplacement()` rather than recomputing from scratch on every update.
