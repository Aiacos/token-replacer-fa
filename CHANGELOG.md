# Changelog

All notable changes to Token Replacer - Forgotten Adventures are documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).
Versioning follows [Semantic Versioning](https://semver.org/).

---

## [2.12.5] - 2025-08

### Added
- **GitHub Actions release workflow** (`.github/workflows/release.yml`): automated build, packaging, and GitHub Release publishing on push to `main`. Releases on `develop` publish as pre-release RCs. The workflow enforces the full test gate (lint, format check, tests, typecheck) before releasing.
- **`MIGRATION_V13.md`**: full audit of the codebase against Foundry v13+ deprecated APIs, with per-file/line checklist of what was already done and what to address in future releases.
- **`foundry` section in `package.json`**: documents `minimum: "13"` and `verified: "14"` for tooling that reads package metadata.

### Changed
- **Compatibility range updated** (`module.json`):
  - `compatibility.minimum`: `"12"` → `"13"` (Foundry v13 is now the minimum; this is a breaking drop for v12 users)
  - `compatibility.verified`: `"13"` → `"14"` (verified against Foundry VTT v14, which became stable in April 2025)
  - `compatibility.maximum`: not set (intentionally omitted for forward-compatibility with future Foundry versions)
- **dnd5e system minimum** (`module.json`): `"3.0.0"` → `"4.0.0"` (dnd5e v4+ targets Foundry v12+; v5+ targets v13+ — v4.0.0 is the minimum for D&D 2024 rules content)
- **Version aligned**: `package.json` version was behind at `2.12.3`; now aligned to `2.12.5`.

### Notes
- No runtime code changes in this release. The codebase was already fully v13-compatible: `TokenReplacerDialog` uses `ApplicationV2`, template helpers use `foundry.applications.handlebars.*` with v12 fallback stubs (flagged as low-priority cleanup in `MIGRATION_V13.md`).
- The v12 compat fallback stubs in `scripts/core/Utils.js` are now dead code and flagged for removal in a future patch.

---

## [2.12.4] - 2025-07

- Version sync and internal quality refactor milestone (v2.12 Quality Refactor).

## [2.12.3] - 2025-07

- Previous stable release.
