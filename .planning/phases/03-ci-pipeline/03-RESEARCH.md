# Phase 3: CI Pipeline - Research

**Researched:** 2026-03-01
**Domain:** GitHub Actions CI/CD for Node.js projects
**Confidence:** HIGH

## Summary

GitHub Actions CI for a Node.js-based Foundry VTT module is a well-documented, straightforward domain. The project already has all four quality-gate scripts defined in `package.json` (`test`, `lint`, `format:check`, `typecheck`), a committed `package-lock.json`, and no existing workflow files. The entire phase is a single YAML file creation plus directory scaffolding.

The current standard actions are `actions/checkout@v6` and `actions/setup-node@v6`. Since this project lacks a `packageManager` field in `package.json`, npm caching must be enabled explicitly via `cache: 'npm'` in the setup-node step. The "run all steps even if one fails" requirement is best handled with `if: always()` on subsequent steps rather than `continue-on-error`, which would mask failures from the job status.

**Primary recommendation:** Create `.github/workflows/ci.yml` with a single job containing four quality-gate steps, each guarded by `if: always()` so all issues surface in one push, using `actions/checkout@v6` and `actions/setup-node@v6` with Node 22 and explicit `cache: 'npm'`.

<user_constraints>

## User Constraints (from CONTEXT.md)

### Locked Decisions
- Trigger on both `push` and `pull_request` events to develop and main branches
- Run on all PRs including drafts (no filtering on draft status)
- Feature branches only get CI through PRs -- no push trigger on arbitrary branches
- Runner: `ubuntu-latest`
- Include `npm run format:check` (Prettier) as a CI step alongside lint, test, typecheck
- Run all steps even if one fails -- use `continue-on-error` or `if: always()` pattern so all issues surface in one push
- Single job with separate steps (not parallel jobs) -- simpler, single npm install, appropriate for project size
- Typecheck keeps `|| true` (lenient) -- fvtt-types has known gaps, strict mode would produce false failures
- Pin to Node 22 LTS only -- no version matrix needed, Node is only used for tooling
- Cache npm dependencies between runs using `setup-node`'s built-in cache feature
- CI should be a required status check that blocks merging (roadmap success criteria)
- Scope: create the workflow YAML file only -- branch protection rules are configured manually in GitHub UI
- Workflow name: "CI" -- simple, standard, clear in PR checks

### Claude's Discretion
- Step ordering within the job (lint first vs test first)
- Exact `actions/checkout` and `actions/setup-node` versions
- Whether to add workflow_dispatch for manual triggers
- Concurrency settings (cancel in-progress runs on new push)

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope

</user_constraints>

<phase_requirements>

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| TOOL-05 | GitHub Actions CI pipeline runs tests, linting, and type checking on PR | All four quality-gate scripts exist in package.json; workflow YAML pattern verified with official GitHub docs; action versions confirmed (checkout@v6, setup-node@v6) |

</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `actions/checkout` | v6 | Clone repository in runner | Official GitHub action, v6 is latest (released Nov 2024), improved credential security |
| `actions/setup-node` | v6 | Install Node.js and configure npm cache | Official GitHub action, v6 is latest (released Oct 2024), automatic npm caching support |

### Supporting
| Tool | Version | Purpose | When to Use |
|------|---------|---------|-------------|
| `ubuntu-latest` | (managed) | CI runner OS | Default for all GitHub Actions Node.js workflows |
| Node.js | 22 (LTS) | Runtime for tooling | User decision: pinned to 22 LTS, no matrix |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `actions/checkout@v6` | `@v4` | v4 still works but v6 has better credential isolation; no reason to use older version |
| `actions/setup-node@v6` | `@v4` | v4 requires explicit `cache: 'npm'`; v6 can auto-detect but only with `packageManager` field |
| Single job | Parallel jobs | Parallel is faster but wastes CI minutes on npm install duplication; overkill for 4 fast steps |

## Architecture Patterns

### Recommended Project Structure
```
.github/
└── workflows/
    └── ci.yml          # Single CI workflow file
```

### Pattern 1: Run All Steps with `if: always()`
**What:** Each quality-gate step uses `if: always()` so it runs regardless of whether a prior step failed.
**When to use:** When you want all lint/test/format/typecheck results visible in a single CI run.
**Why not `continue-on-error`:** Using `continue-on-error: true` on a step causes GitHub to treat that step as "passed" in the job status, which would make the job appear green even when steps fail. `if: always()` runs the step unconditionally but preserves the actual pass/fail status of each step.

**Example:**
```yaml
# Source: GitHub Docs - workflow syntax
steps:
  - uses: actions/checkout@v6

  - name: Setup Node.js
    uses: actions/setup-node@v6
    with:
      node-version: '22'
      cache: 'npm'

  - name: Install dependencies
    run: npm ci

  - name: Lint
    run: npm run lint

  - name: Format check
    if: always() && steps.install.outcome == 'success'
    run: npm run format:check

  - name: Test
    if: always() && steps.install.outcome == 'success'
    run: npm test

  - name: Typecheck
    if: always() && steps.install.outcome == 'success'
    run: npm run typecheck
```

