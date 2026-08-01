# Quipsly iOS capture privacy label and reviewer matrix

Date: 2026-08-01
Status: Build 25 external-beta inventory; not legal-reviewed or App Store-submitted
Target app: `apps/mobile-capture/HighGroundCapture`

## Purpose

This matrix keeps the iOS capture app honest for App Store review and for humans using the product. Quipsly records coaching calls, podcast sessions, interviews, and field notes only after explicit consent. Those recordings can become transcripts, notes, action items, packets, and publishing assets.

This is not legal advice. Before submission, the final App Store Connect privacy labels should be reviewed against the exact production behavior, vendors, retention policy, and account deletion process.

## Public routes and readiness endpoint

- Privacy policy: `https://quipsly.com/privacy`
- Account deletion explanation:
  `https://quipsly.com/privacy/account-deletion`
- Mobile capture readiness endpoint: `GET https://nest.quipsly.com/api/mobile/capture/readiness`

The two canonical marketing policy URLs return HTTP 200 through production.
The readiness endpoint returns HTTP 200, exposes configuration booleans and
the equivalent Nest policy URLs, and does not expose secrets. App Store Connect
now contains both policy URLs, the canonical en-US listing, categories, manual
release setting, Build 25 assignment, and credential-backed App Review details.
The exact redacted listing receipt is stored outside Git with the retained QA
artifacts.

## Data categories likely involved

| App Store category | Quipsly examples | Collected? | Linked to user? | Used for tracking? | Notes |
| --- | --- | --- | --- | --- | --- |
| Contact Info | account email, display name, coaching contact email, optional phone | Yes | Yes | No | Needed for sign-in, scheduling, coaching follow-up, and account support. |
| User Content | recordings, transcripts, notes, action items, field notes, podcast/session artifacts | Yes | Yes | No | Core product data. Original recordings should be preserved until verification/retention policy says otherwise. |
| Audio Data | microphone recordings, provider/server-mix recordings | Yes | Yes | No | Requires explicit consent and visible recording state. |
| Photos or Videos | solo camera-and-microphone movies, video-only podcast camera sources, immutable camera-switch segments | Yes | Yes | No | Build 25 can capture from either iPhone camera. Video consent and visible recording state are required, and source boundaries are preserved across camera switches and pauses. |
| Other User Content | uploaded chunks, recording manifests, transcript corrections, coaching packets | Yes | Yes | No | Use clear retention and deletion review language. |
| Purchases | Stripe checkout/session/payment evidence for eligible one-to-one coaching | Conditional | Yes | No | Stripe is evidence only. Do not use this for SaaS, courses, group coaching, or digital goods inside iOS. |
| Identifiers | Quipsly user ID, Firebase/auth subject, device/session IDs | Yes | Yes | No | Needed for authentication, upload ownership, recovery, and support. |
| Usage Data | session status, upload progress, transcript job status | Review before submission | Yes | No | App-owned operational state is used to finish the user's capture workflow; reconcile the signed archive and production telemetry before selecting this label. |
| Diagnostics | upload errors, provider readiness state, held/failed reasons | No separate telemetry SDK in this candidate | N/A | No | These details are currently app-owned workflow state. Revisit this answer if crash or analytics tooling is added. |
| Location | user-provided timezone/availability notes | Conditional | Yes | No | Do not request GPS location for capture MVP unless a future feature actually needs it. |
| Sensitive Info | coaching topics may include sensitive personal content | User-provided | Yes | No | The app should not prompt for protected categories unnecessarily, but coaching content can naturally contain sensitive topics. |

## Recording disclosure requirements

The app must make these facts visible:

- Recording never starts secretly.
- Audio recording and transcription are separate, explicit choices. Declining transcription must not block a consented local audio take.
- Consent can be granted, declined, or revoked, and the exact policy version/copy presented is bound into the receipt evidence.
- Everyone who may be heard, including a nearby person without a signed-in Quipsly participant record, must be told and agree before capture.
- Recording state must be visible while active.
- Local capture may continue only while consent remains valid.
- Provider recording and local recording are separate paths.
- A transcript is generated only after exact upload verification, current all-party transcription authorization, and a separate released processing receipt. A durable cloud copy may remain preservation-only.

## Account deletion posture

The app has an in-app deletion-request path, visible request status, a disclosed
30-day target, and a public explanation route. Deletion is reviewed because
accounts can attach to:

- bookings
- Stripe evidence
- recording consent
- recordings
- transcripts
- notes
- action items
- publication or receipt records

The controlled executor now inventories the account, refuses shared or
retention-ambiguous records, deactivates access before destructive work, deletes
eligible private database/GCS/Firebase identity data, sends completion email,
and retains a sanitized durable execution receipt. It is disabled by default
outside the controlled worker and supports idempotent recovery after failure.
The local disposable end-to-end proof passes; production schema, provider
configuration, execution, completion confirmation, and account-holder
retention review remain required. The Account option must stay easy to find and
must not degrade into a support-only email flow.

## Test account requirements

Before App Store submission, prepare a reviewer account with:

- working sign-in
- at least one planned coaching/capture session
- one session prepared for local fallback
- ideally one LiveKit-prepared session if provider credentials are configured
- consent state not granted by default
- visible ability to grant, decline, and revoke consent
- visible account deletion request path

Reviewer instructions should explicitly say:

1. Sign in with the test account.
2. Open the capture surface.
3. Select a Quipsly session.
4. Observe provider readiness/local fallback language.
5. Open the versioned consent sheet, consent to audio recording, independently choose whether transcription is allowed, and confirm everyone who may be heard was informed and agreed.
6. Start a short local recording.
7. Stop recording.
8. Observe upload or held-for-recovery state.
9. Open Account and confirm deletion request path is visible.

## Current gaps before App Store submission

- Build 25 is valid, in external beta testing, assigned to the external rehearsal
  group, reachable through the public TestFlight link, and assigned to iOS App
  Version 1.0. Its synthetic reviewer account and real reachable App Review
  contact are configured. Physical installation, app-owned version readback,
  and device operation remain open.
- Production operation of the account-deletion executor against one disposable
  eligible account, including completion confirmation and a sanitized durable
  execution receipt.
- Physical-iPhone Build 25 TestFlight validation of microphone fidelity,
  Bluetooth/wired/USB routes, lock/background, interruption, route loss, force
  quit, reboot, direct-GCS background recovery, solo video, podcast-camera
  video, camera switching, segment upload, and assembled playback.
- Real Nest-issued LiveKit/CallKit room validation and provider-egress reconciliation on device.
- Production operation of one disposable eligible deletion through completion,
  plus account-holder approval of the retention matrix and final
  Terms/Privacy/App Store answers.
- Final legal/privacy review, Xcode archive privacy report, and App Store
  Connect privacy-label reconciliation. The canonical engineering inventory is
  ready, but the account holder must confirm the final declarations.
- Five approved App Store screenshots from the physical/TestFlight candidate.
  The canonical listing metadata is maintained and source-valid; its strict
  submission gate remains red until those assets and delivery proofs exist.

## Product principle

Quipsly should reduce systems anxiety by making every sensitive state visible: signed in, session selected, consent status, recording state, upload state, verification state, transcript state, and deletion/request state.
