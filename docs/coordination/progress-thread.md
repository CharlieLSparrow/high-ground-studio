# Progress Thread

Append short updates here so the project has one readable async thread across
agents and worktrees. Keep updates concrete: branch, action, files touched,
checks, blockers, and next handoff.

## 2026-05-25

### Codex / `codex/live-room-session-recap-001`

- Continuing the OneNote-style live-room push after `studio-00063-982`.
- Targeting a computed session recap that extracts decisions, action items,
  open questions, and source notes from notebook sections for a copyable handoff.

### Codex / `main` Studio live-room quick sections

- Continued the OneNote-style live-room push after `studio-00061-h7l`.
- Added quick-insert notebook sections for notes, decisions, action items,
  questions, and source notes while keeping the same shared Yjs text document.
- Added section-kind inference and chips in the notebook outline and section
  headers.
- Validation passed: `pnpm studio:manuscript:live-room:test`,
  `pnpm studio:cloudrun:test`, `pnpm --filter studio typecheck`,
  `pnpm --filter studio build`, and `git diff --check`.
- Functional commit: `20afe3d`
  `feat(studio): add live room quick sections`.
- Deployed Studio through `pnpm studio:cloudrun:deploy`:
  - Cloud Build `4e9826fb-479d-4877-96c7-a267414ff09e`
  - Studio image
    `us-central1-docker.pkg.dev/high-ground-odyssey/high-ground-studio/studio:20afe3d`
  - Studio revision `studio-00063-982`, serving 100%
- Live smoke passed:
  - `https://studio-hm2odnvjga-uc.a.run.app/manuscript` returned 200.
  - `https://studio-hm2odnvjga-uc.a.run.app/manuscript/live` returned 200.
  - `https://studio-hm2odnvjga-uc.a.run.app/api/manuscript/live-rooms`
    returned the expected unauthenticated 401.
- Rollback:
  `gcloud run services update-traffic studio --project=high-ground-odyssey --region=us-central1 --to-revisions=studio-00061-h7l=100`

### Codex / `main` Studio live-room section presence

- Continued the OneNote-style live-room push after `studio-00059-btd`.
- Added section-aware presence so focused editors publish `editing section N`
  through the existing presence `mode` string.
- The notebook outline and section headers now show active collaborators on the
  section they are editing.
- Validation passed: `pnpm studio:manuscript:live-room:test`,
  `pnpm studio:cloudrun:test`, `pnpm --filter studio typecheck`,
  `pnpm --filter studio build`, and `git diff --check`.
- Functional commit: `6fb0cb4`
  `feat(studio): show live room section presence`.
- Deployed Studio through `pnpm studio:cloudrun:deploy`:
  - Cloud Build `a042bb40-8854-4523-b955-62ae888d6f59`
  - Studio image
    `us-central1-docker.pkg.dev/high-ground-odyssey/high-ground-studio/studio:6fb0cb4`
  - Studio revision `studio-00061-h7l`, serving 100%
- Live smoke passed:
  - `https://studio-hm2odnvjga-uc.a.run.app/manuscript` returned 200.
  - `https://studio-hm2odnvjga-uc.a.run.app/manuscript/live` returned 200.
  - `https://studio-hm2odnvjga-uc.a.run.app/api/manuscript/live-rooms`
    returned the expected unauthenticated 401.
- Rollback:
  `gcloud run services update-traffic studio --project=high-ground-odyssey --region=us-central1 --to-revisions=studio-00059-btd=100`

### Codex / `main` Studio live-room notebook section controls

- Continued the OneNote-style live-room push after `studio-00057-87h`.
- Added notebook starter templates for session notes, writing passes, and
  coaching sessions.
- Added section-level controls to add below, move up, move down, and remove
  notebook sections while keeping the same Yjs room API and database state.
- Validation passed: `pnpm studio:manuscript:live-room:test`,
  `pnpm studio:cloudrun:test`, `pnpm --filter studio typecheck`,
  `pnpm --filter studio build`, and `git diff --check`.
- Functional commit: `982150d`
  `feat(studio): add live room notebook section controls`.
