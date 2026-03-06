---
phase: 5
slug: storage-tests
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-06
---

# Phase 5 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 3.2.4 |
| **Config file** | `vitest.config.js` |
| **Quick run command** | `npx vitest run tests/services/StorageService.test.js` |
| **Full suite command** | `npm test` |
| **Estimated runtime** | ~3 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run tests/services/StorageService.test.js`
- **After every plan wave:** Run `npm test`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 5 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 05-01-01 | 01 | 1 | TEST-06 | infra | `npm test` | ❌ W0 | ⬜ pending |
| 05-01-02 | 01 | 1 | TEST-06 | unit | `npx vitest run tests/services/StorageService.test.js -t "save"` | ❌ W0 | ⬜ pending |
| 05-01-03 | 01 | 1 | TEST-06 | unit | `npx vitest run tests/services/StorageService.test.js -t "load"` | ❌ W0 | ⬜ pending |
| 05-01-04 | 01 | 1 | TEST-06 | unit | `npx vitest run tests/services/StorageService.test.js -t "remove"` | ❌ W0 | ⬜ pending |
| 05-01-05 | 01 | 1 | TEST-06 | unit | `npx vitest run tests/services/StorageService.test.js -t "fallback"` | ❌ W0 | ⬜ pending |
| 05-01-06 | 01 | 1 | TEST-06 | unit | `npx vitest run tests/services/StorageService.test.js -t "migration"` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] Install `fake-indexeddb@6.2.5` as devDependency
- [ ] Update `vitest.config.js` setupFiles to include `fake-indexeddb/auto` as first entry
- [ ] Create `tests/services/` directory
- [ ] Create `tests/services/StorageService.test.js` — stubs for TEST-06

*All Wave 0 items must complete before task verification begins.*

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
