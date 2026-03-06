---
phase: 10
slug: error-handling-worker-lifecycle
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-06
---

# Phase 10 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 3.2.x |
| **Config file** | vitest.config.js |
| **Quick run command** | `npx vitest --run` |
| **Full suite command** | `npx vitest --run` |
| **Estimated runtime** | ~5 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest --run`
- **After every plan wave:** Run `npx vitest --run`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 5 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 10-01-01 | 01 | 1 | ERR-01 | unit | `npx vitest --run -t "hook error"` | ❌ W0 | ⬜ pending |
| 10-01-02 | 01 | 1 | ERR-02 | unit | `npx vitest --run tests/services/ -t "createModuleError"` | ❌ W0 | ⬜ pending |
| 10-01-03 | 01 | 1 | ERR-04 | unit | `npx vitest --run tests/services/ -t "worker error"` | ❌ W0 | ⬜ pending |
| 10-01-04 | 01 | 1 | WORK-03 | unit | `npx vitest --run tests/services/ -t "worker fallback"` | ❌ W0 | ⬜ pending |
| 10-02-01 | 02 | 1 | WORK-02 | unit | `npx vitest --run tests/services/ -t "terminate"` | ✅ partial | ⬜ pending |
| 10-02-02 | 02 | 1 | ERR-03 | unit | `npx vitest --run tests/services/StorageService.test.js -t "abort"` | ✅ | ⬜ pending |
| 10-02-03 | 02 | 1 | WORK-01 | unit | `npx vitest --run tests/services/ -t "lazy"` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] Tests for main.js hook error handling (ERR-01) — may need error handling test file
- [ ] Tests verifying `ui.notifications.warn()` called on worker fallback (WORK-03)
- [ ] Tests verifying recovery suggestions included in notifications (ERR-02)

*Existing test infrastructure covers ERR-03, WORK-01, WORK-02 partially.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Main.js hook try-catch wrapping | ERR-01 | Simple pattern verified by inspection | Review main.js hooks for top-level try-catch with ui.notifications.error() |
| Permanent notification displays correctly | ERR-02 | Requires Foundry VTT runtime | Load module, trigger error, verify permanent notification appears |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 5s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
