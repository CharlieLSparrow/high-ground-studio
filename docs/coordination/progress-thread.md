# Progress Thread

Append short updates here so the project has one readable async thread across
agents and worktrees. Keep updates concrete: branch, action, files touched,
checks, blockers, and next handoff.

## 2026-06-02

## 2026-06-03

### Codex / Episode 4 real editing hardening log

- Added `docs/coordination/quipsly-episode-4-editing-hardening-log.md` as the
  repo-local place to record what was scary, what failed, what was confusing,
  and what to fix after the first real Episode 4 editing test.
- Linked the log from `docs/coordination/agent-board.md` so future agents see
  it during handoff/recon.
- Current emphasis: keep Real Editing Session Mode panic-proof, hide lab
  affordances from the actual Episode 4 workflow, preserve recoverability, and
  make media health/sync/export readiness understandable without NLE expertise.

### Codex / Quipsly Creative OS canonical docs

- Created the new current-authority Quipsly docs:
  - `docs/vision/quipsly-creative-os-north-star.md`
  - `docs/architecture/quipsly-document-kernel.md`
  - `docs/plans/quipsly-kernel-now-next-later.md`
  - `docs/agents/quipsly-current-brief.md`
  - `docs/archive/quipsly-guidance-supersession.md`
- Updated `docs/README.md` so future agents see the new Quipsly docs first.
- Updated `docs/coordination/agent-board.md` with the live Quipsly sprint,
  current app/package/domain, and immediate kernel implementation lane.
- Decision recorded:
  - do not physically move or delete older docs tonight
  - treat older Studio, Manuscript Desk, and Quipsly/QuipLore docs as
    historical source material when they conflict with the new north-star docs
  - build a Quipsly-native document kernel as the canonical brain
  - keep editor engines as adapters and current DB block/span rows as
    materialized projections during transition

### Codex / Quipsly document kernel first slice

- Created `packages/quipsly-document-kernel` as the first pure TypeScript kernel
  package.
- Added core types for:
  - `QuipslyDocument`
  - `DocumentNode`
  - `BoundaryMarker`
  - `Region`
  - `InlineAnnotation`
  - `EntityReference`
  - text, node, boundary, region, media-time, and timeline anchors
- Added operation support for:
  - insert text
  - delete text
  - split node
  - merge adjacent nodes
  - add/remove boundary
  - add region
  - apply/remove inline annotation
- Added projections for materialized blocks, tagged spans, boundary ranges, and
  region ranges so the current DB block/span layer can remain a transition
  projection.
- Added `studioProjection.ts` to convert the current `/create` block/span shape
  into a kernel document and project kernel state back into block/span-shaped
  records.
- Added `getAgentVisibleContext(...)` so future agents can read kernel context
  instead of pixels.
- Added validation and migration stubs.
- Added a Benjamin Franklin fixture/test proving the intended quote split case:
  when a paragraph is split before the quote, the quote annotation moves to the
  new node and projections point at the new block.
- Added `/kernel-lab` in `apps/quipsly` as a safe non-production visual proof
  surface for the kernel split/projection behavior.

## 2026-05-25

### Codex / `main` coaching feature controls

- Added manual coaching feature access independent of subscription tiers:
  - `CoachingFeature`
  - `CoachingFeatureGrant`
- Added a seedable coaching tool catalog with session prep, weekly commitments,
  reflection journal, values scorecard, milestone tracker, resource library,
  post-session actions, and between-session check-ins.
- Extended `/team/clients` so staff can sync the tool catalog and enable,
  pause, or disable specific tools for one client with client-visible or
  coach-only visibility.
- Extended `/dashboard` with a Coaching Tools panel that shows enabled,
  non-expired, client-visible grants.
- Validation passed: `pnpm db:generate`, `pnpm coaching:features:test`,
  `pnpm web:cloudrun:test`, `pnpm --filter web exec next build --webpack`, and
  `git diff --check`.
- Functional commit: `c80eeb4`
  `feat(web): add coaching feature grants`.
- Progress story commit: `456cc68`
  `docs: record coaching feature controls`.
- Live schema sync:
  - Cloud Build `6a867633-5cad-4811-9a2e-d15b6f81d7b2`
  - Image
    `us-central1-docker.pkg.dev/high-ground-odyssey/high-ground-studio/prisma-db-push:456cc68`
  - Cloud Run Job `web-cloudsql-db-push-456cc68`, execution
    `web-cloudsql-db-push-456cc68-kxx65`, completed successfully.
  - Logs reported `Your database is now in sync with your Prisma schema`.
- Deployed web through `pnpm web:cloudrun:deploy`:
  - Cloud Build `223faf4d-a16e-4013-9382-659dbd2c8ec2`
  - Web image
    `us-central1-docker.pkg.dev/high-ground-odyssey/high-ground-studio/web:456cc68`
  - Web revision `web-00072-2tl`, serving 100%
  - optional provider/growth secrets mounted: `0`
- Live smoke passed:
  - `https://app.highgroundodyssey.com/api/health` returned 200.
  - `https://app.highgroundodyssey.com/team/clients` returned the expected
    unauthenticated sign-in redirect.
  - `https://app.highgroundodyssey.com/dashboard` returned the expected
    unauthenticated sign-in redirect.
  - `https://app.highgroundodyssey.com/updates` returned 200 and includes
    `Coaching tools get manual controls` with commit `c80eeb4`.
- Rollback:
  `gcloud run services update-traffic web --project=high-ground-odyssey --region=us-central1 --to-revisions=web-00071-w7g=100`

### Codex / `main` WorldHub monetization research library

- Added `WorldHubMonetizationResearchNote` as an app-owned research table for
  monetization options, comparable project patterns, source URLs, takeaways,
  risks, next actions, confidence, and tags.
- Extended `/team/growth` with:
  - `Seed Research Library`
  - manual research-note intake
  - a research library panel beside the existing SEO, analytics, placement, and
    provider readiness tools
- Seed set covers Patreon-style memberships, paid publication patterns, Stripe
  owned checkout, Apple/Spotify podcast subscriptions, YouTube monetization,
  AdSense, Search Console, FTC disclosure, book affiliates, podcast sponsors,
  and print-on-demand merch.
- Added `docs/analysis/worldhub-monetization-research-map.md` so the research
  options are readable even before the database seed action is run.
- Validation passed: `pnpm db:generate`, `pnpm worldhub:integrations:test`,
  `pnpm worldhub:domain:typecheck`, `pnpm progress:story:test`,
  `pnpm web:cloudrun:test`, `pnpm --filter web exec next build --webpack`, and
  `git diff --check`.
- Functional commit: `810e8ae`
  `feat(web): add monetization research library`.
- Progress story commit: `54afb2e`
  `docs: record monetization research progress`.
- Live schema sync:
  - Cloud Build `fff2a868-29ee-4c3a-bc29-0e655ed86f03`
  - Image
    `us-central1-docker.pkg.dev/high-ground-odyssey/high-ground-studio/prisma-db-push:810e8ae`
  - Cloud Run Job `web-cloudsql-db-push-810e8ae`, execution
    `web-cloudsql-db-push-810e8ae-5xd7g`, completed successfully.
  - Logs reported `Your database is now in sync with your Prisma schema`.
- Deployed web through `pnpm web:cloudrun:deploy`:
  - Cloud Build `36a9221f-f8fe-42c6-9011-91029ec7c4bb`
  - Web image
    `us-central1-docker.pkg.dev/high-ground-odyssey/high-ground-studio/web:54afb2e`
  - Web revision `web-00070-2c5`, serving 100%
  - optional provider/growth secrets mounted: `0`
- Live smoke passed:
  - `https://app.highgroundodyssey.com/api/health` returned 200.
  - `https://app.highgroundodyssey.com/team/growth` returned the expected
    unauthenticated sign-in redirect.
  - `https://app.highgroundodyssey.com/updates` returned 200 and includes
    `Monetization research library begins` with commit `810e8ae`.
- Rollback:
  `gcloud run services update-traffic web --project=high-ground-odyssey --region=us-central1 --to-revisions=web-00069-6vd=100`

## 2026-05-24

### Codex / `main` WorldHub Growth desk

- Added `/team/growth` as a private Growth desk for SEO briefs, manual
  analytics snapshots, AdSense/ad slot planning, affiliate/book recommendation
  placements, and direct sponsor slots.
- Added additive Prisma models:
  - `WorldHubSeoBrief`
  - `WorldHubAnalyticsSnapshot`
  - `WorldHubMonetizationPlacement`
- Added gated public/runtime support:
  - `MarketingScripts` loads the Google Analytics tag when
    `HGO_GA_MEASUREMENT_ID` is mounted.
  - `MarketingScripts` loads AdSense Auto ads only when
    `GOOGLE_ADSENSE_CLIENT` and `HGO_ADSENSE_AUTO_ADS_ENABLED=1` are mounted.
  - `/ads.txt` is generated from AdSense env when configured and returns 404
    while AdSense is not configured.
- Expanded WorldHub provider readiness to include Google Analytics, Google
  Search Console, Google AdSense, affiliate links, and direct sponsors.
- Updated Cloud Run deploy/secret tooling so optional growth provider values are
  mounted automatically only when matching Secret Manager secrets exist with
  enabled versions.
- Validation passed: `pnpm db:generate`, `pnpm worldhub:integrations:test`,
  `pnpm worldhub:domain:typecheck`, `pnpm progress:story:test`,
  `pnpm web:cloudrun:test`, `pnpm --filter web exec next build --webpack`,
  and `git diff --check`.
- The default Turbopack build was started and then killed after stalling at the
  known historical `Creating an optimized production build ...` point; the
  documented webpack deploy path passed locally and in Cloud Build.
- Functional commit: `e4b8543`
  `feat(web): add WorldHub growth desk`.
- Live schema sync:
  - Cloud Build `896aca5f-ea23-46d0-8c33-3d36714e3af5`
  - Image
    `us-central1-docker.pkg.dev/high-ground-odyssey/high-ground-studio/prisma-db-push:e4b8543`
  - Cloud Run Job `web-cloudsql-db-push-e4b8543`, execution
    `web-cloudsql-db-push-e4b8543-t9454`, completed successfully.
  - Logs reported `Your database is now in sync with your Prisma schema`.
- Deployed web through `pnpm web:cloudrun:deploy`:
  - Cloud Build `20ba19bc-ae03-44d4-a87e-708f529a08f9`
  - Web image
    `us-central1-docker.pkg.dev/high-ground-odyssey/high-ground-studio/web:e4b8543`
  - Web revision `web-00066-xgr`, serving 100%
  - optional provider/growth secrets mounted: `0`
  - live `AUTH_URL` and `HGO_SITE_URL` remain
    `https://app.highgroundodyssey.com`
- Final docs/story deploy:
  - Commit `02e96df` `docs: record WorldHub growth deploy`
  - Cloud Build `741557d9-26f1-4c3e-901c-af87de49cf45`
  - Web image
    `us-central1-docker.pkg.dev/high-ground-odyssey/high-ground-studio/web:02e96df`
  - Web revision `web-00067-2ww`, serving 100%
- Live smoke passed:
  - `https://app.highgroundodyssey.com/api/health` returned 200.
  - `https://app.highgroundodyssey.com/team/growth` returned the expected
    unauthenticated sign-in redirect.
  - `https://app.highgroundodyssey.com/ads.txt` returned 404 because AdSense is
    not configured yet.
  - `https://app.highgroundodyssey.com/updates` returned 200 and includes the
    new Growth desk story entry with commit `e4b8543`.
  - `https://app.highgroundodyssey.com/api/auth/signin` returned 200 and set
    its callback cookie to `https://app.highgroundodyssey.com`.
- Rollback:
  `gcloud run services update-traffic web --project=high-ground-odyssey --region=us-central1 --to-revisions=web-00066-xgr=100`

### Codex / `main` WorldHub provider adapter rails

- Added verified provider event intake routes:
  - `/api/worldhub/webhooks/stripe`
  - `/api/worldhub/webhooks/patreon`
- Stripe intake verifies `Stripe-Signature` against the raw request body,
  enforces a 5-minute timestamp tolerance, and records a safe
  `WorldHubProviderEvent` summary.
- Patreon intake verifies `X-Patreon-Signature` as a hex HMAC-MD5 body digest,
  reads `X-Patreon-Event`, and records a safe `WorldHubProviderEvent` summary.
- Added Google Calendar appointment sync rails:
  - pure event payload builder
  - service-account JWT token path
  - refresh-token path
  - `/team/worldhub` action to queue or run the next unsynced appointment jobs
  - `Appointment.googleEventId` write after successful Google Calendar event upsert
- Expanded `/team/worldhub` with recent sync jobs and provider event inbox
  panels so the team can see provider progress without terminal logs.
- Added focused tests for provider readiness, webhook signatures, and calendar
  event payloads under `pnpm worldhub:integrations:test`.
- Updated Web Cloud Run deploy/secret tooling so optional WorldHub provider
  secrets are mounted automatically when matching Secret Manager secrets exist
  and have enabled versions.
- Guardrails preserved: no secret-value storage, no full webhook payload
  storage, no payment-card handling, no Stripe Checkout creation, no automatic
  payment/order reconciliation, no Patreon entitlement mutation, no merch
  provider call, and no public publishing.
- Validation passed: `pnpm worldhub:integrations:test`, `pnpm db:generate`,
  `pnpm worldhub:domain:typecheck`, `pnpm web:cloudrun:test`,
  `pnpm --filter web exec next build --webpack`, and `git diff --check`.
- Local functional commit: `fdf37c3`
  `feat(web): add WorldHub provider adapter rails`.
- Pushed runtime deploy head `b183d91`
  `docs: log WorldHub provider adapter rails`.
- Pushed final deploy-tooling head `a166c4f`
  `chore(web): wire optional WorldHub provider secrets`.
- Pushed final optional-secret guard head `cbd4f60`
  `fix(web): mount only ready provider secrets`.
- Deployed web directly through `pnpm web:cloudrun:deploy`:
  - final Cloud Build `e9974815-da48-4fec-ace6-65e53d7d4a07`
  - Web image `us-central1-docker.pkg.dev/high-ground-odyssey/high-ground-studio/web:cbd4f60`
  - Web revision `web-00065-89q`, serving 100%
  - optional provider secrets mounted: `0`
  - live `AUTH_URL` and `HGO_SITE_URL` restored to
    `https://app.highgroundodyssey.com` after testing the new secret-update
    deploy path; final traffic is on `web-00065-89q`
- Live smoke passed:
  - `https://web-hm2odnvjga-uc.a.run.app/api/health` returned 200.
  - `https://web-hm2odnvjga-uc.a.run.app/` returned 200.
  - `https://web-hm2odnvjga-uc.a.run.app/projection-stage/import` returned
    200.
  - `https://web-hm2odnvjga-uc.a.run.app/team/progress` returned the expected
    unauthenticated sign-in redirect.
  - `https://web-hm2odnvjga-uc.a.run.app/team/hgo-publish-queue` returned the
    expected unauthenticated sign-in redirect.
  - `https://app.highgroundodyssey.com/api/health` returned 200.
  - `https://app.highgroundodyssey.com/updates` returned 200 and includes the
    new WorldHub provider-rails story entry.
  - `https://app.highgroundodyssey.com/team/worldhub` returned the expected
    unauthenticated sign-in redirect.
  - `https://app.highgroundodyssey.com/api/auth/signin` returned 200 and set
    its callback cookie to `https://app.highgroundodyssey.com`.
  - Unsigned Stripe and Patreon webhook POSTs reached the live endpoints and
    returned 503 because provider webhook secrets are not mounted yet.
- Rollback:
  `gcloud run services update-traffic web --project=high-ground-odyssey --region=us-central1 --to-revisions=web-00062-bcw=100`

### Codex / `main` WorldHub provider integration workspace

- Added database-backed WorldHub integration infrastructure:
  - `WorldHubProviderConnection`
  - `WorldHubProviderEvent`
  - `WorldHubProviderSyncJob`
  - `WorldHubCatalogItem`
  - `WorldHubOffer`
  - `WorldHubCart`
  - `WorldHubOrder`
  - `WorldHubFulfillmentJob`
- Rebuilt `/team/worldhub` as a dynamic team-gated integration command center
  for Stripe, Patreon, Google Calendar, merch storefront, merch fulfillment,
  Resend, and the app-owned cart boundary.
- Added `Initialize / Refresh Integrations` to upsert provider connection rows
  and record env-name readiness without storing secret values or calling
  providers.
- Added focused readiness tests in `pnpm worldhub:integrations:test`.
- Guardrails preserved: no secret-value storage, no payment-card handling, no
  Stripe/Patreon/Google Calendar/merch provider calls, no checkout session
  creation, no webhook processing, no calendar event mutation, and no active
  merch fulfillment.
- Validation passed: `pnpm worldhub:integrations:test`,
  `pnpm db:generate`, `pnpm worldhub:domain:typecheck`,
  `pnpm progress:story:test`, `pnpm web:cloudrun:test`,
  `pnpm --filter web exec next build --webpack`, and `git diff --check`.
- Local functional commit: `3364428`
  `feat(web): add WorldHub integration workspace`.
- Pushed final deploy head `2d165a8`
  `docs: log WorldHub integration workspace`.
- Live schema sync:
  - Cloud Build `ce91a3d8-7492-499b-818e-9a30f56a6f24` built
    `prisma-db-push:2d165a8`.
  - Cloud Run Job `web-cloudsql-db-push-2d165a8`, execution
    `web-cloudsql-db-push-2d165a8-8zbxl`, completed successfully.
  - Logs reported `Your database is now in sync with your Prisma schema`.
- Deployed web directly through `pnpm web:cloudrun:deploy`:
  - Cloud Build `fead82d5-7407-4b8e-a0f6-95733e809863`
  - Web image `us-central1-docker.pkg.dev/high-ground-odyssey/high-ground-studio/web:2d165a8`
  - Web revision `web-00057-tww`, serving 100%
- Live smoke passed:
  - `https://web-hm2odnvjga-uc.a.run.app/api/health` returned 200.
  - `https://web-hm2odnvjga-uc.a.run.app/` returned 200.
  - `https://web-hm2odnvjga-uc.a.run.app/projection-stage/import` returned
    200.
  - `https://web-hm2odnvjga-uc.a.run.app/team/progress` returned the expected
    unauthenticated sign-in redirect.
  - `https://web-hm2odnvjga-uc.a.run.app/team/hgo-publish-queue` returned the
    expected unauthenticated sign-in redirect.
  - `https://app.highgroundodyssey.com/api/health` returned 200.
  - `https://app.highgroundodyssey.com/updates` returned 200 and includes the
    new WorldHub integration story entry.
  - `https://app.highgroundodyssey.com/team/worldhub` returned the expected
    unauthenticated sign-in redirect.
- Rollback:
  `gcloud run services update-traffic web --project=high-ground-odyssey --region=us-central1 --to-revisions=web-00055-b4r=100`

### Codex / `main` HGO durable publish intent

- Added the first durable private publish-intent database slice for HGO episode
  publishing:
  - additive Prisma model `HgoEpisodePublishCandidate`
  - pure store-record builder for ready publish-candidate packets
  - server helper and team server action for saving one private intent row
  - `/team/hgo-publish-queue/[recordId]` now shows saved intent status or a
    `Save Publish Intent` button when the packet is ready
- This deliberately relaxes the old no-schema/no-write boundary, but only for
  private review state.
- Guardrails preserved: no public route creation, no content-file mutation, no
  provider calls, no citation/public-safety certification, no live publish
  action, no staged artifact JSON mutation, and no `/episodes` replacement.
