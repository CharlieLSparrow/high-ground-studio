# Quipsly iOS capture App Review notes draft

Date: 2026-07-29
Status: Build 8 submitted for external TestFlight beta review
Target app: `apps/mobile-capture/HighGroundCapture`
Bundle identifier observed: `com.highgroundodyssey.HighGroundCapture`

## Reviewer summary

Quipsly Capture is a native, iPhone-only iOS 17 app for coaching calls,
podcast sessions, interviews, and field notes. It can save a 48 kHz mono AAC
audio source, a solo camera-and-microphone movie, or a video-only podcast
camera source locally before upload. The app records only after the user
chooses the source mode, separately chooses the allowed audio, video, and
transcription consent, attests that everyone who may be heard was informed and
agreed, and then presses the visible Record control.

## Recording behavior

- Consent confirmation does not start recording, and joining a LiveKit room does not start local or provider recording.
- Recording state remains visible through text, shape, timer, controls, and VoiceOver while capture is active.
- The user can prepare the front or back camera. Flipping cameras during an
  active take closes and validates the first immutable movie, then starts the
  other camera in the same capture group. Quipsly preserves the explicit source
  boundary rather than pretending the switch was one uninterrupted file.
- Pause and resume likewise create honest source boundaries in the same capture
  group. The cloud alignment layer retains those segments and gaps for later
  assembled playback.
- Local audio and its protected receipt ledger remain preserved if the network, upload, authentication, or app process fails; the app never prunes originals automatically.
- Upload uses a file-backed background task and an authenticated private-GCS resumable session. Quipsly calls a cloud copy verified only after generation, media type, exact bytes, CRC32C, SHA-256, and ownership checks pass.
- Verified bytes are preservation truth, not automatic permission to edit or transcribe. Studio attachment, transcription, and coaching packets remain held until their normalized consent/release gates pass.
- The signed-in owner can explicitly delete one local original from this iPhone after a separate irreversible-deletion confirmation. That operation does not delete cloud media or the Quipsly account.

## Payments

One-to-one coaching payments are intended to use Stripe only for eligible real-time person-to-person coaching services. Quipsly SaaS access, content libraries, courses, group coaching, and other digital goods are kept separate and should not be routed through this one-to-one coaching checkout path without additional App Store classification review.

## Test path for reviewer

1. Sign in with the provided test account.
2. Open the capture/recording surface.
3. Confirm that Record is unavailable until the versioned consent sheet is completed.
4. Consent to audio recording, independently allow or decline transcription, and confirm everyone who may be heard was informed and agreed.
5. Confirm that completing consent still does not start recording.
6. Start a short local audio recording, add a mark or pause/resume, then stop.
7. Optionally choose Solo video, prepare either camera, start a disposable
   take, and use Flip once. Confirm that the app visibly closes and preserves
   one source before arming the other camera.
8. Open Library and observe the distinct local-save, upload,
   cloud-verification, and processing-held/released states.
9. If the network is unavailable, confirm the source remains saved on the
   iPhone with calm retry guidance.
10. Open Account and confirm the account-deletion initiation path is easy to
    find.

## Current engineering readiness note

Exact committed source `3d414de4e22d4f6e3f659a5a6e47015dd51fbc0c`
passes 32/32 deterministic native UI scenarios. Its signed `1.0 (8)` IPA has
SHA-256
`8e637fa67c5def105e5292a4aa7c37c827c226344663164c08e3576b92617056`
and independently passed app/extension signing, entitlement,
provisioning-profile, privacy-manifest, purpose-string, background-mode, and
export-compliance inspection. The upload and Apple's processing wait returned
successfully. App Store Connect identifies provider build
`32fdd892-e38a-41bb-992d-ef2c049bc43a`. At the 2026-07-29 readback, its
external state is `WAITING_FOR_BETA_REVIEW` and its beta-review state is
`WAITING_FOR_REVIEW`.

The private external group `Quipsly Capture Rehearsal` contains Build 8 and the
intended tester, uses automatic notification after approval, and has current
beta app/build localization. A real reachable Beta App Review contact, the
synthetic reviewer account, and review notes are stored in App Store Connect.
The redacted API receipt records both the review-detail update and successful
submission without storing the phone number or reviewer password.

The account-deletion request, 30-day status policy, reviewed inventory,
fail-closed executor, Firebase/GCS adapters, completion email, recovery state,
and durable receipts are implemented. A disposable local operating loop
creates, reviews, executes, retries, receipts, and cleans up an eligible test
account, while a Home Nest with another collaborator is refused. The executor
is disabled outside a controlled worker by default.

Production Nest revision `studio-00425-gij` is at 100% traffic and the complete
public mobile contract passes 104/104. Its deployed source
`9a12b33d1f60374bfaa8dd89372c71db4becddff` has the same Nest, Prisma, and
shared-domain source as Build 8; the intervening commits change only the native
Capture target and release/rehearsal tools. Google Cloud, Firebase, production
routing, billing, Cloud SQL, and public support/privacy/deletion routes are
healthy.

The synthetic reviewer credential is stored outside Git, signs in through
Firebase and native session-check, and has visible consent-gated production
capture Sessions. A separate two-participant High Ground Odyssey rehearsal
room is also persisted with requested human-controlled consents, provider
readiness, and no recording, provider join, invitation, Stripe, or calendar
side effects.

Build 6 has provider-side installation evidence on the trusted iPhone, but
Build 8 has not yet completed external beta review, installation, app-owned
version readback, or physical operation. CoreDevice still does not enumerate
the iPhone. The five final screenshots are absent, App Privacy has not been
published, and legal, rating, DSA, pricing, territory, and deletion-retention
answers still require account-holder review. The exact provider audit is in
`docs/coordination/2026-07-28-capture-app-store-connect-audit.md`.

## Public policy URLs

Configured policy routes for reviewer reference:

- Privacy and recording policy: `https://quipsly.com/privacy`
- Account deletion request explanation:
  `https://quipsly.com/privacy/account-deletion`

Both canonical marketing URLs return HTTP 200 through the production routing
boundary. App Store Connect has not yet been given either URL.

The in-app action creates a reviewed deletion request rather than blindly
erasing shared or retention-sensitive records. Eligible private accounts can
then be executed through the controlled, receipt-backed deletion workflow.
Accounts with shared, payment, consent, session, or ambiguous retention records
remain blocked for an explicit reviewed plan.
