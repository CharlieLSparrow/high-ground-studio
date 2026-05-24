# Agent Board

Last updated: 2026-05-24

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

Verified after the HGO Content Studio packet-import bridge merge and web deploy
on 2026-05-24.

| Branch | Head | Worktree | Lane | Notes |
| --- | --- | --- | --- | --- |
| `main` | `e5062ac` plus progress-story follow-up | `/Users/wall-e/Dev/high-ground-studio` | Trunk / live runtime | Content Studio checkpoints, production packets, checkpoint history, and the HGO production-packet import bridge are merged and deployed. Do not do feature work directly on `main`; use fresh branches. |
| `codex/hgo-content-studio-packet-import-001` | `55a3f93` | none active | HGO / Content Studio bridge | Merged by PR #19 as `e5062ac`; branch can be left closed. |
| `codex/content-studio-packet-import-001` | `b2fd9ac` | none active | Content Studio persistence | Merged by PR #16 as `3cc1fae`; branch can be left closed. |
| `codex/content-studio-production-packets-001` | `6078172` | none active | Content Studio production packets | Merged by PR #17 as `95b367a`; branch can be left closed. |
| `codex/content-studio-checkpoint-history-001` | `7aac0c9` | none active | Content Studio checkpoint history | Merged by PR #18 as `695645b`; branch can be left closed. |
| `project/worldhub` | `32a6179` | `/Users/wall-e/Dev/hgs-worldhub-project` | WorldHub / Content Studio integration | Merged to `main` by PR #4; keep as integration reference until next cycle. |
| `codex/content-studio-command-001` | `bfa9dc0` | none active | Content Studio command surface and deploy helper | Included in PR #4; PR #3 was closed as superseded; final continuity note is being cherry-picked to `main`. |
| `codex/worldhub-001-foundation` | `ee26a41` | no active terminal | WorldHub / monetization foundation | Included in PR #4. Terminal can remain closed. |
| `codex/studio-cut-001-web-shell` | `46031ff` | `/Users/wall-e/Dev/high-ground-studio-codex-studio-cut-001` | Studio Cut / media tooling | Only remaining active outside agent. Coordinate before touching video/media files. |

## Active Lanes

### Integration / Release Captain

- owner: Codex in this thread
- branch: `main` for release coordination; use `project/worldhub` again for
  the next integration cycle
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
- source branch: `codex/content-studio-packet-import-001`, merged by PR #16
- latest branch: `codex/content-studio-production-packets-001`, merged by PR
  #17
- latest checkpoint branch: `codex/content-studio-checkpoint-history-001`,
  merged by PR #18
- previous branch: `codex/content-studio-command-001`, merged to `main` by PR #4
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
  - browser-local state remains the active working surface
  - manual server checkpoints are available after Cloud Run Job
    `studio-db-push-3cc1fae`
  - no provider calls
  - no public publishing
  - no real manuscript/content material
  - local-first is a first slice, not a promise to avoid DB/API/service work
- deploy posture:
  - deploy coherent Studio slices to the existing private Cloud Run service after validation
  - record live URL, smoke result, and rollback command in the progress thread
- current live revision:
  - `studio-00031-rkx` from `main` commit `695645b`
  - rollback to `studio-00030-ncf`

### HGO Staged Episode Pages

- owner: integration captain until reassigned
- latest branch: `codex/hgo-content-studio-packet-import-001`, merged by PR #19
- owns:
  - `apps/web/src/app/projection-stage/*`
  - `apps/web/src/lib/hgo/*`
  - HGO staged projection tests under `scripts/hgo-*`
- current status:
  - `/projection-stage/import` accepts raw HGO projection JSON and full Content
    Studio production packets
  - Content Studio packets are safety-checked before `hgoProjectionDraft` is
    extracted for browser-only staged review
- current live revision:
  - `web-00013-fq4` from `main` commit `e5062ac`
  - rollback to `web-00011-6sq`

### WorldHub / Business Infrastructure

- owner: integration captain until reassigned
- source branch: `codex/worldhub-001-foundation`
- integration branch: merged to `main` by PR #4
- owns:
  - `packages/worldhub-domain`
  - `apps/web/src/app/team/worldhub/*`
  - `docs/architecture/worldhub-*`
  - `docs/plans/worldhub-now-next-later.md`
  - `docs/runbooks/web-cloud-run.md`
  - future offers, entitlements, merch, Patreon, coaching-package follow-through
- current status:
  - provider-neutral foundation and current workflow map are merged to `main`
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
  - latest collaboration work is on `main`
- next packet:
  - continue from current `main` on a fresh focused branch
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
  - user reports this is the only remaining active outside agent terminal
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
| `apps/web/src/app/team/progress/*` | Integration / team visibility lane | Team-only readable build journal. |
| `apps/web/content/internal/progress-story.json` | Integration / team visibility lane | Add short narrative entries for meaningful commits, merges, and deploys. |
| `packages/content-studio-domain` | Content Studio lane | Provider-neutral content project contract. |
| `packages/worldhub-domain` | WorldHub lane | Provider-neutral business/access contract. |
| `packages/*` | Shared | Coordinate package creation and lockfile changes. |
| `prisma/schema.prisma` | Fast-approval zone | Schema work is allowed when useful, but needs explicit migration/rollback scope. |
| `apps/web/content/publish`, `_staging`, `_inbox` | Protected content | Do not use real manuscript/HGO content without explicit approval. |
| deployment/cloud config | Fast-approval zone | Deploy often when validation and rollback are clear. |

## Recommended Merge Order

Completed for the 2026-05-23 Content Studio / WorldHub cycle:

1. Kept feature work off `main`.
2. Used `project/worldhub` as the integration branch.
3. Merged current `main`, deployed Content Studio, and WorldHub foundation.
4. Validated Studio, web, package, docs, and collaboration smoke surfaces.
5. Deployed integrated runtime changes.
6. Promoted `project/worldhub` to `main` through PR #4.
7. Deployed `main` commit `c32adb2` to Studio Cloud Run.

Next cycle:

1. Start new feature work from current `main`.
2. Use fresh focused branches for worker lanes.
3. Reuse `project/worldhub` only when there is another multi-lane integration
   batch ready.
4. Validate and deploy coherent slices frequently with rollback notes.

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
