# Proposed goal: Coaching, capture, billing, scheduling, and App Store readiness

Date: 2026-07-04
Status: proposed replacement goal
Primary surfaces: HighGroundOdyssey.com, nest.quipsly.com, Quipsly iOS capture app, Quipsly Studio/Nest/Tower shared data model

## Parked work

The active Studio editor sprint is parked here:

`/Users/wall-e/Dev/high-ground-studio/apps/QuipslyStudio/docs/quipsly/parked-goals/2026-07-04-editor-shorts-transcript-repair-pause.md`

Do not mark that sprint complete. Resume it when the focus returns to Episodes 1-6, shorts repair, transcript alignment, or Episode 4 clip weaving.

## Research-backed product stance

This pivot should build a real coaching and capture platform, not a brittle booking form stapled to a recorder.

Apple App Review 3.1.3(d) explicitly allows non-IAP payment methods for real-time person-to-person services between two people, such as tutoring, consultations, and fitness training. One-to-few and one-to-many real-time services must use IAP. That means one-to-one coaching can use Stripe, but group coaching, courses, content libraries, and SaaS access must be classified separately.

Apple App Review 2.5.14 requires explicit consent and clear recording indication when recording microphone, camera, screen, or user activity. This is not optional for coaching calls or podcasts.

Apple requires in-app account deletion for apps with account creation. Recording, transcript, billing, calendar, and coaching data must be represented truthfully in App Store privacy disclosures.

Stripe should handle payment collection, invoices, customer portal, subscriptions, and webhook evidence. Quipsly must own the booking, entitlement, receipt, consent, recording, transcript, and publishing truth.

Live meeting architecture should support both coaching and podcast capture. The strongest technical direction is WebRTC rooms with server-side recording/egress where practical, plus local chunked recording/upload fallback for resilience.

For call recording law, treat all-party consent as the product default, especially because participants can be in different states or countries. This is not legal advice; it is the safest product posture.

## Architecture recommendation

Separate these flows from day one:

1. One-to-one coaching services: Stripe Checkout, invoices, Customer Portal, booking ledger, consent ledger.
2. Quipsly SaaS access: app-owned entitlements, later StoreKit/IAP or external-purchase strategy per platform and region.
3. Group coaching, courses, and libraries: classify before selling inside iOS.
4. Podcast/interview capture: same capture spine as coaching, different product language and post-production routing.

## Core records to design/build

- `CoachProfile`, `ClientProfile`, `ServiceOffering`, `AvailabilityWindow`, `Booking`, `BookingHold`, `CalendarEventLink`
- `StripeCustomerLink`, `StripeCheckoutSessionLedger`, `StripeWebhookEvent`, `PaymentRecord`, `EntitlementGrant`
- `CallRoom`, `CallParticipant`, `RecordingConsent`, `RecordingAsset`, `UploadChunk`, `TranscriptJob`, `TranscriptSegment`, `CoachingNote`, `ActionItem`
- `PodcastCaptureSession`, sharing the call/recording/transcript spine with coaching calls

## Non-negotiable product rules

- Quipsly-owned records are source of truth. Stripe, Calendar, LiveKit or any call provider, and App Store receipts are evidence feeds.
- No real call recording starts without explicit consent UI, visible recording state, and persisted consent audit trail.
- Local recording must be chunked, retryable, and source-preserving.
- Coaching calls and podcasts should become reusable Nest assets: transcript, notes, action items, highlights, clips, and follow-up packets.
- No charge, calendar invite, external upload, or recording should happen silently.
- The first App Store build must be useful as a native app, not just a wrapped website.

## Paste-ready active goal under 4000 characters

Build Quipsly coaching and capture into a real App Store-ready production lane.

Pause the current Quipsly Studio editor sprint safely. Keep its parked handoff intact, then focus on HighGroundOdyssey coaching, Quipsly coaching tools, and the iOS capture app.

Primary objective:
Create a durable coaching and podcast capture system: schedule sessions, collect one-to-one coaching payments through Stripe where allowed, run voice meetings in the app, record with explicit consent, upload resiliently, transcribe accurately, and turn every session into reusable Quipsly assets.

