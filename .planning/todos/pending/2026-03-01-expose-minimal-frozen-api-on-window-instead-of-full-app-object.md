---
created: 2026-03-01T07:01:00.498Z
title: Expose minimal frozen API on window instead of full app object
area: security
files:
  - scripts/main.js:757
---

## Problem

The entire `TokenReplacerApp` singleton is exposed on `window.TokenReplacerFA`. Any script in the same browser context (other Foundry modules, browser extensions) can call `replaceTokenImage()`, `getSetting()`, and access all internal state. A malicious module could silently replace token images.

## Solution

Expose only a minimal read-only API:
```javascript
window.TokenReplacerFA = Object.freeze({
  processTokenReplacement: () => tokenReplacerApp.processTokenReplacement(),
  version: '2.12.3',
});
```