- Deployed Studio through `pnpm studio:cloudrun:deploy`:
  - Cloud Build `a759698c-7b55-47a6-912c-e441beaa052f`
  - Studio image
    `us-central1-docker.pkg.dev/high-ground-odyssey/high-ground-studio/studio:982150d`
  - Studio revision `studio-00059-btd`, serving 100%
- Live smoke passed:
  - `https://studio-hm2odnvjga-uc.a.run.app/manuscript` returned 200.
  - `https://studio-hm2odnvjga-uc.a.run.app/manuscript/live` returned 200.
  - `https://studio-hm2odnvjga-uc.a.run.app/api/manuscript/live-rooms`
    returned the expected unauthenticated 401.
- Rollback:
  `gcloud run services update-traffic studio --project=high-ground-odyssey --region=us-central1 --to-revisions=studio-00057-87h=100`

### Codex / `main` Studio live-room notebook mode

- Made `/manuscript/live` open in notebook mode by default while preserving the
  existing shared Yjs text protocol and raw-text fallback.
- Added editable notebook sections, an outline rail, per-section stats, and an
  `Add section` control for a more OneNote-style co-editing flow.
- Validation passed: `pnpm studio:manuscript:live-room:test`,
  `pnpm studio:cloudrun:test`, `pnpm --filter studio typecheck`,
  `pnpm --filter studio build`, and `git diff --check`.
- Functional commit: `27af190`
  `feat(studio): add live room notebook mode`.
- Deployed Studio through `pnpm studio:cloudrun:deploy`:
  - Cloud Build `e3ed3f83-84ec-4da5-943e-cd54a5e7daf0`
  - Studio image
    `us-central1-docker.pkg.dev/high-ground-odyssey/high-ground-studio/studio:27af190`
  - Studio revision `studio-00057-87h`, serving 100%
- Live smoke passed:
  - `https://studio-hm2odnvjga-uc.a.run.app/manuscript` returned 200.
  - `https://studio-hm2odnvjga-uc.a.run.app/manuscript/live` returned 200.
  - `https://studio-hm2odnvjga-uc.a.run.app/api/manuscript/live-rooms`
    returned the expected unauthenticated 401.
- Rollback:
  `gcloud run services update-traffic studio --project=high-ground-odyssey --region=us-central1 --to-revisions=studio-00055-bgv=100`

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
- Merged PR #23 to `main` as `928d68f`.
- Deployed Studio from the clean merged worktree:
  - Cloud Build `f4f25dc4-58aa-48d4-980b-8ae702a92132`
  - image `us-central1-docker.pkg.dev/high-ground-odyssey/high-ground-studio/studio:928d68f`
  - revision `studio-00047-zm2`, serving 100%
  - smokes passed: `/api/health`, `/content-studio`
  - rollback:
    `gcloud run services update-traffic studio --project=high-ground-odyssey --region=us-central1 --to-revisions=studio-00045-8k4=100`
- Deployed Web from the clean merged worktree:
  - Cloud Build `43420d27-7a3b-4a59-99a8-3024033cbdaa`
  - image `us-central1-docker.pkg.dev/high-ground-odyssey/high-ground-studio/web:928d68f`
  - revision `web-00074-n9v`, serving 100%
  - smokes passed: `/api/health`, `/`, `/projection-stage/import`,
    `/team/progress` unauthenticated sign-in redirect, and
    `/team/hgo-publish-queue` unauthenticated sign-in redirect
  - rollback:
    `gcloud run services update-traffic web --project=high-ground-odyssey --region=us-central1 --to-revisions=web-00073-lnw=100`
- Added public progress story entry `content-studio-persistence-fanout-live`
  for `/updates`.
- Started urgent Manuscript Live Room slice on
  `codex/manuscript-live-room-001` from clean `origin/main` because Charlie and
  Homer need a shared editing surface for a working session tonight. Added
  `/manuscript/live`, authenticated live-room APIs, additive Prisma live-room
  models, Yjs update polling, presence heartbeat, manual snapshot checkpointing,
  and `docs/runbooks/studio-manuscript-live-room.md`.
