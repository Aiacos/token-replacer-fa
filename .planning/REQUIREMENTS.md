# Requirements: Token Replacer FA — Quality Refactor

**Defined:** 2026-02-28
**Core Value:** The module must continue to reliably replace token artwork exactly as it does today — every refactoring change is invisible to users.

## v1 Requirements

Requirements for quality refactor. Each maps to roadmap phases.

### Tooling Infrastructure

- [x] **TOOL-01**: Project has package.json with dev dependencies (Vitest, ESLint, Prettier, fvtt-types)
- [x] **TOOL-02**: Vitest test runner configured with jsdom environment and working `npm test` command
- [x] **TOOL-03**: ESLint v9 flat config with rules appropriate for Foundry VTT module development
- [x] **TOOL-04**: Prettier formatting configured and integrated with ESLint
- [x] **TOOL-05**: GitHub Actions CI pipeline runs tests, linting, and type checking on PR

### Foundry Mocks

- [x] **MOCK-01**: Global mock setup provides `game` object with settings, modules, i18n, and system stubs
- [x] **MOCK-02**: Global mock setup provides `ui` object with notifications stub
- [x] **MOCK-03**: Global mock setup provides `canvas` object with tokens collection stub
- [x] **MOCK-04**: Global mock setup provides `Hooks` registration and trigger stubs
- [x] **MOCK-05**: Mock Worker implementation for testing Worker-dependent code paths

### Unit Tests — Pure Logic

- [x] **TEST-01**: Constants.js CREATURE_TYPE_MAPPINGS categorization is tested for all 14 categories
- [x] **TEST-02**: Constants.js EXCLUDED_FOLDERS filtering is tested with CDN and local paths
- [x] **TEST-03**: Utils.js path extraction functions are tested with edge cases (CDN URLs, nested paths, empty input)
- [x] **TEST-04**: Utils.js Fuse.js loader error handling is tested (CDN failure, fallback)
- [x] **TEST-05**: Utils.js escapeHtml and sanitizePath security functions are tested

### Unit Tests — Service Layer

- [x] **TEST-06**: StorageService IndexedDB operations tested (save, load, delete, version check, transaction abort)
- [x] **TEST-07**: TokenService creature info extraction tested with various D&D 5e actor structures
- [x] **TEST-08**: TokenService groupTokensByCreature tested with mixed creature types
- [x] **TEST-09**: IndexService index building tested (categorization, termIndex construction, cache loading)
- [x] **TEST-10**: TVACacheService cache parsing tested with all entry formats (path, [path,name], [path,name,tags])
- [ ] **TEST-11**: SearchOrchestrator fuzzy search tested with varying thresholds and result ordering
- [ ] **TEST-12**: SearchOrchestrator category-based fallback search tested
- [ ] **TEST-13**: SearchOrchestrator parallel search batching tested with configurable batch sizes

### Integration Tests

- [ ] **INTG-01**: Full search pipeline tested: TVA cache load → index build → fuzzy search → results
- [ ] **INTG-02**: Fallback path tested: no fuzzy match → category search → results
- [ ] **INTG-03**: Worker path vs direct path produce identical index structures

### Constructor Dependency Injection

- [x] **DI-01**: SearchOrchestrator accepts injected dependencies (IndexService, TVACacheService, Fuse, settings)
- [x] **DI-02**: TokenService accepts optional canvas injection for testability
- [x] **DI-03**: TVACacheService accepts injected TVA API for testability
- [x] **DI-04**: IndexService accepts injected StorageService and Worker factory
- [x] **DI-05**: All DI changes are backward-compatible (defaults to Foundry globals when no injection)

### Type Safety

- [ ] **TYPE-01**: jsconfig.json configured with allowJs, checkJs, noEmit for IDE type checking
- [ ] **TYPE-02**: JSDoc @typedef definitions for all service interfaces and data structures
- [ ] **TYPE-03**: JSDoc @param and @returns annotations on all public service methods
- [ ] **TYPE-04**: `tsc --noEmit` script validates type correctness without producing output
- [ ] **TYPE-05**: foundry-vtt-types integrated for Foundry API type definitions
- [ ] **TYPE-06**: ClientSettings.Values declaration merging for typed settings access

### Error Handling

