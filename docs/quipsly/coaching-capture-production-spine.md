# Quipsly coaching and capture production spine

Date: 2026-07-04
Status: implementation spine active; live public loop promoted; Stripe is configured with live charging intentionally held
Primary surfaces: HighGroundOdyssey coaching pages, Nest/Quipsly coaching tools, iOS capture app, future Tower review and receipt surfaces

Public loop deploy and proof ladder:

`docs/quipsly/public-loop-proof-runbook.md`

## 2026-07-07 live promotion and Homer-friendly runway update

Current live proof:

- `https://highgroundodyssey.com/coaching` passes the HGO-to-Quipsly public handoff smoke and no longer shows the stale donation-supported coaching doorway.
- `https://quipsly.com/coaching` passes the public coaching/capture product-route smoke and does not fall through to the private Nest fallback.
- `https://nest.quipsly.com/api/coaching/public` returns the side-effect-free public coaching packet JSON.
- `https://nest.quipsly.com/api/mobile/capture/readiness` returns the side-effect-free mobile capture readiness JSON.
- Cloud Run revision `studio-00310-rdn` was promoted to 100% traffic for the Nest/Quipsly app after local build, container build, deploy, and live smokes.

Validation commands from the promotion pass:

```bash
pnpm --filter quipsly exec next build --webpack
node scripts/quipsly-coaching-payment-contract-smoke.mjs --static-only --json
node scripts/hgo-quipsly-public-integration-smoke.mjs --json
node scripts/quipsly-mobile-capture-contract-smoke.mjs --source-only --json
```

Current payment boundary:

- Stripe is configured in Nest and the readiness route reports `stripeConfigured: true`.
- Live Stripe charging remains intentionally held with `stripeLiveAllowed: false`.
- Customer Portal remains intentionally held with `coachingCustomerPortalEnabled: false`.
- Do not flip `QUIPSLY_ALLOW_LIVE_STRIPE=true`, publish a payment link for a real client, or create external calendar events without explicit approval for that exact action.

Homer-friendly runway update:

- `/coaching` in Nest now has a **Coach setup** card.
- The setup action creates or updates the app-owned `User`, `COACH` role, `CoachProfile`, default paid one-to-one `ServiceOffering`, and a flexible scheduling clue.
- Configured coaches can manage their own coaching runway without needing broad staff/admin permissions.
- The appointment form stays calm: client email/name, title, start, duration, purpose, payment policy, and a custom client price.
- Paid one-to-one bookings create app-owned payment intent/evidence first. Homer creates or copies a Stripe-hosted Checkout link only after the appointment details look right.

Human-friendly public journey update:

- The public coaching packet now carries two plain-English paths: `clientJourney` for the coachee and `operatorJourney` for Homer.
- The coachee path is intentionally provider-light: create a free account, request or confirm a session, review the price, pay on a Stripe-hosted page if needed, join with visible consent, and receive follow-up.
- The Homer path is intentionally action-first: set up the coach profile once, create the booking hold, send a hosted payment link when details are right, capture only with visible consent, and review/send the packet.
- These are product-facing paths, not extra systems of truth. Quipsly still owns booking, payment evidence, consent, capture, transcript, packet, and receipt state.
- Stripe Checkout remains the easiest first payment surface because it keeps card entry, payment-method complexity, and hosted payment UX with Stripe while Quipsly keeps the appointment truth.
- Google Calendar remains a provider receipt path until external calendar writes have explicit approval and a provider event ID or URL exists.

What is still intentionally not done:

- No real live card charge has been enabled.
- External Google Calendar writes are still evidence/receipt slots, not automatic provider mutations.
- LiveKit provider-room join/egress is not configured in production readiness yet.
- Cloud storage and transcription provider readiness still need provider configuration before claiming full capture-to-transcript automation.

## 2026-07-07 public-loop source validation

Historical note: this section captured the source-proof state before the live promotion above. The deploy drift described here is superseded by the 2026-07-07 live promotion update.

Source proof was green before deploy.

Validated locally:

```bash
node --check scripts/hgo-quipsly-release-readiness.mjs
node --check scripts/quipsly-coaching-public-handoff-smoke.mjs
bash -n scripts/release/hgo-quipsly-public-loop-preflight.sh
node scripts/hgo-quipsly-release-readiness.mjs --local-only --json
RUN_BUILDS=0 RUN_LIVE_PACKET=1 STRICT_LIVE_PACKET=0 RUN_LIVE_MATRIX=0 RUN_LIVE_INTEGRATION=0 \
  bash scripts/release/hgo-quipsly-public-loop-preflight.sh
```

The local-only release readiness report returned `ok: true` and
`localSourceReady: true`. It proved:

- `apps/quipsly` production build passes
- `apps/web` production build passes
- the public coaching packet smoke parses
- coaching/capture lifecycle static contracts pass
- mobile capture source contracts pass
- iOS capture App Store static contract passes
- local coaching/capture schema readiness sees all expected app-owned tables

Follow-up source hardening on the same pass:

- HGO `/coaching` source copy no longer uses the stale
  `Donation-supported`/`donation-supported` marker
- HGO `/coaching` now emits the route-matrix marker `Public handoff actions`
- the static handoff smoke now rejects those old HGO public-page markers before
  deploy

At the time of this earlier check, the warn-only live packet smoke still failed
because the deployed Nest image returned stale `404` HTML for `/api/coaching/public`.
That deployment drift was fixed by the later promotion to `studio-00310-rdn`.

## 2026-07-07 Homer-friendly scheduling and billing direction

Research and implementation direction:

- Stripe Checkout is the preferred first production payment surface for paid
  one-to-one coaching because Quipsly can create a booking-specific hosted
  payment page with the exact appointment amount while Stripe owns card entry,
  taxes/payment-method complexity, and payment confirmation UX.
- Stripe Payment Links are useful later for reusable public offers or
  contribution-style links, but they are less precise than a booking-specific
  Checkout Session when Homer needs to send a custom price for one client and
  one appointment.
- Stripe Invoicing can be added later if a client needs formal invoice terms,
  due dates, collection reminders, or accounts-receivable workflows. It is too
  heavy for the simplest “book session, pay link, capture call” path.
- Google Calendar should remain a receipt/evidence surface until server-side
  calendar writes are explicitly enabled and tested. The app should not imply
  that a calendar invite exists until there is a provider event ID or event URL.

Current product flow target:

1. Homer creates an appointment or hold in Quipsly.
2. For paid one-to-one coaching, Homer enters the client price on the booking.
3. Quipsly stores a pending app-owned `PaymentRecord`.
4. When the appointment details look correct, Homer creates a Stripe payment
   link for that booking.
