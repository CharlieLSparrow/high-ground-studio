# Quipsly iOS capture App Review notes draft

Date: 2026-07-18
Status: engineering draft, blocked from submission
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

The Simulator/static/build candidate has substantial automated coverage, but it must not be submitted yet. Production Quipsly/Nest returned HTTP 503 during the candidate audit; the additive capture-ledger schema is not proved deployed; no physical iPhone/TestFlight candidate was available; and the retention-aware account-deletion executor, legal surfaces, reviewer account/session proof, and final privacy answers remain incomplete.

## Public policy URLs

Configured policy routes for reviewer reference (unavailable with HTTP 503 during the 2026-07-18 audit):

- Privacy and recording policy: `https://nest.quipsly.com/privacy`
- Account deletion request explanation: `https://nest.quipsly.com/privacy/account-deletion`

The iOS Account section links to policy routes derived from its configured service URL. The in-app deletion path currently creates a deletion review request rather than completing deletion. Apple submission remains blocked until Quipsly discloses the fulfillment timeframe, applies the approved retention rules, runs the executor/anonymizer, and confirms completion to the user.
