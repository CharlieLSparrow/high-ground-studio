# Agent Board

Last updated: 2026-05-23

Use this board as the async coordination surface for concurrent Codex work.
Keep entries short and current.

This board should prevent collisions, not slow down creative work. Agents can
keep moving on owned branches when paths do not overlap and fast-approval zones
are not involved.

For a single readable progress stream, append updates to:

```text
docs/coordination/progress-thread.md
```

For reboot/crash recovery and copy/paste worker packets, use:

```text
docs/agents/restart-playbook.md
```

## Current Snapshot

Verified after `git fetch --all --prune` on 2026-05-23.

| Branch | Head | Worktree | Lane | Notes |
| --- | --- | --- | --- | --- |
| `main` | `d9c9337` | none active | Trunk / integration runway | Current trunk before integration. Do not do feature work directly on `main`. |
| `project/worldhub` | integration in progress | `/Users/wall-e/Dev/hgs-worldhub-project` | WorldHub / Content Studio integration | Current integration branch; now merging `main`, deployed Content Studio, and WorldHub foundation. |
| `codex/content-studio-command-001` | `e13e33f` | `/Users/wall-e/Dev/high-ground-studio` | Content Studio command surface and deploy helper | Deployed to Studio Cloud Run revision `studio-00023-7c5`; PR #3 opened. |
| `codex/worldhub-001-foundation` | `ee26a41` | `/Users/wall-e/Dev/hgs-worldhub-codex` | WorldHub / monetization foundation | Clean and pushed. Safe to close its terminal; integration proceeds through `project/worldhub`. |
| `codex/studio-cut-001-web-shell` | `46031ff` plus local edits | `/Users/wall-e/Dev/high-ground-studio-codex-studio-cut-001` | Studio Cut / media tooling | Active dirty lane; do not touch without handoff. |

## Active Lanes

### Integration / Release Captain

- owner: Codex in this thread
- branch: `project/worldhub`
- owns:
  - lane visibility
  - merge order recommendations
  - dirty worktree warnings
  - final integration validation
  - deployment and rollback notes for integrated releases
- does not own:
  - every product decision
  - every branch commit
  - day-to-day feature velocity when file ownership is clear

### Studio / Content Management Studio

- owner: integration captain until reassigned
- source branch: `codex/content-studio-command-001`
- integration branch: `project/worldhub`
- owns:
  - `apps/studio/src/app/content-studio/*`
  - `apps/studio/src/app/studio-nav.tsx`
  - `packages/content-studio-domain`
  - `scripts/studio-cloud-run-deploy.mjs`
  - `cloudbuild.studio.deploy.yaml`
  - Content Studio docs under `docs/architecture`, `docs/plans`, and `docs/project-context`
- goal:
  - create a private command surface for podcast production, book writing/publishing, HGO episode-page work, monetization follow-through, and Homer coaching ideas
- current guardrails:
  - browser-local state for the deployed board
  - no Prisma writes
  - no provider calls
  - no public publishing
  - no real manuscript/content material
  - local-first is a first slice, not a promise to avoid DB/API/service work
- deploy posture:
  - deploy coherent Studio slices to the existing private Cloud Run service after validation
  - record live URL, smoke result, and rollback command in the progress thread

### WorldHub / Business Infrastructure

- owner: integration captain until reassigned
- source branch: `codex/worldhub-001-foundation`
- integration branch: `project/worldhub`
- owns:
  - `packages/worldhub-domain`
  - `apps/web/src/app/team/worldhub/*`
  - `docs/architecture/worldhub-*`
  - `docs/plans/worldhub-now-next-later.md`
  - `docs/runbooks/web-cloud-run.md`
  - future offers, entitlements, merch, Patreon, coaching-package follow-through
- current status:
  - provider-neutral foundation and current workflow map are being integrated
  - no Stripe/Patreon/POD/provider calls are active
- next likely slice:
  - read-only WorldHub summary of current workflows, then deliberate persistence or service boundary if that becomes the smallest useful move

### Manuscript Collaboration

- owner: unassigned
- likely branch: `codex/studio-collab-*` or a dedicated manuscript branch
- owns:
  - `apps/studio/src/app/manuscript/collaboration-lab/*`
  - collaboration lab tests and runbooks
- current status:
  - latest collaboration work is on `main` and now merged into `project/worldhub`
- next packet:
  - continue from current `main` or the integration branch on a fresh focused branch
  - preserve synthetic-only boundaries unless a real collaboration persistence slice is approved