5. The client can open the payment link from their dashboard, or Homer can copy
   and send the same link manually.
6. Stripe webhook evidence reconciles payment state back into the Quipsly
   booking. Until that receipt exists, the booking should stay visibly pending.

Relevant primary docs:

- Stripe Checkout Sessions create API:
  https://docs.stripe.com/api/checkout/sessions/create
- Stripe Checkout overview:
  https://docs.stripe.com/payments/checkout
- Stripe Invoicing overview:
  https://docs.stripe.com/invoicing
- Google Calendar Events insert API:
  https://developers.google.com/workspace/calendar/api/v3/reference/events/insert

Historical deploy blocker from the earlier source-validation pass:

```text
PASS Selected gcloud account: charlie@highgroundodyssey.com
FAIL gcloud user credentials cannot mint an access token.
FAIL Application Default Credentials cannot mint an access token.
FAIL Cannot access deploy project high-ground-odyssey.
FAIL Cannot access Firebase project quipsly-reef.
```

Historical operator step used to clear the blocker:

```bash
gcloud auth login --update-adc --brief
bash scripts/release/quipsly-gcloud-auth-check.sh
corepack pnpm quipsly:public-loop:preflight
```

That auth blocker was cleared on 2026-07-07. Continue to use the same rule in
future releases: do not describe live public readiness until the live packet
smoke, route matrix, and public integration smoke pass against the public
domains.

## 2026-07-06 transcript-to-packet runway proof

The Nest coaching runway now exposes the next operational ladder after capture:

- the runway read model returns `latestRecordingAssetId` and
  `latestRecordingAssetStatus` for the latest transcribable recording evidence
  in a room
- the capture room card shows a transcript-to-packet panel separate from
  provider recording controls
- staff can run or repair a transcript through
  `/api/mobile/capture/transcripts/run`
- staff can build a reviewable coaching packet through
  `/api/mobile/capture/transcripts/packet`
- packet building stays gated on a completed transcript with at least one
  segment
- UI copy states that transcripts are reusable evidence, not source truth, and
  that notes/highlights/action items remain reviewable packet artifacts

Validation run:

```bash
node scripts/quipsly-coaching-lifecycle-static-smoke.mjs
node scripts/quipsly-mobile-capture-contract-smoke.mjs --source-only --json
corepack pnpm --filter quipsly typecheck
```

All three checks passed locally on 2026-07-06. This is local/source proof only.
It does not prove the live Nest deployment until the deploy gate is green and
live route smokes pass.

## Why this exists

Quipsly needs a coaching and capture lane that can handle real human work:

- schedule coaching sessions
- collect Stripe payments for eligible one-to-one real-time services
- start voice meetings from the app
- record only with explicit consent
- preserve local recordings until upload is verified
- transcribe calls and podcasts into reusable Quipsly assets
- turn sessions into notes, action items, clips, articles, and follow-up packets

The important architecture rule is simple: Quipsly owns the truth. Stripe, calendar providers, call providers, App Store receipts, and transcription providers provide evidence.

## Paused work

The Studio editor sprint is parked here:

`/Users/wall-e/Dev/high-ground-studio/apps/QuipslyStudio/docs/quipsly/parked-goals/2026-07-04-editor-shorts-transcript-repair-pause.md`

Do not mark that sprint complete. Resume it when the focus returns to Episodes 1-6, shorts repair, transcript alignment, Episode 4 clip weaving, or export reliability.

## Historical live public proof status

Checked before the later 2026-07-07 live promotion.

Historical note: this section is retained as a record of the drift that was
fixed by the later 2026-07-07 promotion to `studio-00310-rdn`.

At this point, local source and build proof were ahead of public deployment. The live public route matrix showed deployment drift, not a known source-code failure:

- `https://highgroundodyssey.com/coaching` and
  `https://app.highgroundodyssey.com/coaching` still render the older
  donation-supported coaching page with stale `Book a Session` language.
- `https://quipsly.com/` renders the current Research / Studio / Tower product
  education well enough for the public smoke.
- `https://quipsly.com/coaching` still falls through to the private Nest
  fallback instead of the coaching product-education route.
- `https://nest.quipsly.com/api/coaching/public?source=route-matrix`,
  `https://nest.quipsly.com/api/mobile/capture/readiness`, and
  `https://nest.quipsly.com/api/mobile/capture/review-digest` return stale 404
  HTML instead of the new side-effect-free JSON routes.

The next promotion pass should not patch source first unless a new local check
fails. Reauth, deploy tagged preview revisions for Nest and HGO, smoke previews,
then promote traffic only after the preview route matrix and integration smoke
pass.

Current credential blocker from `bash scripts/release/quipsly-gcloud-auth-check.sh`:

```text
gcloud user credentials cannot mint an access token.
Application Default Credentials cannot mint an access token.
Cannot access deploy project high-ground-odyssey.
Cannot access Firebase project quipsly-reef.
```

Historical operator reauth command:

```bash
gcloud auth login --update-adc --brief
bash scripts/release/quipsly-gcloud-auth-check.sh
```

## Research-backed operating constraints

Apple App Review Guideline 3.1.3(d) allows non-IAP payment for one-to-one real-time person-to-person services, such as tutoring, medical consultations, real estate tours, or fitness training. Quipsly can use Stripe for one-to-one coaching when the product is truly a real-time service between two people.

Apple still expects IAP for many digital goods, SaaS access, content libraries, courses, group services, and other app-mediated digital products unless a specific rule or entitlement applies. Keep one-to-one coaching, group coaching, courses, SaaS, and content purchases separate.

Apple App Review Guideline 2.5.14 requires explicit user consent and a clear visual or audible recording indication before recording microphone, camera, screen, or other user activity.

Apps with account creation need an in-app account deletion path. Privacy labels and review notes must truthfully describe recording, transcript, payment, calendar, and coaching data.

Stripe should collect payments, produce checkout and payment evidence, support Customer Portal flows, and send webhook events. Stripe should not become the source of booking, consent, recording, transcript, or entitlement truth.

For calls, the likely long-term spine is WebRTC rooms with provider/server recording when practical, plus native local recording fallback for resilience. Product default should be all-party consent because participants may be in different states or countries.

## Current repo audit snapshot

Existing useful surfaces:

