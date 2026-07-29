# HGO / Quipsly coaching-capture analysis reconciliation

Date: 2026-07-06
Status: active goal guidance

## Why this exists

Charlie brought in an outside GPT analysis of the High Ground and Quipsly repos.
The analysis was directionally useful, but parts of it reflected an older local
state. This note records what to keep, what to ignore, and what should change so
future agents do not chase stale advice.

## Keep

- HighGroundOdyssey.com should be the public coaching, story, and business
  doorway.
- Quipsly.com should be the product education and creator funnel for Research,
  Studio, and Tower.
- Nest / `apps/quipsly` remains operational truth for users, Nests, bookings,
  sessions, consent, recordings, transcript jobs, packets, payment/session
  evidence, and publishing receipts.
- The native iOS capture app should be production-first, source-safe, and
  explicit-consent-first.
- Coaching and podcast capture should share the same durable capture spine:
  room, participants, consent, local recording, upload verification,
  transcript, packet, and follow-up material.

## Adjust

- Do not split new work into `apps/quipsly-api` just because older docs mention
  that direction. The active implementation path currently lives in
  `apps/quipsly` API routes, shared `packages/quipsly-domain` contracts, and
  the native capture app. A separate API service can still happen later if a
  runtime or scaling reason appears.
- Treat Stripe, calendar, LiveKit, Firebase, App Store, and transcription
  providers as evidence providers. Quipsly-owned database records remain the
  source of truth.
- Treat High Ground coaching routes as a doorway and handoff surface, not a
  second booking/capture owner.
- Treat Quipsly.com as a product narrative and funnel, not an operational state
  owner.
- Treat Apple deployment targets as a product/device-coverage decision, not an
  automatic downgrade. The outside analysis flagged a future-looking iOS target,
  but Quipsly is intentionally latest-platform-first while pre-customer unless
  TestFlight, App Store review, or collaborator devices create a concrete
  coverage blocker.

## Stale or already addressed

- The outside analysis warned that the upload manager and app delegate used
  mismatched background session identifiers. Current code uses
  `UploadManager.backgroundSessionIdentifier` from the app delegate.
- The outside analysis warned that native recording cleanup deleted local audio
  too early. Current `AudioCaptureController.cleanupOldRecordings()` no longer
  deletes local recordings silently.
- The outside analysis described uploads targeting an older
  `/ingest/mobile/chunk` shape. Current native upload code targets the
  canonical `/mobile/capture/uploads/chunk` route after Nest base URL
  normalization.
- The outside analysis treated native auth as mostly missing. Current native
  app code uses Firebase email/password plus Quipsly bearer verification, and
  `scripts/quipsly-mobile-capture-native-auth-smoke.mjs` mirrors that path.

## Current live truth

As of this note, local source is ahead of production. The latest readiness
check was:

```bash
node scripts/hgo-quipsly-release-readiness.mjs --json
```

Result: local contracts pass, live public routes still need promotion, and
deploy remains blocked by local operator gcloud/ADC auth.

- Local HGO coaching handoff code exists.
- Local Nest public coaching packet route exists.
- Local mobile capture route contracts exist.
- Live Quipsly.com already explains Research, Studio, Tower for storytellers,
  coaches, trainers, and researchers.
- Live HGO `/coaching` still shows the older donation-supported page until
  `apps/web` is deployed/promoted.
- Live Nest `/api/coaching/public` still returns deployed 404 HTML until
  `apps/quipsly` is deployed/promoted.
- Live Nest `/api/mobile/capture/readiness` must also return side-effect-free
  JSON before native capture can be treated as live-ready for App Store,
  reviewer, or agent diagnostics.
- Release readiness remains blocked by `operator-gcloud-auth` until local
  gcloud and ADC credentials are refreshed.

Current evidence from readiness:

- `local-hgo-quipsly-handoff-static-contract`: pass.
- `coaching-capture-schema-readiness`: pass.
- `quipslyMarketingExplainsResearchStudioTower`: pass.
- `hgoCoachingUsesQuipslyOperationalHandoff`: fail on live, older HGO build.
- `nestPublicCoachingPacketShape`: fail on live, route missing from deployed
  Nest build.
