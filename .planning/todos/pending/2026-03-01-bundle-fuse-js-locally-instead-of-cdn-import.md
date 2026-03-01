---
created: 2026-03-01T07:01:00.498Z
title: Bundle Fuse.js locally instead of CDN import
area: security
files:
  - scripts/core/Constants.js:8
  - scripts/workers/IndexWorker.js:15
---

## Problem

Fuse.js is dynamically imported from `cdn.jsdelivr.net` at runtime with no Subresource Integrity hash. If the CDN is compromised, attacker code executes in the Foundry VTT context with full access to `game`, `canvas`, `socket`. Runs in both main thread and Web Worker. `dynamic import()` does not support SRI hashes natively.

## Solution

Bundle `fuse.js` as a local file (e.g., `scripts/lib/fuse.mjs`) and import from the local path. This eliminates the external runtime dependency entirely.