- `prisma/schema.prisma` already had `User`, `ClientProfile`, `CoachingRequest`, `Appointment`, subscription and entitlement records, and WorldHub Stripe-adjacent commerce records.
- `apps/web/src/app/coaching/actions.ts` creates public coaching requests and client user/profile records.
- `apps/web/src/app/team/coaching-requests/*` supports team review and conversion of requests to appointments.
- `apps/web/src/app/team/appointments/*` supports appointment management.
- `apps/web/src/lib/server/stripe.ts` has a WorldHub offer checkout path.
- `apps/web/src/app/api/worldhub/webhooks/stripe/route.ts` has a real webhook verification path for WorldHub provider events.
- `apps/mobile-capture/HighGroundCapture/HighGroundCapture/AudioCaptureController.swift` already records segmented `.m4a` audio locally.
- `apps/mobile-capture/HighGroundCapture/HighGroundCapture/UploadManager.swift` has a chunked upload shape that now targets the canonical Nest mobile-capture route.
- `apps/mobile-capture/HighGroundCapture/HighGroundCapture/AppDelegate.swift` now routes background URL session completion through `UploadManager.backgroundSessionIdentifier`, avoiding split upload identifiers.

Known risk surfaces:

- `apps/web/src/app/api/checkout/stripe/route.ts` still has a mock checkout route and should not be reused for paid coaching without replacement.
- The iOS capture app still has project/episode compatibility language in parts of the UI and bridge. Coaching and podcast calls must keep promoting room/session/participant/consent IDs as the primary capture truth.
- The old upload-manager danger was deleting local files after upload attempts. Current code preserves local source recordings, deletes only temporary chunk files, and reports server verification/retention state back to the app. Keep `scripts/quipsly-mobile-capture-contract-smoke.mjs` and `scripts/quipsly-ios-capture-app-store-static-smoke.mjs` guarding that behavior.
- The old cleanup danger was silent 24-hour `.m4a` deletion. Current `AudioCaptureController.cleanupOldRecordings()` is a no-delete recovery note. Do not reintroduce blind pruning; future cleanup must require server verification, a retention ledger, and visible user/operator control.
- The mobile capture contract smoke now explicitly checks that `UploadManager.backgroundSessionIdentifier` is the single source used by both the background `URLSessionConfiguration` and `AppDelegate.handleEventsForBackgroundURLSession`. If this regresses, iOS can finish an upload while the app is suspended and Quipsly may never call the system completion handler. That is a production reliability bug, not a cosmetic test failure.

## Outside analysis reconciliation

An outside GPT analysis correctly identified the durable product split:

- HighGroundOdyssey.com should be the public coaching, story, and business surface.
- Quipsly.com should teach the Research / Studio / Tower product story and act as the creator funnel.
- Nest / `apps/quipsly` should own operational booking, payment evidence, consent, capture, upload, transcript, packet, and receipt truth.
- Native capture should remain local-first: source files stay local until Quipsly verifies upload and an explicit retention policy permits cleanup.

The same analysis also mentioned older implementation risks. Several are now fixed in current source:

- background upload identifiers are shared through `UploadManager.backgroundSessionIdentifier`
- local recording cleanup is no-delete
- native upload targets `/mobile/capture/uploads/chunk`
- upload completion preserves local originals instead of deleting them
- command payloads carry call-room, participant, consent, recording-asset, and capture-purpose fields

Do not use the older analysis as a reason to fork a separate `apps/quipsly-api` service right now. The active seam is `apps/quipsly` API routes plus shared `packages/quipsly-domain` contracts. Split services later only if runtime scale, deploy independence, or operational isolation creates a concrete reason.

## Additive schema spine started

The first schema pass added these concepts to `prisma/schema.prisma`:

- coach profile and service offerings
- availability windows and booking holds
- coaching bookings linked to requests, appointments, users, offerings, payment records, call rooms, notes, and action items
- Stripe customer links, checkout session ledger, payment records, and Stripe webhook event evidence
- calendar event links as evidence, not source truth
- call rooms, call participants, and recording consent records
- recording assets and upload chunks
- transcript jobs and transcript segments
- coaching notes and action items

This schema has not been migration-applied, generated, formatted, or build-validated in this pass. It is intentionally additive so the next pass can validate and iterate without throwing away existing coaching request behavior.

## Source-of-truth model

### Coaching request

A `CoachingRequest` is an inbound expression of interest. It is not a confirmed appointment and not a paid booking.

Public coaching requests now capture structured handoff metadata:

- session intent: coaching, podcast capture, or research interview
- general availability notes
- recording/transcription preference: yes, no, or not sure
- next intended system step: team review to booking hold and call room

This keeps the public page honest. The client is not self-scheduling yet, but the request can move cleanly into the Quipsly-owned booking, consent, recording, transcript, and packet chain.

### Booking hold

A `BookingHold` temporarily reserves a slot while the client completes payment, confirms details, or accepts terms. Holds expire.

### Coaching booking

A `CoachingBooking` is Quipsly's app-owned truth for a scheduled session. It can link to an older `Appointment`, a `CoachingRequest`, a `ServiceOffering`, payment evidence, calendar evidence, and a call room.

### Payment evidence

`PaymentRecord`, `StripeCheckoutSessionLedger`, and `StripeWebhookEvent` record what Stripe said happened. They do not decide whether a session exists. Quipsly reconciles payment evidence into booking state.

### Calendar evidence

`CalendarEventLink` records external calendar state. Calendar events are useful reminders and handoff artifacts, not the source of truth.

### Call room

A `CallRoom` represents the actual synchronous session. It can be coaching, podcast capture, research interview, or internal meeting.

### Consent

`RecordingConsent` must be explicit, per room and participant. Recording should not start unless required participants have granted the relevant consent.

Consent can be granted, declined, or revoked. Decline and revoke are real states, not absence of a checkbox. If consent is revoked during local capture, the app should stop local recording and preserve the source recording for review/retention handling.

### Recording assets

`RecordingAsset` and `UploadChunk` represent local and uploaded evidence. Local source recordings should not be deleted until upload verification and retention rules are satisfied.

### Transcripts and notes

`TranscriptJob`, `TranscriptSegment`, `CoachingNote`, and `ActionItem` turn recordings into useful Quipsly work artifacts without mutating the source media or original transcript destructively.

## Recommended flow