- `operator-gcloud-auth`: fail because user credentials and Application Default
  Credentials cannot currently mint access tokens for the deploy/Firebase
  projects.

Additional live marker check on 2026-07-06:

- `https://quipsly.com/` returns the current product narrative markers:
  Research, Studio, Tower, storytellers, coaches, trainers, researchers, and
  systems anxiety.
- `https://quipsly.com/coaching` was found routing to the private Nest fallback
  instead of a public coaching/product page. Local source now includes a
  dedicated `apps/quipsly/src/app/(marketing)/coaching/page.tsx` route, and the
  public route matrix plus integration smoke check that this URL explains the
  coaching/capture lane instead of rendering `Your private creative workspace
  lives here.`
- `https://highgroundodyssey.com/coaching` returns HTTP 200, but content markers
  show the older page: `Book a Session` and `Donation-supported` are present,
  while `Open Quipsly Booking`, `Quipsly live packet`, `Inspect packet`, and
  `Quipsly Nest` are absent.
- `https://nest.quipsly.com/api/coaching/public?source=hgo-coaching` still
  returns HTTP 404 HTML, not the coaching packet JSON.
- `https://nest.quipsly.com/api/mobile/capture/readiness` still returns HTTP 404
  HTML, not the mobile capture readiness JSON.

Do not interpret Quipsly.com passing as proof that the coaching/capture system is
live. Quipsly.com is product education. The operational proof is the Nest packet,
HGO handoff page, preview smoke, promotion, and final live smoke.

## Trajectory adjustment

The outside GPT analysis is useful as strategic confirmation, not as a task list.
It reinforces the current split:

- HighGroundOdyssey.com teaches, routes, and proves published story/coaching
  surfaces.
- Quipsly.com explains the product and creates the creator/researcher/coach
  funnel.
- Nest owns operational truth for users, Nests, booking, payment evidence,
  capture, transcripts, packets, and publication receipts.
- Native capture owns local recording trust and source-safe upload.

The immediate adjustment is to treat live public integration as part of the
coaching/capture goal, not a later polish step. Before broadening to more
capture features, prove this loop:

1. Local contract remains green.
2. Nest no-traffic preview exposes `/api/coaching/public` as side-effect-free
   JSON.
3. HGO no-traffic preview renders the Quipsly operational handoff.
4. Preview smoke passes.
5. Traffic is promoted only after preview proof.
6. Live smoke proves the same boundaries.

Do not create a separate `apps/quipsly-api` implementation right now solely
because older analysis suggested it. The active durable path is `apps/quipsly`
API routes plus shared `packages/quipsly-domain` contracts unless runtime scale
or deployment pressure creates a concrete reason to split services.

## Goal adjustment recommendation

The active coaching/capture goal should explicitly include the public-site
integration boundary. The next sprint should not only grow native capture; it
should make the HGO -> Quipsly.com -> Nest loop visibly true:

- Quipsly.com teaches the Research / Studio / Tower product story for
  storytellers, coaches, trainers, and researchers.
- HighGroundOdyssey.com routes coaching/podcast/research-interview interest into
  Quipsly without pretending to own booking or capture truth.
- Nest exposes side-effect-free public packet and mobile capture readiness JSON.
- Native capture uses Nest session truth and preserves local recordings until
  server verification plus an explicit retention policy.
- No public claim should say a route, booking, recording, transcript, packet, or
  publication is live unless the route or receipt proves it.

## Next safest path

`scripts/hgo-quipsly-release-readiness.mjs` now reports two separate truths:

- `previewDeployReady`: operator auth and local deploy prerequisites are clear.
- `livePublicIntegrationProven`: live HGO, Quipsly.com, Nest public packet, and
  mobile capture readiness all prove the intended public contract.
- `runtimeWarnings`: local checks that exited successfully but reported
  semantic drift in their JSON payload. This matters because the live public
  route matrix and integration smoke intentionally run with `--warn-only` while
  preview deploys are meant to fix live drift.

