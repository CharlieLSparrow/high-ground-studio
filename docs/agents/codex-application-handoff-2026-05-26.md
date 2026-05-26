# Codex Application Handoff

Date: 2026-05-26

This is the handoff packet for moving the project from this terminal session
into the Codex application.

## Read First

- `AGENTS.md`
- `docs/project-context/current-state.md`
- `docs/architecture/system-overview.md`
- `docs/agents/codex-continuity.md`
- `docs/coordination/agent-board.md`
- `docs/coordination/progress-thread.md`
- `docs/analysis/studio-manuscript-writing-tool-competitive-research.md`
- `docs/plans/studio-manuscript-desk-improvement-roadmap.md`

## Current Branch

- Checkout: `/Users/wall-e/Dev/high-ground-studio`
- Branch: `codex/content-studio-persistence-supervisor-001`
- HEAD at handoff start: `b4c3914 Quipsly added to commit`
- Relation to `origin/codex/content-studio-persistence-supervisor-001` at
  handoff start: `0 ahead / 0 behind`
- Relation to `origin/main` at handoff start: `4 ahead / 30 behind`

The branch is not `main`. Do not assume trunk state without checking
`git status --short --branch` and `git log -1 --oneline`.

## Work Completed In This Handoff Pass

### Manuscript Desk mobile writing pass

Updated:

- `apps/studio/src/app/manuscript/studio-manuscript-client.tsx`
- `apps/studio/src/app/globals.css`
- `docs/sessions/studio-manuscript-mobile-writing-result.md`
- `docs/project-context/current-state.md`

Behavioral intent:

- phone-width `/manuscript` can mark selected text by author
- phone-width `/manuscript` can choose/apply/clear semantic tags
- phone-width `/manuscript` can mark cited quotations
- mobile tools expose semantic focus and all-semantic focus
- mobile editor readability, bottom safe-area spacing, wrapping, caret
  visibility, and inline semantic mark visibility are improved

Data boundary:

- no Prisma schema change
- no server route change
- no canonical manuscript file writes
- no public publish path
- no change to the TipTap/ProseMirror draft JSON contract
- author marks and semantic marks remain separate

### Planning and competitive research pass

Added:

- `docs/analysis/studio-manuscript-writing-tool-competitive-research.md`
- `docs/plans/studio-manuscript-desk-improvement-roadmap.md`
- this handoff packet

Updated:

- `docs/README.md`
- `docs/agents/codex-handoff.md`
- `docs/coordination/agent-board.md`
- `docs/coordination/progress-thread.md`

## Other Local Work On This Branch

The working tree also contains an untracked Quipsly/QuipLore scaffold that was
already present before this manuscript planning pass:

- `apps/quiplore`
- `apps/quipsly-api`
- `packages/quipsly-domain`
- `docs/agents/quipsly-quiplore-implementation-result.md`
- root script and lockfile changes

Earlier validation recorded for that scaffold:

- `pnpm --filter @high-ground/quipsly-domain typecheck`
- `pnpm --filter quiplore typecheck`
- `pnpm --filter quipsly-api typecheck`
- `pnpm --filter quiplore build`
- `pnpm --filter quipsly-api build`
- `git diff --check`

The scaffold now pins `next@16.1.6`, `react@19.2.4`, and
`react-dom@19.2.4` to match the existing Studio/Web peer graph. The root
package also pins `react@19.2.4` and `react-dom@19.2.4` because root
`react-datepicker` otherwise caused pnpm to auto-install a newer React peer and
split `@prisma/client` into two generated-client instances.

This handoff did not repeat local dev-server smoke because the sandbox blocked
local port listening with `listen EPERM`.

## Validation Status

Manuscript mobile pass validation completed:

```bash
pnpm studio:manuscript:test
pnpm --filter studio typecheck
pnpm --filter studio build
git diff --check
```

Sandbox-only build note:

```bash
pnpm --filter studio build
```

Inside the sandbox, this command still hits the known Turbopack/PostCSS helper
port-bind restriction. Outside the sandbox, it passes.

## Open Worktrees Checked

These sibling worktrees were checked for dirty state during this handoff pass:

| Worktree | Branch | Status |
| --- | --- | --- |
| `/private/tmp/hgs-deploy-928d68f` | detached `a665940` | clean |
| `/private/tmp/hgs-manuscript-live-001` | `codex/manuscript-live-room-001` | clean, `1 ahead / 28 behind origin/main` |
| `/Users/wall-e/Dev/hgs-worldhub-codex` | `codex/worldhub-001-foundation` | clean |
| `/Users/wall-e/Dev/hgs-worldhub-project` | `project/worldhub` | clean |
| `/Users/wall-e/Dev/high-ground-studio-codex-studio-cut-001` | `codex/studio-cut-001-web-shell` | clean |

No sibling worktree had uncommitted changes to rescue. The many old
`codex/*live-room*` branches that are ahead/behind `origin/main` should be
treated as historical feature/deploy lanes unless a future agent explicitly
needs to recover one. Do not merge or delete them blindly.

## Recommended Next Product Slice

The local Studio build environment is healthy at handoff. Take one of these
narrow roadmap items next:

1. Mobile session strip: local saved time, selected lens, session words, and
   snapshot freshness.
2. Read-only Manuscript Map: binder/outliner rows generated from existing
   structure regions and block summaries.
3. Semantic review queue: derived `needs-review` and `quote` queues with jump
   back to manuscript.

Keep the first slice browser-local and model-preserving.

## Stop Conditions

Stop and record before proceeding if:

- Prisma/schema changes become necessary
- production database mutation is required
- real manuscript text would need to enter tests or synthetic fixtures
- public content paths would be written
- Cloud Run/IAM/DNS/OAuth/secrets/billing changes become necessary
- old live-room branches need to be merged or deleted