1. Public coaching page or Nest/Tower scheduling surface creates a `CoachingRequest` or direct `BookingHold`.
2. User picks an offering and time.
3. Quipsly creates a hold with an expiration.
4. If paid one-to-one coaching, Quipsly creates Stripe Checkout in test or live mode and records a `StripeCheckoutSessionLedger`.
5. Stripe webhook creates `StripeWebhookEvent` evidence and reconciles `PaymentRecord`.
6. Quipsly confirms `CoachingBooking` when requirements are satisfied.
7. Quipsly creates or links `CalendarEventLink` evidence.
8. Quipsly creates a `CallRoom` with participants.
9. Each participant grants or declines `RecordingConsent`.
10. Capture app records local chunks and uploads to `RecordingAsset` and `UploadChunk` records.
11. Server verifies upload integrity.
12. Transcript jobs produce segments and speaker labels.
13. Quipsly creates notes, action items, research packets, clips, follow-up packets, or podcast assets.

## First implementation slices

### Slice 1: Validate and migrate schema safely

- Run schema formatting and validation intentionally.
- Generate Prisma client.
- Create a targeted migration or safe schema sync plan.
- Do not broad-push production schema without a migration note.
- Current additive migration artifact: `prisma/migrations/20260704000000_add_coaching_request_metadata/migration.sql`.

### Slice 2: Coaching admin and user flow

- Add admin/team pages for `ServiceOffering`, `AvailabilityWindow`, `BookingHold`, and `CoachingBooking`.
- Keep current request queue working.
- Make conversion from request to booking explicit and calm.

### Slice 3: Stripe test-mode checkout

- Replace or quarantine the mock checkout route for coaching.
- Build a real one-to-one coaching checkout route from `CoachingBooking` or `BookingHold`.
- Record checkout ledger before redirecting.
- Reconcile webhooks into `StripeWebhookEvent` and `PaymentRecord`.
- Keep WorldHub commerce separate unless deliberately unified later.

### Slice 4: Scheduling MVP

- Build availability windows.
- Build booking holds and expiration handling.
- Add calendar-ready metadata and optional calendar-link creation.
- Keep calendar links evidence-only.

### Slice 5: iOS capture MVP

- Add call/session list and session detail.
- Add explicit consent screen.
- Add visible recording state.
- Extend bridge models from project/episode to room/participant/consent/asset.
- Preserve local recordings until server verification.
- Replace silent deletion with reviewable retention and recovery.

### Slice 6: Meeting provider choice

- Provider-neutral `CallRoom` remains the app-owned source of truth.
- Decision v1: use LiveKit first for provider rooms and egress, with iOS local segmented recording as fallback.
- Twilio Video remains a fallback candidate, especially if telephony/compliance needs outweigh the Quipsly-owned egress path.
- Do not implement inbound VoIP/CallKit complexity until scheduled in-app room join is working.
- Keep provider IDs as evidence fields.
- Keep room lifecycle state app-owned: planned, open, recording, ended, canceled, or failed. Provider state should reconcile into this model instead of replacing it.
- Decision doc: `docs/quipsly/coaching-meeting-spine-decision.md`.

Implementation seam:

- Shared meeting-state contract:
  `packages/quipsly-domain/src/coaching-meeting-spine.ts`.
- Nest provider egress helper:
  `apps/quipsly/src/lib/server/coaching-livekit-egress.ts`.
- Nest room join route uses `buildQuipslyMeetingJoinSpine` for provider join,
  recording boundary, provider recording, and local fallback semantics.
- Nest provider-recording route uses
  `buildQuipslyProviderRecordingReceiptSlotManifest` for receipt-slot evidence.
- Nest provider-recording route now exposes staff-only `START_EGRESS`,
  `STOP_EGRESS`, and `RECONCILE_PROVIDER_FILE` commands. Starts remain
  payment- and consent-gated. Stops and reconciliation are intentionally
  operator commands because stopping a recording and verifying storage evidence
  should not be blocked by the same preconditions that prevent starting.
- Static checks now require the routes to consume this shared contract, not
  hand-roll provider safety language.

This keeps the sensitive state consistent across Nest, native capture, and
future Tower/reviewer surfaces: joining a provider room is not recording,
recording needs visible consent and state, local fallback remains available,
provider egress needs receipt proof, and provider receipt slots are not
transcript media.

Native capture remains local-first for App Store MVP. Server-side provider
egress is available as a Nest operator seam, but the iOS app should not expose a
one-tap provider recording control until the user-facing consent ceremony,
participant visibility, active-recording indicator, and review notes are mature.

### Slice 7: Transcription and coaching packets

- Queue transcript jobs after verified recordings.
- Store segments with speaker labels and timestamps.
- Allow corrections without overwriting source transcript evidence.
- Generate notes, action items, highlights, and follow-ups.

## Implementation note: transcript runner and packet runway controls

The team coaching/capture runway can now advance the transcript chain:

- run a transcript job from the operator surface
- show held/failed provider or asset errors in the transcript queue
- build a deterministic coaching packet from completed transcript segments
- rebuild a packet deliberately when a fresh review packet is wanted

The web runway uses web-side server helpers against the shared Quipsly Prisma schema instead of importing from the Nest app. That keeps app boundaries explicit while preserving one database truth.

Current boundary:

- the route runner is appropriate for small verified recordings
- oversized recordings are held for a future background worker
- missing storage paths, missing provider credentials, unsupported providers, or unverified assets produce held/failed states instead of fake success
- generated coaching packets are review-first candidate summaries, highlights, and action items

## Implementation note: provider egress controls

The team coaching/capture runway now has first provider recording controls for LiveKit-backed rooms.

Implemented pieces:

- `apps/web/src/lib/server/coaching/livekit-egress.ts`
- `updateProviderRecordingEgressAction` in the team runway actions
- start/stop buttons on `/team/coaching-capture`

Safety boundaries:

- Provider recording only starts for rooms prepared as `livekit`.
- Every attached participant must have granted recording consent.
- Duplicate active server-mix egress is held.
- Missing provider/storage config creates a held `RecordingAsset` with the reason.
- Provider egress starts only when the operator gate `LIVEKIT_EGRESS_ENABLED=true` is present.
- Provider recordings use the shared Quipsly media-vault bucket policy and write to `media-vault/recordings/livekit/...`; do not create a separate proxy or recording bucket unless there is a concrete operations reason.
- A successful start creates a `SERVER_MIX` recording asset in `UPLOADING` state.
- A successful stop marks the asset `UPLOADED`, not `VERIFIED`.
- Transcript work should wait for a later verification/reconciliation step.

Bucket truth:

- `QUIPSLY_MEDIA_BUCKET` is a valid source of recording/proxy bucket readiness because it points at the shared Quipsly media vault.
- Raw media, proxy media, thumbnails, mobile recordings, LiveKit recordings, exports, packets, and review artifacts should be separated by `media-vault/...` prefixes and app-owned records, not by inventing unrelated source-of-truth buckets.

## Implementation note: provider egress reconciliation