- Validation passed: `pnpm hgo:publish-candidate:test`,
  `pnpm db:generate`, `pnpm progress:story:test`,
  `pnpm web:cloudrun:test`, `pnpm --filter web exec next build --webpack`,
  and `git diff --check`.
- Local functional commit: `3b12d49`
  `feat(web): persist HGO publish intent`.
- Pushed final deploy head `6416979`
  `docs: log HGO publish intent progress`.
- Live schema sync:
  - Cloud Build `438935c4-c21c-4051-9164-2de33577e759` built
    `prisma-db-push:6416979`.
  - Cloud Run Job `web-cloudsql-db-push-6416979`, execution
    `web-cloudsql-db-push-6416979-wjxmt`, completed successfully.
  - Logs reported `Your database is now in sync with your Prisma schema`.
- Deployed web directly through `pnpm web:cloudrun:deploy` because no GitHub
  Actions Cloud Run build appeared after the push:
  - Cloud Build `e42fae06-9711-4ceb-8c0d-02faaf4e4424`
  - Web image `us-central1-docker.pkg.dev/high-ground-odyssey/high-ground-studio/web:6416979`
  - Web revision `web-00055-b4r`, serving 100%
- Live smoke passed:
  - `https://web-hm2odnvjga-uc.a.run.app/api/health` returned 200.
  - `https://web-hm2odnvjga-uc.a.run.app/` returned 200.
  - `https://web-hm2odnvjga-uc.a.run.app/projection-stage/import` returned
    200.
  - `https://web-hm2odnvjga-uc.a.run.app/team/progress` returned the expected
    unauthenticated sign-in redirect.
  - `https://web-hm2odnvjga-uc.a.run.app/team/hgo-publish-queue` returned the
    expected unauthenticated sign-in redirect.
  - `https://app.highgroundodyssey.com/api/health` returned 200.
  - `https://app.highgroundodyssey.com/updates` returned 200 and includes the
    new durable-publish-intent story entry.
  - `https://app.highgroundodyssey.com/team/hgo-publish-queue` returned the
    expected unauthenticated sign-in redirect.
  - `https://app.highgroundodyssey.com/team/hgo-publish-queue/synthetic-record`
    returned the expected unauthenticated sign-in redirect.
- Rollback:
  `gcloud run services update-traffic web --project=high-ground-odyssey --region=us-central1 --to-revisions=web-00053-2tv=100`

### Codex / `main` HGO draft packet lab

- Added portable validation for `hgo-episode-publish-draft-v1` packets:
  - validates packet kind and required identity fields
  - requires private-review frontmatter and draft status
  - requires uncertified citation/public-safety state
  - rejects safety flags that imply content-file writes, DB mutation, public
    route creation, live publishing, provider calls, or staged-artifact mutation
- Added `/team/hgo-publish-draft-lab` as a private team route for pasting a
  publish-draft packet, validating it, inspecting generated MDX, inspecting
  frontmatter, and copying/downloading private handoff files.
- Added the Draft Lab link to the team console navigation.
- Guardrails preserved: no public route creation, no content-file mutation, no
  staged artifact mutation, no provider calls, no citation/public-safety
  certification, no live publish action, and no `/episodes` replacement.
- Validation passed: `pnpm hgo:publish-candidate:test`,
  `pnpm progress:story:test`, `pnpm web:cloudrun:test`,
  `pnpm --filter web exec next build --webpack`, and `git diff --check`.
- Local functional commit: `37270e5`
  `feat(web): add HGO publish draft packet lab`.
- Pushed final deploy head `3f97c92`
  `docs: log HGO draft packet lab`.
- GitHub Actions run `26373399963` completed successfully:
  - Web revision `web-00053-2tv`, serving 100%.
  - Studio deploy skipped because this slice did not touch Studio runtime
    paths.
- Live smoke passed:
  - `https://app.highgroundodyssey.com/api/health` returned 200.
  - `https://app.highgroundodyssey.com/updates` returned 200 and includes the
    new draft-packet-lab story entry.
  - `https://app.highgroundodyssey.com/team/hgo-publish-draft-lab` returned the
    expected unauthenticated team sign-in redirect.
- Post-deploy readiness test passed: `pnpm web:cloudrun:test`.
- Rollback:
  `gcloud run services update-traffic web --project=high-ground-odyssey --region=us-central1 --to-revisions=web-00052-vjs=100`

### Codex / `main` HGO draft export handoff

- Added first-class handoff exports for generated private HGO publish drafts:
  - copy/download the full `hgo-episode-publish-draft-v1` packet
  - copy/download the generated private MDX draft
  - copy/download the generated frontmatter JSON
- Added deterministic draft export file names:
  - `<slug>.hgo-episode-publish-draft.json`
  - `<slug>.private-review.mdx`
  - `<slug>.frontmatter.json`
- Updated the private publish review detail page to surface the MDX/frontmatter
  export names in the human checklist and draft packet panel.
- Guardrails preserved: no public route creation, no content-file mutation, no
  staged artifact mutation, no provider calls, no citation/public-safety
  certification, no live publish action, and no `/episodes` replacement.
- Validation passed: `pnpm hgo:publish-candidate:test`,
  `pnpm progress:story:test`, `pnpm web:cloudrun:test`,
  `pnpm --filter web exec next build --webpack`, and `git diff --check`.
- Local functional commit: `2e90a18`
  `feat(web): add HGO draft export handoff`.
- Pushed final deploy head `3ad6584`
  `docs: log HGO draft export handoff`.
- GitHub Actions run `26373113777` completed successfully:
  - Web revision `web-00052-vjs`, serving 100%.
  - Studio deploy skipped because this slice did not touch Studio runtime
    paths.
- Live smoke passed:
  - `https://app.highgroundodyssey.com/api/health` returned 200.
  - `https://app.highgroundodyssey.com/updates` returned 200 and includes the
    new draft-export handoff story entry.
  - `https://app.highgroundodyssey.com/team/hgo-publish-queue/synthetic-record`
    returned the expected unauthenticated team sign-in redirect.
  - `https://app.highgroundodyssey.com/team/hgo-publish-queue/synthetic-record/preview`
    returned the expected unauthenticated team sign-in redirect.
- Post-deploy readiness test passed: `pnpm web:cloudrun:test`.
- Rollback:
  `gcloud run services update-traffic web --project=high-ground-odyssey --region=us-central1 --to-revisions=web-00051-7qm=100`

### Codex / `main` HGO publish draft preview

- Added `hgo-episode-publish-draft-v1` packets derived from saved staged HGO
  artifacts and publish candidates. The packet carries proposed private MDX
  draft content, proposed frontmatter, deferred file targets, review state, and
  explicit safety flags.
- Added the private render preview route at
  `/team/hgo-publish-queue/[recordId]/preview`. It uses the shared HGO
  projection renderer plus the existing review gate so the team can see the
  projected episode page before any public route or content file is created.
- Extended the saved artifact handoff panel so the publish review detail page
  can copy or download the publish-draft packet alongside the immutable staged
  artifact, publish candidate, and review brief.
- Guardrails preserved: no public route creation, no content-file mutation, no
  staged artifact mutation, no provider calls, no citation/public-safety
  certification, no live publish action, and no `/episodes` replacement.
- Validation passed: `pnpm hgo:publish-candidate:test`,
  `pnpm progress:story:test`, `pnpm web:cloudrun:test`,
  `pnpm --filter web exec next build --webpack`, and `git diff --check`.
- Local functional commit: `1077be8`
  `feat(web): add HGO publish draft preview`.
- Pushed final deploy head `e718122`
  `docs: log HGO publish draft preview`.
- GitHub Actions run `26372871262` completed successfully:
  - Web revision `web-00051-7qm`, serving 100%.
  - Studio deploy skipped because this slice did not touch Studio runtime
    paths.
- Live smoke passed:
  - `https://app.highgroundodyssey.com/api/health` returned 200.
  - `https://app.highgroundodyssey.com/updates` returned 200 and includes the
    new publish-draft-preview story entry.
  - `https://app.highgroundodyssey.com/team/hgo-publish-queue` returned the
    expected unauthenticated team sign-in redirect.
  - `https://app.highgroundodyssey.com/team/hgo-publish-queue/synthetic-record/preview`
    returned the expected unauthenticated team sign-in redirect.
- Post-deploy readiness test passed: `pnpm web:cloudrun:test`.
- Rollback:
  `gcloud run services update-traffic web --project=high-ground-odyssey --region=us-central1 --to-revisions=web-00050-6wd=100`

### Codex / `main` HGO publish review detail

- Added a private per-artifact review detail route at
  `/team/hgo-publish-queue/[recordId]`.
- Added `hgo-episode-publish-review-brief-v1` packets derived from
  publish-candidate packets. The brief carries proposed future file targets,
  validation commands, safety flags, blockers/warnings, and rollback notes for
  operator/agent handoff.
- Extended the saved artifact handoff controls so detail pages can copy or
  download the review brief alongside immutable artifact JSON and the
  publish-candidate packet.
- Guardrails preserved: no public route creation, no content-file mutation, no
  staged artifact mutation, no provider calls, no public-safety certification,
  no live publish action, and no `/episodes` replacement.
- Validation passed: `pnpm hgo:publish-candidate:test`,
  `pnpm progress:story:test`, `pnpm web:cloudrun:test`,
  `pnpm --filter web exec next build --webpack`, and `git diff --check`.
- The Turbopack `pnpm --filter web build` path was stopped after the known
  long-running hang; webpack build remains the documented production gate and
  passed.
- Local functional commit: `05140de`
  `feat(web): add HGO publish review detail`.
- Pushed final deploy head `0d4b29b`
  `docs: log HGO publish review detail`.
- GitHub Actions run `26372364439` completed successfully:
  - Web revision `web-00050-6wd`, serving 100%.
  - Studio deploy skipped because this slice did not touch Studio runtime
    paths.
- Live smoke passed:
  - `https://app.highgroundodyssey.com/api/health` returned 200.
  - `https://app.highgroundodyssey.com/updates` returned 200 and includes the
    new publish-review-detail story entry.
  - `https://app.highgroundodyssey.com/team/hgo-publish-queue` returned the
    expected unauthenticated team sign-in redirect.
  - `https://app.highgroundodyssey.com/team/hgo-publish-queue/synthetic-record`
    returned the expected unauthenticated team sign-in redirect.
- Post-deploy readiness test passed: `pnpm web:cloudrun:test`.
- Rollback:
  `gcloud run services update-traffic web --project=high-ground-odyssey --region=us-central1 --to-revisions=web-00049-6jd=100`

### Codex / `main` Studio full-packet HGO handoff

- Updated Content Studio so `Copy Packet + Open HGO` copies the full selected
  production packet instead of splitting out only the HGO draft.
- Added a direct Studio link to the private HGO publish queue for saved
  artifact follow-through.
- Guardrails preserved: no provider calls, no public route creation, no public
  publish action, and no HGO artifact mutation.
- Validation passed: `pnpm --filter studio typecheck`,
  `pnpm --filter studio build` outside the sandbox, `pnpm studio:cloudrun:test`,
  and `git diff --check`.
- Local functional commit: `27459c6`
  `feat(studio): copy production packet to HGO import`.
- Pushed final deploy head `b291494`
  `docs: log Studio HGO packet handoff`.
- GitHub Actions run `26371939993` completed successfully:
  - Studio revision `studio-00039-jzh`, serving 100%.
  - Web revision `web-00049-6jd`, serving 100%.
- Live smoke passed:
  - `https://studio-hm2odnvjga-uc.a.run.app/api/health` returned 200.
  - `https://studio-hm2odnvjga-uc.a.run.app/content-studio` returned 200 with
    the expected unauthenticated Studio sign-in surface.
  - `https://app.highgroundodyssey.com/api/health` returned 200.
  - `https://app.highgroundodyssey.com/updates` returned 200 and includes the
    new full-packet handoff story entry.
- Post-deploy readiness tests passed:
  `pnpm studio:cloudrun:test` and `pnpm web:cloudrun:test`.
- Rollback:
  - Studio:
    `gcloud run services update-traffic studio --project=high-ground-odyssey --region=us-central1 --to-revisions=studio-00038-9nw=100`
  - Web:
    `gcloud run services update-traffic web --project=high-ground-odyssey --region=us-central1 --to-revisions=web-00048-m7t=100`

### Codex / `main` HGO episode publish queue

- Added `/team/hgo-publish-queue` as a private episode-page publish planning
  surface for saved HGO staged artifacts.
- Added `createHgoEpisodePublishQueue` so saved staged artifacts can derive
  ready/not-ready/archived publish-candidate lanes with active blocker/warning
  totals.
- Added the queue route to the team console nav and to the web Cloud Run deploy
  smoke redirects.
- Guardrails preserved: no public route creation, no content-file mutation, no
  provider calls, no public-safety certification, no `/episodes` replacement,
  and no publish action.
- Validation passed: `pnpm hgo:publish-candidate:test`,
  `pnpm web:cloudrun:test`, `pnpm --filter web build` outside the sandbox
  after the known Turbopack sandbox hang, `DATABASE_URL=postgresql://postgres:postgres@localhost:5432/high_ground_studio pnpm --filter web exec next build --webpack`,
  and `git diff --check`.
- Local functional commit: `a219b88`
  `feat(web): add HGO episode publish queue`.
- Pushed final deploy head `7beae2f`
  `docs: log HGO episode publish queue`.
- GitHub Actions run `26371696778` completed successfully:
  - Web revision `web-00048-m7t`, serving 100%.
  - Studio deploy skipped because this slice did not touch Studio runtime
    paths.
- Live smoke passed:
  - `https://app.highgroundodyssey.com/api/health` returned 200.
  - `https://app.highgroundodyssey.com/team/hgo-publish-queue` returned the
    expected unauthenticated team sign-in redirect.
  - `https://app.highgroundodyssey.com/updates` returned 200 and includes the
    new publish-queue story entry.
- Post-deploy readiness test passed: `pnpm web:cloudrun:test`.
- Rollback:
  `gcloud run services update-traffic web --project=high-ground-odyssey --region=us-central1 --to-revisions=web-00047-lf8=100`

### Codex / `main` HGO artifact handoff controls

- Added a private team-shelf handoff panel to `/team/hgo-staged-artifacts`:
  - copy/download immutable saved artifact JSON
  - copy/open the artifact inspector for a saved artifact
  - copy/download the derived private episode-page publish-candidate packet
- Added clipboard-load and clear controls to `/projection-stage/artifact` so
  copied artifacts can be inspected without file downloads.
- Guardrails preserved: no public publish, no provider call, no approval action,
  no `/episodes` route creation, no artifact mutation, and no public-safety
  certification.
- Validation passed:
  `pnpm hgo:artifact:test`, `pnpm hgo:publish-candidate:test`,
  `pnpm --filter web build`,
  `pnpm hgo:projection:browser-smoke`,
  `DATABASE_URL=postgresql://postgres:postgres@localhost:5432/high_ground_studio pnpm --filter web exec next build --webpack`,
  and `git diff --check`.
- Local functional commit: `409c625`
  `feat(web): add HGO artifact handoff controls`.
- Pushed final deploy head `6307e7a`
  `docs: log HGO artifact handoff controls`.
- GitHub Actions run `26371342232` completed successfully:
  - Web revision `web-00047-lf8`, serving 100%.
  - Studio deploy skipped because this slice did not touch Studio runtime
    paths.
- Live smoke passed:
  - `https://app.highgroundodyssey.com/api/health` returned 200.
  - `https://app.highgroundodyssey.com/projection-stage/artifact` returned 200
    and includes `Paste Clipboard` plus the saved-artifact inspector copy.
  - `https://app.highgroundodyssey.com/updates` returned 200 and includes the
    new HGO artifact handoff story entry.
- Post-deploy readiness test passed: `pnpm web:cloudrun:test`.
- Rollback:
  `gcloud run services update-traffic web --project=high-ground-odyssey --region=us-central1 --to-revisions=web-00046-jwx=100`

### Codex / `main` Studio-to-HGO import bridge

- Tightened the Content Studio to HGO staged-review handoff:
  - Studio now has `Copy + Open HGO Import` for selected HGO projection drafts.
  - `/projection-stage/import` can load clipboard JSON, detect direct HGO drafts
    versus full Content Studio production packets, and clear the import panel.
  - The import route copy now reflects current reality: browser review first,
    explicit private team save when signed in, and no public publish action.
- Updated architecture/runbook docs and the HGO browser smoke expectation so
  they no longer describe the staged import route as a future-only store path.
- Validation passed:
  `pnpm hgo:artifact:test`, `pnpm content-studio:packet:test`,
  `pnpm progress:story:test`, `pnpm --filter studio typecheck`,
  `pnpm --filter web build` outside the sandbox,
  `pnpm --filter studio build` outside the sandbox,
  `DATABASE_URL=postgresql://postgres:postgres@localhost:5432/high_ground_studio pnpm --filter web exec next build --webpack`,
  `pnpm hgo:projection:browser-smoke`, and `git diff --check`.
- Local functional commit: `800dbf9`
  `feat(hgo): streamline Studio projection import`.
- Pushed final deploy head `26250c5`
  `docs: log Studio HGO import bridge`.
- GitHub Actions run `26370289854` completed successfully:
  - Web revision `web-00046-jwx`, serving 100%.
  - Studio revision `studio-00038-9nw`, serving 100%.
- Live smoke passed:
  - `https://app.highgroundodyssey.com/api/health` returned 200.
  - `https://app.highgroundodyssey.com/projection-stage/import` returned 200
    and includes the browser-first/private-save import copy.
  - `https://app.highgroundodyssey.com/updates` returned 200 and includes the
    new Studio-to-HGO review story entry.
  - `https://studio-hm2odnvjga-uc.a.run.app/api/health` returned 200.
  - `https://studio-hm2odnvjga-uc.a.run.app/content-studio` returned 200 with
    the expected unauthenticated Studio sign-in surface.
- Post-deploy readiness tests passed:
  `pnpm web:cloudrun:test` and `pnpm studio:cloudrun:test`.
- Rollback:
  - Web:
    `gcloud run services update-traffic web --project=high-ground-odyssey --region=us-central1 --to-revisions=web-00045-vhj=100`
  - Studio:
    `gcloud run services update-traffic studio --project=high-ground-odyssey --region=us-central1 --to-revisions=studio-00037-z9r=100`

### Codex / `main` Content Studio handoff copy

- Added Content Studio copy/open handoff actions for selected production
  packets:
  - copy the full production packet JSON
  - copy the HGO projection draft JSON when one exists
  - open `https://app.highgroundodyssey.com/projection-stage/import` directly
    from Studio
- Guardrails preserved: no provider calls, no automatic cross-service submit,
  no public publish action, no production content mutation.
- Added a public build-journal entry with `pnpm progress:story:add`.
- Validation passed: `pnpm --filter studio typecheck`,
  `pnpm --filter studio build` outside the sandbox after the known Turbopack
  sandbox port-bind panic, `pnpm studio:cloudrun:test`,
  `pnpm web:cloudrun:test`,
  `DATABASE_URL=postgresql://postgres:postgres@localhost:5432/high_ground_studio pnpm --filter web exec next build --webpack`,
  `pnpm progress:story:test`, JSON parse checks, and `git diff --check`.
- Committed and pushed `08c17ef`:
  `feat(studio): add content studio handoff copy actions`.
- GitHub Actions run `26369828940` deployed:
  - Studio revision `studio-00037-z9r`, serving 100%.
  - Web revision `web-00045-vhj`, serving 100%.
