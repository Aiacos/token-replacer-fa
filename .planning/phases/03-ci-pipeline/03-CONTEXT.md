# Phase 3: CI Pipeline - Context

**Gathered:** 2026-03-01
**Status:** Ready for planning

<domain>
## Phase Boundary

Create a GitHub Actions workflow that runs the full quality gate (test, lint, format check, typecheck) on every push and PR to develop/main branches. The workflow must report status checks that block PR merging.

</domain>

<decisions>
## Implementation Decisions

### Workflow triggers
- Trigger on both `push` and `pull_request` events to develop and main branches
- Run on all PRs including drafts (no filtering on draft status)
- Feature branches only get CI through PRs — no push trigger on arbitrary branches
- Runner: `ubuntu-latest`

### Quality gate steps
- Include `npm run format:check` (Prettier) as a CI step alongside lint, test, typecheck
- Run all steps even if one fails — use `continue-on-error` or `if: always()` pattern so all issues surface in one push
- Single job with separate steps (not parallel jobs) — simpler, single npm install, appropriate for project size
- Typecheck keeps `|| true` (lenient) — fvtt-types has known gaps, strict mode would produce false failures

### Node and caching
- Pin to Node 22 LTS only — no version matrix needed, Node is only used for tooling
- Cache npm dependencies between runs using `setup-node`'s built-in cache feature

### PR status checks
- CI should be a required status check that blocks merging (roadmap success criteria: "block the PR status check")
- Scope: create the workflow YAML file only — branch protection rules are configured manually in GitHub UI
- Workflow name: "CI" — simple, standard, clear in PR checks

### Claude's Discretion
- Step ordering within the job (lint first vs test first)
- Exact `actions/checkout` and `actions/setup-node` versions
- Whether to add workflow_dispatch for manual triggers
- Concurrency settings (cancel in-progress runs on new push)

</decisions>

<specifics>
## Specific Ideas

No specific requirements — open to standard GitHub Actions conventions.

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `package.json` scripts already defined: `test`, `lint`, `format:check`, `typecheck`
- All quality commands are ready to run — no additional tooling setup needed

### Established Patterns
- `npm test` uses `vitest run --passWithNoTests` — exits 0 with no tests
- `npm run lint` uses `eslint scripts/` — ESLint v10 flat config
- `npm run format:check` uses `prettier --check .` — Prettier 3.x
- `npm run typecheck` uses `tsc --noEmit --project jsconfig.json || true` — lenient

### Integration Points
- GitHub remote: `github.com/Aiacos/token-replacer-fa`
- Branches: `develop` (default development), `main` (releases)
- No `.github/workflows/` directory exists yet — needs creation

</code_context>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 03-ci-pipeline*
*Context gathered: 2026-03-01*