The team coaching/capture runway now has a first `Verify provider file` control for LiveKit/server-mix recording assets.

Implemented pieces:

- `reconcileLiveKitEgressRecording` in `apps/web/src/lib/server/coaching/livekit-egress.ts`
- `reconcileProviderRecordingAssetAction` in the team runway actions
- provider recording verification button on recent `SERVER_MIX` recording assets
- `@google-cloud/storage` declared for `apps/web`

Truth ladder:

1. LiveKit start creates an `UPLOADING` server-mix asset.
2. LiveKit stop marks the server-mix asset `UPLOADED`.
3. Reconciliation checks the storage object.
4. Only nonzero object evidence marks the asset `VERIFIED`.
5. Only verified provider evidence queues transcript work.

Current limitation:

This first reconciliation only proves cloud object existence and nonzero bytes. It does not yet prove audio stream, duration, or transcript suitability. Add media probing before treating provider recordings as production-perfect.

### Slice 8: App Store readiness

- Add account deletion route/screen.
- Add privacy and permission copy.
- Add test account instructions.
- Add review notes describing recording consent and payment classification.
- Ensure paid one-to-one coaching is not confused with SaaS, group coaching, or digital content.

## Human and agent review checklist

Before claiming this lane works:

- Can a new user get a home Nest and a coaching/client profile?
- Can a service offering be created without code changes?
- Can a client request or hold a real slot?
- Can a Stripe test checkout be created from Quipsly state?
- Does webhook evidence reconcile back to Quipsly state?
- Can a booking create or link calendar evidence?
- Can the iOS app show a session and request recording consent?
- Can the app record locally without losing files?
- Can upload resume or fail calmly?
- Can a transcript job attach to the recording asset?
- Can notes and action items be created from the transcript?
- Can reviewers see exactly what is ready, what is blocked, and what evidence exists?

## Source links for next research refresh

- Apple App Review Guidelines: https://developer.apple.com/app-store/review/guidelines/
- Apple account deletion guidance: https://developer.apple.com/support/offering-account-deletion-in-your-app/
- Stripe Checkout docs: https://docs.stripe.com/checkout
- Stripe webhooks docs: https://docs.stripe.com/webhooks
- Stripe Customer Portal docs: https://docs.stripe.com/customer-management
- LiveKit egress docs: https://docs.livekit.io/home/egress/
- Google Calendar API events docs: https://developers.google.com/calendar/api/v3/reference/events

## Current stop point

Schema spine is started. Documentation spine is created. No build, Prisma validation, migration, Stripe live charge, calendar mutation, external invite, recording, upload, or App Store action was run in this pass.

## Implementation note: first coaching Stripe seam

Added coaching-specific Stripe code separate from the existing WorldHub and mock checkout paths:

- `apps/web/src/lib/server/coaching/stripe.ts`
- `apps/web/src/app/api/coaching/checkout/route.ts`
- `apps/web/src/app/api/coaching/webhooks/stripe/route.ts`

The route is intentionally guarded:

- It requires an existing `CoachingBooking`.
- It only allows `PAID_ONE_TO_ONE` bookings.
- It records `PaymentRecord` and `StripeCheckoutSessionLedger` evidence.
- It refuses live Stripe keys unless `QUIPSLY_ALLOW_LIVE_STRIPE=true` is explicitly set.
- It processes Stripe webhook events into `StripeWebhookEvent`, `PaymentRecord`, `StripeCheckoutSessionLedger`, and booking status.

The coaching runway and mobile capture readiness packet now expose a separate
payment-readiness boundary. This is intentional: a configured Stripe key is only
evidence that checkout can be attempted. It is not permission to sell SaaS,
courses, group coaching, content libraries, subscriptions, or entitlements
through the one-to-one coaching path. The visible modes are `not-configured`,
`test-or-held`, and `live-enabled`; only `live-enabled` means the explicit live
Stripe guard has been opened, and the checkout path still remains scoped to
eligible paid one-to-one real-time coaching.

## Implementation note: Stripe Customer Portal seam

The team coaching/capture runway now has a Customer Portal launch path for clients who already have Stripe customer evidence.

Implemented pieces:

- `createCoachingCustomerPortalSession` in the coaching Stripe helper.
- `createCoachingCustomerPortalAction` in the team runway actions.
- A Stripe Customer Portal operator panel on `/team/coaching-capture`.

Boundary:

- Portal sessions require an existing Stripe customer ID from checkout/webhook/payment evidence.
- Quipsly does not invent a portal customer from an email alone.
- Customer Portal can help a client manage Stripe-side payment details for eligible one-to-one coaching.
- Customer Portal does not create bookings, entitlements, recordings, consent, transcripts, subscriptions, group coaching access, courses, or SaaS access.
- Quipsly remains the source of truth for the booking, capture, transcript, notes, action items, and publication/capture receipt chain.
- It uses Quipsly `User.primaryEmail` as the app-owned customer email source for coaching checkout.
- Completed checkout webhooks now upsert `StripeCustomerLink` records so Customer Portal and reconciliation can find the Stripe customer later without making Stripe the user source of truth.
- The internal coaching/capture runway can create a guarded Stripe checkout from a paid one-to-one booking. This is an operator/test-mode control, not a broad in-app purchase surface.

This code depends on the new Prisma schema models. It should not be considered build-ready until Prisma format, validation, generation, and migration planning have run intentionally.

## Implementation note: coaching request to capture runway bridge

The older High Ground coaching request flow still creates `CoachingRequest` records and team operators can still convert those requests into `Appointment` records.

That conversion now also attempts to create the newer Quipsly-owned `CoachingBooking`, `BookingHold`, `CalendarEventLink`, and planned `CallRoom` through the shared booking-draft helper. If the new booking write gate or schema rollout is not ready, the appointment still schedules and the team sees an honest bridge warning instead of silently splitting the coaching workflow.

This is intentionally a migration seam, not a permanent dual-source architecture:

- public coaching requests remain the inbound interest signal
- appointments remain compatible with existing dashboard/calendar surfaces
- `CoachingBooking` and `CallRoom` become the durable capture/payment/consent/transcript spine as the new lane matures

## Implementation note: booking runway scheduling controls

The team coaching/capture runway now has controlled booking updates for the scheduling MVP:

- add reusable coach availability windows
- see active availability blocks by coach, weekday, time, and timezone
- update booking status
- reschedule start/end/timezone
- add an operator note
- append operator history to booking metadata
- sync linked booking hold timing/status
- sync linked calendar evidence timing/status
- sync linked planned call-room timing/status