Core work:
1. Audit current coaching, Stripe, scheduling, auth, iOS capture, and Nest/Tower surfaces.
2. Design and implement app-owned source-of-truth records for coaches, clients, offerings, bookings, payments, call rooms, participants, recording consent, recordings, transcripts, notes, and action items.
3. Build Stripe test-mode one-to-one coaching checkout, webhook ledger, payment records, and Customer Portal path. Stripe is evidence, not source of truth.
4. Keep SaaS subscriptions, group coaching, courses, and content libraries separate from one-to-one coaching. Do not accidentally sell IAP-required products through Stripe inside iOS.
5. Build scheduling MVP: availability windows, booking holds, confirmed bookings, calendar-ready metadata, reschedule/cancel states, and next-action clarity.
6. Make the iOS capture app App Store-ready: native auth, useful home screen, join/start session, microphone permission, explicit recording consent, visible recording state, local chunked recording, retry upload, and calm failure recovery.
7. Research and choose the best meeting spine for our use case, likely WebRTC rooms with server-side recording/egress plus local recording fallback.
8. Produce transcription jobs from recordings and save transcript segments, speakers, notes, action items, and coaching/podcast packets into Quipsly.
9. Connect HighGroundOdyssey coaching pages to Quipsly-owned booking and capture state without making HGO the source of truth.
10. Build App Store readiness: privacy labels, account deletion, permission strings, test account path, review notes, recording disclosure, and no hidden behavior.

Safety:
- Do not charge real money, publish, send invites, or record real calls without explicit approval.
- Do not mutate source media or transcripts destructively.
- Preserve ledgers and receipts.
- If one lane blocks, continue on data model, UI, docs, Stripe test mode, scheduling, capture, or App Store readiness.

Acceptance:
Quipsly has a clear coaching/capture architecture, a working test-mode booking/payment path, a usable iOS capture MVP path, explicit recording consent, transcript asset flow, and a calm route from booking to recorded/transcribed session.

## First implementation slices

1. Audit existing code and docs for coaching, Stripe, scheduling, mobile capture, auth, and App Store readiness.
2. Create the canonical architecture/data model document.
3. Implement Stripe test-mode checkout plus webhook ledger for one-to-one coaching.
4. Implement scheduling MVP and app-owned booking states.
5. Implement iOS capture MVP: auth, session list, join/start, consent, local chunk recording, upload queue, transcript job stub.
6. Add App Store readiness checklist and review notes.
7. Wire HGO coaching pages to Quipsly-owned state.

## Sources checked

- Apple App Review Guidelines: payments, person-to-person services, recording consent, app usefulness, privacy/account deletion requirements.
- Apple account deletion guidance.
- Stripe Billing subscriptions, Customer Portal, and webhook docs.
- Google Calendar API event creation docs.
- LiveKit overview and egress docs for WebRTC rooms and server-side recording.
- Recording-law reference material from Digital Media Law Project and Reporters Committee. Use all-party consent as product default and obtain legal review before broad launch.

## Implementation note: 2026-07-04 schema and spine pass

Status: started, not validated or migrated.

This pass added an additive Prisma schema spine for coaching/capture truth and created the canonical handoff document:

`/Users/wall-e/Dev/high-ground-studio/docs/quipsly/coaching-capture-production-spine.md`

Key decision: Quipsly owns request, booking, consent, recording, transcript, notes, and action item truth. Stripe, calendar providers, and call providers remain evidence feeds.

Known immediate cleanup targets:

- Quarantine or replace the mock Stripe checkout route before any paid coaching flow uses it.
- Convert iOS capture deletion behavior into explicit retention/recovery policy.
- Extend mobile bridge commands from project/episode-only capture into call room, participant, consent, and recording asset capture.
- Validate Prisma schema and generate a targeted migration only when ready.

Implementation note: a first coaching-specific Stripe checkout/webhook seam now exists under `apps/web/src/lib/server/coaching/stripe.ts` and `apps/web/src/app/api/coaching/*`. It is guarded against accidental live charges and should be validated only after the additive Prisma schema pass is formatted, generated, and migration-planned.
