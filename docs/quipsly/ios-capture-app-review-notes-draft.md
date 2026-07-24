# Quipsly iOS capture App Review notes draft

Date: 2026-07-24
Status: Build 6 engineering draft, blocked from submission
Target app: `apps/mobile-capture/HighGroundCapture`
Bundle identifier observed: `com.highgroundodyssey.HighGroundCapture`

## Reviewer summary

Quipsly Capture is a native, iPhone-only iOS 17 app for coaching calls, podcast sessions, interviews, and field notes. It saves a 48 kHz mono AAC source locally before upload. The app records microphone audio only after the user explicitly chooses audio recording, separately chooses whether transcription is allowed, attests that everyone who may be heard was informed and agreed, and then presses the visible Record control.

## Recording behavior

- Consent confirmation does not start recording, and joining a LiveKit room does not start local or provider recording.
- Recording state remains visible through text, shape, timer, controls, and VoiceOver while capture is active.
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
6. Start a short local recording, add a mark or pause/resume, then stop.
7. Open Library and observe the distinct local-save, upload, cloud-verification, and processing-held/released states.
8. If the network is unavailable, confirm the source remains saved on the iPhone with calm retry guidance.
9. Open Account and confirm the account-deletion initiation path is easy to find.

## Current engineering readiness note

Exact committed source `e0525e68f9d2cedaa14c597ed978c4b66715b0f4`
passes 30/30 deterministic native UI scenarios, 80/80 safety contracts, and
635/635 App Store static checks. Its signed `1.0 (6)` IPA passed app/extension
signing, entitlement, provisioning-profile, privacy-manifest, purpose-string,
and export-compliance inspection. It has not been uploaded.

The account-deletion request, 30-day status policy, reviewed inventory,
fail-closed executor, Firebase/GCS adapters, completion email, recovery state,
and durable receipts are implemented. A disposable local operating loop
creates, reviews, executes, retries, receipts, and cleans up an eligible test
account, while a Home Nest with another collaborator is refused. The executor
is disabled outside a controlled worker by default.

Submission remains blocked. Production passes 96 of 104 mobile contract checks
and lacks eight current protected routes. The Nest privacy and deletion URLs
also redirect through an internal `:8080` port; the source fix is committed but
not deployed. Google Cloud/Firebase authorization currently requires
interactive reauthentication, no physical iPhone is visible, Build 6 is not in
TestFlight, no production reviewer account/session has been proved, and final
privacy/legal answers still require account-holder review.

## Public policy URLs

Configured policy routes for reviewer reference:

- Privacy and recording policy: `https://quipsly.com/privacy`
- Account deletion request explanation:
  `https://quipsly.com/privacy/account-deletion`

Both canonical marketing URLs currently return HTTP 200. The iOS Account
section derives equivalent Nest URLs from its configured service origin; the
committed host-routing fix removes Cloud Run's internal port while redirecting
them to the canonical marketing host. Production deployment/readback remains
required.

The in-app action creates a reviewed deletion request rather than blindly
erasing shared or retention-sensitive records. Eligible private accounts can
then be executed through the controlled, receipt-backed deletion workflow.
Accounts with shared, payment, consent, session, or ambiguous retention records
remain blocked for an explicit reviewed plan.
