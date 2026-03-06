# Retrospective

## Milestone: v2.12 — Quality Refactor

**Shipped:** 2026-03-06
**Phases:** 10 | **Plans:** 19 | **Requirements:** 44/44

### What Was Built
- Test infrastructure from zero to 498 tests (Vitest + jsdom + fake-indexeddb + MockWorker)
- Constructor dependency injection on all 5 services with backward-compatible defaults
- GitHub Actions CI pipeline running tests, lint, and type checking on every PR
- JSDoc type safety with declaration merging for typed settings access
- Standardized error handling with structured errors and recovery suggestions
- Worker lifecycle management — lazy init, clean termination, crash fallback notification

### What Worked
- Wave-based parallel execution kept plans small and focused (avg 3 min each)
- Hand-written Foundry mocks gave full control over test fidelity vs @rayners/foundry-test-utils
- Constructor DI with lazy defaults preserved backward compatibility while enabling testability
- Phase dependency ordering ensured each phase could build on verified foundations

### What Was Inefficient
- Some ROADMAP.md checkboxes fell out of sync during rapid execution (not all phases marked [x])
- Summary one-liners not consistently populated across all plans
- Early phases (1-5) executed across multiple sessions before GSD was fully configured

### Patterns Established
- `createModuleError()` pattern for all service errors with recovery suggestions
- `_ensureWorker()` lazy initialization pattern for Worker lifecycle
- Mock TVA cache fixture shared across all service test suites
- `buildPipeline()` helper for integration test service wiring

### Key Lessons
- fake-indexeddb must be the first setupFile (before foundry-mocks) for IndexedDB globals at import time
- Vitest 3.x (not 2.x) — version 2.2.x doesn't exist
- fvtt-types beta has 128+ type errors — strict mode not viable, JSDoc + checkJs is the pragmatic path
- UIManager.js benefits from @ts-nocheck (51 DOM errors, no value in typing)

### Cost Observations
- Model mix: primarily opus for execution, sonnet for verification
- Plans averaged 3 minutes execution time
- Total execution: ~1 hour across 19 plans

---

## Cross-Milestone Trends

| Metric | v2.12 |
| ------ | ----- |
| Phases | 10 |
| Plans | 19 |
| Tests | 498 |
| LOC (source) | 9,242 |
| LOC (tests) | 6,468 |
| Duration | 57 days |
