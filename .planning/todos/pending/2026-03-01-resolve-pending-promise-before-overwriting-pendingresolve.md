---
created: 2026-03-01T07:01:00.498Z
title: Resolve pending promise before overwriting pendingResolve
area: quality
files:
  - scripts/ui/UIManager.js:554-557
  - scripts/ui/UIManager.js:710-712
---

## Problem

Both `setupMatchSelectionHandlers()` and `setupNoMatchHandlers()` store their `resolve` into `this._pendingResolve`. If dialog content is replaced mid-flow (e.g., rapid close/reopen), `_pendingResolve` is overwritten and the first Promise hangs forever because `onClose` would resolve the second (newer) resolve, not the first.

## Solution

Before overwriting `_pendingResolve`, resolve the existing one with `null` to prevent the previous Promise from hanging:
```javascript
if (this._pendingResolve) {
  this._pendingResolve(null);
}
this._pendingResolve = resolve;
```