- Merged PR #25 as `330f466`, built db-push image
  `prisma-db-push:330f466` with Cloud Build
  `c5b00e97-0bda-498c-9f6a-55af9dd4bb71`, synced the live Studio database with
  Cloud Run Job `studio-db-push-330f466` execution
  `studio-db-push-330f466-4lntn`, and deployed Studio revision
  `studio-00049-lt2` from Cloud Build
  `e7d0f864-6207-49ff-9d84-50f67f5ee964`. Direct Cloud Run smoke passed for
  `/manuscript/live`; `studio.highgroundodyssey.com` does not currently
  resolve.
- Merged PR #27 as `9e46ce6` to let any authenticated Studio-access user with
  a room URL join/edit the live room, while keeping recent-room listing
  creator-scoped. Deployed Studio revision `studio-00051-zl8` from Cloud Build
  `010fcd7a-a46a-4352-901f-a96f9f9be94b`; final smokes passed for
  `/api/health`, `/content-studio`, `/manuscript/live`, and unauthenticated
  `401` on `/api/manuscript/live-rooms`.
- Started follow-up branch `codex/manuscript-live-room-snapshot-start-001` so
  `/manuscript/live` can seed new rooms from the latest Manuscript Library
  snapshot and save checkpoints back to the selected manuscript.
- Validation passed on the snapshot-start branch:
  `pnpm studio:manuscript:live-room:test`, `pnpm studio:cloudrun:test`,
  `pnpm --filter studio typecheck`, `pnpm --filter studio build` outside the
  sandbox after the known Turbopack port-binding failure, and
  `git diff --check`.
- Merged PR #29 as `533151c` and deployed Studio revision `studio-00053-rfn`
  from Cloud Build `2a62f5bd-2a9a-4cc5-8c28-8c1a85033bb0`. Live smokes passed
  for `/manuscript/live` (`HTTP 200`) and unauthenticated
  `/api/manuscript/live-rooms` (`401`). Rollback:
  `gcloud run services update-traffic studio --project=high-ground-odyssey --region=us-central1 --to-revisions=studio-00051-zl8=100`.
- Deployed Web from current `main` `8d84886` so `/updates` includes the latest
  progress story content. Cloud Build `6b078d8d-15bb-4034-bde0-7aeb3dbfac64`,
  image `us-central1-docker.pkg.dev/high-ground-odyssey/high-ground-studio/web:8d84886`,
  revision `web-00078-x9q`, direct Cloud Run URL
  `https://web-hm2odnvjga-uc.a.run.app`. Smokes passed for `/api/health`, `/`,
  `/projection-stage/import`, `/team/progress` sign-in redirect,
  `/team/hgo-publish-queue` sign-in redirect, and `/updates` (`HTTP 200`).
  Rollback:
  `gcloud run services update-traffic web --project=high-ground-odyssey --region=us-central1 --to-revisions=web-00077-h56=100`.
- Started `codex/manuscript-live-room-launch-from-desk-001` to let Manuscript
  Desk create and open a live room directly from the current browser-local
  draft, avoiding an extra save/load hop before a shared writing session.
- Validation passed on the launch-from-Desk branch:
  `pnpm studio:cloudrun:test`, `pnpm studio:manuscript:live-room:test`,
  `pnpm --filter studio typecheck`, `pnpm --filter studio build` outside the
  sandbox after the known Turbopack port-binding failure, and
  `git diff --check`.
- Merged PR #32 as `bbb095f` and deployed Studio revision `studio-00055-bgv`
  from Cloud Build `d3c9f219-4457-4581-8993-e888a9babaeb`. Direct smokes
  passed for `/manuscript` (`HTTP 200`), `/manuscript/live` (`HTTP 200`), and
  unauthenticated `/api/manuscript/live-rooms` (`401`). Rollback:
  `gcloud run services update-traffic studio --project=high-ground-odyssey --region=us-central1 --to-revisions=studio-00053-rfn=100`.
- Started `codex/live-room-notebook-mode-001` to make `/manuscript/live`
  default to a notebook-style editing surface. This keeps the existing Yjs text
  protocol but splits the shared text into editable sections with an outline
  and a raw-text fallback.
- Validation passed on the notebook-mode branch:
  `pnpm studio:manuscript:live-room:test`, `pnpm studio:cloudrun:test`,
  `pnpm --filter studio typecheck`, `pnpm --filter studio build` outside the
  sandbox after the known Turbopack port-binding failure, and
  `git diff --check`.
