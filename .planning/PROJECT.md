# Token Replacer FA — Quality Refactor

## What This Is

A Foundry VTT module (v2.12.3) that automatically replaces NPC token artwork with matching tokens from Forgotten Adventures and The Forge Bazaar. It integrates with Token Variant Art (TVA) for cache access and fuzzy search, uses Web Workers for non-blocking index builds, and provides a dialog-based UI for match selection. This project is a comprehensive quality uplift of the existing codebase — no user-facing behavior changes.

## Core Value

The module must continue to reliably replace token artwork exactly as it does today — every refactoring change is invisible to users.

## Requirements

### Validated

- ✓ Automatic NPC token replacement via scene control button — existing
- ✓ Fuzzy search with Fuse.js against TVA cache — existing
- ✓ Hierarchical category index with Web Worker background building — existing
- ✓ Match selection dialog with random/sequential assignment modes — existing
- ✓ Category-based fallback search when fuzzy match fails — existing
- ✓ IndexedDB + localStorage persistent caching with version checks — existing
- ✓ Multi-language support (English, Italian) — existing
- ✓ Handlebars template-based UI with XSS protection — existing
- ✓ Debug logging toggle via module settings — existing
- ✓ D&D 5e creature type/subtype extraction — existing

### Active

- [ ] Automated test suite (unit tests for services, integration tests for key workflows)
- [ ] Consistent error handling patterns across all services
- [ ] Clean code structure with clear separation of concerns
- [ ] Type safety via JSDoc annotations or TypeScript (approach TBD by research)

### Out of Scope

- New user-facing features — this is a quality-only refactor
- Support for non-D&D 5e systems — system-specific by design
- ForgeBazaarService implementation — intentionally a stub
- UI redesign — existing Handlebars templates stay as-is
- Build tooling changes — build.sh/build.bat remain unchanged

## Context

- Brownfield codebase at v2.12.3 on `develop` branch
- Recent work (today) included performance optimizations, bug fixes for dialog races, promise lifecycle, IndexedDB durability, and code review cycles
- Service-based architecture already in place: SearchService facade, SearchOrchestrator, TokenService (static), IndexService, TVACacheService, StorageService, UIManager
- Web Worker integration for index building already functional
- No existing test infrastructure — testing is manual via browser console
- Module runs entirely client-side in Foundry VTT browser runtime
- Fuse.js loaded dynamically from CDN (jsDelivr)
- TVA module is a hard dependency; FA Nexus and Forge are optional

## Constraints

- **Runtime**: Foundry VTT v12-v13 browser environment — no Node.js at runtime
- **System**: D&D 5e only — creature type extraction depends on `system.details.type`
- **Dependencies**: TVA module required, cannot be removed or replaced
- **Storage**: localStorage ~4.5MB limit, IndexedDB for larger caches
- **No build step currently**: ES6 modules loaded directly — adding TypeScript would require a build step
- **Backward compatibility**: All existing settings, caches, and module.json structure must be preserved
- **Zero regression**: Every user-facing behavior must remain identical

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| JSDoc vs TypeScript | Trade-off between type safety strength and build complexity | — Pending (research will inform) |
| Test framework choice | Need something compatible with Foundry VTT's browser-only runtime | — Pending (research will inform) |
| Internal-only refactor | User wants quality uplift without disrupting existing users | — Pending |

---
*Last updated: 2026-02-28 after initialization*
