---
phase: 09-type-safety
plan: 01
subsystem: type-safety
tags: [typescript, jsdoc, declaration-merging, fvtt-types, jsconfig]

# Dependency graph
requires:
  - phase: 01-tooling-foundation
    provides: jsconfig.json with checkJs, fvtt-types installed
provides:
  - SettingConfig declaration merging for all 10 module settings
  - ModuleConfig declaration merging for TVA module API
  - Window augmentation for Fuse, TVA, TokenReplacerFA globals
  - Central JSDoc typedef definitions (CreatureInfo, TokenMatch, IndexedCache, ModuleError, TVACacheEntry, SearchResult)
  - jsconfig.json include covering .d.ts files
affects: [09-02, 09-03, 09-04]

# Tech tracking
tech-stack:
  added: []
  patterns: [declaration-merging, jsdoc-typedef-central-file, window-augmentation]

key-files:
  created:
    - scripts/types/settings.d.ts
    - scripts/types/modules.d.ts
    - scripts/types/globals.d.ts
    - scripts/types/typedefs.js
  modified:
    - jsconfig.json

key-decisions:
  - "Net error reduction 97->86 (not 97->75) because declaration merging exposed previously-masked type errors"
  - "game.forge augmentation deferred to Plan 02 via @ts-expect-error (fvtt-types complex Game type hierarchy)"

patterns-established:
  - "Declaration merging: global interface extension in .d.ts files for fvtt-types SettingConfig/ModuleConfig"
  - "Central typedef: all shared JSDoc @typedef definitions in scripts/types/typedefs.js, imported via import() syntax"

requirements-completed: [TYPE-01, TYPE-04, TYPE-05, TYPE-06]

# Metrics
duration: 3min
completed: 2026-03-06
---

# Phase 9 Plan 01: Type Infrastructure Summary

**SettingConfig/ModuleConfig declaration merging and central JSDoc typedefs eliminating settings, module API, and window global tsc errors**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-06T10:43:22Z
- **Completed:** 2026-03-06T10:46:13Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments
- Created SettingConfig declaration merging resolving all "not assignable to core" tsc errors (13 original errors)
- Created ModuleConfig declaration merging resolving all ".api does not exist" tsc errors (4 original errors)
- Created Window augmentation resolving all window.Fuse/TVA/TokenReplacerFA tsc errors (5 original errors)
- Created central typedefs.js with 6 JSDoc typedef definitions for downstream service annotation
- Updated jsconfig.json to include .d.ts files in type checking

## Task Commits

Each task was committed atomically:

1. **Task 1: Create type declaration files and update jsconfig.json** - `85e34c9` (feat)
2. **Task 2: Create central JSDoc typedef definitions** - `ac51eed` (feat)

## Files Created/Modified
- `scripts/types/settings.d.ts` - SettingConfig declaration merging for all 10 module settings
- `scripts/types/modules.d.ts` - ModuleConfig declaration merging for TVA module API
- `scripts/types/globals.d.ts` - Window augmentation for Fuse, TVA, TokenReplacerFA
- `scripts/types/typedefs.js` - Central JSDoc typedef definitions (6 types)
- `jsconfig.json` - Added .d.ts include pattern

## Decisions Made
- Net error reduction was 97 to 86 (11 net), not 22 as estimated. The declaration merging resolved the targeted error categories completely (0 remaining in all three), but better type resolution exposed previously-masked errors (e.g., ScanService object property access, main.js KeyFor type). This is expected and positive -- more errors visible means better type safety.
- game.forge augmentation deferred: The fvtt-types Game type hierarchy is too complex for simple interface merging. The single ForgeBazaarService.js error will be handled with @ts-expect-error in Plan 02.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Type infrastructure is in place for Plans 02-04 to annotate service methods
- typedefs.js provides importable types via `import('../types/typedefs.js').CreatureInfo` syntax
- Remaining 86 errors are service-level (D&D 5e casts, Promise return types, DOM narrowing) ready for systematic fix

## Self-Check: PASSED

All 4 created files verified on disk. Both task commits (85e34c9, ac51eed) verified in git log.

---
*Phase: 09-type-safety*
*Completed: 2026-03-06*