- Live smoke passed:
  - `https://studio-hm2odnvjga-uc.a.run.app/api/health` returned 200.
  - `https://app.highgroundodyssey.com/updates` returned 200 and includes the
    new Content Studio handoff story entry.
- Rollback:
  - Studio:
    `gcloud run services update-traffic studio --project=high-ground-odyssey --region=us-central1 --to-revisions=studio-00036-7vh=100`
  - Web:
    `gcloud run services update-traffic web --project=high-ground-odyssey --region=us-central1 --to-revisions=web-00044-9n7=100`

### Codex / `main` public build journal

- Published a public `/updates` page at
  `https://app.highgroundodyssey.com/updates` using the same checked-in story
  data as protected `/team/progress`.
- Extracted the progress renderer into
  `apps/web/src/components/progress/ProgressStoryView.tsx` so the public and
  team pages stay aligned instead of drifting.
- Added `Updates` to the public site header.
- Committed and pushed `4bd64a2`: `feat(web): publish build updates page`.
- GitHub Actions run `26369417848` deployed web revision `web-00043-hp2`,
  serving 100% traffic.
- Live smoke passed: `/updates` returned 200 and rendered the new story entry;
  `/team/progress` still redirects unauthenticated users to sign-in.
- Immediate rollback:
  `gcloud run services update-traffic web --project=high-ground-odyssey --region=us-central1 --to-revisions=web-00042-nw9=100`.
- Follow-up added `pnpm progress:story:add` so future agents can append journal
  entries without hand-editing `apps/web/content/internal/progress-story.json`.

### Codex / `codex/hgo-content-studio-packet-import-001`

- Created a focused web/HGO bridge branch from `main` so feature work stayed
  off trunk.
- Added `apps/web/src/lib/hgo/content-studio-production-packet.ts` and wired
  `/projection-stage/import` to accept either raw HGO projection JSON or a full
  Content Studio production packet.
- Packet import safety checks reject provider-called, public-published,
  real-manuscript, missing-review, wrong-schema, or no-HGO-draft packets before
  HGO projection validation runs.
- Updated HGO staged artifact tests to prove a generated Content Studio podcast
  production packet exposes a valid HGO projection draft and unsafe packets are
  blocked.
- Validation passed: `pnpm hgo:artifact:test`,
  `pnpm content-studio:packet:test`,
  `DATABASE_URL=postgresql://postgres:postgres@localhost:5432/high_ground_studio pnpm --filter web exec next build --webpack`,
  `pnpm web:cloudrun:test`, and `git diff --check`.
- Opened and merged PR #19 as `e5062ac`:
  `feat(web): import Content Studio packets into HGO staging`.
- GitHub push-to-main deploy had not moved the service quickly, so the existing
  `pnpm web:cloudrun:deploy` helper deployed `web:e5062ac` manually.
- Cloud Build: `e82db780-0722-4beb-9f66-7dc4af1572e4`.
- New web revision: `web-00013-fq4`, serving 100% traffic.
- Live route smoke passed:
  `https://web-hm2odnvjga-uc.a.run.app/projection-stage/import` returned 200
  and includes the new Content Studio packet import copy.
- Rollback:
  `gcloud run services update-traffic web --project=high-ground-odyssey --region=us-central1 --to-revisions=web-00011-6sq=100`.
- No DB/schema, provider, public publishing, real content, secrets, IAM, OAuth,
  DNS, or Cloud SQL changes.

### Codex / `codex/web-deploy-hgo-smoke-001`

- Added `/projection-stage/import` to the web Cloud Run deploy smoke list so
  the HGO staged import route is checked on every web deploy.
- Updated `pnpm web:cloudrun:test` coverage and the web Cloud Run runbook.
- Validation passed: `pnpm web:cloudrun:test` and `git diff --check`.
- Opened and merged PR #20 as `97d6bd6`:
  `test(web): smoke HGO staged import on deploy`.
- Ran `pnpm web:cloudrun:deploy` from merged `main` to prove the new smoke in
  the real deploy path.
- Cloud Build: `47e8469e-adfb-42ca-ac87-dac5deab6aec`.
- New web revision: `web-00017-mgg`, serving 100% traffic.
- Live deploy smokes passed: `/api/health`, `/`, `/projection-stage/import`,
  and unauthenticated `/team/progress` sign-in redirect.
- Rollback:
  `gcloud run services update-traffic web --project=high-ground-odyssey --region=us-central1 --to-revisions=web-00015-9vs=100`.

### Codex / `main` web Cloud SQL cutover

- Staged a dedicated Cloud SQL runtime target for web:
  database `web`, user `web_app`, and secret `web-cloudsql-database-url`.
- Applied the current Prisma schema to the staged Cloud SQL target with Cloud
  Run Job `web-cloudsql-db-push-47d8200`; logs reported the database is in
  sync with the Prisma schema.
- Added a guarded Postgres copy job image and iterated it until it supported
  Neon/Postgres 17 source data, Cloud SQL/Postgres 16 target data, secret
  newline cleanup, public-schema-only dumps, and non-empty target refusal.
- Successful copy job:
  `web-neon-to-cloudsql-copy-f14c4c7-w27bk`.
- Copy counts:
  source-before 20 rows, target-before 0 rows, target-after 20 rows.
- Created no-traffic Cloud Run revision `web-00033-den` from image
  `web:f14c4c7d463b3b37b109b49e7eaabb6968cb22b8`, mounted
  `DATABASE_URL=web-cloudsql-database-url:latest`, and tagged it
  `cloudsql-smoke`.
- Isolated smoke passed on
  `https://cloudsql-smoke---web-hm2odnvjga-uc.a.run.app`:
  `/api/health` 200, `/` 200, `/projection-stage/import` 200, and
  `/team/progress` unauthenticated redirect 307.
- Routed live web traffic to `web-00033-den`, now serving 100% at
  `https://web-hm2odnvjga-uc.a.run.app`.
- Live smoke passed after cutover:
  `/api/health` 200, `/` 200, `/projection-stage/import` 200, and
  `/team/progress` unauthenticated redirect 307.
- `pnpm web:db:target:report` now reports no pending work, no warnings, no
  blocked items, and confirms `DATABASE_URL` is mounted from
  `web-cloudsql-database-url`.
- Committed and pushed the cutover record and team progress story as
  `41dc418`: `ops(web): record Cloud SQL cutover`.
- Deployed `web:41dc418` with Cloud Build
  `bd6547a6-43e6-4677-9b95-7094c9380441`; because traffic was pinned to the
  cutover revision, tagged `web-00034-n4p` as `story-smoke`, smoked it, then
  routed live traffic to `web-00034-n4p`.
- Updated `pnpm web:cloudrun:deploy` so future deploys explicitly route
  traffic to the deployed revision when Cloud Run traffic was previously pinned
  to a named rollback revision.
- Committed and pushed the deploy-helper fix as `d4ebbfe`:
  `ops(web): route deployed revision after pinned traffic`.
- Deployed `web:d4ebbfe` with Cloud Build
  `fbad7319-00f8-4a87-8dfc-671916ac2d4d`; the fixed helper detected pinned
  traffic and routed live traffic to deployed revision `web-00036-rl9`.
- Current live smoke passed:
  `/api/health` 200, `/` 200, `/projection-stage/import` 200, and
  `/team/progress` unauthenticated redirect 307.
- Current `pnpm web:db:target:report` confirms latest ready revision
  `web-00036-rl9` still mounts `DATABASE_URL` from
  `web-cloudsql-database-url`.
- Immediate rollback:
  `gcloud run services update-traffic web --project=high-ground-odyssey --region=us-central1 --to-revisions=web-00034-n4p=100`.
- Deeper rollback while the Neon source remains valid:
  `gcloud run services update-traffic web --project=high-ground-odyssey --region=us-central1 --to-revisions=web-00031-4r2=100`.

### Codex / `main` web custom-domain recheck

- Re-ran `pnpm web:domain:check` after the web Cloud SQL cutover.
- Cloud Run domain mapping still routes `app.highgroundodyssey.com` to service
  `web`, and the requested record remains `app CNAME ghs.googlehosted.com.`
- Public DNS still has no `app.highgroundodyssey.com` CNAME, so the Cloud Run
  managed certificate remains `CertificatePending`.
- Enabled Cloud DNS API in `high-ground-odyssey`; no managed zones are visible
  in that project.
- Enabled Cloud Domains API in `high-ground-odyssey`; no registrations are
  visible in that project.
- Enabled Cloud DNS API in accessible project `gen-lang-client-0819080752`
  (`HighGroundOdyssey`); no managed zones are visible there.
- Attempted Cloud DNS API enablement in `high-ground-schedule`, but billing is
  not attached to that project.
- Current handoff: add only this DNS record wherever the authoritative zone is
  managed: `app.highgroundodyssey.com CNAME ghs.googlehosted.com.`

### Codex / `codex/hgo-publish-candidate-packets-001`

- Added `hgo-episode-publish-candidate-v1`, a private episode-page handoff
  packet derived from saved HGO staged artifacts.
- `/team/hgo-staged-artifacts` now shows the proposed `/episodes/...` route,
  readiness state, blockers, warnings, packet filename, and private packet JSON
  for each saved artifact.
- The packet is explicitly not publishing: it does not create route files,
  mutate the database, call providers, certify public safety, or change the
  immutable staged artifact JSON.
- Added `pnpm hgo:publish-candidate:test` and updated the team progress story
  plus HGO private staged artifact store plan.
- Validation passed:
  `pnpm hgo:publish-candidate:test`, `pnpm hgo:artifact:test`,
  `pnpm hgo:store-lab:test`, `pnpm web:cloudrun:test`,
  `DATABASE_URL=postgresql://postgres:postgres@localhost:5432/high_ground_studio pnpm --filter web exec next build --webpack`,
  and `git diff --check HEAD`.
- Opened and merged PR #22 as `aaf3568`:
  `feat(web): add HGO publish candidate packets`.
- Deployed web with Cloud Build `a47a0bcb-4388-4d3d-9ea9-99676036ac9d`.
- Web revision `web-00038-jxl` is serving 100% with image `web:aaf3568`.
- Live smokes passed:
  `/api/health`, `/`, `/projection-stage/import`, and `/team/progress`
  unauthenticated redirect.
- `pnpm web:db:target:report` confirms latest ready revision `web-00038-jxl`
  still mounts `DATABASE_URL` from `web-cloudsql-database-url`.
- Rollback:
  `gcloud run services update-traffic web --project=high-ground-odyssey --region=us-central1 --to-revisions=web-00036-rl9=100`.

### Jason / Studio Cut lane handoff

- Jason reports dedicated worktree
  `/Users/wall-e/Dev/high-ground-studio-codex-studio-cut-001` is clean.
- Branch `codex/studio-cut-001-web-shell` is at `64c024a`.
- Intended media-lane paths remain `apps/studio-cut-web/*`,
  `packages/studio-cut-schema/*`, `tools/studio-cut-local/*`,
  `scripts/studio-cut-*`, and `docs/studio-cut*`.
- Jason will not touch HGO projection paths, web Cloud Run scripts, or
  `docs/runbooks/web-cloud-run.md` without coordination.

## 2026-05-23

### Codex / `codex/content-studio-command-001`

- Verified `main` is clean at `d9c9337` after fetch; the older dirty-main
  report at `b0ee6c8` is stale for this checkout.
- Created `codex/content-studio-command-001` from current `main` to avoid
  feature work directly on trunk.
- Adopted the existing board idea from `codex/worldhub-001-foundation` instead
  of creating a separate coordination system.
- Current slice: lightweight coordination docs plus a private, browser-local
  Content Studio command surface for podcast, book, and episode-page work.
- Guardrails for this slice: no Prisma/schema changes, no provider calls, no
  deploy, no real manuscript/HGO content, no public publishing.
- Coordination adjustment from Chuck: DB/API/deploy/service work should be
  treated as fast-approval work, not avoided. If it is the right smallest move,
  ask for the specific approval and proceed.
- Validation so far: `pnpm --filter studio typecheck` passed; sandboxed
  `pnpm --filter studio build` hit the known Turbopack port-bind restriction,
  rerun outside the sandbox and passed; `git diff --check` passed.
- Added `docs/agents/restart-playbook.md` so reboot/crash recovery has a
  one-minute captain prompt, one progress thread, and worker packets for
  Manuscript Collaboration, WorldHub Integration, Studio Cut, and Content
  Studio.
- Chuck updated deployment posture: prefer live Google Cloud deploys over local
  only, with fast approval and rollback. Added one-command Studio Cloud Run
  deploy helper and Cloud Build deploy config; live deploy is waiting on gcloud
  reauthentication.
- gcloud reauthenticated as `charlie@highgroundodyssey.com`.
- Deployed Studio image `studio:0e17203` to Cloud Run revision
  `studio-00023-7c5`, serving 100% traffic.
- Live URL: `https://studio-hm2odnvjga-uc.a.run.app`
- Smokes passed:
  - `https://studio-hm2odnvjga-uc.a.run.app/api/health`
  - `https://studio-hm2odnvjga-uc.a.run.app/content-studio`
- Rollback:
  `gcloud run services update-traffic studio --project=high-ground-odyssey --region=us-central1 --to-revisions=studio-00022-fdg=100`
- Opened merge PR: `https://github.com/CharlieLSparrow/high-ground-studio/pull/3`
- Worktree check: `project/worldhub` and `codex/worldhub-001-foundation` are
  clean; Studio Cut has a dirty local edit in
  `tools/studio-cut-local/studio_cut_local.py`, so treat that lane as occupied.
- Added `docs/agents/codex-continuity.md` as a durable north-star and handoff
  note before closing this terminal.

### Codex / project/worldhub

- Merged current `main` into `project/worldhub`.
- Merged deployed Content Studio branch `codex/content-studio-command-001`.
- Merged WorldHub foundation branch `codex/worldhub-001-foundation` and resolved conflicts by preserving the deployed browser-local Content Studio board while folding in `packages/content-studio-domain`, `packages/worldhub-domain`, WorldHub docs, and Web Cloud Run deployment scaffolding.
- Validation passed: `git diff --check`, `pnpm install --frozen-lockfile`, `pnpm content-studio:domain:typecheck`, `pnpm worldhub:domain:typecheck`, `pnpm content-studio:domain:build`, `pnpm worldhub:domain:build`, `pnpm --filter studio typecheck`, `pnpm --filter studio build`, `pnpm studio:cloudrun:test`, `pnpm web:cloudrun:test`, `DATABASE_URL=postgresql://postgres:postgres@localhost:5432/high_ground_studio pnpm --filter web build`, `DATABASE_URL=postgresql://postgres:postgres@localhost:5432/high_ground_studio pnpm --filter web exec next build --webpack`, and `pnpm studio:collab:agentic-smoke`.
- Web builds used a dummy local `DATABASE_URL` only for build-time env; no database mutation was run.

### Codex / project/worldhub deploy

- Deployed integrated `project/worldhub` runtime commit `beb86b7` to Studio Cloud Run.
- Cloud Build: `521c9b31-1d49-4522-9e2d-88559b987e42`.
- Image: `us-central1-docker.pkg.dev/high-ground-odyssey/high-ground-studio/studio:beb86b7`.
- Image digest: `sha256:e987a509e97122e5567244b1217b454b3197f59921fd4e2cd6bc626fce3931c8`.
- New revision: `studio-00024-rr5`, serving 100% traffic.
- Live URL: `https://studio-hm2odnvjga-uc.a.run.app`.
- Smokes passed: `/api/health` and `/content-studio`.
- Rollback: `gcloud run services update-traffic studio --project=high-ground-odyssey --region=us-central1 --to-revisions=studio-00023-7c5=100`.

### Codex / main merge and deploy

- Merged PR #4, `project/worldhub` into `main`.
- Superseded and closed PR #3 because its Content Studio slice is included in PR #4.
- Main merge commit: `c32adb2` (`feat: integrate Content Studio and WorldHub foundation`).
- Primary checkout `/Users/wall-e/Dev/high-ground-studio` is now on `main` at `c32adb2`.
- Deployed main runtime commit `c32adb2` to Studio Cloud Run.
- Cloud Build: `ce548402-cc92-47e1-9cbb-be5a83dac156`.
- Image: `us-central1-docker.pkg.dev/high-ground-odyssey/high-ground-studio/studio:c32adb2`.
- Image digest: `sha256:bae37d870de5f44077483b39e8b9b1e71d4323c54b089f4663f1701304aee7bb`.
- New revision: `studio-00025-shp`, serving 100% traffic.
- Live URL: `https://studio-hm2odnvjga-uc.a.run.app`.
- Smokes passed: `/api/health` and `/content-studio`.
- Rollback: `gcloud run services update-traffic studio --project=high-ground-odyssey --region=us-central1 --to-revisions=studio-00024-rr5=100`.
- Deployment changed Studio runtime only; no DB/schema, provider, DNS, OAuth, IAM, billing, or secret mutation was performed.

### Codex / closed-agent handoff sync

- Chuck closed all terminals except the video/Studio Cut agent.
- The closed Content Studio terminal pushed docs-only continuity commit `bfa9dc0`
  to `codex/content-studio-command-001` after PR #4 had already merged.
- Cherry-picked the continuity note into `main` instead of merging the stale
  feature branch.
- Preserved current `main` deploy history and added `docs/agents/codex-continuity.md`
  to the first-five-minutes handoff list.

### Codex / `codex/team-progress-story-001`

- Added a team-only web route at `/team/progress` for a readable internal
  progress story.
- Added checked-in story data at `apps/web/content/internal/progress-story.json`
  so the page can render in the web standalone container without `.git` or repo
  docs at runtime.
- Added the Progress link to the existing Team Console navigation.
- Validation passed: `DATABASE_URL=postgresql://postgres:postgres@localhost:5432/high_ground_studio pnpm --filter web exec next build --webpack`, `pnpm web:cloudrun:test`, `pnpm web:cloudrun:preflight`, and `git diff --check`.
- Default `pnpm --filter web build` was attempted, hit the known Turbopack
  optimized-build hang, and was stopped; webpack remains the documented passing
  web build path.
- Web Cloud Run preflight has no blocked repo items, but first live web deploy
  still needs cloud setup or confirmation of the current HighGroundOdyssey.com
  hosting target.

### Codex / `codex/web-cloud-run-deploy-001`

- Added `pnpm web:cloudrun:seed-secrets` and `pnpm web:cloudrun:deploy`.
- Seeded web Secret Manager versions from local env files without printing
  values.
- Ensured the web runtime service account can read web secrets and granted it
  `roles/cloudsql.client`.
- Created Cloud Run service `web`, attached Cloud SQL
  `high-ground-odyssey:us-central1:studio-postgres`, and deployed image
  `us-central1-docker.pkg.dev/high-ground-odyssey/high-ground-studio/web:742690e`.
- Cloud Build: `dd3c4756-ea24-443c-8906-ac3b6726c4eb`.
- Latest ready revision after env update: `web-00002-vjt`, serving 100%.
- Live URL: `https://web-hm2odnvjga-uc.a.run.app`.
- Smokes passed after applying the same disabled invoker-IAM-check setting used
  by Studio: `/api/health`, `/`, and `/team/progress` unauthenticated redirect.
- Redeployed after adding the web-launch story entry: image `web:29b1bfb`,
  Cloud Build `38e4197f-903b-461c-be64-11ce4425695a`, revision
  `web-00003-fc2`, serving 100%.
- Rollback:
  `gcloud run services update-traffic web --project=high-ground-odyssey --region=us-central1 --to-revisions=web-00002-vjt=100`