The live route checks intentionally run in warn-only mode inside the readiness
wrapper so they do not block a preview deploy that is meant to fix them.
However, their internal JSON is promoted into `publicDriftWarnings` so stale
public state cannot be mistaken for production proof.

As of 2026-07-06, the release readiness wrapper also requires production builds
for both public app surfaces before preview deploy:

- `quipsly-production-build`: `corepack pnpm --filter quipsly build`.
- `hgo-production-build`: `corepack pnpm --filter web build`.

This is intentionally stricter than typecheck-only validation. It catches
framework-level failures such as App Router route collisions, stale generated
route types, proxy/route table problems, metadata generation failures, and
deployment bundle-shape issues before Cloud Build time is spent. The
`/coaching` collision between the authenticated Nest operational route and the
public Quipsly marketing route is the example that made this gate mandatory.

The wrapper now has two intentionally different modes:

```bash
pnpm quipsly:release:local
pnpm quipsly:release:local:json
pnpm quipsly:release:readiness
pnpm quipsly:release:readiness:json
```

`--local-only` proves the source, route contracts, production builds, schema
readiness, and native capture/static App Store contracts without requiring
current operator gcloud credentials or live route checks. This is for ordinary
development and agent handoff.

The production build checks deliberately remove only generated `.next` folders
before building:

- `apps/quipsly/.next`
- `apps/web/.next`

This prevents stale local build artifacts from causing nondeterministic
`ENOTEMPTY` cleanup failures while preserving source files, media, manifests,
exports, database state, and user-created work.

Cleanup is retry-backed and report-safe. If a generated folder is temporarily
busy, the script retries; if it still cannot clean the folder, it emits a
structured failed check instead of crashing before JSON can be parsed.

The build checks also share a local generated-build lock under `.tmp` so two
agents cannot concurrently clean and rebuild the same Next output folders. This
lock is intentionally narrow: it guards disposable build artifacts, not source
editing, media work, schema work, docs, or operator actions.

The normal command still checks operator gcloud/ADC auth and live public drift.
Only the normal command can report `previewDeployReady:true`. This keeps the
workflow fast for local engineering without letting expired deploy auth or stale
live routes get confused with production proof.

The readiness script uses `process.exitCode` instead of `process.exit()` so large
JSON reports are not truncated when the report exits nonzero and is piped into a
summarizer. Automation should be able to parse failure evidence, not just learn
that something failed.

As of 2026-07-06 07:32 MDT, authenticated mobile capture sessions also expose a
compact per-room action packet:

- `actionPacket.packetKind:"quipsly-capture-action-packet-v1"`.
- Capabilities include provider-room joinability, local recording readiness,
  provider-recording receipt-slot preparation, transcript execution, packet
  building, and packet review.
- `canStartProviderRecording` intentionally remains `false` until a real
  provider egress start path and receipt proof exist.
- The review digest aggregates these packets so the iOS app, reviewers, and
  agents can inspect blockers and next safe actions without inferring state from
  raw room rows.

This keeps the architecture honest: joining a room, recording locally, preparing
provider-recording evidence, running transcription, and building packets are
separate actions with separate receipts.

As of 2026-07-06T09:28:46Z, the readiness wrapper also promotes warn-only JSON
failures into `runtimeWarnings`, so the top-level report now clearly shows:

- `runtimeWarnings`: `live-public-route-matrix`,
  `live-public-integration-smoke`.
- `publicDriftWarnings`: HGO coaching stale markers plus Nest public packet and
  mobile readiness 404s.

As of 2026-07-06 04:40 MDT, live smoke also checks the authenticated mobile
capture review digest boundary:

- `nestMobileCaptureReviewDigestAuth` in
  `scripts/hgo-quipsly-public-route-matrix.mjs`.
- `nestMobileCaptureReviewDigestAuthBoundary` in
  `scripts/hgo-quipsly-public-integration-smoke.mjs`.

