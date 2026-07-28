# Quipsly iOS capture App Review notes draft

Date: 2026-07-28
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

Exact committed source `f10ceab5e83ce08e61092d3cf6a8e8ec2f457589`
passes 32/32 deterministic native UI scenarios. Its signed `1.0 (6)` IPA has
SHA-256
`080f8b9fa700a3270683a347419c0695cc9694e03b33b3c4cc34bef6b52c6c5a`
and passed app/extension signing, entitlement, provisioning-profile,
privacy-manifest, purpose-string, and export-compliance inspection. Apple
processed that exact binary as provider build
`47e5e730-e5bd-4cfb-afae-baef86d3923c`; it is `Ready to Test`, has no Missing
Compliance gate, and is assigned to the manually controlled
`Quipsly Capture Internal` group.

The account-deletion request, 30-day status policy, reviewed inventory,
fail-closed executor, Firebase/GCS adapters, completion email, recovery state,
and durable receipts are implemented. A disposable local operating loop
creates, reviews, executes, retries, receipts, and cleans up an eligible test
account, while a Home Nest with another collaborator is refused. The executor
is disabled outside a controlled worker by default.

Submission remains blocked. Production Nest revision `studio-00414-tut` is at
100% traffic and the full public mobile contract passes 104/104. Google Cloud,
Firebase, and the signed-in App Store Connect browser session are healthy.
CoreDevice still does not enumerate the physical iPhone, the invited tester has
not installed or operated Build 6, no production reviewer account/session has
been proved, the five final screenshots are absent, App Privacy has not been
started, and legal, rating, DSA, pricing, territory, and deletion-retention
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