- DNS and Google OAuth callback mutation are still pending.

### Codex / `codex/web-domain-mapping-001`

- Created Cloud Run domain mapping for `app.highgroundodyssey.com` to service
  `web`.
- Cloud Run requested DNS record: `app CNAME ghs.googlehosted.com.`
- Mapping is domain-routable but certificate-pending until DNS is configured.
- Public nameservers are `ns-cloud-a1` through `ns-cloud-a4`, but no Cloud DNS
  zone is visible in project `high-ground-odyssey`; DNS likely lives in another
  Google project/account or DNS management surface.
- Root `highgroundodyssey.com` and `www.highgroundodyssey.com` DNS were not
  changed.

### Codex / `codex/github-cloud-deploy-001`

- Created a dedicated Google Cloud deployer service account:
  `github-actions-deployer@high-ground-odyssey.iam.gserviceaccount.com`.
- Granted the deployer Cloud Build editor, Cloud Run admin, and artifact
  storage object admin permissions.
- Granted the deployer `roles/iam.serviceAccountUser` only on the existing
  runtime service accounts:
  - `web-cloud-run@high-ground-odyssey.iam.gserviceaccount.com`
  - `studio-cloud-run@high-ground-odyssey.iam.gserviceaccount.com`
- Enabled the IAM Credentials and Security Token Service APIs.
- Created Workload Identity Federation resources for GitHub Actions:
  - pool: `github-actions`
  - provider: `github`
  - provider resource:
    `projects/659427658635/locations/global/workloadIdentityPools/github-actions/providers/github`
- Restricted the provider to repository
  `CharlieLSparrow/high-ground-studio`.
- Added `.github/workflows/deploy-cloud-run.yml` so pushes to `main` deploy
  changed Cloud Run targets and manual dispatch can deploy `all`, `web`,
  `studio`, or `auto`.
- The workflow reuses `pnpm web:cloudrun:deploy` and
  `pnpm studio:cloudrun:deploy` so CI deploys keep the same validation, Cloud
  Build, smoke, and rollback behavior as operator deploys.
- Merged PR #8 to `main` as `e2f0a83`.
- First GitHub Actions run `26347264413` started successfully and selected
  `web`, but failed before Cloud Build because
  `google-github-actions/auth` generated a temporary `gha-creds-*.json` file in
  the checkout and the deploy helper correctly refused a dirty tree.
- Follow-up fix branch: `codex/github-cloud-deploy-fix-001`.

### Codex / `codex/github-cloud-deploy-docker-001`

- GitHub Actions deploys reached the app validation steps but remained blocked
  on Cloud Build source-staging bucket access for both `web` and `studio`.
- Added a Docker build/push strategy to both Cloud Run deploy helpers:
  - `WEB_IMAGE_BUILD_STRATEGY=docker`
  - `STUDIO_IMAGE_BUILD_STRATEGY=docker`
- Updated the GitHub Actions workflow to use the Docker strategy so CI builds
  images on the runner, pushes to Artifact Registry, and deploys Cloud Run
  without using `gcloud builds submit`.
- Granted the GitHub deployer scoped Artifact Registry writer access on
  `us-central1/high-ground-studio`.
- Local validation passed: workflow YAML parse, `git diff --check`,
  `pnpm web:cloudrun:test`, and `pnpm studio:cloudrun:test`.
- Merged PR #10 to `main` as `b80f140`; GitHub Actions run `26347727705`
  deployed both services successfully from `main`.
- New live revisions:
  - web: `web-00004-fml`
  - Studio: `studio-00026-hpm`
- Live smokes passed for web `/api/health`, web `/`, web `/team/progress`
  unauthenticated sign-in redirect, Studio `/api/health`, and Studio
  `/content-studio`.
- Docker logs exposed Prisma/OpenSSL warnings in the slim images. Follow-up
  hardening branch: `codex/cloud-run-openssl-hardening-001`.

### Codex / `codex/cloud-run-openssl-hardening-001`

- Installed `openssl` and `ca-certificates` in web and Studio Docker build and
  runtime stages.
- Merged PR #11 to `main` as `3842c1d`.
- GitHub Actions run `26347922823` deployed both hardened images
  successfully.
- New live revisions:
  - web: `web-00005-r68`
  - Studio: `studio-00027-8gx`
- Rollback:
  - web:
    `gcloud run services update-traffic web --project=high-ground-odyssey --region=us-central1 --to-revisions=web-00004-fml=100`
  - Studio:
    `gcloud run services update-traffic studio --project=high-ground-odyssey --region=us-central1 --to-revisions=studio-00026-hpm=100`
- Live health smokes passed after deploy for web and Studio.

### Codex / `main` web custom-domain readiness

- Rechecked the live `web` and `studio` Cloud Run services after the OpenSSL
  hardening deploy:
  - web: `web-00005-r68`, serving 100% at
    `https://web-hm2odnvjga-uc.a.run.app`
  - Studio: `studio-00027-8gx`, serving 100% at
    `https://studio-hm2odnvjga-uc.a.run.app`
- Confirmed the Cloud Run mapping for `app.highgroundodyssey.com` routes to
  `web`, is domain-routable, and is waiting on DNS/certificate issuance.
- Confirmed the required DNS record remains:
  `app CNAME ghs.googlehosted.com.`
- Public DNS still returns NXDOMAIN for `app.highgroundodyssey.com`; root and
  `www` still point at the current public/Vercel-facing site records.
- WHOIS reports the registrar as Squarespace Domains LLC. Cloud DNS API was not
  enabled in the accessible Google Cloud projects checked from this workstation,
  so DNS likely needs to be added in Squarespace Domains or the legacy Google
  Domains DNS surface.
- Added `pnpm web:domain:check` as a read-only custom-domain readiness command.
- Added `docs/sessions/web-domain-readiness-result.md` with the DNS, OAuth, and
  Cloud Run origin cutover sequence.
- Merged PR #13 to `main` as `4de9fb8`.
- GitHub Actions run `26348319193` redeployed both services successfully:
  - web: `web-00006-m6l`, serving 100%
  - Studio: `studio-00028-qlk`, serving 100%
- Live smokes passed for web `/api/health`, Studio `/api/health`, and web
  `/team/progress` unauthenticated redirect.
- Added a team progress story entry for this domain-readiness/deploy loop.
- Merged PR #14 to `main` as `079205f`.
- GitHub Actions run `26348472669` deployed only `web` and skipped Studio, as
  expected for a checked-in team progress story update.
- Latest web revision after the story update: `web-00007-7p8`, serving 100%.
- Live smokes passed for web `/api/health` and web `/team/progress`
  unauthenticated redirect.

### Codex / `codex/content-studio-packet-import-001`

- Added Content Studio import/export packet parsing, project handoff summaries,
  and explicit manual server checkpoints.
- Added `StudioContentWorkspaceSnapshot` to Prisma for private Studio workspace
  recovery across browsers and devices.
- Added authenticated `/api/content-studio/snapshots` endpoints for list,
  latest, detail, and manual save.
- Added a Cloud Build config and Cloud Run Job Dockerfile for deliberate live
  `pnpm db:push` schema sync using the same Cloud SQL attachment and database
  secret as Studio.
- Added `.gcloudignore` so Cloud Build source uploads exclude `.env`, local
  artifacts, and protected inbox/staging content.
- Validation passed locally: `pnpm content-studio:packet:test`,
  `pnpm exec prisma validate`, `pnpm db:generate`,
  `pnpm studio:cloudrun:test`, `pnpm --filter studio typecheck`,
  `pnpm --filter studio build` outside the sandbox, YAML parse, and
  `git diff --check`.
- No provider calls, public publishing, real manuscript text, or automatic
  autosave behavior were added.
- Merged PR #16 to `main` as `3cc1fae`.
- Built the one-off Prisma db-push image with Cloud Build
  `920209e8-68be-4a0e-bfe6-22520d58a98e`:
  `us-central1-docker.pkg.dev/high-ground-odyssey/high-ground-studio/prisma-db-push:3cc1fae7fc0b`.
- Created and executed Cloud Run Job `studio-db-push-3cc1fae` against the live
  Studio Cloud SQL database using Studio's runtime service account, Cloud SQL
  attachment, and `studio-database-url:latest`.
- Job execution `studio-db-push-3cc1fae-426ng` completed successfully; logs
  report `Your database is now in sync with your Prisma schema`.
- GitHub Actions deployed the merged runtime commit `3cc1fae`:
  - Studio: `studio-00029-nqp`, serving 100%.
  - Web: `web-00008-k4l`, serving 100%.
- Live smokes passed:
  - Studio `/api/health`
  - Studio `/content-studio`
  - Studio `/api/content-studio/snapshots` unauthenticated `401`
  - Web `/api/health`
  - Web `/team/progress` unauthenticated redirect
- Rollback:
  - Studio:
    `gcloud run services update-traffic studio --project=high-ground-odyssey --region=us-central1 --to-revisions=studio-00028-qlk=100`
  - Web:
    `gcloud run services update-traffic web --project=high-ground-odyssey --region=us-central1 --to-revisions=web-00007-7p8=100`

### Codex / `codex/content-studio-production-packets-001`

- Added selected-project production packets inside Content Studio.
- Production packets include provider-safe delivery targets, flattened
  checklist state, review-required agent task prompts, and safety flags.
- Podcast and episode-page packets include a staged HGO projection draft that
  validates against the existing HGO projection import contract.
- The UI can download the full production packet or just the HGO projection
  draft for review in `/projection-stage/import`.
- Guardrails remain: no provider calls, no public publishing, no real
  manuscript/HGO source text, no automatic promotion.
- Merged PR #17 to `main` as `95b367a`.
- GitHub Actions run `26349644925` deployed Studio and skipped web, as
  expected for a Studio-only code change.
- Studio revision `studio-00030-ncf` is serving 100% with image
  `studio:95b367a83f9c27467b37401872fb6ca1e01448af`.
- Live smokes passed for Studio `/api/health` and `/content-studio`.
- Rollback:
  `gcloud run services update-traffic studio --project=high-ground-odyssey --region=us-central1 --to-revisions=studio-00029-nqp=100`

### Codex / `codex/content-studio-checkpoint-history-001`

- Added Content Studio checkpoint history controls on top of the existing
  snapshot API.
- Operators can refresh recent checkpoints, see project/status counts, and load
  a specific checkpoint instead of only loading the latest.
- This keeps manual checkpoints useful as recovery/rollback anchors without
  introducing autosave or canonical publishing state.
- Merged PR #18 to `main` as `695645b`.
- GitHub Actions run `26349970858` deployed Studio and skipped web, as
  expected for a Studio-only code change.
- Studio revision `studio-00031-rkx` is serving 100% with image
  `studio:695645b7438d9344dd164329a9246f7811f9bbb0`.
- Live smokes passed for Studio `/api/health` and `/content-studio`.
- Rollback:
  `gcloud run services update-traffic studio --project=high-ground-odyssey --region=us-central1 --to-revisions=studio-00030-ncf=100`

### Codex / `codex/hgo-staged-artifact-store-001`

- Added the first private HGO staged artifact store for validated
  `hgo-staged-artifact-v1` review packets.
- Added additive Prisma model `HgoStagedProjectionArtifact`, team-gated API
  route `/api/hgo/staged-artifacts`, private team list route
  `/team/hgo-staged-artifacts`, and an explicit `Save private review artifact`
  action on `/projection-stage/import`.
- The save action does not publish pages, promote artifacts, call providers,
  certify public-safety review, or mutate the embedded browser-created artifact
  packet.
- Validation before merge passed: `pnpm db:generate`,
  `pnpm hgo:store-lab:test`, `pnpm hgo:artifact:test`,
  `pnpm web:cloudrun:test`, webpack build, and `git diff --check`.
- Merged PR #21 to `main` as `b07c73d`.
- Built the one-off Prisma db-push image with Cloud Build
  `d87f4471-4542-4744-8af8-b237cc946e44`:
  `us-central1-docker.pkg.dev/high-ground-odyssey/high-ground-studio/prisma-db-push:b07c73d`.
- Created and executed Cloud Run Job `web-db-push-b07c73d` using the web
  runtime service account, Cloud SQL attachment, and `web-database-url:latest`.
- Job execution `web-db-push-b07c73d-4rhhc` completed successfully; logs report
  `Your database is now in sync with your Prisma schema`.
- Operator note: the `web-database-url` secret currently resolves to a Neon
  PostgreSQL pooler even though the job also has the Cloud SQL attachment. Plan
  a deliberate web database migration/cutover if the goal is to move all web
  persistence onto Google Cloud SQL.
- Deployed web with Cloud Build `fb9356b7-9a6d-4bfb-ab2f-32fe2c3e136b`.
- Web revision `web-00019-tkx` is serving 100% with image `web:b07c73d`.
- Live smokes passed:
  - Web `/api/health`
  - Web `/`
  - Web `/projection-stage/import`
  - Web `/team/progress` unauthenticated redirect
  - Web `/api/hgo/staged-artifacts` unauthenticated `401`
  - Web `/team/hgo-staged-artifacts` unauthenticated sign-in redirect
- Rollback:
  `gcloud run services update-traffic web --project=high-ground-odyssey --region=us-central1 --to-revisions=web-00018-wjt=100`

### Codex / `main` progress-story follow-up

- Added the team-readable story entry
  `hgo-private-staged-artifact-store` to
  `apps/web/content/internal/progress-story.json`.
- Committed and pushed as `070f460`:
  `docs: record HGO staged artifact deploy`.
- Deployed web with Cloud Build `b46b2390-bc95-4a25-ada5-fec820a3a1fe`.
- Web revision `web-00021-t2b` is serving 100% with image `web:070f460`.
- Live smokes passed:
  - Web `/api/health`
  - Web `/`
  - Web `/projection-stage/import`
  - Web `/team/progress` unauthenticated redirect
- Rollback:
  `gcloud run services update-traffic web --project=high-ground-odyssey --region=us-central1 --to-revisions=web-00019-tkx=100`

### Codex / `main` web database target report

- Added `pnpm web:db:target:report`, a read-only operator check that reports
  the active web database target without printing the `DATABASE_URL` secret.
- Committed and pushed as `8c1df32`:
  `ops(web): report database target state`.
- Live report results:
  - Cloud Run web revision was `web-00021-t2b` at report time.
  - `DATABASE_URL` is mounted from `web-database-url`.
  - Cloud Run has Cloud SQL attachment
    `high-ground-odyssey:us-central1:studio-postgres`.
  - `web-database-url` provider is Neon, database `neondb`, with SSL required.
  - Cloud SQL instance `studio-postgres` is `RUNNABLE`, PostgreSQL 16, backups
    enabled, deletion protection enabled.
  - Cloud SQL databases visible: `postgres`, `studio`.
  - Cloud SQL users visible: `postgres`, `studio_app`.
  - Pending for full GCP database cutover: create/stage a web Cloud SQL
    database, least-privilege web user, staged secret, schema sync, data
    migration, smoke, and rollback before swapping `web-database-url`.
- GitHub Actions auto-deployed this operator-tool commit as `web-00022-vb8`.

### Codex / `main` HGO staged artifact review controls

- Added private review/archive lifecycle controls for saved HGO staged
  artifacts.
- Added server action support from `/team/hgo-staged-artifacts` and PATCH
  support on `/api/hgo/staged-artifacts`.
- Saved artifacts can now be marked `needs-fixes`, `human-review`,
  `approved-for-future-staging`, or `archived`.
- Review actions update server metadata and append event-log entries only; they
  do not publish pages, create episode routes, call providers, or certify
  public-safety review.
- Committed and pushed as `5e9599a`:
  `feat(web): review HGO staged artifacts`.
- Added the team-readable story entry
  `hgo-staged-artifact-review-controls`.
- Committed and pushed as `3ab47aa`:
  `docs: record HGO artifact review controls`.
- Validation passed: `pnpm hgo:store-lab:test`, `pnpm hgo:artifact:test`,
  `pnpm web:cloudrun:test`, webpack build, and `git diff --check`.
- Deployed web with Cloud Build `83ad3e2f-03e6-4c78-aa8f-72908adbbeae`.
- Web revision `web-00025-x2s` is serving 100% with image `web:3ab47aa`.
- Live smokes passed:
  - Web `/api/health`
  - Web `/`
  - Web `/projection-stage/import`
  - Web `/team/progress` unauthenticated redirect
  - Web `/api/hgo/staged-artifacts` GET unauthenticated `401`
  - Web `/api/hgo/staged-artifacts` PATCH unauthenticated `401`
  - Web `/team/hgo-staged-artifacts` unauthenticated sign-in redirect
- Rollback:
  `gcloud run services update-traffic web --project=high-ground-odyssey --region=us-central1 --to-revisions=web-00022-vb8=100`

### Codex / `codex/content-studio-persistence-supervisor-001` multi-agent fanout

- Created supervisor branch `codex/content-studio-persistence-supervisor-001`
  from `origin/main` at `29d78bc`.
- Spawned Epicurus (`019e606f-35fd-72f2-831b-0c635974e12d`) for Content Studio
  project-native persistence across podcast, book, and episode-page work.
- Spawned Erdos (`019e6070-bbd8-7b10-9dcd-b8f5385820e7`) for the first real
  persisted coaching tool loop for Homer/client use.
- Spawned Plato (`019e6070-f3fe-74c3-9f80-cfc13365abcb`) for private HGO
  episode publish workflow improvements.
- Coordination note: `prisma/schema.prisma` is active shared territory during
  this fanout. Workers were warned to inspect current diffs and preserve each
  other's model changes.
- Scope guardrails remain: no public publish action, provider calls,
  production DB mutation commands, secrets/IAM/DNS/OAuth/billing changes, or
  real manuscript/source-content test data from worker threads.
- Epicurus completed Content Studio project persistence:
  - new `StudioContentProject` Prisma model
  - private `/api/content-studio/projects`
  - `/content-studio` save/list/open durable project controls
  - result note:
    `docs/sessions/content-studio-project-persistence-result.md`
- Erdos completed the first real coaching tool data loop:
  - new `WeeklyCommitment` Prisma model and relations
  - grant-gated client dashboard Weekly Commitments card
  - `/team/coaching-tools` review queue for Homer/team
  - result note:
    `docs/sessions/coaching-weekly-commitments-result.md`
- Plato completed the private HGO operator handoff slice:
  - new `hgo-episode-publish-operator-handoff-v1` packet
  - copy/download handoff panel on publish-queue detail pages
  - result note:
    `docs/sessions/hgo-episode-publish-operator-handoff-result.md`
- Integrated validation passed:
  - `pnpm db:generate`
  - `pnpm content-studio:packet:test`
  - `pnpm coaching:weekly-commitments:test`
  - `pnpm coaching:features:test`
  - `pnpm hgo:publish-candidate:test`
  - `pnpm studio:cloudrun:test`
  - `pnpm web:cloudrun:test`
  - `pnpm --filter studio typecheck`
  - `pnpm --filter studio build` outside sandbox after Turbopack hit sandbox
    process/port restrictions
  - `pnpm --filter web exec next build --webpack`
  - `pnpm --filter web build` outside sandbox after clearing stale/competing
    build locks
  - `git diff --check`
- No production DB mutation, deploy, provider call, public publish action,
  `/episodes` replacement, secrets/IAM/DNS/OAuth/billing change, or real
  manuscript/source-content test data was performed in the worker fanout.
- Opened draft PR #23:
  `https://github.com/CharlieLSparrow/high-ground-studio/pull/23`.