That route is expected to return calm JSON `401` when unauthenticated:
`{ ok:false, error:"Sign in before loading the mobile capture review digest." }`.
A live `404` means Nest is still on a stale image or routed to the wrong app,
not that the reviewer has the wrong account.

As of 2026-07-06 05:00 MDT, reviewer setup also has a source-only runway smoke:

```bash
node scripts/quipsly-capture-reviewer-runway-static-smoke.mjs
```

This check proves the repo still contains one coherent reviewer path:
`/admin/users` creates or repairs the Firebase email/password reviewer login and
Quipsly starter state, `/coaching` has a reviewer preset that creates an
app-owned booking plus capture room, the native visible-session smoke reports a
copy-pasteable setup runbook when no session exists, and the review digest route
stays side-effect-free. It does not sign in, mutate data, charge, invite,
publish, create external calendar events, or start recording.

It is now wired into the normal operator checks:

As of 2026-07-06, scheduling has the same app-owned/evidence-provider
boundary:

- `apps/quipsly/src/app/api/coaching/runway/route.ts` owns booking holds,
  booking conversion, reschedule, cancel, and calendar receipt attachment.
- Reschedule/cancel writes Quipsly booking/room truth first and creates
  `CalendarEventLink` rows such as `reschedule-planned` or `cancel-planned`.
  These rows are work-to-do/evidence slots, not claims that Google Calendar has
  changed.
- `attach-calendar-receipt` stores the provider calendar ID, provider event ID,
  event link, and status after a human/provider action happens. It does not call
  Google, send invites, or mutate external calendars.
- `scripts/quipsly-coaching-scheduling-static-smoke.mjs` guards this boundary,
  and `scripts/hgo-quipsly-release-readiness.mjs` now includes it as
  `coaching-scheduling-static-contract`.

This keeps scheduling useful before full calendar automation exists: Quipsly can
show the intended session truth, show exactly which external receipt is missing,
and later attach the receipt without pretending the outside world changed by
magic.

As of 2026-07-06 05:30 MDT, the recording-to-packet lifecycle also has a
source-only contract smoke:

```bash
node scripts/quipsly-coaching-lifecycle-static-smoke.mjs
```

This check proves the repo still contains one coherent app-owned lifecycle:
booking, test-mode payment evidence, capture room, participants, consent,
verified recording, transcript job, transcript segments, deterministic packet
notes, and candidate action items. It is intentionally static and does not touch
the database. The deeper `scripts/quipsly-coaching-local-lifecycle-db-smoke.mjs`
remains available when an operator explicitly wants a local create/read/cleanup
proof, but it should not be an always-on release gate because it writes generated
records before deleting them.

It is now wired into:

- `scripts/hgo-quipsly-release-readiness.mjs` as
  `coaching-lifecycle-static-contract`.
- `scripts/quipsly-mobile-capture-preflight.sh` as both a syntax check and a
  source contract run.

For the deeper local database proof, run it deliberately instead of implicitly:

```bash
RUN_COACHING_LIFECYCLE_DB_SMOKE=1 bash scripts/quipsly-mobile-capture-preflight.sh
```

That optional mode creates generated local records, reads them back, and cleans
them up. Use it when validating the end-to-end local lifecycle, not as the
default fast release gate.

As of 2026-07-06 06:15 MDT, payment-hold is enforced at the capture route
boundary, not just in the UI summary:

- `/api/mobile/capture/rooms/join` refuses paid one-to-one coaching room joins
  while payment evidence is unresolved.
- `/api/mobile/capture/rooms/state` refuses `START_RECORDING` for paid
  one-to-one sessions while payment evidence is unresolved.
- `/api/mobile/capture/rooms/provider-recording` refuses provider recording
  receipt-slot prep while payment evidence is unresolved.

This preserves the product rule that Stripe is evidence, not source of truth:
these routes do not mutate Stripe or create payment state. They return calm
`payment-hold` JSON and tell the user to resolve payment evidence in Quipsly.

- `scripts/hgo-quipsly-release-readiness.mjs` includes
  `capture-reviewer-runway-static-contract` as a local deploy-readiness check.
