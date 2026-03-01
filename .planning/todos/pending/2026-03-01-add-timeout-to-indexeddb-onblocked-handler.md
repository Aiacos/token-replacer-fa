---
created: 2026-03-01T06:58:20.716Z
title: Add timeout to IndexedDB onblocked handler
area: reliability
files:
  - scripts/services/StorageService.js:108
---

## Problem

In `openDatabase()`, the `request.onblocked` handler logs a warning but never rejects the promise. If another browser tab holds an older version of the IndexedDB database open, `openDatabase()` hangs forever. Any caller of `has()`, `save()`, `load()`, or `remove()` will stall indefinitely, blocking the background index build and indirectly freezing the UI.

## Solution

Add a rejection in the `onblocked` handler:
```javascript
request.onblocked = () => {
  console.warn(`${MODULE_ID} | IndexedDB open request blocked`);
  reject(new Error('IndexedDB open blocked by another tab'));
};
```
Alternatively, add a timeout (e.g., 5 seconds) around the entire `openDatabase()` call so it falls back to localStorage gracefully rather than hanging.