- [ ] **ERR-01**: All async hook handlers wrapped in try-catch with user-visible error reporting
- [ ] **ERR-02**: All services use consistent createModuleError pattern with recovery suggestions
- [ ] **ERR-03**: IndexedDB transaction abort handlers prevent silent data loss
- [ ] **ERR-04**: Worker error/messageerror handlers surface failures to user

### Worker Lifecycle

- [ ] **WORK-01**: Worker initialization is lazy (deferred to first use)
- [ ] **WORK-02**: Worker termination is clean (no dangling listeners or references)
- [ ] **WORK-03**: Worker crash recovery falls back to direct indexing with user notification

## v2 Requirements

Deferred to future release. Tracked but not in current roadmap.

### Advanced Testing

- **ADV-01**: Quench in-browser integration tests against live Foundry instance
- **ADV-02**: Code coverage reporting with configurable thresholds
- **ADV-03**: Pre-commit hooks with lint-staged for automated quality gates

### Advanced Type Safety

- **ADV-04**: Full TypeScript migration (requires build step addition)
- **ADV-05**: Strict mode TypeScript with zero `@ts-ignore` suppressions

## Out of Scope

| Feature                           | Reason                                               |
| --------------------------------- | ---------------------------------------------------- |
| New user-facing features          | Quality-only refactor — zero behavior changes        |
| TypeScript .ts file migration     | Requires build step, out of scope for this milestone |
| UI/template redesign              | Existing Handlebars templates work correctly         |
| Non-D&D 5e system support         | System-specific by design                            |
| ForgeBazaarService implementation | Intentionally a stub                                 |
| Build tooling changes             | build.sh/build.bat remain unchanged                  |
| Quench in-browser tests           | Requires live Foundry instance, impractical for CI   |

## Traceability

| Requirement | Phase    | Status   |
| ----------- | -------- | -------- |
| TOOL-01     | Phase 1  | Complete |
| TOOL-02     | Phase 1  | Complete |
| TOOL-03     | Phase 1  | Complete |
| TOOL-04     | Phase 1  | Complete |
| TOOL-05     | Phase 3  | Complete |
| MOCK-01     | Phase 2  | Complete |
| MOCK-02     | Phase 2  | Complete |
| MOCK-03     | Phase 2  | Complete |
| MOCK-04     | Phase 2  | Complete |
| MOCK-05     | Phase 2  | Complete |
| TEST-01     | Phase 4  | Complete |
| TEST-02     | Phase 4  | Complete |
| TEST-03     | Phase 4  | Complete |
| TEST-04     | Phase 4  | Complete |
| TEST-05     | Phase 4  | Complete |
| TEST-06     | Phase 5  | Complete |
| TEST-07     | Phase 7  | Complete |
| TEST-08     | Phase 7  | Complete |
| TEST-09     | Phase 7  | Complete |
| TEST-10     | Phase 7  | Complete |
| TEST-11     | Phase 7  | Pending  |
| TEST-12     | Phase 7  | Pending  |
| TEST-13     | Phase 7  | Pending  |
| INTG-01     | Phase 8  | Pending  |
| INTG-02     | Phase 8  | Pending  |
| INTG-03     | Phase 8  | Pending  |
| DI-01       | Phase 6  | Complete |
| DI-02       | Phase 6  | Complete |
| DI-03       | Phase 6  | Complete |
| DI-04       | Phase 6  | Complete |
| DI-05       | Phase 6  | Complete |
| TYPE-01     | Phase 9  | Pending  |
| TYPE-02     | Phase 9  | Pending  |
| TYPE-03     | Phase 9  | Pending  |
| TYPE-04     | Phase 9  | Pending  |
| TYPE-05     | Phase 9  | Pending  |
| TYPE-06     | Phase 9  | Pending  |
| ERR-01      | Phase 10 | Pending  |
| ERR-02      | Phase 10 | Pending  |
| ERR-03      | Phase 10 | Pending  |
| ERR-04      | Phase 10 | Pending  |
| WORK-01     | Phase 10 | Pending  |
| WORK-02     | Phase 10 | Pending  |
| WORK-03     | Phase 10 | Pending  |

**Coverage:**

- v1 requirements: 44 total
- Mapped to phases: 44
- Unmapped: 0

---

_Requirements defined: 2026-02-28_
_Last updated: 2026-02-28 after roadmap creation — all 44 requirements mapped_
