---
phase: 8
slug: integration-tests
status: approved
nyquist_compliant: true
wave_0_complete: true
created: 2026-03-06
---

# Phase 8 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 3.2.4 |
| **Config file** | vitest.config.js |
| **Quick run command** | `npm test -- --run` |
| **Full suite command** | `npm test -- --run` |
| **Estimated runtime** | ~5 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npm test -- --run`
- **After every plan wave:** Run `npm test -- --run`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 5 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 08-01-01 | 01 | 1 | INTG-01 | integration | `npx vitest run tests/integration/SearchPipeline.test.js` | No - Wave 0 | pending |
| 08-01-02 | 01 | 1 | INTG-02 | integration | `npx vitest run tests/integration/SearchPipeline.test.js` | No - Wave 0 | pending |
| 08-01-03 | 01 | 1 | INTG-03 | integration | `npx vitest run tests/integration/SearchPipeline.test.js` | No - Wave 0 | pending |
| 08-02-01 | 02 | 1 | - | unit | `npx vitest run tests/services/SearchService.test.js` | No - Wave 0 | pending |

*Status: pending / green / red / flaky*

---

## Wave 0 Requirements

Wave 0 is self-satisfied: both plans use TDD pattern where test files are the primary deliverable created by the tasks themselves.

- [x] `tests/integration/SearchPipeline.test.js` -- created by Plan 08-01 Task 1 (TDD)
- [x] `tests/services/SearchService.test.js` -- created by Plan 08-02 Task 1 (TDD)

*Existing infrastructure covers test framework and fixtures.*

---

## Manual-Only Verifications

*All phase behaviors have automated verification.*

---

## Validation Sign-Off

- [ ] All tasks have automated verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 5s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** approved 2026-03-06
