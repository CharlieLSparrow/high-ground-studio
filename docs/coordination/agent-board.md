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

Verified after the HGO draft packet lab deploy on 2026-05-24.

| Branch | Head | Worktree | Lane | Notes |
| --- | --- | --- | --- | --- |
| `main` | WorldHub Growth deploy docs `02e96df` | `/Users/wall-e/Dev/high-ground-studio` | Trunk / live runtime | Content Studio checkpoints, HGO staging/publish-intent rails, WorldHub provider rails, Google Calendar sync jobs, the Growth desk, SEO briefs, analytics snapshots, ad/affiliate/sponsor placement planning, gated GA/AdSense runtime hooks, the web Cloud SQL cutover, `app.highgroundodyssey.com` Cloud Run cutover, and public `/updates` build journal are merged and deployed. Do not do feature work directly on `main`; use fresh branches. |
| `codex/hgo-staged-artifact-store-001` | `9598cb7` | none active | HGO private review store | Merged by PR #21 as `b07c73d`; branch can be left closed. |
| `codex/web-deploy-hgo-smoke-001` | `c9e4d28` | none active | Web deploy hardening | Merged by PR #20 as `97d6bd6`; branch can be left closed. |
| `codex/hgo-content-studio-packet-import-001` | `55a3f93` | none active | HGO / Content Studio bridge | Merged by PR #19 as `e5062ac`; branch can be left closed. |
| `codex/content-studio-packet-import-001` | `b2fd9ac` | none active | Content Studio persistence | Merged by PR #16 as `3cc1fae`; branch can be left closed. |
| `codex/content-studio-production-packets-001` | `6078172` | none active | Content Studio production packets | Merged by PR #17 as `95b367a`; branch can be left closed. |
| `codex/content-studio-checkpoint-history-001` | `7aac0c9` | none active | Content Studio checkpoint history | Merged by PR #18 as `695645b`; branch can be left closed. |
| `project/worldhub` | `32a6179` | `/Users/wall-e/Dev/hgs-worldhub-project` | WorldHub / Content Studio integration | Merged to `main` by PR #4; keep as integration reference until next cycle. |
| `codex/content-studio-command-001` | `bfa9dc0` | none active | Content Studio command surface and deploy helper | Included in PR #4; PR #3 was closed as superseded; final continuity note is being cherry-picked to `main`. |
| `codex/worldhub-001-foundation` | `ee26a41` | no active terminal | WorldHub / monetization foundation | Included in PR #4. Terminal can remain closed. |
| `codex/studio-cut-001-web-shell` | `64c024a` | `/Users/wall-e/Dev/high-ground-studio-codex-studio-cut-001` | Studio Cut / media tooling | Jason reports the worktree is clean and the lane will stay out of HGO/web deploy files without coordination. |

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
  - `studio-00039-jzh` from `main` commit `b291494`
  - rollback to `studio-00038-9nw`

### HGO Staged Episode Pages

- owner: integration captain until reassigned
- latest branch: `codex/hgo-staged-artifact-store-001`, merged by PR #21
- previous branch: `codex/hgo-content-studio-packet-import-001`, merged by PR #19
- owns:
  - `apps/web/src/app/projection-stage/*`
  - `apps/web/src/lib/hgo/*`
  - HGO staged projection tests under `scripts/hgo-*`
- current status:
  - `/projection-stage/import` accepts raw HGO projection JSON and full Content
    Studio production packets
  - Content Studio packets are safety-checked before `hgoProjectionDraft` is
    extracted for browser-only staged review
  - validated `hgo-staged-artifact-v1` packets can be saved through an explicit
    private team action
  - saved artifacts can be marked `needs-fixes`, `human-review`,
    `approved-for-future-staging`, or `archived`
  - `/api/hgo/staged-artifacts` and `/team/hgo-staged-artifacts` are
    authenticated/team-gated
  - `/team/hgo-publish-queue` derives ready/not-ready/archived private
    episode-page publish review lanes from saved staged artifacts
  - `/team/hgo-publish-queue/[recordId]` opens one saved artifact as a private
    review detail page with proposed file targets, validation commands, safety
    flags, copy/download controls, and future rollback notes
  - `/team/hgo-publish-queue/[recordId]/preview` renders the private projected
    episode page through the shared HGO projection renderer before any public
    route or content file is created
  - approved saved artifacts derive private
    `hgo-episode-publish-candidate-v1` packets with proposed route, blockers,
    warnings, human review steps, and rollback notes
  - queue detail pages derive private
    `hgo-episode-publish-review-brief-v1` packets for operator/agent handoff
  - queue detail pages also derive private `hgo-episode-publish-draft-v1`
    packets with proposed MDX draft content, proposed frontmatter, safety flags,
    and deferred file targets
  - queue detail handoff controls can copy/download the whole publish-draft
    packet, the generated private MDX draft, and the generated frontmatter JSON
  - `/team/hgo-publish-draft-lab` validates portable private publish-draft
    packet JSON, rejects public/write/provider safety drift, and lets operators
    inspect/copy/download generated MDX and frontmatter without DB writes
  - `/team/hgo-publish-queue/[recordId]` can now save one durable private
    `HgoEpisodePublishCandidate` publish-intent row for ready packets; this is
    additive DB persistence only and still does not create public routes, write
    content files, call providers, publish live pages, or replace `/episodes`
  - live schema was first synced by Cloud Run Job `web-db-push-b07c73d`
  - latest live schema sync ran through Cloud Run Job
    `web-cloudsql-db-push-6416979`, execution
    `web-cloudsql-db-push-6416979-wjxmt`, for
    `HgoEpisodePublishCandidate`
  - web persistence has moved from Neon to the staged Cloud SQL target:
    database `web`, user `web_app`, secret `web-cloudsql-database-url`
  - successful copy job `web-neon-to-cloudsql-copy-f14c4c7-w27bk` copied 20
    public-schema rows from Neon into Cloud SQL
  - `pnpm web:db:target:report` confirms live `web` mounts
    `DATABASE_URL` from `web-cloudsql-database-url`