The booking stays the source of truth. Holds, calendar links, and call rooms are operational mirrors or evidence records. This keeps scheduling changes from splitting into several invisible clocks.

Default coaching scheduling should use Pacific time (`America/Los_Angeles`) unless a coach profile, booking, or explicit client-facing selection overrides it. Homer is in Orange County, so Pacific is the least surprising default for his coaching workflow. The active Quipsly calendar adapter exposes this through `COACHING_DEFAULT_TIMEZONE`; do not reintroduce Denver or local-machine timezone defaults into the coaching path.

`GET /api/coaching/calendar/readiness` is the side-effect-free calendar readiness surface. Signed-in users can read the non-secret configured posture. Staff can add `?verify=1` to perform a read-only Google Calendar metadata check. That verification must not create, update, delete, send, invite, or schedule anything externally; it only proves whether Quipsly can read the configured calendar before an operator syncs booking evidence.

For local development, `GOOGLE_CALENDAR_ALLOW_APPLICATION_DEFAULT=true` permits Quipsly to use Application Default Credentials from `gcloud auth application-default login` as an explicit test credential path. Dedicated service-account or refresh-token credentials remain the preferred production paths. Metadata-token fallback is for deployed runtimes where the service account and calendar sharing have been intentionally configured.

This still needs validation, migration, and runtime smoke before it is treated as production-ready.

## Implementation note: iOS capture consent and source preservation seam

Added the first real mobile-capture safety seam across the iOS app and Nest ingest endpoints.

Updated iOS files:

- `apps/mobile-capture/HighGroundCapture/HighGroundCapture/BridgeModels.swift`
- `apps/mobile-capture/HighGroundCapture/HighGroundCapture/AudioCaptureController.swift`
- `apps/mobile-capture/HighGroundCapture/HighGroundCapture/UploadManager.swift`
- `apps/mobile-capture/HighGroundCapture/HighGroundCapture/QuipslyMobileComponents.swift`

Updated Nest ingest files:

- `apps/quipsly/src/app/api/ingest/mobile/chunk/route.ts`
- `apps/quipsly/src/app/api/ingest/mobile/route.ts`

What changed:

- Recorder commands can now carry `callRoomId`, `participantId`, `recordingConsentId`, `recordingAssetId`, `recordingConsentGranted`, and `capturePurpose`.
- The native recorder refuses to start without explicit consent.
- The visible recorder controls now include a consent toggle and plain-language warning.
- Automatic 24-hour deletion of local `.m4a` recordings was removed. Local recordings are preserved until a future verified-prune policy exists.
- Hard upload errors now hold the local recording for recovery instead of deleting it.
- Chunked upload headers now include call-room, participant, consent, recording-asset, and capture-purpose metadata.
- Nest mobile chunk ingest preserves that metadata in the upload manifest, GCS metadata, episode imported-media metadata, and JSON response.
- One-shot mobile ingest now preserves the same metadata so fallback uploads do not lose coaching/capture context.

Current limitation:

This is still a metadata-preserving seam, not the final fully relational capture pipeline. The next backend pass should create/update `CallRoom`, `CallParticipant`, `RecordingConsent`, `RecordingAsset`, `UploadChunk`, and `TranscriptJob` records from the ingest endpoint after Prisma validation/generation/migration are intentionally completed.

Required next checks before claiming production readiness:

1. Prisma format/validate/generate after the additive schema pass.
2. Xcode compile check for the iOS capture app.
3. API compile check for `apps/quipsly` and `apps/web` after Prisma client generation.
4. A local recorder smoke with consent off must refuse recording.
5. A local recorder smoke with consent on must create a local `.m4a`, upload or hold it, and never delete it on failure.
6. Nest ingest response should echo consent/call-room metadata.
7. Server-side recording/transcript records should be created only after the schema is migrated.

## Implementation note: mobile ingest relational write-through

Added shared server helper:

- `apps/quipsly/src/lib/server/mobile-capture-records.ts`

Updated ingest routes:

- `apps/quipsly/src/app/api/ingest/mobile/chunk/route.ts`
- `apps/quipsly/src/app/api/ingest/mobile/route.ts`

What changed:

- After media upload/asset creation, Nest now attempts to create relational coaching/capture records:
  - `CallRoom`
  - `CallParticipant`
  - `RecordingConsent`
  - `RecordingAsset`
  - `UploadChunk`
  - `TranscriptJob`
- The write-through is intentionally non-destructive. If relational capture record creation fails during schema migration or rollout, the media upload can still succeed and the response reports `captureRecordError`.
- `TranscriptJob` starts as `QUEUED` with provider `pending`; no transcription provider call is made yet.
- `RecordingAsset` is marked `VERIFIED` for GCS-backed uploads and `UPLOADED` for local-dev fallback uploads.
- `UploadChunk` records are created or updated by `(assetId, chunkIndex)` so retrying a chunked upload does not create a pile of duplicate chunks.

Current limitation:

This depends on the new Prisma schema models. The helper should not be considered compile-ready until Prisma format, validation, generation, and migration have been run intentionally.

Next implementation target:

Build the scheduling/booking UI seam that creates `CoachingBooking` and `CallRoom` records before the iOS app joins a session. Once that exists, mobile capture should receive server-generated room, participant, and consent IDs instead of relying on local/ad hoc labels.

## Implementation note: gated coaching booking draft seam

Added a controlled scheduling/booking seam:

- `apps/web/src/lib/server/coaching/bookings.ts`
- `apps/web/src/app/api/coaching/bookings/route.ts`

What it creates:

- `CoachingBooking`
- `BookingHold`
- `CalendarEventLink` evidence stub
- planned `CallRoom`

Safety posture:

- The route is disabled unless `COACHING_BOOKING_WRITE_ENABLED=true`.
- It does not charge money.
- Paid one-to-one bookings return `nextAction: create-stripe-checkout`, which then flows through the separate coaching Stripe checkout seam.
- Calendar evidence is only planned metadata. It does not create a live Google Calendar event yet.
- Call rooms are planned records only. They do not start a meeting or recording.

Next implementation target:

Replace the environment-gated route with a proper authenticated team/admin and client-facing booking UI. The route is useful for controlled test-mode/internal wiring but is not the final public booking surface.

## Implementation note: gated Stripe Customer Portal seam

Added a coaching customer portal seam:

- `apps/web/src/app/api/coaching/customer-portal/route.ts`
- `createCoachingCustomerPortalSession(...)` in `apps/web/src/lib/server/coaching/stripe.ts`

Safety posture:

- The route is disabled unless `COACHING_CUSTOMER_PORTAL_ENABLED=true`.
- It does not create customers by itself.
- It opens a Stripe Billing Portal session from an existing `StripeCustomerLink` or explicitly supplied Stripe customer ID.
- This should become an authenticated customer/team action before production exposure.

## Implementation note: team coaching capture runway page

Added a read-only operator page:

- `apps/web/src/app/team/coaching-capture/page.tsx`

Added it to Team Console navigation:

- `apps/web/src/app/team/layout.tsx`

What it shows:

- recent `ServiceOffering` records
- recent `CoachingBooking` records
- payment policy and payment evidence status
- planned call room state
- consent, recording asset, and transcript counts
- recent `RecordingAsset` records
- recent `TranscriptJob` records
- plain-English next safest action for each booking or room

Why it is read-only first:

The schema and Prisma client still need intentional validation, generation, and migration. A read-only runway helps humans and agents inspect the new source-of-truth chain without exposing a half-finished public workflow.

Truth rule reinforced:

Stripe is payment evidence. Calendar is scheduling evidence. The iOS app is capture evidence. Quipsly owns the booking, consent, recording, transcript, notes, and action-item chain.

## Implementation note: controlled setup and booking controls

Added gated server actions for the Team Coaching Capture runway:

- `apps/web/src/app/team/coaching-capture/actions.ts`
- updated `apps/web/src/app/team/coaching-capture/page.tsx`

What operators can now attempt from the runway page:

- Seed or refresh a coach profile, one-to-one coaching service offering, podcast capture service offering, and a starter availability window.
- Create a draft booking from an existing client and service offering.
- The draft booking action creates a Quipsly-owned booking, hold, calendar evidence stub, and planned call room through the shared `createCoachingBookingDraft(...)` seam.

Safety gates:

- Foundation seed requires `COACHING_CAPTURE_SETUP_ENABLED=true`.
- Draft booking writes still require `COACHING_BOOKING_WRITE_ENABLED=true` through the shared booking helper.
- Both actions require internal team access.
- Failures redirect back to `/team/coaching-capture` with calm visible status instead of throwing the user into a raw Next error page.

Current limitation:

The write controls depend on the additive Prisma schema and should not be exposed as a production workflow until Prisma validation/generation/migration and route/page validation are complete. They are intended to accelerate controlled internal setup and testing.

## 2026-07-04 research refresh and mobile session seam

Current source-backed direction:

- Apple still draws a sharp line between one-to-one real-time person-to-person services and one-to-few or one-to-many services. Keep Stripe checkout restricted to explicit `PAID_ONE_TO_ONE` bookings until group coaching, course, SaaS, or content-library purchases get their own App Store classification.
- Apple recording policy requires explicit consent and a clear visual or audible indication when recording user activity, including microphone input. The capture app must keep the consent gate and visible recording state as product primitives, not review-note wallpaper.
- Apple account-deletion guidance applies because Quipsly creates/signs in users. Capture must link to an account deletion initiation path before App Store submission.
- Stripe Checkout is the right payment front door for one-to-one coaching MVP because it gives hosted payment UI, test-mode proof, and webhook events. Webhook events must reconcile into Quipsly-owned booking/payment state; they should not directly become booking truth.
- Google Calendar event links are evidence and convenience. Calendar attendees, conference data, reminders, and event IDs belong in `CalendarEventLink`, but Quipsly booking state remains canonical.
- LiveKit remains the preferred first meeting spine to prototype: rooms map to `CallRoom`, participants map to `CallParticipant`, tokens are server-issued, Swift SDK support exists, and egress can record room composites or individual tracks. For audio-only coaching, server-side audio egress plus local iOS recording fallback gives the safest capture story.

Practical product decision:

Do not build a generic "call recorder" first. Build scheduled Quipsly sessions first, then make the iOS app choose a real session and record against its call room, participant, and consent records. Ad hoc field-note capture can come back as a deliberate "Home Nest quick note" flow later.

Implementation update:

- Added authenticated Nest endpoint `GET /api/mobile/capture/sessions`.
- The endpoint returns accessible call rooms with booking labels, payment status, project/episode routing, participant ID, consent ID/status, recording counts, transcript job counts, and next-action copy.
- The iOS capture board now loads that list and requires a selected Quipsly session before starting a coaching/podcast recording.
- The start command carries the selected room, participant, consent, project, episode, and purpose metadata into the existing local recording and chunked upload path.

This intentionally replaces the "invent a local room ID from the text label" habit for coaching/podcast capture. Real work needs a real room before recording starts.

## Implementation note: participant consent write from iOS

Added the first mobile consent mutation seam:

- `apps/quipsly/src/app/api/mobile/capture/consent/route.ts`
- `CaptureSessionClient.grantRecordingConsent(for:)` in the iOS capture app
- `RecorderControlBoard.startSelectedSessionRecording()` now writes consent before local recording starts

Behavior:

- The signed-in user must have access to the call room through creator, participant, booking client, booking coach, or staff access.
- Recording consent must be explicitly granted in the request.
- If the user is allowed into the room but does not yet have a participant record, Quipsly creates a participant row for that user.
- The route creates or updates a `RecordingConsent` row with audio recording and transcription consent.
- The iOS app uses the returned participant ID and consent ID in the local recorder command and upload metadata.

Why this matters:

A coaching or podcast recording is no longer just a local audio file with hopeful labels. It can be traced from signed-in user to call room, participant, consent, recording asset, upload chunks, transcript job, and later notes/action items.

Not yet validated:

- Prisma generate/migration.
- Next route build.
- iOS compile/device smoke.
- Full consent revocation/decline UX.
- Multi-participant consent policy enforcement.

## Implementation note: provider-neutral mobile room join contract

Added the first mobile room-join contract:

- `apps/quipsly/src/app/api/mobile/capture/rooms/join/route.ts`
- `CaptureSessionClient.prepareRoomJoin(for:)` in the iOS capture app
- `Prepare call room` button on the capture board

Behavior:

- The signed-in user must have access to the call room through creator, participant, booking client, booking coach, or staff access.
- The route creates a participant row for the user if they are allowed into the room but do not yet have one.
- Planned/non-provider rooms return `canJoin: false` with a clear next action.
- Rooms with `provider: livekit` can return a short-lived LiveKit join token when `LIVEKIT_URL`, `LIVEKIT_API_KEY`, and `LIVEKIT_API_SECRET` are configured.
- The returned contract includes provider, room name, participant token, participant ID, consent ID/status, token expiry, and next-action copy.

Current boundary:

