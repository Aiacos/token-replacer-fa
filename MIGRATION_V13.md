# Foundry VTT v13+ Migration Checklist

Scanned on: 2025-08 | Module version: 2.12.5 | Baseline: v13+ (dropping v12)

---

## Summary

The codebase is in **excellent shape** for v13+. Most modernization was done proactively during the v2.12 refactor. Only minor cleanup items remain, all low-risk.

**Legend:**

- ✅ DONE — Already modernized
- ⚠️ LOW — Minor / defensive code left over from v12 compat; safe to keep
- 🔶 MEDIUM — Should be cleaned up before v3.0
- 🔴 HIGH — Breaking issue; must fix before claiming v13+ support

---

## ApplicationV2 / Dialog

| Status  | File                      | Line(s) | Detail                                                                                                                                                                                    |
| ------- | ------------------------- | ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ✅ DONE | `scripts/ui/UIManager.js` | 113     | `TokenReplacerDialog extends foundry.applications.api.ApplicationV2` — already fully ported to ApplicationV2. No `Dialog`, `FormApplication`, or `Application` base class usage anywhere. |

**No action required.**

---

## Template Loading (`loadTemplates` / `renderTemplate`)

| Status  | File                    | Line(s)  | Detail                                                                                                                                                                                                           |
| ------- | ----------------------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ✅ DONE | `scripts/core/Utils.js` | 424–428  | `renderModuleTemplate()` checks `foundry.applications.handlebars.renderTemplate` first (v13 path).                                                                                                               |
| ✅ DONE | `scripts/core/Utils.js` | 436–443  | `loadModuleTemplates()` checks `foundry.applications.handlebars.loadTemplates` first (v13 path).                                                                                                                 |
| ⚠️ LOW  | `scripts/core/Utils.js` | 428, 442 | v12 global-fallback branches (`renderTemplate(...)`, `loadTemplates(...)`) are now dead code since minimum is v13. Safe to remove in a future cleanup. Not a runtime problem — the v13 branch always runs first. |

**Recommended cleanup (non-breaking, future PR):**

```js
// Remove fallback branches; simplify to:
export async function renderModuleTemplate(path, data) {
  return foundry.applications.handlebars.renderTemplate(path, data);
}
export async function loadModuleTemplates(paths) {
  return foundry.applications.handlebars.loadTemplates(paths);
}
```

---

## Global Utility Functions

| Status  | API                                                | Detail                                                              |
| ------- | -------------------------------------------------- | ------------------------------------------------------------------- |
| ✅ DONE | `getProperty` / `setProperty` / `hasProperty`      | Not used anywhere in `scripts/`.                                    |
| ✅ DONE | `mergeObject`                                      | Not used.                                                           |
| ✅ DONE | `duplicate()`                                      | Not used (only the word "duplicate" appears in comments/Set usage). |
| ✅ DONE | `isObjectEmpty` / `flattenObject` / `expandObject` | Not used.                                                           |
| ✅ DONE | `foundry.utils.*`                                  | Codebase does not rely on these globals; no migration needed.       |

---

## Dice / Roll Modes

| Status  | API                     | Detail                                         |
| ------- | ----------------------- | ---------------------------------------------- |
| ✅ DONE | `CONFIG.Dice.rollModes` | Not used. No dice-related code in this module. |

---

## Remaining Structural Concerns

| Status    | Area                 | File                                         | Detail                                                                                                                           |
| --------- | -------------------- | -------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| ⚠️ LOW    | v12 compat stubs     | `scripts/core/Utils.js`                      | Dual-path `renderModuleTemplate` / `loadModuleTemplates` (see above). Dead fallback, cosmetically noisy.                         |
| 🔶 MEDIUM | Worker API           | `scripts/workers/IndexWorker.js`             | Web Worker usage is standard browser API — no Foundry deprecation risk. Monitor if Foundry changes worker sandboxing in v14/v15. |
| 🔶 MEDIUM | `game.i18n.localize` | `scripts/main.js`, `scripts/ui/UIManager.js` | API stable in v13/v14; no changes required now. Watch for v15 i18n refactor if announced.                                        |

---

## Items Intentionally NOT Fixed (Structural / Major Version)

The following deprecations were **not present** in this codebase (no action needed):

- `Dialog` → `DialogV2`: N/A — module already uses `ApplicationV2`
- `FormApplication` → `ApplicationV2 + HandlebarsApplicationMixin`: N/A — not used
- `Application` base class: N/A — not used
- `CONFIG.Dice.*` renames: N/A — no dice code
- Global `getProperty` / `setProperty` → `foundry.utils.*`: N/A — not used

---

## What Was Changed in v2.12.5

- `module.json`: `compatibility.minimum` 12→13, `compatibility.verified` 13→14, removed `compatibility.maximum` (was absent), `relationships.systems.dnd5e.compatibility.minimum` 3.0.0→4.0.0
- `package.json`: version aligned 2.12.3→2.12.5, added `foundry` section
- Added `.github/workflows/release.yml`
- Created this file

---

## Recommended Future Work (post-v2.12.5)

1. **v12 shim cleanup** (⚠️ LOW) — Remove dead fallback branches in `Utils.js`. PR can be titled `chore: remove v12 compat shims`.
2. **v14 ApplicationV2 features** (🔶 MEDIUM) — Review if `ApplicationV2` gained new required lifecycle methods in v14 that `TokenReplacerDialog` should implement.
3. **Worker sandboxing** (🔶 MEDIUM) — Verify `IndexWorker.js` still works under v14 if Foundry changes `SharedWorker`/`Worker` policies.
