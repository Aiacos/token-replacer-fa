---
phase: 9
slug: type-safety
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-06
---

# Phase 9 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 3.x + TypeScript 5.x (tsc --noEmit) |
| **Config file** | vitest.config.js, jsconfig.json |
| **Quick run command** | `npx tsc --noEmit --project jsconfig.json 2>&1 \| grep "error TS" \| wc -l` |
| **Full suite command** | `npm run typecheck && npx vitest run` |
| **Estimated runtime** | ~10 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npx tsc --noEmit --project jsconfig.json 2>&1 | grep "error TS" | wc -l` (count should decrease toward 0)
- **After every plan wave:** Run `npm run typecheck && npx vitest run`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 10 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 09-01-01 | 01 | 1 | TYPE-01, TYPE-04, TYPE-05, TYPE-06 | smoke | `npx tsc --noEmit --project jsconfig.json` | N/A (config) | ⬜ pending |
| 09-02-01 | 02 | 1 | TYPE-02, TYPE-03 | smoke | `npx tsc --noEmit --project jsconfig.json` | N/A (JSDoc) | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `scripts/types/settings.d.ts` — SettingConfig declaration merging for TYPE-06
- [ ] `scripts/types/modules.d.ts` — ModuleConfig declaration merging for TYPE-05
- [ ] `scripts/types/globals.d.ts` — Window/global augmentations for TYPE-05
- [ ] `scripts/types/typedefs.js` — JSDoc @typedef definitions for TYPE-02
- [ ] Update `jsconfig.json` include to cover `.d.ts` files
- [ ] Remove `|| true` from package.json typecheck script for TYPE-04

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| jsconfig.json has correct fields | TYPE-01 | Config file content verification | Inspect `allowJs`, `checkJs`, `noEmit` are `true` |
| IDE shows type info on Foundry APIs | TYPE-05 | IDE behavior | Hover over `game.settings.get()` in VS Code, verify tooltip shows types |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 10s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