**Key insight:** The `if: always() && steps.install.outcome == 'success'` guard ensures quality steps run even if a sibling fails, but skips if `npm ci` itself failed (no point running lint without node_modules).

### Pattern 2: Concurrency Control
**What:** Cancel in-progress CI runs when a new commit is pushed to the same branch/PR.
**When to use:** Saves CI minutes by not running stale checks.

**Example:**
```yaml
# Source: GitHub Docs - concurrency control
concurrency:
  group: ${{ github.workflow }}-${{ github.event.pull_request.number || github.ref }}
  cancel-in-progress: true
```

**Key insight:** The group key includes PR number (for PRs) or ref (for pushes), ensuring runs are scoped correctly. Pushing a new commit to a PR cancels the in-progress run for that same PR without affecting other PRs.

### Pattern 3: Manual Trigger with workflow_dispatch
**What:** Adding `workflow_dispatch` to the `on` triggers allows manually running CI from the GitHub Actions tab.
**When to use:** Useful for debugging CI failures or re-running after transient issues.

**Example:**
```yaml
on:
  push:
    branches: [develop, main]
  pull_request:
    branches: [develop, main]
  workflow_dispatch:    # Manual trigger - no configuration needed
```

### Anti-Patterns to Avoid
- **Using `continue-on-error: true` on quality steps:** Makes the job appear green even when steps fail. Use `if: always()` instead.
- **Using `npm install` instead of `npm ci`:** `npm install` can modify `package-lock.json` and is slower. `npm ci` does a clean, reproducible install.
- **Omitting `cache: 'npm'` with setup-node@v6:** This project lacks `packageManager` in `package.json`, so automatic caching won't activate. Must set `cache: 'npm'` explicitly.
- **Running quality steps when `npm ci` failed:** If dependency installation fails, all subsequent steps will produce misleading errors. Guard with `steps.install.outcome == 'success'`.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| npm dependency caching | Manual `actions/cache` with custom key | `setup-node`'s `cache: 'npm'` | Automatic cache key from package-lock.json hash, handles save/restore |
| Node.js version management | Manual nvm/n installation | `actions/setup-node` | Official, handles PATH, caching, and registry auth |
| Git checkout | Manual `git clone` | `actions/checkout` | Handles auth tokens, submodules, shallow clone optimization |
| PR status checks | Custom status API calls | Workflow job status | GitHub automatically maps workflow job status to PR checks |

**Key insight:** For a simple CI pipeline, every component has an official action. Zero custom logic needed.

## Common Pitfalls

### Pitfall 1: Job appears green despite step failures
**What goes wrong:** Using `continue-on-error: true` on quality-gate steps causes the job to report success even when lint/test fails.
**Why it happens:** `continue-on-error` changes the step's "conclusion" from "failure" to "success" in the job context.
**How to avoid:** Use `if: always()` on subsequent steps instead. Each step's actual pass/fail is preserved.
**Warning signs:** PR checks show green but expanding the workflow reveals red steps.

### Pitfall 2: npm ci fails without package-lock.json
**What goes wrong:** `npm ci` requires `package-lock.json` to exist and be committed.
**Why it happens:** Some projects gitignore lock files.
**How to avoid:** Verify `package-lock.json` is committed (VERIFIED: it IS committed in this project, 184KB).
**Warning signs:** "npm ci can only install packages with an existing package-lock.json" error.

### Pitfall 3: Cache misses with setup-node when no packageManager field
**What goes wrong:** With `actions/setup-node@v6`, automatic npm caching only activates if `package.json` has a `packageManager` or `devEngines.packageManager` field.
**Why it happens:** v6 changed the auto-detection behavior.
**How to avoid:** Explicitly set `cache: 'npm'` in the setup-node step. This project has no `packageManager` field.
**Warning signs:** Workflow runs slowly; "Cache not found" in setup-node logs.

### Pitfall 4: Typecheck step fails on fvtt-types gaps
**What goes wrong:** `tsc --noEmit` produces 128 type errors from fvtt-types beta.
**Why it happens:** fvtt-types v13 is beta and has known gaps.
**How to avoid:** The `typecheck` script already includes `|| true` to make it lenient. This is intentional per user decision. CI must use the existing `npm run typecheck` script, which handles this.
**Warning signs:** If someone removes `|| true` from the typecheck script, CI will fail on every run.

### Pitfall 5: Duplicate CI runs on PRs
**What goes wrong:** Both `push` and `pull_request` triggers fire when pushing to a branch that has an open PR.
**Why it happens:** GitHub fires both events independently.
**How to avoid:** Concurrency control (`cancel-in-progress: true`) limits resource waste. Alternatively, this can be accepted as harmless -- both runs produce the same result.
**Warning signs:** Two CI runs appearing simultaneously for one push.

## Code Examples

Verified patterns from official sources:

### Complete CI Workflow (recommended)
```yaml
# Source: GitHub Docs - Building and testing Node.js
# + GitHub Docs - Concurrency control
name: CI

on:
  push:
    branches: [develop, main]
  pull_request:
    branches: [develop, main]
  workflow_dispatch:

concurrency:
  group: ${{ github.workflow }}-${{ github.event.pull_request.number || github.ref }}
  cancel-in-progress: true

jobs:
  quality-gate:
    name: Quality Gate
    runs-on: ubuntu-latest

    steps:
      - name: Checkout
        uses: actions/checkout@v6

      - name: Setup Node.js
        uses: actions/setup-node@v6
        with:
          node-version: '22'
          cache: 'npm'

      - name: Install dependencies
        id: install
        run: npm ci

      - name: Lint
        if: always() && steps.install.outcome == 'success'
        run: npm run lint

      - name: Format check
        if: always() && steps.install.outcome == 'success'
        run: npm run format:check

      - name: Test
        if: always() && steps.install.outcome == 'success'
        run: npm test

      - name: Typecheck
        if: always() && steps.install.outcome == 'success'
        run: npm run typecheck
```

### Step Ordering Recommendation (Claude's Discretion)
**Recommended order:** Lint -> Format check -> Test -> Typecheck

**Rationale:**
1. **Lint** first: fastest check, catches syntax and code-quality issues
2. **Format check**: fast, catches style issues (separate concern from lint)
3. **Test**: core correctness check
4. **Typecheck**: slowest, runs `tsc --noEmit` over the whole project, currently lenient with `|| true`

This order puts the fastest, most actionable feedback first. However, since all steps run via `if: always()`, order is primarily cosmetic -- it affects display order in the GitHub UI, not execution behavior.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `actions/checkout@v4` | `actions/checkout@v6` | Nov 2024 | Improved credential isolation under `$RUNNER_TEMP` |
| `actions/setup-node@v4` with `cache: 'npm'` | `actions/setup-node@v6` auto-caching | Oct 2024 | Auto-caching for npm when `packageManager` field present; explicit `cache: 'npm'` still works |
| Node 20 LTS | Node 22 LTS | Oct 2024 | Node 22 is current LTS; actions runtime moved to node24 |
| `actions/checkout@v3` on node16 | All actions on node24 | 2024 | Actions using node16 runtime show deprecation warnings |

**Deprecated/outdated:**
- `actions/setup-node` `always-auth` input: removed in v6, should not be used
- `actions/checkout@v3` and below: use node16 runtime, produce deprecation warnings on GitHub

## Open Questions

1. **Duplicate runs on PR pushes**
   - What we know: pushing to a branch with an open PR triggers both `push` and `pull_request` events
   - What's unclear: whether this causes any issues beyond extra CI minutes
   - Recommendation: Accept it. Concurrency control mitigates resource waste. This is standard behavior in the GitHub Actions ecosystem. No action needed.

2. **Branch protection rule setup**
   - What we know: creating the workflow YAML makes the CI check available as a status check in GitHub branch protection settings
   - What's unclear: nothing -- this is well-documented
   - Recommendation: Per user decision, this is out of scope for the phase. Branch protection is configured manually in GitHub UI after the workflow file exists and has run at least once.

## Sources

### Primary (HIGH confidence)
- [GitHub Docs - Building and testing Node.js](https://docs.github.com/en/actions/automating-builds-and-tests/building-and-testing-nodejs) - workflow structure, npm ci, caching
- [GitHub Docs - Concurrency control](https://docs.github.com/actions/writing-workflows/choosing-what-your-workflow-does/control-the-concurrency-of-workflows-and-jobs) - concurrency group patterns
- [GitHub Docs - Workflow syntax](https://docs.github.com/actions/using-workflows/workflow-syntax-for-github-actions) - if: always(), continue-on-error semantics
- [actions/checkout releases](https://github.com/actions/checkout/releases) - v6.0.2 confirmed as latest
- [actions/setup-node releases](https://github.com/actions/setup-node/releases) - v6.2.0 confirmed as latest
- [actions/setup-node v6 README](https://github.com/actions/setup-node/tree/v6) - caching behavior, inputs

### Secondary (MEDIUM confidence)
- [Ken Muse - How to Handle Step and Job Errors](https://www.kenmuse.com/blog/how-to-handle-step-and-job-errors-in-github-actions/) - continue-on-error vs if: always() tradeoffs
- [Latenode Community - Continue on failure pattern](https://community.latenode.com/t/can-a-github-actions-job-continue-after-a-step-fails-while-still-marking-the-job-as-failed/17960) - verified pattern for run-all-then-fail

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - official GitHub Actions, versions verified from release pages
- Architecture: HIGH - single YAML file, well-documented patterns, no ambiguity
- Pitfalls: HIGH - verified cache behavior, tested patterns, project-specific checks done

**Research date:** 2026-03-01
**Valid until:** 2026-06-01 (GitHub Actions is stable, major version bumps are infrequent)