### Studio Cut / Media Tooling

- owner: separate agent/worktree
- branch: `codex/studio-cut-001-web-shell`
- owns:
  - Studio Cut editor/media workflow
  - rescue sync and generated package tooling
  - `tools/studio-cut-local/*`
  - Studio Cut docs
- current status:
  - pushed at `46031ff`
  - local worktree has dirty edits in Studio Cut docs and `tools/studio-cut-local/studio_cut_local.py`
- no-touch without handoff:
  - main `apps/studio` routes
  - WorldHub provider/domain packages
  - Content Studio command surface

## File Ownership Rules

| Path | Current owner | Notes |
| --- | --- | --- |
| `apps/studio/src/app/content-studio/*` | Content Studio lane | Private browser-local command surface. |
| `apps/studio/src/app/manuscript/*` | Manuscript lane | Do not mix collaboration lab changes into Content Studio slices. |
| `apps/studio/src/app/studio-nav.tsx` | Shared Studio navigation | Declare before editing. |
| `apps/web/src/app/team/worldhub/*` | WorldHub lane | Keep provider-neutral until business model is stable. |
| `packages/content-studio-domain` | Content Studio lane | Provider-neutral content project contract. |
| `packages/worldhub-domain` | WorldHub lane | Provider-neutral business/access contract. |
| `packages/*` | Shared | Coordinate package creation and lockfile changes. |
| `prisma/schema.prisma` | Fast-approval zone | Schema work is allowed when useful, but needs explicit migration/rollback scope. |
| `apps/web/content/publish`, `_staging`, `_inbox` | Protected content | Do not use real manuscript/HGO content without explicit approval. |
| deployment/cloud config | Fast-approval zone | Deploy often when validation and rollback are clear. |

## Recommended Merge Order

1. Keep `main` clean; no feature work directly on `main`.
2. Use `project/worldhub` as the integration branch.
3. Merge current `main` into `project/worldhub`.
4. Merge deployed Content Studio branch.
5. Merge WorldHub foundation branch.
6. Validate Studio, web, package, and docs surfaces.
7. Deploy integrated runtime changes if validation passes.
8. Promote `project/worldhub` to `main` only after broad validation and rollback notes are recorded.

## Broad Validation Matrix

| Scope | Commands |
| --- | --- |
| Docs-only | `git diff --check` |
| Studio route/UI | `pnpm --filter studio typecheck`, `pnpm --filter studio build`, `pnpm studio:cloudrun:test`, `git diff --check` |
| Studio collaboration | `pnpm studio:collab:test`, relevant `studio:collab:*` tests, `pnpm --filter studio typecheck` |
| Web/HGO/WorldHub route work | `pnpm --filter web build`, `pnpm --filter web exec next build --webpack`, relevant HGO smoke/test command |
| Packages/domain helpers | `pnpm content-studio:domain:typecheck`, `pnpm worldhub:domain:typecheck` |
| Prisma/schema | `pnpm db:generate`; run `pnpm db:push` only when DB target is confirmed safe |
| Content publish/discovery | `node scripts/verify-published-discovery.mjs` |

## Rollback Commands

Record exact commit SHAs before merging. Typical local rollback commands:

```bash
git switch main
git revert <merge-or-feature-commit-sha>
```

For Cloud Run rollback, record the previous ready revision and use:

```bash
gcloud run services update-traffic SERVICE \
  --project=PROJECT_ID \
  --region=REGION \
  --to-revisions=PREVIOUS_REVISION=100
```

Do not use destructive reset commands unless Chuck explicitly asks for that operation.

## Fast-Approval Zones

These are not off-limits. They require explicit scope and approval before mutation, then the agent should keep moving.

- Production database mutation
- Prisma schema migration or `db:push`
- Cloud Run, Cloud SQL, DNS, OAuth, billing, secrets, IAM, Firebase config
- Live Stripe, Patreon, POD, merch, social, publishing, or analytics providers
- Real manuscript text or real HGO source content in tests/prototypes
- Public exposure of private Studio material
- Generated/private artifacts that should remain ignored

## Open Questions

- Should Content Studio project persistence land in the Studio app database, a new API boundary, or a small service?
- Which podcast workflow matters first: show-prep packet, edit checklist, publish package, episode-page projection, or podcast-host metadata?
- Should WorldHub's first read-only summary live in `apps/web` long term, or should it quickly move toward a service/API boundary once the domain model is useful?
