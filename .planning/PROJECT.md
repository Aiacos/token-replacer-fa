# Token Replacer FA — Quality Refactor

## What This Is

A Foundry VTT module (v2.12.4) that automatically replaces NPC token artwork with matching tokens from Forgotten Adventures and The Forge Bazaar. It integrates with Token Variant Art (TVA) for cache access and fuzzy search, uses Web Workers for non-blocking index builds, and provides a dialog-based UI for match selection. Now includes 498 automated tests, JSDoc type safety, CI pipeline, and standardized error handling.

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
- ✓ Automated test suite (498 tests, Vitest + jsdom) — v2.12
- ✓ Consistent error handling with structured errors and recovery suggestions — v2.12
- ✓ Constructor dependency injection on all services — v2.12
- ✓ JSDoc type safety with declaration merging — v2.12
- ✓ GitHub Actions CI pipeline (tests, lint, typecheck) — v2.12
- ✓ Worker lifecycle management (lazy init, clean termination, crash fallback) — v2.12

### Active

(Ready for next milestone — use `/gsd:new-milestone` to define)

### Out of Scope

- New user-facing features — this is a quality-only refactor
- Support for non-D&D 5e systems — system-specific by design
- ForgeBazaarService implementation — intentionally a stub
- UI redesign — existing Handlebars templates stay as-is
- Build tooling changes — build.sh/build.bat remain unchanged

## Context

- Codebase at v2.12.4 on `develop` branch
- v2.12 Quality Refactor milestone complete: 498 tests, CI pipeline, type safety, DI, error handling
- Service-based architecture with constructor DI: SearchService facade, SearchOrchestrator, TokenService, IndexService, TVACacheService, StorageService, UIManager
- Web Worker integration with lazy init, clean termination, and crash fallback
- 9,242 LOC source (scripts/) + 6,468 LOC tests (tests/)
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

| Decision               | Rationale                                                         | Outcome                          |
| ---------------------- | ----------------------------------------------------------------- | -------------------------------- |
| JSDoc over TypeScript  | No build step constraint; checkJs provides sufficient type safety | ✓ Good — 498 tests pass with JSDoc types |
| Vitest 3.x + jsdom     | Browser-compatible, fast, ESM-native test runner                  | ✓ Good — sub-second test runs |
| Hand-written mocks     | @rayners/foundry-test-utils had gaps in settings/Worker/ApplicationV2 | ✓ Good — full control over mock fidelity |
| Constructor DI pattern | Backward-compatible defaults, testable in isolation               | ✓ Good — all services testable |
| Internal-only refactor | Quality uplift without disrupting existing users                  | ✓ Good — zero behavior changes |

---

_Last updated: 2026-03-06 after v2.12 milestone_