- `scripts/quipsly-mobile-capture-preflight.sh` syntax-checks and runs the same
  reviewer runway smoke before the iOS build.

As of 2026-07-06 05:15 MDT, the one-to-one coaching payment boundary is also
wired into normal readiness:

- `scripts/hgo-quipsly-release-readiness.mjs` includes
  `coaching-payment-static-contract`.
- `scripts/quipsly-mobile-capture-preflight.sh` runs
  `node scripts/quipsly-coaching-payment-contract-smoke.mjs --static-only --json`
  before the iOS build.

This proves the source contract for the current payment runway: Stripe remains
receipt/evidence for eligible one-to-one coaching, live Stripe requires
`QUIPSLY_ALLOW_LIVE_STRIPE=true`, Customer Portal requires existing Stripe
customer evidence, webhook events stay ledger-backed, and group coaching,
courses, content libraries, and SaaS access are not sold through this iOS-facing
Stripe coaching path.

As of 2026-07-06 05:25 MDT, release readiness also includes the native capture
source and App Store static contracts:

- `mobile-capture-source-contract` runs
  `node scripts/quipsly-mobile-capture-contract-smoke.mjs --source-only --json`.
- `ios-capture-app-store-static-contract` runs
  `node scripts/quipsly-ios-capture-app-store-static-smoke.mjs`.

Together these catch drift in upload retention, room join, consent, transcript,
packet, review digest, native decode/UI boundaries, privacy manifest,
permission strings, local retention, reviewer auth, deletion path, and App
Review notes before a deploy can be mistaken for production readiness.

As of 2026-07-06 09:50 MDT, the public HGO-to-Quipsly handoff packet also
includes shared, side-effect-free handoff actions:

- `packages/quipsly-domain/src/coaching-public.ts` owns
  `QUIPSLY_PUBLIC_COACHING_HANDOFF_ACTIONS`.
- `apps/quipsly/src/app/api/coaching/public/route.ts` resolves those actions
  against current Nest links and returns them as `handoffActions`.
- `apps/quipsly/src/proxy.ts` rewrites public Quipsly.com `/coaching` to
  the marketing route at `/public/coaching`, while Nest `/coaching` remains the
  authenticated operational coaching runway.
- `apps/web/src/lib/hgo/coaching-handoff.ts` normalizes the actions without
  importing booking, payment, consent, capture, or transcript logic into HGO.
- `apps/web/src/app/coaching/page.tsx` renders `Public handoff actions` so HGO
  can route users clearly while Nest stays the operational source of truth.

Validated locally with:

```bash
node scripts/hgo-quipsly-coaching-handoff-static-smoke.mjs
node --check scripts/hgo-quipsly-public-integration-smoke.mjs
node --check scripts/hgo-quipsly-public-route-matrix.mjs
corepack pnpm --filter @high-ground/quipsly-domain typecheck
corepack pnpm --filter quipsly typecheck
corepack pnpm --filter web build
```

1. Reauth operator credentials:

   ```bash
   gcloud auth login --update-adc --brief
   bash scripts/release/quipsly-gcloud-auth-check.sh
   ```

2. Re-run release readiness:

   ```bash
   node scripts/hgo-quipsly-release-readiness.mjs --json
   ```

3. Deploy tagged no-traffic previews for Nest and HGO through the release
   conductor.

4. Smoke tagged previews for:

   - HGO `/coaching` current handoff markers.
   - Nest `/api/coaching/public` JSON packet.
   - Nest `/api/mobile/capture/readiness` JSON packet.
   - Nest `/api/mobile/capture/review-digest` unauthenticated JSON auth
     boundary, then authenticated digest with reviewer/test account.
   - Mobile capture readiness and route contracts.
   - Quipsly.com Research / Studio / Tower marketing truth.

5. Promote live only after previews prove the same source-of-truth model.

## Product invariant

HighGroundOdyssey.com teaches and routes. Quipsly.com educates and funnels.
Nest owns operational coaching and capture truth. Native capture preserves local
recordings until server verification and explicit retention policy say
otherwise.
