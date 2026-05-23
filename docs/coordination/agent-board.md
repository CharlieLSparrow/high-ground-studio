# Agent Board

Last updated: 2026-05-23

Use this board as the async coordination surface for concurrent Codex work.
Keep entries short and current.

## Active Branches Observed

| Branch | Head | Lane | Notes |
| --- | --- | --- | --- |
| `main` | `b0ee6c8` | Studio annotation/materialized state | Latest trunk observed after `git fetch --all --prune`. |
| `project/worldhub` | `fb7bfaa` | WorldHub / HGO staged projection integration | Behind `main`; contains collaboration and staged projection sequence. |
| `codex/worldhub-001-foundation` | `ab7882d` | WorldHub foundation / web deploy path / Content Studio spine | Current branch for this agent. |
| `codex/studio-cut-001-web-shell` | `46031ff` | Studio Cut media tooling | Dedicated worktree; should stay separate from `apps/studio` and `apps/web` unless intentionally integrated. |

## Current Agent Lanes

### Integration / Release Captain

- owner: unassigned
- branch: recommended `project/worldhub` or a dedicated integration branch
- owns:
  - merge order
  - final conflict resolution
  - final full build/smoke before deploy
  - deployment notes and rollback path
- current need:
  - decide whether `main` should merge into `project/worldhub` before
    WorldHub/Content Studio work stacks further

### WorldHub / Business Infrastructure

- owner: Codex in `hgs-worldhub-codex`
- branch: `codex/worldhub-001-foundation`
- owns:
  - `packages/worldhub-domain`
  - `/team/worldhub`
  - `apps/web` Cloud Run deploy path
  - provider-neutral WorldHub docs
- current status:
  - web image `92132b8` built and pushed
  - web Cloud Run deploy blocked until required Secret Manager versions exist
  - Content Studio spine added in Studio commit `ab7882d`
  - Studio deploy blocked by local `gcloud` reauthentication
- no-touch without handoff:
  - live provider integrations
  - Prisma schema
  - public manuscript/source surfaces

### Studio / Content Management Studio

- owner: Codex in `hgs-worldhub-codex` until reassigned
- branch: `codex/worldhub-001-foundation`
- owns:
  - `/content-studio`
  - `docs/architecture/content-management-studio.md`
  - `docs/plans/content-studio-now-next-later.md`
  - future provider-neutral content project model
- current status:
  - route is private, static planning state
  - no Prisma writes, provider calls, or publishing behavior
- likely next files:
  - `packages/content-studio-domain`
  - `apps/studio/src/app/content-studio/*`
  - Studio route smoke docs

### Studio Cut / Media Tooling

- owner: separate agent/worktree
- branch: `codex/studio-cut-001-web-shell`
- owns:
  - Studio Cut editor/media workflow
  - rescue sync and generated package tooling
- current observed head:
  - `46031ff test(studio-cut): add rescue sync publish package harness`
- no-touch without handoff:
  - main `apps/studio` routes
  - WorldHub provider/domain package

## Coordination Rules For The Next Pass

- Do not let three agents commit directly to the same branch at the same time.
- Prefer one branch per lane, then merge through an integration captain.
- Before editing shared files such as `package.json`, `pnpm-lock.yaml`,
  Dockerfiles, or top-level docs, update this board first.
- Keep deploy authority with the agent holding the deploy runbook and rollback
  path for that app.
- If a lane needs secrets or OAuth changes, record the blocker here instead of
  trying to work around it.

## Open Questions

- Should `project/worldhub` be rebased/merged onto current `main` before more
  WorldHub work accumulates?
- Should Content Studio move to its own `codex/studio-content-*` branch after
  this foundation branch lands?
- Who should be integration captain for the three-agent setup?
