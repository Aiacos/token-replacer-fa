---
phase: 7
slug: service-layer-tests
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-06
---

# Phase 7 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 3.2.4 |
| **Config file** | vitest.config.js |
| **Quick run command** | `npm test` |
| **Full suite command** | `npm test` |
| **Estimated runtime** | ~5 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npm test`
- **After every plan wave:** Run `npm test`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 5 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 07-01-01 | 01 | 1 | TEST-07 | unit | `npx vitest run tests/services/TokenService.test.js -x` | ❌ W0 | ⬜ pending |
| 07-01-02 | 01 | 1 | TEST-08 | unit | `npx vitest run tests/services/TokenService.test.js -x` | ❌ W0 | ⬜ pending |
| 07-01-03 | 01 | 1 | TEST-10 | unit | `npx vitest run tests/services/TVACacheService.test.js -x` | ❌ W0 | ⬜ pending |
| 07-02-01 | 02 | 1 | TEST-09 | unit | `npx vitest run tests/services/IndexService.test.js -x` | ❌ W0 | ⬜ pending |
| 07-02-02 | 02 | 1 | INTG-03 | integration | `npx vitest run tests/services/IndexService.test.js -x` | ❌ W0 | ⬜ pending |
| 07-03-01 | 03 | 2 | TEST-11 | unit | `npx vitest run tests/services/SearchOrchestrator.test.js -x` | ❌ W0 | ⬜ pending |
| 07-03-02 | 03 | 2 | TEST-12 | unit | `npx vitest run tests/services/SearchOrchestrator.test.js -x` | ❌ W0 | ⬜ pending |
| 07-03-03 | 03 | 2 | TEST-13 | unit | `npx vitest run tests/services/SearchOrchestrator.test.js -x` | ❌ W0 | ⬜ pending |
| 07-03-04 | 03 | 2 | INTG-01 | integration | `npx vitest run tests/services/SearchOrchestrator.test.js -x` | ❌ W0 | ⬜ pending |
| 07-03-05 | 03 | 2 | INTG-02 | integration | `npx vitest run tests/services/SearchOrchestrator.test.js -x` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/helpers/mock-tva-cache.js` — shared TVA cache fixture (all 3 entry formats)
- [ ] `fuse.js` devDependency — needed for real fuzzy search tests
- [ ] Test file stubs created for all 4 services

*Wave 0 is handled by the first task of Plan 01.*

---

## Manual-Only Verifications

*All phase behaviors have automated verification.*

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 5s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
