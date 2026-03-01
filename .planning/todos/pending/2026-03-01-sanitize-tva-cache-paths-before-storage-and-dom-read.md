---
created: 2026-03-01T06:58:20.716Z
title: Sanitize TVA cache paths before storage and DOM read
area: security
files:
  - scripts/services/TVACacheService.js:210-238
  - scripts/ui/UIManager.js:538
  - scripts/ui/UIManager.js:681
  - scripts/ui/UIManager.js:924
---

## Problem

Paths from the external TVA cache JSON file are stored without sanitization in `TVACacheService._loadTVACacheFromFile()`. These paths flow through `_renderMatchGrid()` into DOM `data-path` attributes, then are read back via `opt.dataset.path` in event handlers and passed directly to `token.document.update({'texture.src': imagePath})` without calling `sanitizePath()`.

If the TVA cache file were tampered with or served from an attacker-controlled endpoint, crafted paths (path traversal, protocol-relative URLs) would be passed to Foundry's token update API.

## Solution

1. Apply `sanitizePath()` to `img[0]` during cache parsing in `TVACacheService._loadTVACacheFromFile()`:
   ```javascript
   const path = sanitizePath(rawPath);
   if (!path) continue;
   ```
2. Apply `sanitizePath()` to every `opt.dataset.path` read in `setupMatchSelectionHandlers()`, `setupNoMatchHandlers()`, and the dblclick handler before passing to `replaceTokenImage()`.