- Reauthenticated gcloud as `charlie@highgroundodyssey.com` and verified
  project `high-ground-odyssey`.
- Built one-off Prisma db-push image with Cloud Build
  `21a319e8-a70b-4d11-8619-3c274e947836`:
  `us-central1-docker.pkg.dev/high-ground-odyssey/high-ground-studio/prisma-db-push:6b12434`.
- Applied the schema to the live Studio Cloud SQL database with Cloud Run Job
  `studio-db-push-6b12434`, execution `studio-db-push-6b12434-658xk`.
  Logs reported: `Your database is now in sync with your Prisma schema.`
- Applied the schema to the live Web Cloud SQL database with Cloud Run Job
  `web-cloudsql-db-push-6b12434`, execution
  `web-cloudsql-db-push-6b12434-49qpc`. Logs reported:
  `Your database is now in sync with your Prisma schema.`

### Codex / Manuscript Desk mobile and roadmap handoff

- 2026-05-26: Took over the interrupted local state on
  `codex/content-studio-persistence-supervisor-001`.
- Added a mobile writing and semantic marking pass for private Studio
  `/manuscript`: phone-width users can mark selected text by author, apply or
  clear semantic tags, mark cited quotations, enter semantic Focus View, and
  return to the manuscript surface without the desktop sidebar.
- Recorded competitive research for comparable writing tools in
  `docs/analysis/studio-manuscript-writing-tool-competitive-research.md`.
- Recorded the next Manuscript Desk roadmap in
  `docs/plans/studio-manuscript-desk-improvement-roadmap.md`.
- Recorded the Codex application handoff in
  `docs/agents/codex-application-handoff-2026-05-26.md`.
- Sibling worktrees checked clean:
  `/private/tmp/hgs-deploy-928d68f`,
  `/private/tmp/hgs-manuscript-live-001`,
  `/Users/wall-e/Dev/hgs-worldhub-codex`,
  `/Users/wall-e/Dev/hgs-worldhub-project`, and
  `/Users/wall-e/Dev/high-ground-studio-codex-studio-cut-001`.
- Manuscript validation passed: `pnpm studio:manuscript:test`,
  `pnpm --filter studio typecheck`, and `git diff --check`.
- Repaired the local generated-client issue by pinning the new QuipLore apps
  and the root `react-datepicker` peer graph to the repo's current
  Next/React versions: `next@16.1.6`, `react@19.2.4`, and
  `react-dom@19.2.4`. `pnpm why @prisma/client -r` now reports one
  `@prisma/client` instance.
- `pnpm --filter studio build` still fails inside the sandbox with the known
  Turbopack/PostCSS helper port-bind restriction, but the outside-sandbox build
  passed.

## 2026-06-02 - Quipsly kernel validation and live deploy push

- Built the first `@high-ground/quipsly-document-kernel` package and validated the hard case: a Benjamin Franklin quote annotation survives a paragraph split and projects back into Studio block/span records.
- Added `/kernel-lab` to Quipsly and linked it from `/create` when Publisher Mode is enabled.
- Local validations passed: `pnpm quipsly:kernel:typecheck`, `pnpm quipsly:kernel:build`, `pnpm quipsly:kernel:test`, and `pnpm --filter quipsly build` with collab env vars.
- Browser smoke passed on `http://127.0.0.1:3000/kernel-lab`: validation shows Clean, 2 nodes after split, 1 projected span, and the Studio bridge output.
- Browser smoke passed on `http://127.0.0.1:3000/create?publisher=1` without local `DATABASE_URL`: the workbench now falls back to an explicit offline browser lab instead of a 500, still showing Episode 4/8/9 views and the Kernel Lab link.
- Production schema push completed through Cloud Run Job execution `prisma-db-push-tt9cg`.
- App deploy Cloud Build started as `c26090c7-2ff9-468f-93e3-b40644000c88`; smoke live `/create` and `/kernel-lab` after it completes.

## 2026-06-02 - Document outline lens added

- Added a `/create` document-outline lens that derives clickable boundaries from short heading blocks such as `Preface`, `Introduction`, `Chapter ...`, and `Episode ...`.
- Selecting an outline item filters the editor from that heading until the next heading, so chapters/episodes work before any manual tags exist.
- Local browser smoke verified the offline fallback: clicking `Episode 8` reduced the editor to the `Episode 8` heading and body only.

## 2026-06-02 - Enter creates blocks

- Added server-backed block splitting in `/create`: Enter splits the current block at the cursor and creates a new `StudioDocumentBlock`; Shift+Enter remains the inline newline escape hatch.
- The split action shifts following block order, updates the current block body, creates the next block, and remaps tagged spans across the split when possible.
- Local browser smoke verified the Franklin-quote-style hard case: pressing Enter at the start of a block increased visible editor blocks from 7 to 8 and separated the text into its own block.

## 2026-06-02 - Show Mode marking foundation

- Added foundational show-production tags to the `/create` workbench: `Homer`, `Charlie`, `Show Note`, `Clip Cue`, and `YouTube Clip`.
- Added a `Show Mode` lens so the manuscript can become the recording run sheet: speaker/author passages, show notes, and clip cues are filterable from the sidebar.
- Loaded persisted `StudioTaggedSpan` offsets into the client block model and added a marked reading layer above each editable textarea so tagged ranges can be seen while reading.
- Local browser smoke verified `Show Mode`, voice/show/media tags, and filtered editor output.

## 2026-06-02 - Dev Lab vs real manuscript projects

- Changed `/create` default to the `quipsly-dev-lab` project so agents and experiments have a safe mutable sandbox.
- Added `high-ground-odyssey-manuscript` as the canonical real manuscript project; it seeds from the latest manuscript snapshot if empty.
- Kept `quipsly-live` as `Legacy Live` so existing data remains reachable.
- Added a visible project switcher in the workbench header: Dev Lab, HGO Manuscript, Legacy Live.
- Local browser smoke verified default Dev Lab, Show Mode, and project switcher visibility.

## 2026-06-02 - Live deploy `studio-00131-v42`

- Deployed Cloud Run revision `studio-00131-v42` from image `us-central1-docker.pkg.dev/high-ground-odyssey/high-ground-studio/studio:quipsly-projects-show-20260602020656`.
- This revision includes: Quipsly Document Kernel lab, offline fallback, project switcher, Dev Lab default, HGO Manuscript project, Legacy Live link, Document Outline lens, Enter-to-split blocks, Show Mode, speaker/show-note/clip tags, and marked reading layer.
- HTTP smoke passed for `/create?project=high-ground-odyssey-manuscript&publisher=1` and `/kernel-lab` on `studio-hm2odnvjga-uc.a.run.app`.

## 2026-06-02 - Live deploy `studio-00132-xkz`

- Deployed Cloud Run revision `studio-00132-xkz` from image `us-central1-docker.pkg.dev/high-ground-odyssey/high-ground-studio/studio:quipsly-devlab-repair-20260602021324`.
- Added Dev Lab self-healing for old seed data: if Show Mode has no speaker/show/media spans, Dev Lab seeds Homer/Charlie/show-note/clip-cue spans automatically on load.
- Final live browser smoke passed: `/create?publisher=1&view=show-mode` shows Dev Lab Show Mode content, and `/create?project=high-ground-odyssey-manuscript&publisher=1` opens the real manuscript with project switcher visible.

## 2026-06-02 - Embedded YouTube clip cue in manuscript

- Added `ClipCueCard` to `/create`: a block tagged `clip-cue`/`youtube-clip`, or containing a YouTube URL/clip syntax, now renders an embedded clip editor directly in the writing surface.
- Clip cues use manuscript-native text fields: `Clip:`, `Start:`, `End:`, and `Note:` so agents and humans can edit the same source of truth.
- The card renders a YouTube iframe with `start` and `end` parameters so recording playback can be adjusted while writing.
- Local browser smoke verified entering URL `https://www.youtube.com/watch?v=ysz5S6PUM-U`, Start `0:05`, End `0:12` produced iframe `https://www.youtube.com/embed/ysz5S6PUM-U?rel=0&modestbranding=1&start=5&end=12` and wrote the cue back into the manuscript block.

### 2026-06-02 - Codex clip-stack cue card

- Extended the `/create` Show Mode clip cue card from single-video segment playback into a manuscript-native clip stack.
- Text format remains readable and editable in the document: repeated `Clip: <youtube-url>` sections with one or more `Segment: start-end` rows under each clip.
- Play mode flattens those clip sections into one playback stack so Episode/show blocks can stitch ranges from multiple YouTube videos without leaving the writing surface.
- This is intentionally a near-seamless iframe-based sequence first; frame-perfect playback can come later through the YouTube IFrame API or the real media pipeline.

### 2026-06-02 - Codex default everything and subtractive Book Mode

- Adjusted `/create` view semantics so the default lens is `Everything Mode`: the living document shows manuscript, notes, tags, and clip scaffolding by default.
- Added `Book Mode` as the subtractive clean-reading/export lens. It hides production/media tags such as `show-note`, `clip-cue`, `youtube-clip`, `internal_note`, `social-clip`, and `media` instead of requiring prose to be specially selected into a book view.
- Added `excludeTagSlugs` support to workbench views so future lenses can hide clutter without creating dangerous additive shadow-documents.
- Product rule: the manuscript remains the object; modes are ways of hiding or focusing the same object, not separate content stores.

### 2026-06-02 - Default starter project concept

- Add a default project/document for every new Quipsly account.
- The starter document should explain how Quipsly works by using Quipsly features inside the document itself: tags, lenses, Book Mode, notes, clip cues, speaker/voice markings, embedded media cues, and example sidebar/research patterns.
- This should feel like a living demo manuscript, not a separate onboarding checklist or docs page.
- Tone target: whimsical, sharp, humane comic-fantasy narrator energy with Discworld-style vibes, but no direct Discworld references, names, settings, or imitation that would make it feel like a parody/copy.
- Product purpose: show users immediately why the “everything visible by default, subtractive lenses when needed” model is powerful for books, episodes, articles, talks, studying, and research.

### 2026-06-02 - Codex starter-demo document foundation

- Added `apps/quipsly/src/app/create/starterDocuments.ts` as the source for seeded starter content.
- The default Dev Lab seed now uses a living Quipsly starter document that demonstrates tags, Everything Mode, subtractive Book Mode, show notes, clip stacks, episode headings, and research-note patterns inside the document itself.
- Existing documents are not overwritten: starter blocks are only used when a seeded document has zero blocks.
- The writing tone aims for whimsical, sharp, humane comic-fantasy narrator energy without direct references to Discworld or any Discworld-specific characters/settings.

### 2026-06-02 - Codex starter demo project route

- Added `quipsly-starter-demo` as a separate project config and project switcher option.
- This gives us a visible, safe place to iterate on the future new-account default document without overwriting Dev Lab experiments or the High Ground Odyssey manuscript.
- The Starter Demo uses the same starter block source as the future default onboarding template.

### 2026-06-02 - Navigation system needs to grow up

- Future navigation should read from the actual Quipsly document/project graph instead of being mostly hardcoded sidebar view buttons.
- Base unit language is still settling: project, document, note, manuscript, notebook, and workspace need a clear hierarchy that feels obvious to users.
- Navigation should understand headings, episodes, chapters, stories, notes, clip cues, research/source material, and saved lenses as first-class surfaces derived from the same living document model.
- Product direction: evolve the sidebar from a view picker into a mature table-of-contents plus knowledge-map system that can support writing, studying, production, and future onboarding documents.

### 2026-06-02 - Codex QA login follow-up

- Follow-up reminder: create a real Google/Workspace QA account for Codex testing, such as `codex@quipsly.com` or `qa@quipsly.com`.
- Once the account exists, wire that email into Studio access using the existing Google/NextAuth role or allowlist path instead of adding a fake password or backdoor.
- Purpose: let Codex test authenticated Studio/collab flows directly in the browser without using Charlie's personal session.

### 2026-06-02 - Reliability before video-editor sprint

- Product course correction: stop overfitting the workbench language around specific episode numbers. Episode/chapter/story numbers are document data, not the architecture.
- Current priority is editor trust: clear save-state feedback, durable writing, safe tagging, and navigation that helps with the active production job without dragging the team back into old manuscript-recovery obsession.
- After the current editor reliability/navigation slices, shift hard into the video editor so Quipsly can support syncing, clip review, and episode editing under the same living-document workflow.

### 2026-06-02 - Audio-first recording room direction

- Product direction: start the recording system audio-first instead of trying to clone Riverside/Descript video recording immediately.
- Core flow: a live call for conversation/coordination, local high-quality asynchronous audio capture/upload per participant, manuscript/show notes visible in the same surface, and clip cues that can be played during the recording with timing captured against the session timeline.
- Video can remain synchronized as an asset layer: local/remote video tracks, YouTube/reference clips, screen/video cues, and later multicam assets align to the high-quality audio spine rather than defining the whole recording system up front.
- This connects naturally to transcript generation, paper edit, multitrack podcast editing, show notes, clip extraction, and publishing. The editing system should remain robust and multitrack, but connected tangibly to manuscript blocks, recording cues, and transcript ranges.
- Existing video-editor work remains useful as timeline/render/segment/asset/360 groundwork, but mock assets and toy UI assumptions should not be treated as product truth.

## 2026-07-18 - Unified Quipsly product goal active

- Activated the persistent iPhone-first Quipsly product goal and recorded its architecture, research, acceptance gates, and loop-back rules in `docs/plans/quipsly-unified-product-goal-2026-07-18.md`.
- iPhone Capture is now a focused Today/Record/Library/Account app with explicit consent, truthful local/upload state, a primary Session Plan, revision conflict review, and local-draft preservation. Simulator proof passed on iPhone 17 Pro; physical-device and real-session endurance proof remains open.
- Hardened note sync/parse ownership and no-loss conflict behavior. Transcript-derived actions remain packet candidates until an explicit human decision; release evidence is checked again inside the accepting transaction.
- Added the v2 canonical session-context spine without a schema migration: structured note/goal/task entries, stable IDs, optimistic revision, bounded receipts, transactional source-marked CoachingNote/ActionItem projections, idempotent resaves, and safe archive/cancel behavior.
- Replaced misleading or fabricated states across Projects, Research, Schedule, Collections, Read, Publishing, Outputs, Analytics, and the routable legacy Publishing Suite with actor-scoped real reads or explicit signed-out/empty/unavailable/archived boundaries.
- Retired randomized retention-telemetry seeding and fallback success. The reader is staff-gated, read-only, exact-ID only, and derives alerts solely from persisted points.
- Visible local proof completed in the installed simulator and in-app browser. Consolidated focused Quipsly regression passed 22 suites / 114 tests; packet, session, public-failure, and source-only capture contract gates are green.
- Public host truth remains blocked before app code: `highgroundodyssey.com`, `app.highgroundodyssey.com`, `quipsly.com`, and `nest.quipsly.com` return uniform Google Frontend HTTP 503. `gcloud` and ADC need interactive refresh. Loop back with `gcloud auth login --update-adc --brief`, then `bash scripts/release/quipsly-gcloud-auth-check.sh`, then read-only service/billing/revision/database inspection before any deployment decision.
- No production write, deployment, provider call, OAuth grant, calendar mutation, publication, commit, or push was performed.

## 2026-07-18 - Work Queue and runtime truth checkpoint

- Added primary `/work` navigation and a canonical actor-scoped Work Queue for committed ActionItems, exact active Session Plan goal projections, and WeeklyCommitments.
- Added explicit self-assigned personal task capture plus conflict-safe OPEN/DONE/CANCELED transitions. Creation and status changes write bounded internal receipts and explicitly claim no messaging, calendar, delivery, or publication side effect.
- Kept inferred transcript candidates out of the queue until ACCEPT materializes one committed ActionItem. Preserved distinct provenance for accepted transcript proposals, Session Plan tasks, and manual tasks.
- Fixed signed-out Settings to remain on `/settings` with a callback-safe sign-in gate.
- Removed the unauthenticated development-owner bypass from `requireProjectAccess`; authentication now fails before private database reads in every environment.
- Separated Jest `*.test.*` files from Playwright `*.spec.ts` journeys.
- Running `http://127.0.0.1:3012` dogfood verified:
  - private Work and Session Review sign-in gates;
  - Schedule's honest database-unavailable state;
  - render-worker retirement with no fake queue claim;
  - beta-readiness `blocked`, 1/11 required gates passing, 14 production-core tables unproven/missing, and no valid release-smoke secret;
  - repaired Settings callback path.
- Authenticated web mutation remains unproven: available browser surfaces were signed out, the Google popup did not establish a local Quipsly session, and the configured database was unavailable.
- Consolidated verification passed:
  - Quipsly Jest: 47 suites / 218 tests;
  - web Jest: 2 suites / 6 tests;
  - Quipsly, domain, and web TypeScript checks;
  - 76 capture/security/release contracts, including 50/50 iPhone durability checks;
  - native Xcode iPhone 17 Pro simulator test: 8 UI tests passed; credential-dependent signed-in runtime smoke skipped as designed.
- Physical iPhone, real QA credential/session, reachable persistence, cross-device receipt readback, real episode/coaching dogfood, public host recovery, and authorized destination readback remain open completion gates.
- Public loop-back remains: `gcloud auth login --update-adc --brief`, `bash scripts/release/quipsly-gcloud-auth-check.sh`, then read-only service/billing/revision/database inspection.
- No production write, deploy, provider call, OAuth grant, calendar mutation, publication, commit, or push was performed.

## 2026-07-18 - Canonical Goal and follow-through checkpoint

- Added additive canonical `Goal`, `GoalTaskLink`, and `GoalProgressReceipt` Prisma models plus the reversible `20260718190000_add_canonical_goals` migration. Goals now have an owner/lifecycle/target, optional room/booking/project and hierarchy links, explicit task relationships, and append-only progress evidence.
- Regenerated Prisma and validated the schema. The migration was not applied: the configured database remains unavailable and no production mutation was authorized.
- Session Plan v2 now dual-writes goal entries to the compatibility `CoachingNote` projection and canonical `Goal` in one transaction. Stable legacy projection IDs remain readable; canonical records retain exact context-entry and legacy-note provenance; removals archive history.
- Upgraded `/work` from legacy goal-note display to canonical goal create, status, progress, task-connect, and task-disconnect decisions with owner/access rechecks and optimistic concurrency. Canonical goals suppress duplicate legacy projections; unmatched legacy goals remain read-only.
- Expanded production-core readiness to 17 required tables with a dedicated three-table `goals-follow-through` group. Runtime error responses preserve the checklist and redact private database diagnostics.
- Local runtime proof returned all 17 tables unproven/missing, including the goal group, with only a generic database-unavailable error. No persistence claim was made.
- Consolidated verification passed: Quipsly Jest 49 suites / 227 tests, Quipsly and domain TypeScript checks, Prisma validation, and the six-fact mobile Session Plan static smoke.
- Authenticated cross-device goal/task persistence, real episode/coaching use, physical iPhone operation, and the previously recorded public-service recovery gates remain open.
- No database migration, production write, deploy, provider call, OAuth grant, calendar mutation, publication, commit, or push was performed.

## 2026-07-18 - Personal planning and weekly review checkpoint