- current live revision:
  - latest web deploy is `web-00067-2ww` from `main` commit `02e96df`
  - immediate rollback to previous Cloud SQL-backed revision `web-00066-xgr`
  - deeper rollback to Neon-backed `web-00031-4r2` while the legacy Neon source
    remains valid

### WorldHub / Business Infrastructure

- owner: integration captain until reassigned
- source branch: `codex/worldhub-001-foundation`
- integration branch: merged to `main` by PR #4
- owns:
  - `packages/worldhub-domain`
  - `apps/web/src/app/team/worldhub/*`
  - `apps/web/src/app/team/growth/*`
  - `docs/architecture/worldhub-*`
  - `docs/plans/worldhub-now-next-later.md`
  - `docs/runbooks/web-cloud-run.md`
  - future offers, entitlements, merch, Patreon, coaching-package follow-through,
    SEO, analytics, ads, affiliates, and sponsors
- current status:
  - provider-neutral foundation and current workflow map are merged to `main`
  - `/team/worldhub` is now a database-backed integration command center for
    provider readiness, carts, orders, fulfillment, provider events, and sync
    jobs
  - live schema sync ran through Cloud Run Job `web-cloudsql-db-push-2d165a8`,
    execution `web-cloudsql-db-push-2d165a8-8zbxl`
  - Stripe and Patreon webhook endpoints are live and verify signatures before
    writing provider-event summaries; live unsigned smokes return 503 until the
    webhook secrets are mounted
  - Google Calendar sync can queue appointment sync jobs and can create/update
    events once dedicated `GOOGLE_CALENDAR_*` credentials are mounted
  - Cloud Run deploy tooling now mounts optional provider secrets automatically
    when matching Secret Manager secrets exist and have enabled versions;
    current live check found `0` optional provider secrets mounted
  - `/team/growth` is now live as a database-backed Growth desk for SEO briefs,
    manual analytics snapshots, AdSense/ad slot planning, affiliate/book
    recommendation placements, direct sponsor slots, and monetization research
    notes
  - live schema sync for the Growth models ran through Cloud Run Job
    `web-cloudsql-db-push-e4b8543`, execution
    `web-cloudsql-db-push-e4b8543-t9454`
  - live schema sync for `WorldHubMonetizationResearchNote` ran through Cloud
    Run Job `web-cloudsql-db-push-810e8ae`, execution
    `web-cloudsql-db-push-810e8ae-5xd7g`
  - latest Growth deploy docs/story revision is `web-00070-2c5` from commit
    `54afb2e`
  - Google Analytics and AdSense runtime scripts are gated by env; no GA,
    Search Console, AdSense, affiliate, or sponsor optional secrets are mounted
    yet
  - no Stripe Checkout, payment reconciliation, Patreon entitlement mutation,
    merch provider call, fulfillment call, analytics import, Search Console
    import, public ad placement, or public affiliate link is active yet
- next likely slice:
  - seed `/team/growth`, convert the highest-confidence research notes into
    placements/offers, mount the first analytics/search/AdSense secrets, add
    automatic Google Calendar sync enqueue, then Stripe hosted checkout/order
    reconciliation, Patreon member/tier reconciliation, analytics/search import,
    and merch catalog/fulfillment handoff

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
  - pushed at `64c024a`
  - Jason reports the dedicated Studio Cut worktree is clean
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
| `apps/web/src/app/team/growth/*` | WorldHub / Growth lane | Private SEO, analytics, ads, affiliate, and sponsor planning. |
| `apps/web/src/components/analytics/*` | WorldHub / Growth lane | Runtime scripts must stay env-gated and off by default. |
| `apps/web/src/app/ads.txt/*` | WorldHub / Growth lane | Should return 404 until AdSense env is configured. |
| `apps/web/src/app/api/worldhub/webhooks/*` | WorldHub lane | Provider webhooks must verify signatures and write replayable provider events before mutating app state. |
| `apps/web/src/lib/server/google-calendar-sync.ts` | WorldHub lane | Calendar writes must stay behind dedicated `GOOGLE_CALENDAR_*` credentials and app-owned sync jobs. |
| `apps/web/src/app/team/progress/*` | Integration / team visibility lane | Team-only readable build journal. |
| `apps/web/src/app/updates/*` | Integration / team visibility lane | Public build journal route powered by the same story data. |
| `apps/web/src/components/progress/*` | Integration / team visibility lane | Shared progress story renderer. |
| `apps/web/content/internal/progress-story.json` | Integration / team visibility lane | Add short narrative entries for meaningful commits, merges, and deploys. |
| `scripts/progress-story-add-entry.*` | Integration / team visibility lane | CLI helper and tests for appending build journal entries. |
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
