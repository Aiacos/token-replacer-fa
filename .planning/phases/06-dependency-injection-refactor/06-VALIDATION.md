---
phase: 6
slug: dependency-injection-refactor
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-06
---

# Phase 6 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 3.x |
| **Config file** | vitest.config.js |
| **Quick run command** | `npx vitest run --reporter=verbose` |
| **Full suite command** | `npx vitest run --reporter=verbose` |
| **Estimated runtime** | ~3 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run --reporter=verbose`
- **After every plan wave:** Run `npx vitest run --reporter=verbose`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 5 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 06-01-01 | 01 | 1 | DI-05 | unit | `npx vitest run tests/core/Utils.test.js` | existing | pending |
| 06-01-02 | 01 | 1 | DI-03 | unit | `npx vitest run tests/services/TVACacheService.test.js` | W0 | pending |
| 06-01-03 | 01 | 1 | DI-02 | unit | `npx vitest run tests/services/TokenService.test.js` | W0 | pending |
| 06-02-01 | 02 | 2 | DI-04 | unit | `npx vitest run tests/services/IndexService.test.js` | W0 | pending |
| 06-02-02 | 02 | 2 | DI-01 | unit | `npx vitest run tests/services/SearchOrchestrator.test.js` | W0 | pending |
| 06-02-03 | 02 | 2 | DI-05 | integration | `npx vitest run --reporter=verbose` | existing | pending |

*Status: pending / green / red / flaky*

---

## Wave 0 Requirements

- [ ] `tests/services/TVACacheService.test.js` — stubs for DI-03
- [ ] `tests/services/TokenService.test.js` — stubs for DI-02
- [ ] `tests/services/IndexService.test.js` — stubs for DI-04
- [ ] `tests/services/SearchOrchestrator.test.js` — stubs for DI-01

*Test files created during plan execution as part of verification tasks.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Foundry VTT runtime backward compatibility | DI-05 | Requires live Foundry VTT instance | Load module in Foundry VTT v12+, run token replacement, verify no regressions |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 5s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
