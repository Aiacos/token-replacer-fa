---
created: 2026-03-01T07:01:00.498Z
title: Cache cancel button reference to skip repeated DOM queries
area: performance
files:
  - scripts/ui/UIManager.js:1008-1017
---

## Problem

`updateDialogContent()` is called on every token processed (hundreds of times). Each call invokes `_wireCancelButton()` which runs `querySelector('.cancel-btn[data-action="cancel"]')`. The `_cancelWired` flag skips `addEventListener`, but the DOM query still runs every time.

## Solution

Skip `_wireCancelButton()` entirely once `_cancelWired` is true, or cache the button element reference after first find.