- Added additive actor-owned `WorkPlanBlock` records with exact-one task/goal targeting, finite time windows, IANA timezone, explicit lifecycle, optimistic revisions, and bounded internal receipts.
- Added the reversible `20260718203000_add_work_plan_blocks` migration. It also adds `WeeklyCommitment.clientReviewedAt` and `sourceJson` so client reflection evidence remains separate from coach review. The migration was generated/validated but not applied.
- Schedule now requires a real Quipsly session and no longer falls back to an unauthenticated local operator identity.
- Added a visible personal planning surface for accessible open tasks and owned active goals. Completing or moving a focus block never mutates target status, deadlines, appointments, provider calendars, or invitations.
- Added actor-owned weekly commitment create/update, support requests, progress reflection, and explicit client-reviewed evidence. One required plus two optional commitments discourage overloaded plans; stale writes conflict.
- Running-app proof: signed-out `/schedule` returns the private-runway lock. Production-core readiness returns `error`, 0/18 present, 18 missing/unproven, all four goals/follow-through tables missing, and a generic database-only diagnostic.
- Consolidated verification passed: Quipsly Jest 52 suites / 237 tests, Quipsly and domain TypeScript checks, Prisma validation/client generation, and scoped diff checks.
- Authenticated persistence/cross-device readback and real episode/coaching dogfood remain blocked on a real QA session and reachable schema; no external calendar/provider action was attempted.
- No database migration, production write, deploy, provider call, OAuth grant, calendar mutation, invitation, publication, commit, or push was performed.

## 2026-07-18 - iPhone Today follow-through checkpoint

- Added authenticated `/api/mobile/capture/today` readback for canonical actor-scoped tasks, goals/progress, personal focus blocks, and the active weekly plan. Unreviewed transcript candidates remain quarantined.
- Added conflict-safe iPhone task-status and focus-status decisions with access rechecks and bounded internal receipts. Focus completion cannot complete its target or mutate recording/provider/calendar state.
- Capture Today now displays the next focus block, committed tasks, active goals, and weekly commitments beneath the next session, with useful Task Done and Block done actions.
- Added an owner-bound, complete-file-protection, backup-excluded Today cache. Offline snapshots are read-only, network authority is required for mutations, and sign-out clears the cache.
- Running local endpoint proof: signed-out `/api/mobile/capture/today` returned HTTP 401 before private reads.
- Consolidated web verification passed: Quipsly Jest 53 suites / 240 tests, TypeScript, and scoped diff checks.
- Native Xcode test succeeded on iOS 26.3 / iPhone 17 Pro simulator: 9 deterministic UI tests passed, including Today canonical follow-through; signed-in credential smoke skipped. Evidence: `/tmp/quipsly-capture-derived/Logs/Test/Test-HighGroundCapture-2026.07.18_18-56-51--0600.xcresult`.
- Authenticated cross-device mutation, safe schema application, physical iPhone work, and real coaching/episode dogfood remain open. No schema migration, production write, deploy, provider/calendar call, invitation, publication, commit, or push occurred.

## 2026-07-18 - Source-aware annotation checkpoint

- Consolidated the next annotation lane around immutable `StudioSourceUnit`, canonical project `StudioTag`, and additive revisioned `StudioSourceAnnotation` overlays. Legacy Studio spans and QuipLore notes remain intact during migration.
- Added quote-and-position selectors with prefix/suffix context and source fingerprints; stale anchors fail closed. Private overlays are author-only, Nest-visible overlays still require project access, and only authors can change review state.
- Added reversible source-annotation and annotation-use migrations and expanded production-core readiness to 22 tables. They were not applied.
- `/research` now exposes a real source reader and selection-first annotation composer with types, privacy, tags, visible source boundary, idempotent saves, and resolve/reopen receipts.
- iPhone Today now reads active source-linked research cues and lets their author resolve one without changing preserved source text. Protected offline readback is decision-disabled.
- Added an idempotent annotation-to-private-draft handoff with a typed evidence-use row, stable citation, reversible document operation, writing-editor provenance panel, and Research-side `Used in writing` readback.
- Added private/no-store per-Nest research export with full preserved text, source hashes, actor-scoped annotations/revisions, tags, writing-use links, explicit boundaries, and a manifest digest. Restore mutation remains deliberately unclaimed.
- Verification passed: Prisma validate/generate; Quipsly TypeScript; 55 Jest suites / 246 tests; 47/47 mobile source-contract checks; 7/7 deterministic `CaptureExperienceUITests` on iPhone 17 Pro simulator. Xcode evidence: `/tmp/quipsly-capture-derived/Logs/Test/Test-HighGroundCapture-2026.07.18_19-18-22--0600.xcresult`.
- Running Nest proof on port 3012 showed honest `/research` database-unavailable UI; mobile Today and research export HTTP 401 before private reads; and production-core `error` with 0/22 tables present and the six-table source-aware group unproven.
- Authenticated persistence, separate-account privacy, physical iPhone, real HGO/coaching evidence flows, writing/Studio handoff, export/restore, and public-service recovery remain open. Loop back after safe schema sync and a real QA session; no production/external mutation, migration application, commit, or push occurred.

## 2026-07-18 - Real research dogfood and no-overwrite restore checkpoint

- Started only the disposable local Postgres lane, reviewed Prisma's datasource-to-schema SQL for drops, then used `prisma db push` against `localhost:5432/high_ground_studio`. Production and migration history were untouched; local production-core now reports 22/22 required tables ready.
- Added explicit `server-only` dependency ownership and aligned Jest to one workspace React dispatcher after the forced reinstall exposed duplicate React copies.
- Dogfooded real repository work into `quipsly-local-dogfood`: the Homer coaching workflow guide and Episode 4 audio-first publication goal were stored as versioned immutable sources, annotated at exact passages, resolved/reopened, and converted into private citation-linked writing drafts. Direct readback proved hashes, quote anchors, tags, three revisions per annotation, reversible draft operations, and retry reuse.
- Fixed Create's legacy-workspace-only lookup. Dynamic canonical Nests now resolve by the same slug rule as access checks, so evidence draft links no longer reject a valid project outside `tonight-pack`.
- Operated `/research` in the in-app browser at desktop and 390x844 phone dimensions. It rendered eight persisted source cards across the source and restored Nests with no horizontal overflow. Local fallback is now visibly read-only and exposes no annotation, draft, private export, or restore mutation controls.
- Added `quipsly-research-export-v1` validation and authenticated `/api/research/restore`. Validation checks manifest/count/source hashes/exact anchors/size/write access and returns a no-overwrite plan; apply is a separate request, versioning source-name collisions and using deterministic actor-bound annotation identities.
- Added app-visible export/restore UX: choose destination, load JSON locally, validate, inspect create/reuse/collision/deferred-use counts, then explicitly apply only when overwrite and source-mutation counts are zero. Writing-use target restore remains deferred and visibly named.
- Dogfooded export-to-restore into `quipsly-local-restored-research`. The expanded bundle contains two coaching and two Episode 4 sources, tags, annotations, revision receipts, and deferred private writing uses. After adding the second pair, apply created two and reused two of each source/tag/annotation identity; the immediate retry reused all four with zero creates, zero overwrites, and zero source mutations. Direct readback verified all four hashes, exact anchors, and `restored-from-export` receipts.
- Verification at this checkpoint: Quipsly TypeScript; full Jest 58 suites / 254 tests; mobile source-only contract smoke 47/47; local restore endpoint HTTP 401 before body/private reads when signed out; production-core 22/22 ready; `git diff --check` clean.
- Still open: real authenticated browser export/apply, separate-account privacy, physical iPhone and cross-device annotation decisions, restored writing-use target documents, production/public host recovery, and Studio proof-watch/listen. The local two-coaching/two-episode source-to-writing requirement is satisfied with repository truth, but these are not recorded coaching sessions or complete produced episode flows. No migration-history application, production mutation, deploy, provider call, invitation, calendar action, publication, commit, or push occurred.

## 2026-07-18 - Canonical Research to Studio handoff and native launch repair

- Added `quipsly-research-studio-handoff-v1` on canonical `StudioOutputPacket` rows. A handoff pins one project-visible annotation revision, exact source selector, source SHA-256, tags, and safe writing provenance. Private annotations are blocked; private draft IDs/titles/blocks/bodies are omitted; retries reuse the same revision packet; changed anchors or fingerprints fail closed.
- Research now offers `Send pinned revision to Studio` only for signed-in writers and Nest-visible annotations. The two Episode 4 dogfood annotations produced two real `ready-for-studio` packets at revision 3. Direct local readback verified both exact quotes and hashes, one hidden private writing use per packet, zero source/media mutations, no publish authority, and idempotent retry.
- Extended the existing Firebase bearer-token Mac session envelope and QuipslyStudio Account workbench with a read-only `Nest evidence inbox`. The inbox renders source title, exact quote, annotation note/revision/kind/tags, short hash receipt, human-review requirement, and a count of private links whose contents remain hidden.
- Built and launched the exact `/tmp/quipsly-studio-handoff-derived/Build/Products/Debug/QuipslyMac.app` bundle. Real UI operation exposed a launch freeze: first-layout agent state synchronously crawled `~/Movies/QuipslyExports`, a symlink to the removable `My Passport` drive. Removed the implicit main-thread crawl; queue paths now come only from explicit import/generate state. The rebuilt app became AX-readable in 3.2 seconds, drained the Account command to handled state, and visibly rendered the evidence inbox.
- Fixed agent JSON readback so a re-sanitized numeric zero remains `0` instead of bridging to boolean `false`. The running app now reports numeric `studioEvidenceHandoffCount: 0` and `visibleProjectCount: 0` while signed out.
- Current verification: Quipsly TypeScript passed; Jest 59 suites / 258 tests passed; mobile source-only contract smoke 47/47 passed; production-core reports 22/22 ready; QuipslyMac Debug build succeeded; `git diff --check` passed. ESLint is not installed in the Quipsly package, so the attempted focused lint command could not run.
- Authenticated native packet readback remains open: this Mac has no saved Firebase refresh token, and signed-out `/api/mac/session-check` correctly returns 401 before private reads. Loop back after a real QA native session exists, then verify these exact two packet IDs appear on the Mac under authorized project access and remain absent for a separate unauthorized account. No credentials were entered or created.

## 2026-07-18 - Playback-reviewed transcript correction checkpoint

- Added additive `TranscriptCorrection` and `TranscriptCorrectionRevision`
  models plus reversible migration `20260719001500_add_transcript_corrections`.
  Provider `TranscriptSegment` rows remain immutable; accepted overlays retain
  original SHA-256/text/speaker and unchanged media-time snapshots.
- Nest Session Review now has protected audio/video controls, per-segment play,
  human word/speaker correction, correction history, and AI proposal
  accept/reject. Accepted changes require an explicit listen checkbox and the
  player's actual position inside the segment window. AI output always begins
  proposed and does not change effective transcript text before review.
- Reads, mutations, and idempotent replays all recheck room access and capture
  release evidence. Stale provider text, a newly active overlay, missing
  playback, or a save race fails closed. Transcript runner replacement is now
  atomic and refuses to overwrite a version with correction history.
- Native Firebase session context now carries accessible, released correction
  briefs into QuipslyStudio. The Account workbench has a read-only Transcript
  Review inbox that distinguishes proposals from accepted overlays and sends
  decisions back to the Nest playback desk.
- Local-only dogfood used the real repository Episode 4 Charlie 680–740 second
  WAV and its MLX Whisper draft: 60-second playable source, five timed segments,
  stable source/asset/job lineage, and one filename-derived Charlie speaker
  proposal with one revision. QuickTime opened the exact copied WAV and
  playback advanced through the first segment to six seconds.
- The proposal remains `proposed`; `humanListenPerformed=false`. UI automation
  proved bytes and controls, but Codex cannot hear the speaker output and did
  not fabricate a human approval receipt.
- The additive local schema diff was inspected with no drops and pushed only to
  `localhost:5432/high_ground_studio`; a second diff is empty. Production-core
  readiness is now 24/24 locally. Production and migration history were not
  changed.
- Verification at this checkpoint: Quipsly TypeScript passed; full Jest 61
  suites / 266 tests passed; focused correction service 6/6 and UI 2/2 passed.
  Signed-out GET/POST correction routes and raw playback all returned HTTP 401
  before private evidence. The exact rebuilt QuipslyMac bundle succeeded and
  its Account accessibility tree visibly reads `Transcript review inbox 0`
  plus the AI/protected-playback boundary while signed out. Authenticated
  web/native correction readback remains open.

## 2026-07-18 - iPhone playback-reviewed transcript correction checkpoint

- Added a first-class Transcript Review destination to each eligible retained source in Capture Library. It reads the same canonical Nest correction desk as web and shows immutable provider evidence, effective reviewed overlays, correction history, and quarantined AI proposals.
- iPhone acceptance now requires an exact `recordingAssetId` match between the retained local original and the recording asset backing Nest playback. Missing, deleted, remote-only, preview, mismatched, or not-yet-playable media remains review-only instead of silently falling back to a different recording.
- Native playback seeks the retained `AVAudioPlayer` to the exact segment, records actual player position, and pauses near the review window. Human correction and AI acceptance unlock only while that measured position is inside the server-enforced timestamp window. A checkbox or preview claim cannot unlock the mutation.
- Human word/speaker changes preserve provider text, speaker, SHA-256, and media time underneath the versioned overlay. AI rejection remains available without pretending playback occurred; AI acceptance requires the same exact-source position proof. Neither path creates work, sends notes, moves media, or publishes.
- Added deterministic preview UI for review-state inspection with every mutation disabled and explicit `Preview data — no server actions` plus `Review-only on this iPhone` boundaries.
- Today now answers `what needs review?` with up to eight accessible, release-gated AI transcript proposals. The server reads each candidate through the canonical correction desk and omits held or inaccessible rooms. Each phone row keeps the proposal non-authoritative, names the session/timestamp, shows exact-local-source readiness, and opens the same correction surface instead of inventing a second decision contract.
- The protected Today snapshot can retain proposal readback offline, but all decisions remain disabled without current authority and exact local playback. Transcript review does not complete tasks, change goals, send notes, or mutate provider/calendar/recording state.
- Added a per-session protected transcript-desk cache bound to the signed-in email, written atomically with complete file protection, excluded from backup, capped at 30 days, and cleared on sign-out. Offline users can inspect provider/correction evidence and play an exact retained original; human/AI decisions stay locked until Nest verifies current authority. Cache failures never replace a newer in-memory desk with fabricated data.
- Added protected local correction drafts keyed by account, room, segment, and provider-text SHA-256. Word/speaker/reason edits survive navigation and outages, are visibly `not synced`, fail restoration when provider evidence changes, clear after a successful canonical save or explicit discard, and are erased on sign-out. Offline drafting does not create an accepted overlay or queue a hidden mutation.
- Simulator build succeeded. All 8 primary `CaptureExperienceUITests` passed on iPhone 17 Pro / iOS 26.3.1, including consent, navigation, session planning, accessibility, Today follow-through, and the new transcript/AI boundary journey. Evidence: `/tmp/quipsly-capture-transcript-derived/Logs/Test/Test-HighGroundCapture-2026.07.18_21-24-16--0600.xcresult`.
- Mobile source contract now passes 50/50 checks, including authenticated correction-route, immutable-evidence, exact-source iPhone, AI-quarantine, and no-delivery/no-publication boundaries. App Store static smoke passes 563/563. `git diff --check` remains clean.
- The Today route's signed-out runtime boundary still returns HTTP 401 before private reads. Its focused server contract passes 3/3; Quipsly TypeScript and the full 61-suite / 266-test regression pass. Focused simulator rerun passed both Today resurfacing and transcript-review journeys.
- The focused transcript-review simulator journey additionally passes iOS accessibility audit checks for hit regions, sufficient descriptions, and clipped text.
- Deterministic preview can open the correction editor for UX inspection, but playback proof, canonical save, local draft persistence, AI accept, and AI reject remain disabled. The simulator re-proved that editor boundary and accessibility audit.
- Repaired Capture's existing `Mark` control from toast-only behavior into visible source metadata. Live capture shows mark count and latest audio time without pausing; finalized Library cards reconstruct every numbered timestamp from persisted `user-mark` segment boundaries. The mark remains metadata around immutable bytes, not an audio edit.
- Kept `New session` permanently available in Today's top bar after the richer follow-through content pushed the old Later-section action outside LazyVStack's instantiated viewport. Session-duplication UI proof now checks canonical row identity rather than globally counting a title that legitimately appears in transcript review.
- Final unified iPhone 17 Pro / iOS 26.3.1 run passed all 8 primary journeys after those repairs. Evidence: `/tmp/quipsly-capture-transcript-derived/Logs/Test/Test-HighGroundCapture-2026.07.18_21-49-48--0600.xcresult`. Mobile source/capture contract passes 51/51; App Store static smoke remains 563/563; scoped and repository diff checks are clean.
- This is simulator and static proof, not physical-iPhone or authenticated cross-device proof. Loop back when an iPhone and real QA account are available: retain/upload one real take, load its canonical transcript, play and correct one segment on-device, review one AI proposal, then read the same correction IDs/revisions in Nest and Studio. No production write, deploy, provider/calendar call, invitation, publication, commit, or push occurred.

## 2026-07-18 - Explicit transcript-derived task checkpoint

- Added one deliberate `Make this my task` composer to the shared Nest and iPhone transcript-correction surfaces. Opening the composer creates nothing; only the final `Create my task` decision may create one self-owned `OPEN` ActionItem.
- The server re-reads current room access, release/consent gate, protected playback, transcript segment, accepted correction overlay, and provider-text SHA inside the creation transaction. Stale, held, inaccessible, or mismatched evidence fails closed.
- Each committed task retains the room, transcript job, segment, exact start/end seconds, provider text/hash/speaker, current reviewed overlay snapshot, accepted correction identity, recording asset, playback source, actor, surface, and stable client request identity under `quipsly-transcript-derived-task-v1`.
- Retried requests are idempotent and reauthorize the source before returning the existing task. An identity rebound to different evidence is rejected. Creation does not change transcript/provider evidence, recording bytes, correction overlays, deadlines, reminders, calendar, messages, delivery, or publication.
- Fixed two accessibility defects revealed by operating the combined correction/task composer: the local-draft discard target now meets the 44-point minimum, and correction decisions stack at full width so `Accept reviewed correction` grows under Dynamic Type instead of clipping.
- Focused native transcript/task/a11y proof passed on iPhone 17 Pro / iOS 26.3.1. The final unified native run passed all 8 primary journeys: `/tmp/quipsly-capture-transcript-derived/Logs/Test/Test-HighGroundCapture-2026.07.18_22-09-14--0600.xcresult`.
- Verification passed: focused route/web 7/7; full Quipsly Jest 62 suites / 271 tests; TypeScript; mobile source contract 52/52. Running local POST while signed out returned HTTP 401 before private evidence reads.
- Authenticated task creation and cross-device readback remain unproven without a real QA session. Required loop-back: play a released exact-source segment on a physical iPhone, create one real task from it, verify the identical task and source receipt in Today, Work, Schedule, the session, and a second client, then reopen the exact recording timestamp. No production write, deploy, provider/calendar call, invitation, publication, commit, or push occurred.

### Exact transcript-task source return checkpoint

