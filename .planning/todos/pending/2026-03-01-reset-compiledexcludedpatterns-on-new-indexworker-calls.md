---
created: 2026-03-01T07:01:00.498Z
title: Reset compiledExcludedPatterns on new IndexWorker calls
area: quality
files:
  - scripts/workers/IndexWorker.js:424-451
---

## Problem

`compiledExcludedPatterns` and `compiledExcludedFolders` are initialized from the first `indexPaths` call's parameters. The guard `if (!compiledExcludedPatterns)` means a second call with different exclusion lists silently uses stale compiled values. This is an API contract violation — parameters are accepted but ignored on subsequent calls.

## Solution

Always recompile patterns when new exclusion lists are provided, or compare incoming lists with cached ones and recompile on change.