This is not the full in-app voice meeting UI yet. It is the provider-neutral handshake that lets the app ask Quipsly what room/provider/token state is true before a LiveKit or other WebRTC client is introduced.

## Implementation note: transcript runner MVP

Added the first provider-neutral transcript execution seam:

- `apps/quipsly/src/lib/server/capture-transcripts.ts`
- `apps/quipsly/src/app/api/mobile/capture/transcripts/run/route.ts`
- `UploadManager.lastTranscriptJobId` now remembers the queued transcript job from upload completion
- The iOS capture board now shows `Transcript queued: ...` after a successful upload returns capture records

Current behavior:

- Ingest already creates a `TranscriptJob` after verified mobile upload.
- The runner can execute a transcript job using `CAPTURE_TRANSCRIPT_PROVIDER=deepgram` and `DEEPGRAM_API_KEY`.
- Deepgram responses are converted into `TranscriptSegment` rows using utterances when available, falling back to grouped word timing.
- Missing API key, missing cloud object path, unverified assets, unsupported providers, or oversized route payloads are marked as `HELD` with a clear error instead of fake success.
- Provider failures and empty transcript responses are marked `FAILED`.

Boundary:

This route-runner is an MVP/control-plane seam, not the final worker for multi-hour calls. Long calls should move to a background worker or Cloud Run job using the same `TranscriptJob` contract.

Next transcript targets:

- Add an operator button or queue worker to run eligible transcript jobs.
- Add transcript summary, highlights, coaching notes, and action-item extraction after segment creation.
- Add speaker correction UI so transcript segments can be assigned to the correct participant.
- Decide whether Deepgram, Google Speech-to-Text, AssemblyAI, or a hybrid becomes the default production provider.

## Implementation note: transcript to coaching packet builder

Added the first transcript packet builder:

- `apps/quipsly/src/lib/server/coaching-packets.ts`
- `apps/quipsly/src/app/api/mobile/capture/transcripts/packet/route.ts`
- Team runway now shows recent coaching packet notes and action-item candidates in `apps/web/src/app/team/coaching-capture/page.tsx`

Behavior:

- A completed `TranscriptJob` can be turned into a deterministic candidate packet.
- The builder creates one `CoachingNote` summary, up to six highlight notes, and action-item candidates from transcript segments.
- It uses transcript timing, speaker labels, action-language patterns, and segment confidence when available.
- Existing packets are reused unless `force: true` is passed.
- Notes and action items carry `sourceJson` with transcript job, recording asset, room, provider, segment timing, and review-required metadata.

Boundary:

This is reviewable coaching work, not final coaching judgment. It should help a coach, client, or Quipsly agent move faster, but candidate action items are not commitments until reviewed.

Next packet targets:

- Add Gemini/LLM-assisted packet expansion behind a clear provider gate.
- Add speaker correction and participant assignment before polished summaries.
- Add a client-facing follow-up packet surface.
- Add webhook/worker automation after transcript completion.

## Implementation note: account deletion request ledger

Added a reviewed account-deletion request path:

- `UserAccountDeletionRequestStatus` and `UserAccountDeletionRequest` in `prisma/schema.prisma`
- `apps/quipsly/src/app/api/account/deletion-request/route.ts`
- `AccountDeletionClient` and `AccountSafetyPanel` in the iOS capture app
- Account section in both iPhone and iPad mobile shells
- Recent deletion request visibility on the team coaching/capture runway

Design decision:

Do not hard-delete accounts directly from the app. Quipsly needs an in-app deletion initiation path for App Store readiness, but real deletion must account for retention/export/payment/consent/recording/transcript obligations. This path records the request, deduplicates open requests, and makes it visible to operators.

Implementation note:

The iOS app now normalizes the configured Nest URL so clients tolerate either a root URL or `/api` URL. Upload uses the API-root normalizer; auth/session/account clients use the Nest-root normalizer.

## 2026-07-07 transcript-to-packet route hardening

The authenticated Nest packet route now returns an explicit `quipsly-mobile-capture-transcript-packet-v1` shape for coaching/podcast capture follow-up material.

Added route evidence:

- `GET /api/mobile/capture/transcripts/packet` returns packet kind, generation time, source-truth boundaries, and safe actions.
- `POST /api/mobile/capture/transcripts/packet` returns the same packet kind and boundaries after building review artifacts.
- The route states the intended truth split directly: recording assets remain source evidence, transcript segments are derived evidence, and coaching packet notes/action items are review projections.
- Safe actions distinguish `build-review-packet`, `review-packet`, and `repair-transcript-first` so native capture, Nest reviewers, and agents do not collapse transcript completion into packet review.

Validation run:

```bash
node scripts/quipsly-mobile-capture-contract-smoke.mjs --source-only
node scripts/quipsly-coaching-lifecycle-static-smoke.mjs
corepack pnpm --dir apps/quipsly typecheck
```

Result: source contracts and typecheck passed. Live network checks still fail until the current Nest image is deployed/promoted; this is the same known production drift tracked by the public loop route matrix.

## 2026-07-07 native transcript-packet readback

Native capture now decodes the transcript-to-packet build response boundary instead of treating packet creation as a generic success toast. `MobileCapturePacketBuildResponse` carries `packetKind`, `generatedAt`, `nextAction`, and `MobileCaptureTranscriptPacketBoundaries`, including the recording-source-truth and review-rule language returned by Nest. The capture UI shows this in a `MobileCapturePacketTruthPanel` after packet build so reviewers and agents can see that recordings remain source truth, transcript segments are derived evidence, and coaching packet output is review material until a human approves next action.

Validation run:

- `node scripts/quipsly-mobile-capture-contract-smoke.mjs --source-only --json`
- `node scripts/quipsly-ios-capture-app-store-static-smoke.mjs`
- `swiftc -parse apps/mobile-capture/HighGroundCapture/HighGroundCapture/BridgeModels.swift`
- `swiftc -parse apps/mobile-capture/HighGroundCapture/HighGroundCapture/QuipslyMobileComponents.swift`

Follow-up validation on 2026-07-08 proved the full simulator build works when
the repo supplies the Xcode path explicitly:

```bash
DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer \
  xcodebuild -project apps/mobile-capture/HighGroundCapture/HighGroundCapture.xcodeproj \
  -scheme HighGroundCapture \
  -destination 'generic/platform=iOS Simulator' \
  CODE_SIGNING_ALLOWED=NO \
  build
```

The machine-level `xcode-select` may still point at CommandLineTools, so use the
explicit `DEVELOPER_DIR` path in scripts and handoffs instead of treating
`xcodebuild` as unavailable.