- Promoted `quipsly-transcript-derived-task-v1` into a shared, fail-closed source-anchor parser. Work and mobile Today only expose the anchor when schema, room, job, segment, ordered media time, provider SHA-256, effective reviewed text, recording asset, and playback source are complete and the task room still matches.
- Work now shows the reviewed transcript speaker/text and returns to the exact Session segment hash. The Session correction desk scrolls and focuses that segment after load instead of dropping the user at the top of a long transcript.
- Native Today now offers a visible `Return to 00:03–00:04` action for a transcript-derived task. It opens the shared transcript review surface at the preserved segment and retained recording source, identifies that it was opened from task evidence, and never starts playback automatically.
- Operating the new Today journey exposed a real SwiftUI infinite-layout regression: scrolling the source link into a giant lazy/grouped follow-through card trapped the app in `LazySubviewPlacements` / `AttributeGraph` updates until XCTest timed out. Today now uses its bounded non-lazy stack and smaller labeled accessibility landmarks, removing the cycle and improving VoiceOver control granularity.
- Focused Today-to-source and transcript-review journeys pass. The final unified iPhone 17 Pro / iOS 26.3.1 simulator run passed 10 tests, skipped 1 explicit environment-dependent test, and failed 0: `/tmp/quipsly-capture-transcript-derived/Logs/Test/Test-HighGroundCapture-2026.07.18_22-46-20--0600.xcresult`.
- Refreshed verification passes: full Quipsly Jest 62 suites / 273 tests, Quipsly and shared-domain TypeScript, mobile source contract 52/52, App Store static contract 563/563, and `git diff --check`.
- This proves the deterministic simulator and local contract round trip, not authenticated or production truth. Required loop-back remains: use a released recording on a physical iPhone under a real QA account, create the task, verify the identical task/source IDs in Today, Work, Schedule, Session, and a second client, manually play the exact timestamp, and then repeat after editing/resurfacing. No production write, deploy, provider/calendar call, invitation, publication, commit, or push occurred.

### Portable research writing-target restore checkpoint

- Portable Research exports now include a typed, SHA-256-manifested snapshot of each eligible writing-use target document and referenced block. Another member's private draft link is excluded unless the exporter created that use; project-visible writing targets remain portable.
- Validation binds every writing target to its exported use, annotation, document, and block identities; malformed dates, repeated IDs, inconsistent shared-document snapshots, and block/document rebounds fail before Prisma opens. Older valid exports without target snapshots remain accepted and report those legacy links as deferred.
- Restore creates private excerpt documents containing only the referenced blocks and says so explicitly; it never claims the original full document was exported. Source text, existing documents, and existing blocks are never overwritten. Each create/reuse decision is deterministic, actor-bound, reversible, and backed by restore provenance plus a `StudioDocumentOperation` receipt.
- Writing-link identity now includes the verified use+target snapshot digest. Retrying an identical export reuses the same document, block, annotation, and use IDs. A later export whose referenced writing bytes changed creates a new private excerpt/link version while leaving the first version untouched.
- The opt-in local PostgreSQL smoke created and inspected a real source, tag, annotation, private excerpt document/block, evidence link, and receipts; granted a second actor Viewer access; retried the same package; then restored a changed block snapshot. It proved the creator can resolve the private link while the second authorized actor and signed-out predicate both receive zero writing-use rows, first-retry ID reuse, changed-snapshot versioning, exact preserved source bytes, private projection status, zero overwrites, and 0 temporary workspace/account leftovers after cleanup.
- Verification passes: focused portability/export/restore 10/10; opt-in local DB smoke 1/1; full Quipsly Jest 62 passing suites / 277 passing tests with the DB smoke skipped by default; Quipsly and shared-domain TypeScript; mobile source contract 52/52; `git diff --check`.
- Authenticated browser download/validate/apply/readback, second-account privacy through the real UI, and cross-device writing-open behavior remain unproven until a real QA session is available. No production write, deploy, provider/calendar call, invitation, publication, commit, or push occurred.

### Schedule exact-source continuity checkpoint

- Schedule now parses the same fail-closed `quipsly-transcript-derived-task-v1` source receipt used by Work and Today and exposes it only when the preserved room ID still matches the ActionItem relationship.
- An accepted transcript-derived task shows its reviewed speaker/text and exact Session timestamp in the committed-work lane. The focus picker names it as reviewed transcript work, and a saved focus block retains the same source return instead of flattening the task to a title.
- Planning, moving, completing, skipping, or canceling the focus block remains independent from task state, deadlines, transcript truth, recording evidence, and external calendars. The source link only navigates to the exact review segment; it does not autoplay or mutate evidence.
- Focused Schedule model/page/planner proof passes 13/13. Full Quipsly Jest passes 62 suites / 277 tests with the opt-in DB smoke skipped, TypeScript passes, mobile source contract remains 52/52 with Schedule included in the exact-source invariant, App Store static checks pass 563/563, and `git diff --check` passes.
- Real-account persistence is still required: create the task from released playback, plan it, reopen the same task/segment from Schedule and iPhone, complete only its focus block, and verify the task stays open on a second client. No external calendar mutation, production write, deploy, invitation, publication, commit, or push occurred.

### Evidence-aware next-day Today checkpoint

- Reworked mobile Today's committed-task selection from raw database order into a bounded relevance order: focus blocks beginning within 24 hours, overdue/due-within-24-hours commitments, recently created reviewed-transcript work, then ordinary open tasks. A task planned later in the seven-day planning horizon no longer masquerades as today's focus.
- Added an app-visible explanation for every elevated task. The iPhone shows `Planned focus`, `Overdue commitment`, `Due within 24 hours`, `Reviewed transcript follow-through`, or the combined planned/reviewed state while preserving the exact reviewed speaker, words, session, and source-return action.
- Ranking reads at most 200 actor-visible open rows and returns at most 20. It still quarantines unreviewed transcript candidates and has no implicit calendar, provider, reminder, delivery, publication, transcript, correction, recording, or source mutation.
- Focused route proof passes 3/3 and explicitly covers a future planned task not receiving today's priority. Quipsly TypeScript, the generic iOS simulator build, 52/52 source contract, and the focused Today exact-source simulator journey pass. Visible iPhone 17 Pro preview evidence is `/tmp/quipsly-today-ranked.png`.
- Real elapsed-day and cross-device proof remains open. Required loop-back: create a no-deadline task from reviewed physical-iPhone playback, leave it open overnight, verify the same ID/source outranks newer generic work the next day in Capture and Nest, then complete it and read its receipt from another client. No production write, deploy, provider/calendar call, invitation, notification, publication, commit, or push occurred.

### Canonical task navigation checkpoint

- Replaced display-only copies of accepted tasks in Session Review, Schedule, and Goal linked-work rows with links to `/work?task=<same ActionItem ID>`.
- Work resolves requested task/goal IDs only inside its already actor-scoped snapshot. The exact card receives a stable element ID, visible ring, programmatic keyboard focus, and centered scroll; deep links to DONE/CANCELED work switch to `All` so the record remains visible.
- Focused Work and Schedule tests pass 11/11, including a completed-task deep link and focus assertion. Quipsly TypeScript passes. The unified source contract adds the canonical-deep-link invariant and passes 53/53.
- Operated the real local `/work` route in the in-app browser. The available browser session was signed out, and the page correctly rendered `Sign in to Studio` before private reads. No mock task or local-operator bypass was introduced to manufacture visual proof.
- Notification and global-search task entry points plus authenticated cross-client focus remain open. Required loop-back: use a real QA account, open one same-ID task from Session, Schedule, Goal, Nest, iPhone Today, and a second client, then repeat after completing and reopening it. No production write, deploy, OAuth grant, provider/calendar call, invitation, message, publication, commit, or push occurred.

### Nest project follow-through checkpoint

- Added a dominant Project follow-through panel to each signed-in Nest dashboard so documents, media, goals, and committed work finally meet in the project context rather than forcing a jump to a disconnected queue.
- Project goals are owner-only. Project tasks must first relate through a matching Session slug or an actor-owned project Goal, then independently pass the same assignment/Session participant, creator, client, or coach access boundary. Another collaborator's task is not exposed solely through project access.
- The panel links goals/tasks to the same canonical Work IDs and carries exact transcript return when the fail-closed source receipt still matches its room. Unreviewed transcript candidates remain outside committed work.
- Added `nest-project-follow-through.ts` as the shared read boundary plus focused UI coverage. A real disposable-PostgreSQL smoke created two actors, separate rooms, actor/other goals, accepted room/goal-linked tasks, an unreviewed candidate, and another actor's private task. The actor received exactly one owned goal and two accepted tasks; source time survived; the other task remained stored but invisible; cleanup left zero smoke tasks, goals, workspaces, or users.
- Full Quipsly regression passes 63 suites / 279 tests with two opt-in DB suites skipped; the new DB smoke passes 1/1 when enabled. Quipsly/shared-domain TypeScript, 54/54 source contract, 563/563 App Store static contract, and diff checks pass.
- Authenticated browser rendering and physical/cross-device readback remain required. The local browser correctly stopped at the private sign-in boundary; no operator bypass or fake data was added. No production write, deploy, OAuth grant, provider/calendar call, invitation, message, publication, commit, or push occurred.

### Permission-filtered Search All checkpoint

- Added `/find` plus a persistent desktop Search All control and mobile More entry. One read-only query spans tasks, goals, Sessions, documents, sources, and annotations and routes canonical work back to `/work?task=`, `/work?goal=`, `/sessions/`, or the exact document/research context.
- Access inputs are explicit: the page resolves visible Nests once, then passes those IDs into a pure search query. Tasks/Sessions remain actor scoped; goals require ownership or accessible Session/booking context; sources/documents stay inside visible Nests; private annotations require creator identity. Unreviewed transcript candidates are filtered out.
- Search requires 2 characters, caps normalized input at 120 characters, returns at most 10 per kind, bounds research handoff URLs, and fails honestly without sample results. It has no mutation or provider/calendar/message/publication path.
- Focused proof passes 5/5 across query and rendered page contracts. The disposable-PostgreSQL Nest smoke now also searches the live mixed-privacy fixture and returns only the exact actor task; cleanup remains zero. Full Quipsly regression passes 65 suites / 285 tests with two opt-in DB suites skipped; TypeScript, 55/55 unified source contract, 563/563 App Store checks, and diff checks pass.
- Indexed full-text scale and latency remain unproven; do not claim the one-million-token/sub-second acceptance bar from this bounded query implementation. Authenticated browser/cross-device search and notification deep links remain open. No production write, deploy, OAuth grant, provider/calendar call, invitation, notification, message, publication, commit, or push occurred.

### Immutable transcript-version checkpoint

- A cross-runner audit found destructive transcript retry behavior in both Quipsly and the legacy web coaching path: stored provider segments were deleted before replacement. That would invalidate JSON source anchors used throughout task, correction, schedule, Today, search, Nest, and Studio surfaces.
- Both runners now stop before media/provider work when an existing transcript version has segments. Quipsly returns `TRANSCRIPT_VERSION_IMMUTABLE`; its retry route creates a new queued version with explicit prior-job and prior-segment receipts. Segment insertion plus completion is transactional, and no runtime segment delete remains.
- Updated the lifecycle static audit to reflect the safer packet architecture: packet generation creates review candidates, never ActionItems; only explicit ACCEPT may materialize committed work. The provider egress assertion now enforces current all-party audio/video consent language.
- Real local PostgreSQL proof created v1 + anchored task + v2 and read back the original segment ID, exact words, 12.25-17.5 timing, and task source unchanged. Test cleanup was independently queried and left zero fixture rooms, users, and tasks.
- Verification passes: Quipsly 67 suites / 290 tests (three opt-in DB suites skipped), focused transcript runner/route 5/5, web transcript/packet 5/5, transcript-version DB smoke 1/1, all three relevant TypeScript checks, source contract 56/56, live local mobile capture contract 79/79, lifecycle static audit, and `git diff --check`.
- The local dev server was restarted after Prisma regeneration; this resolved stale-client HTTP 500s, and the full signed-out runtime boundary then passed. Real provider transcription and authenticated physical/cross-device retry proof remain open. No external write or irreversible action occurred.

### Canonical attention checkpoint

- Added a persistent Attention control that routes to the existing Work Queue with a derived `ATTENTION` lens. It does not create a notification record or claim an unread state.
- The server snapshot marks only open overdue work, due-within-24-hours work, and recently accepted reviewed-transcript follow-through. Later-week tasks stay out. Cards retain the same ActionItem ID, status controls, Session link, and exact transcript segment return.
- Completing/canceling work removes it from Attention in the current client snapshot; reopening recalculates urgency. The attention URL survives sign-in redirect while unauthenticated access still performs zero private reads.
- Focused model/client/page/sidebar proof passes 20/20. Full regression is 67 suites / 293 tests with three opt-in DB suites skipped; all relevant TypeScript checks, 57/57 source contract, 80/80 live local contract, lifecycle static audit, and diff checks pass.
- This deliberately does not claim push notification, local reminder, badge, or delivery proof. Those require an explicit opt-in product contract and physical-device acceptance rather than a decorative bell.

### Tag discovery and taxonomy-truth checkpoint

- Search All now includes active project-scoped Studio tags from only the actor's visible Nests and opens Research with the exact tag label.
- Corrected a semantic bug in Research: the available project taxonomy is now `tagCatalog`, not “tags applied to this source.” Search/filter matching uses tags actually attached to annotations and evidence, so an unused catalog tag no longer makes every source appear tagged.
- The mixed-privacy PostgreSQL smoke created and found a private `Episode workflow` taxonomy tag through explicit project visibility, then removed every fixture; independent readback returned zero tags/workspaces/users. Focused Search/Research coverage passes 14/14.
- Architecture boundary is explicit: StudioTag is the semantic project taxonomy; StudioMediaTag remains a separate operational media label. Work/session entities need canonical project foreign keys plus explicit joins before tagging. No JSON tag strings or generic polymorphic assignments were added.
- Full regression is 67 suites / 294 tests; relevant TypeScript, 57/57 source contract, 80/80 live local contract, and diff checks pass.

### Calendar identity and cancellation checkpoint

- Google event creation now uses a deterministic calendar+booking SHA-256 ID. A provider-success/local-receipt-failure retry recovers POST 409 into PUT of the same event instead of duplicating the appointment.
- Cross-calendar receipt reuse is blocked. Provider mutation is followed by one local transaction for CalendarEventLink, CoachingBooking, and Appointment receipts.
- Fixed authorization so sync, manual receipt attachment, reschedule, Quipsly cancellation, and provider cancellation require the assigned coach, room creator, or staff. A generic active coach profile is no longer sufficient for a guessed booking ID.
- Added separately confirmed provider cancellation after Quipsly-first cancellation. It recovers the provider event hidden behind `cancel-planned`, records 404/410 as already absent, preserves booking history, and exposes the staff button only while an external event still exists.
- Calendar unit proof passes 7/7; scheduling contract 19/19. Full Quipsly is 68 suites / 301 tests with three DB suites skipped; all relevant TypeScript, 57/57 source, 80/80 live local, lifecycle, 563/563 App Store, and diff checks pass.
- This is code/mock/local proof only. No real Calendar credential or event was touched. Credentialed provider replay, reschedule, cancellation, and invite-delivery readback remain mandatory before production-ready claims.

### Source-linked session brief checkpoint

- Upgraded deterministic transcript packets from speaker counts plus opening/closing excerpts into separate candidate decisions, goals, questions, commitments, and key moments.
- The classifier/shape lives in shared `coaching-packet` domain code and is used by both Quipsly and legacy web builders. Each item retains segment ID, speaker, exact media time, and bounded text; the summary source stores `quipsly-transcript-packet-brief-v1`.
- Briefs are candidate-only and human-review-required. Packet generation still creates zero goals and zero ActionItems, preserving the explicit acceptance boundary.
- Focused Quipsly 4/4, web 5/5; full Quipsly 68 suites / 302 tests; TypeScript, 57/57 source, 80/80 live local, lifecycle/scheduling audits, and diff checks pass.
- Real usefulness proof and explicit goal-candidate acceptance remain open; no provider, production, message, calendar, or publication side effect occurred.

### Explicit transcript-derived goal checkpoint

- Added explicit `Make this my goal` / `Create my goal` interactions to both Nest and iPhone transcript review. The composer itself is non-mutating; the final action creates one actor-owned ACTIVE canonical Goal.
- The route re-reads the current correction desk inside its transaction, checks access, release/playback evidence, segment identity, and provider hash, and stores the exact transcript/recording receipt behind a deterministic actor+request identity. It creates no task, target, reminder, focus block, calendar event, message, delivery, or publication.
- Work and personal Schedule now retain goal transcript provenance just as tasks do. A room-matched goal or focus block returns to the same segment/time; partial or room-mismatched source JSON fails closed.
- Disposable PostgreSQL created transcript v1 + source-linked canonical goal + transcript v2 and read back the untouched v1 goal anchor. Cleanup independently returned zero smoke users, rooms, and goals.
- Native iPhone 17 Pro simulator build passed. The focused UI journey opened the goal composer, proved preview creation disabled, showed the negative side-effect contract, and passed accessibility audit. Focused Jest is 34/34; full Quipsly is 69 suites / 309 tests with three opt-in DB suites skipped; legacy web packet/release is 7/7; TypeScript, 58/58 source, 81/81 live local, lifecycle, 19/19 scheduling, 563/563 App Store static, and diff checks pass.
- Mobile Today now carries the exact goal source receipt and opens it on iPhone. A mismatched room fails closed. Simulator proof caught and fixed an accessibility collision between task and goal source buttons: each now has a distinct spoken label and independent identifier. Both exact-source Today journeys pass; full Quipsly remains 69/309, source 58/58, live local 81/81, App Store static 563/563, and diff checks clean.
- Still required: real signed-in physical-iPhone creation from released episode and coaching audio, same-ID cross-surface readback, and human progress/completion use. No production/provider/calendar/message/publication/deploy/commit/push action occurred.

### Packet goal-candidate review checkpoint

- Packet goal candidates now render as exact-source review cards in Nest and iPhone transcript review. Viewing remains non-mutating; accept, edit, defer, and reject are explicit actor decisions.
- The candidate builder revalidates the current completed transcript segment and provider-text SHA-256. A serializable goal-review route locks the current packet summary, rejects stale evidence, writes edit/defer/reject receipts without work, and atomically creates one canonical Goal plus receipt only on accept.
- Accepted candidates resolve to the same canonical Goal ID and link into Work. Fixed refresh feedback on the web and form resynchronization after edited truth reload. iPhone preserves the same candidate status, exact timestamp/source return, and mutation boundary; Preview/offline decisions are disabled.
- Focused web proof passes 17/17; full Quipsly is 72 suites / 319 tests with three opt-in DB suites skipped by default. The enabled transcript-version PostgreSQL smoke retained the accepted packet-goal receipt and exact v1 anchor after v2, then cleanup readback returned zero smoke users, rooms, goals, and notes. TypeScript, 59/59 source, 85/85 live local, lifecycle, 563/563 App Store static, native build, and diff checks pass. The focused iPhone 17 Pro journey passed with hit-region, description, and clipped-text accessibility audit after multiline title fields fixed a Dynamic Type clipping failure.
- Real-audio judgment, authenticated cross-surface readback, and physical-device use remain required. No production/provider/calendar/message/publication/deploy/commit/push action occurred.

### iPhone packet task-review checkpoint

- Capture now reads packet action candidates on the same transcript screen as packet goals. Cards retain exact media time/speaker/source return and the current server review status.
- Native accept/edit/defer/reject calls the canonical action-review ledger; only accept creates one unassigned ActionItem. Preview/offline modes lock all decisions. No parallel local task projection was introduced.
- Corrected Preview source continuity so its displayed task and goal suggestions are actually present in the matching transcript segment. The longer truthful fixture exposed title clipping; packet and direct task/goal title fields now support multiline Dynamic Type layout.
- Source contract remains 59/59 and App Store static 563/563. Native build passes; the focused iPhone 17 Pro journey exercised task and goal cards, source links, edit states, disabled Preview writes, and the full accessibility audit.
- Real signed-in physical-device acceptance and same-ID Today/Work/Nest/Studio readback remain required. No production/provider/calendar/message/publication/deploy/commit/push action occurred.

### iPhone Today goal check-in checkpoint

- Native Today now uses the canonical Goal progress ledger rather than a local projection. A goal card shows its latest percent/evidence and opens an explicit progress/evidence form; Preview and protected offline snapshots remain inspectable but read-only.
- The mobile action requires goal ownership and the current `updatedAt`, appends one `GoalProgressReceipt`, records the `ios-capture-today` surface, and leaves goal status/achievement, tasks, plans, providers, Calendar, messages, delivery, and publication unchanged.
- Route proof passes 5/5. Disposable PostgreSQL route proof passes 1/1 with one 75% receipt and an unchanged ACTIVE goal; cleanup readback is zero. Two actual iPhone 17 Pro Today journeys pass, including exact-source navigation and disabled Preview mutation.
- Full evidence: Quipsly 72 suites / 321 tests with four DB suites skipped by default; relevant TypeScript passes; 60/60 source and 88/88 live-local mobile contracts pass; packet/lifecycle gates and 563/563 App Store static checks pass; native build and diff checks pass.
- Production remains unavailable before application routes across all checked Quipsly/High Ground hosts, and gcloud user/ADC credentials are expired. Reauthenticate, then inspect billing and Cloud Run read-only before any deploy. Physical-device authenticated use, cross-device same-ID readback, separate-account privacy, and real episode/coaching check-ins remain required.

### Canonical project and work/session tag checkpoint

- Added nullable canonical `projectId` foreign keys to Sessions and Tasks, preserved legacy slugs, and introduced explicit audited tag joins for Task, Goal, and Session over the shared `StudioTag` taxonomy. The reversible migration backfills only unique/unanimous matches and leaves ambiguity unresolved.
- Work can now file new Tasks/Goals into an editable Nest, show project/tag chips, and replace tags with entity ownership, Owner/Editor, active same-Nest tag, and optimistic revision checks. Viewer UI remains read-only and server enforcement is rechecked in the transaction. Actor-visible Session access alone cannot expose hidden project/tag metadata.
- New Capture Sessions plus Session-context, exact-transcript, and packet-accepted work inherit canonical project identity. Nest follow-through prefers the foreign key while retaining a labeled slug fallback.
- iPhone Today visibly reads the same Nest/tag context. The focused iPhone 17 Pro journey operated the actual preview card and verified `High Ground Odyssey`, `Proof listen`, and the exact transcript return; native build passes.
- All 77 Quipsly suites / 329 tests pass with five real local database suites enabled. The new journey proved Task/Goal/Session tag persistence plus cross-Nest, Viewer, stale-revision, and second-actor rejection; cleanup is zero. Quipsly/shared-domain/legacy-web TypeScript, Prisma validation/generation, source 61/61, live local 89/89, packet/lifecycle, App Store 563/563, and diff checks pass.
- Production migration, authenticated browser/iPhone use, physical-device and cross-device same-ID proof, Studio readback, and separate-account privacy remain open. No production write, deploy, provider/calendar mutation, invite, message, delivery, publication, commit, or push occurred.

### Canonical Session to Studio handoff checkpoint

- Session Review now shows and permission-checks canonical Nest tags, then reads per-recording Studio handoff truth from real `RecordingAsset` promotion manifests plus unique `StudioAssetAttachment` receipts. Attached recordings open the exact project/episode editor; missing receipts and project conflicts are explicit holds.
- Recording promotion now treats the Session's relational project as authoritative, refuses silent cross-Nest promotion, snapshots only same-project tag provenance, and preserves original bytes. New media/source/attachment/workflow/episode/manifest writes commit together; replay reuses the one episode source without duplicate imported media or jobs.
- Studio episode inventory now uses the authorized project ID, canonical room `projectId`, real project `name`, and Session-context provenance. The editor links each handed-off source back to its Session and labels tag names as a snapshot rather than canonical assignments.
- The actual iPhone Record Session chooser now receives and displays the canonical relational project, holds unfiled Sessions instead of inventing a destination, labels legacy-slug fallback, and omits a client slug during canonical promotion so server-side Session truth remains decisive.
- Disposable PostgreSQL dogfood promoted and replayed an Episode 4 room mix with a Proof-listen tag through the actual inventory route. Counts remained one attachment/source/media/imported item across replay; cleanup independently returned zero handoff users/projects/assets/sources. The run found and fixed invalid `orderIndex`, project `title`, and non-unique slug queries that static typing had missed.
- Verification passes: 81 Quipsly suites / 341 tests with all six database suites enabled; Quipsly/shared-domain/legacy-web TypeScript; 62/62 source and 90/90 live-local contracts; packet/lifecycle gates; App Store static 563/563; and diff checks. The focused real-shell journey `CaptureExperienceUITests.testCaptureFirstNavigationKeepsFourFocusedDestinations()` passed on iPhone 17 Pro / iOS 26.3.1 (`Test-HighGroundCapture-2026.07.19_02-37-59--0600.xcresult`) and visibly found High Ground Odyssey on the Session chooser. No production write, migration, deploy, provider/calendar call, invitation, message, delivery, publication, commit, or push occurred.
- Physical-iPhone/authenticated cross-surface use, separate-account privacy, real HGO proof-watch/listen, real coaching handoff, and authorized production readback remain open acceptance gates.

### iPhone local-first quick Note, Task, and Goal checkpoint

- Record now exposes Note, Task, and Goal as an immediate `Capture the work` action bar, with the current Session/Nest visible and an honest protected-local-first Save boundary.
- Added a file-protected, actor-partitioned outbox with stable request UUIDs, last-known-good recovery, automatic retry for transient failures, and visible held state for access or validation failures. Account switching cannot upload or reveal another actor's queue.
- The authenticated mobile route writes canonical private Session notes, assigned Tasks, and owned Goals under the Session's authoritative project. Exact source receipts and deterministic IDs make replay idempotent; no Calendar, provider, message, delivery, publication, or media side effect is reachable.
- Session Review reads the actor's same canonical records back. Task and Goal deep-link to the exact Work IDs; Notes stay private to the Session. No copied mobile-only work model was added.
- Actual disposable-PostgreSQL use committed Note/Task/Goal, replayed Task at count one, denied a second actor, and cleaned all fixture rows to zero. The running local route returned signed-out 401 before private reads.
- Proof passes: 84 Quipsly suites / 357 tests with all local DB suites enabled; focused API/helper 14/14; Session Review 5/5; all relevant TypeScript; 63/63 source and 91/91 live-local contracts; lifecycle, coaching-handoff, App Store static, native build, and diff checks. The focused iPhone 17 Pro / iOS 26.3.1 real-shell journey passed 1/1 (`Test-HighGroundCapture-2026.07.19_02-57-12--0600.xcresult`).
- Still required: signed-in physical-iPhone offline save, kill/relaunch recovery, authenticated same-ID Nest readback, and separate-account privacy proof. The locked Mac prevented an additional computer-use visual audit; XCUITest remained available and passed. No production write, deploy, provider/calendar call, invitation, message, delivery, publication, commit, or push occurred.

### Unified Nest operating shell checkpoint

- The primary Nest shell now matches the daily product loop: Today, Inbox, Work, Sessions, Library, and Calendar. Nests, Research, production, Publishing, and administration remain reachable under More; mobile web keeps the first four plus More.
- New Today is a bounded canonical read: one upcoming Session, four timezone-aware chosen blocks, three evidence-aware attention Tasks, and two owned Goals. It deduplicates planned Tasks, excludes unreviewed transcript proposals, and filters project names through explicit Nest access.
- New Inbox reads the newest packet from actor-accessible Sessions and separates ready, revise, and deferred action/goal/lane proposals. Exact segments return to Session Review; accepted/rejected proposals leave triage. It makes no unread, assignment, schedule, delivery, or publication claim.
- Disposable PostgreSQL created two actors and complete private Today/Inbox fixtures. The actor saw only the actor Episode Session, plan, Task, Goal, and proposal; the other actor's records stayed stored and invisible. Independent cleanup returned zero fixture users/workspaces/projects/rooms/tasks/notes/goals.
- The in-app browser operated the live local shell from Today to Inbox, found all six exact destinations and correct page titles/callbacks, and logged no console errors. The unsigned browser stopped at the private-data gate, so authenticated rendered records remain an explicit loop-back rather than being simulated.
- Proof passes: 87 suites / 363 tests with all local DB suites enabled; focused shell 7/7; DB loader 2/2; all relevant TypeScript; 64/64 source and 92/92 live-local contracts; App Store 563/563; lifecycle/handoff gates; diff checks.
- Still open: authenticated real-data UI, same-ID cross-surface operation, physical iPhone, separate-account UI privacy, production reachability, and future canonical research/share/import Inbox lanes. No production write, deploy, provider/calendar call, invitation, message, delivery, publication, commit, or push occurred.

### Dedicated Calendar checkpoint

- `/schedule` is now visibly Calendar rather than a second Today or a generic production runway. It centers personal focus blocks, upcoming Sessions, and accepted Tasks available to plan; the unrelated five-lane production board no longer competes for attention here.
- The surface explicitly separates personal planning, Quipsly Session time, and provider-event receipts. Focus completion does not complete work, and planning never changes deadlines/targets, sends invitations, or mutates an external calendar by implication.
- The in-app browser rendered the live local `Calendar - Quipsly` hierarchy and exact signed-out callback with zero console errors. Authenticated real records remain open rather than bypassed.
- Focused Calendar proof passes 18/18; full Quipsly remains 87 suites / 363 tests with all local DB suites enabled; TypeScript, 64/64 source, 92/92 live-local, and diff checks pass.
- Required real-use loop-back: plan, move, and complete real episode/coaching focus blocks; verify Tasks/Goals stay unchanged; compare provider-linked and Quipsly-only Sessions; then perform separate authorized provider replay/cancel/invite readback. No external or production mutation occurred.

### Canonical Library checkpoint

- Library now indexes canonical Session, Research source, Document, Studio media, and actor-owned saved-capture identities without creating a parallel record model. Exact links continue at the same ID and Research validates the requested source against the already authorized snapshot.
- Permission projection is fail-closed: Session access is actor-scoped, Nest metadata requires separate project visibility, and private source annotations are visible only to their creator. Capture media already promoted to Studio is deduplicated beneath its owning Session; standalone reusable media remains visible.
- Actual local-database use proved one actor could see the intended Session with two transcript segments, two visible annotations, exact episode manuscript, standalone media, and personal saved capture while a second actor's room, private note, and bookmark stayed stored but absent. Cleanup readback returned zero fixture users.
- The running local app exposed Library in primary navigation and enforced the real private sign-in gate with a `/library` callback. Full proof is 89 suites / 369 tests with all DB smokes enabled, focused 9/9, Library DB 2/2, Quipsly TypeScript, and source contract 64/64.
- Authenticated real-record card operation, second-account rendered privacy, physical-iPhone promotion/readback, and production reachability remain open. No production or external mutation occurred.

### iPhone personal-source to Nest Inbox checkpoint

- iPhone `Capture the work` now includes a local-first Source action for a URL or quoted passage. Source does not require or invent a Session/Nest; the composer says `Personal Inbox` and `Not chosen yet` while reusing the protected actor outbox and stable retry ID.
- Nest saves URL capture as the existing actor-owned Bookmark identity and text capture as the existing actor-owned Snippet identity. Inbox reads all actor-owned unfiled sources, never another actor's, and opens the exact ID in Collections before any deliberate Research filing.
- Disposable PostgreSQL proved URL/text creation, exact replay, actor ownership, second-actor exclusion, and cleanup. Full web proof is 90 suites / 375 tests; focused 21/21; enabled DB 4/4; TypeScript and source 64/64 pass.
- Native build passes. The actual iPhone 17 Pro / iOS 26.3.1 journey opened Source, verified the private/unfiled destination, entered a URL, and proved Preview created no pending record (`Test-HighGroundCapture-2026.07.19_03-45-04--0600.xcresult`). Local web Inbox enforced its private callback.
- Still open: iOS Share Extension intake, physical offline/relaunch sync, authenticated same-ID cross-device readback, explicit Research filing/provenance, separate-account rendered privacy, and production reachability. No production or external mutation occurred.

### Protected iOS Share Sheet intake checkpoint

- Added and embedded a genuine iOS Share Extension for URLs, webpages, and text. It never authenticates or uploads independently; it accepts Post only when the containing app has published a verified owner snapshot and stages one bounded, atomic, file-protected envelope in the shared app group.
- Capture imports only a matching-owner envelope into the existing protected Source outbox, preserves the staging UUID as the retry identity, commits locally before deleting the handoff, and leaves mismatched-account files sealed. Pending UI now shows the exact shared URL and the honest `Saved on iPhone · waiting for Nest` boundary.
- Actual Safari and iOS Share Sheet journeys pass on iPhone 17 Pro / iOS 26.3.1 for both states: signed out finds Quipsly but cannot Post; signed in posts and sees the exact pending source in Capture. The combined order-independent suite is `Test-HighGroundCapture-2026.07.19_04-16-04--0600.xcresult`.
- Debug and Release simulator builds pass embedded-extension validation. Plist/entitlement lint, source contract, and diff checks pass. Physical-device offline/relaunch sync, authenticated same-ID Nest readback, separate-account rendered privacy, and explicit Research filing remain open. No production or external mutation occurred.

### Deliberate personal-source to Research filing checkpoint

- Collections now lets a signed-in owner explicitly choose a writable Nest and file a private Snippet/Bookmark into Research. One serializable transaction creates the canonical `StudioSourceUnit` and a provenance receipt; the personal capture stays unchanged and retries converge on the same source.
- Inbox removal follows the committed filing receipt instead of a UI assumption. Collections retains the original and canonical source links. Research exposes capture provenance while returning to the private original only for its owner.
- Passage text and source URL are preserved. A bookmark remains honest link evidence with `pageContentImported: false`; private notes/metadata are not copied. Another actor and a Viewer both produced zero writes in disposable PostgreSQL.
- Proof passes: Prisma format/validate/generate and exact local migration; focused UI/model 18/18; database filing 3/3 with zero cleanup; full Quipsly 91 suites / 379 tests with all DB smokes enabled; TypeScript; source contract 66/66; diff checks. Signed-in real browser use, physical-iPhone origin, rendered collaborator privacy, and production schema/readback remain open. No production or external mutation occurred.

### Selected-passage webpage provenance checkpoint

- Share envelope v2, the protected outbox, and the authenticated quick-entry route now carry exact selected text separately from its validated HTTP(S) webpage URL. Nest stores a passage as a source-linked Snippet with original device capture time; later Research filing preserves that time instead of the delayed sync timestamp. URL-only sharing remains a Bookmark.
- Actual iOS operation caught that Safari's contextual selection Share exports only `public.plain-text`. The extension now includes Apple's documented webpage preprocessor, limited to current URL/title/explicit selection. The proven interaction keeps text selected and uses Safari page Share; a truly text-only provider remains allowed but visibly says `Text only · no webpage` rather than inventing provenance.
- The focused iPhone 17 Pro / iOS 26.3.1 journey visibly reached `Passage + webpage`, posted, and read both `Example Domain` plus `example.com` from Capture's protected pending card. Ordinary URL share still reads `Web link`; the unsigned boundary still disables Post.
- Web proof passes: 91 suites / 382 tests with every database smoke enabled, TypeScript, Prisma validation, source contract 67/67, plist/entitlement/JavaScript lint, and diff checks. The final actual-system Share suite passes 3/3 with zero skips/failures at `/Users/wall-e/Library/Developer/Xcode/DerivedData/HighGroundCapture-gkbduygtikskhbarozfvqyxytyrq/Logs/Test/Test-HighGroundCapture-2026.07.19_05-03-47--0600.xcresult`; the current Release simulator build also passes with the embedded extension and webpage preprocessor. Physical-iPhone, real-account/cross-device, separate-account rendered privacy, actual HGO/coaching source filing, and production migration remain open. No production or external mutation occurred.

### Duplicate-safe source receipts and visible capture history checkpoint

- URL and passage content now have one actor-owned source identity while each deliberate request has its own immutable receipt. Exact request replay is idempotent; a new share of the same evidence increases capture history without creating another Bookmark/Snippet. A database check requires each receipt to point to exactly one correctly typed source.
- Inbox orders by latest receipt time and shows the capture count. Collections exposes the latest date and up to ten timestamped/title-preserving receipts, with an honest legacy-history state. Research filing pins the earliest receipt time and count at filing while leaving the private source/history unchanged.
- Actual disposable-PostgreSQL route use proved one URL plus one passage each remained one source after two distinct captures, retained two receipts, and did not gain a third receipt on exact replay. Filing proof used a twice-captured passage and retained the first capture timestamp in canonical Research provenance.
- Proof passes: focused API/helper 23/23, Inbox/Collections 8/8, database 5/5; full Quipsly 91 suites / 385 tests with every database smoke enabled; TypeScript; Prisma validation/generation; exact local migration plus target constraint; source contract 68/68; Share Extension JavaScript/plist/entitlement lint; diff checks. Physical-iPhone offline/relaunch, authenticated cross-device history, rendered second-account privacy, real HGO/coaching filing, and authorized production migration remain open. No production or external mutation occurred.

### iPhone protected-source relaunch and owner-isolation checkpoint

- Extended the real Safari Share Sheet journey through app termination and relaunch. The protected ledger restores the exact `iana.org` URL, one waiting-capture count, honest local-save boundary, and explicit retry control while network actions remain disabled.
- Switched the relaunched app to a unique second simulator owner and proved the first owner's URL/receipt/retry UI remained absent; switching back restored the original pending identity. No upload or synthetic synced state was used to satisfy the assertion.
- Focused proof passes 1/1; the complete `ShareCaptureExtensionUITests` suite passes 3/3 on iPhone 17 Pro / iOS 26.3.1 at `/tmp/quipsly-share-suite-0605.xcresult`. Source contract is 68/68 and diff checks pass.
- Local rendered Inbox stops at the correct private sign-in boundary, but Firebase Admin ADC is unavailable for authenticated local use. Live Nest Inbox currently returns Google Frontend 503. Physical-device offline/relaunch/retry, real-account same-ID web readback, rendered second-account privacy, HGO/coaching dogfood, and authorized production service/schema proof remain open. No production or external mutation occurred.

### Honest and atomic AI research-index checkpoint

- Replaced the Writing Assistant's fake zero-count embedding sync with an authenticated, Nest-write-authorized refresh using current `gemini-embedding-2` at the schema's 768 dimensions. Query/document prefixes now match current retrieval guidance; missing credentials and invalid vectors fail closed.
- The refresh precomputes all provider results before one managed-origin replacement transaction. Provider failure leaves the previous index untouched; successful refresh deletes only `studio-document-block` and `quipsly-lore-quote` rows. Corrected the raw SQL from nonexistent `sourceType` to canonical `sourceOrigin`.
- UI copy now discloses the provider boundary before the person presses `Refresh AI research index`, reports real model/count evidence, and renders failure separately while promising only that the prior index remains.
- Real disposable PostgreSQL/pgvector proof wrote one block and one quote as 768-dimensional vectors, removed one obsolete managed row, preserved one unrelated external-origin row, and retained the exact result after an injected provider failure. Cleanup completed. Focused proof is 17/17 including DB; full Quipsly is 93 suites / 395 tests; TypeScript and diff checks pass.
- No real Gemini call or production/external mutation occurred. Authenticated rendered use, HGO evidence-quality judgment, private-coaching provider consent, separate-account denial, and production pgvector/model readback remain required.
