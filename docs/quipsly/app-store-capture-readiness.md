# Quipsly iOS capture App Store readiness checklist

Date: 2026-07-04
Status: started, not submission-ready

## Product classification

Quipsly iOS capture supports real-time coaching and podcast/interview capture. One-to-one coaching payments may use Stripe where Apple App Review Guideline 3.1.3(d) applies. Group services, courses, content libraries, and SaaS access must be classified separately before being sold inside iOS.

Stripe Checkout and Customer Portal should remain scoped to eligible one-to-one coaching payment evidence. Customer Portal must not be used as a hidden substitute for App Store-required purchases, SaaS subscriptions, content-library access, group coaching, courses, or digital goods.

## Required App Store posture

### Recording consent

- Recording must not start without explicit participant consent.
- The app must show a visible recording state.
- Consent should be persisted as Quipsly-owned state and attached to the call room/session.
- If a participant revokes or declines consent, recording must stop or exclude that participant according to the room policy.

### Privacy and data disclosure

App privacy labels will need to account for:

- account identifiers and email
- coaching booking information
- calendar/session metadata
- payment evidence handled through Stripe
- microphone audio recordings
- transcripts and transcript corrections
- notes, action items, and follow-up packets
- diagnostics for upload/recovery

### Account deletion

If the app allows account creation or sign-in, it needs an in-app account deletion path or clearly reachable deletion initiation flow that satisfies Apple account deletion guidance.

### Permission strings

The iOS target needs explicit, human-readable purpose strings for at least microphone access. If camera, photo library, local network, speech recognition, contacts, or calendars are added, each permission needs its own purpose string.

Recommended microphone copy:

`Quipsly uses the microphone to record coaching calls, podcast sessions, and field notes after you explicitly start recording.`

Recommended speech/transcription copy if native speech APIs are added:

`Quipsly may use speech recognition to create editable transcripts from sessions you choose to record.`

### Test account and review notes

App Review should receive:

- a test login account
- instructions for finding the capture screen
- a note that recording requires explicit consent
- a note that Stripe is used only for eligible one-to-one real-time coaching services, not app SaaS access or digital content
- a note that uploads may be held locally for recovery if network/cloud upload fails

## Current implementation progress

Implemented in the current codebase:

- native microphone capture exists
- local segmented recording exists
- consent toggle exists in visible capture UI
- recorder refuses start without explicit consent
- local recordings are no longer silently purged after 24 hours
- hard upload failure preserves local source recording
- chunked upload can carry room/participant/consent metadata to Nest

Still needed:

- compile and device validation
- server-side relational capture records after schema migration
- real session list from Quipsly bookings/call rooms
- participant-specific consent UI
- account deletion UX check
- privacy label inventory
- App Store review note draft
- provider choice for actual in-app voice rooms
- transcript queue integration after upload verification

## Source links

- Apple App Review Guidelines: https://developer.apple.com/app-store/review/guidelines/
- Apple account deletion guidance: https://developer.apple.com/support/offering-account-deletion-in-your-app/

## Current implementation progress update: relational upload receipt seam

Nest mobile ingest now attempts to turn verified upload evidence into relational capture records: call room, participant, consent, recording asset, upload chunks, and queued transcript job. The route preserves media-upload success even if relational record creation fails during schema rollout, then reports the capture record error.

This improves App Store readiness because a user-visible recording is now moving toward an inspectable consent and transcript chain instead of disappearing into anonymous timeline metadata.

Still not done:

- Prisma validation/generation/migration.
- Device compile and runtime smoke.
- Participant-specific consent records created before recording starts.
- Transcription provider execution.

## Permission copy update

The generated Info.plist microphone usage description in the Xcode project now says:

`Quipsly uses the microphone to record coaching calls, podcast sessions, interviews, and field notes after you explicitly start recording.`

This replaces the older episode-only background-recording copy.

A first App Review notes draft now lives at:

`/Users/wall-e/Dev/high-ground-studio/docs/quipsly/ios-capture-app-review-notes-draft.md`

## Current implementation progress update: Quipsly session selection

The capture app now has the first real Quipsly session-selection seam:

- Nest exposes `GET /api/mobile/capture/sessions` for authenticated mobile users.
- The response includes accessible call rooms, booking/payment labels, project and episode routing, participant ID, recording consent ID/status, recording counts, transcript job counts, and next-action copy.
- The iOS capture board loads sessions, shows their current status, and disables coaching/podcast recording until a real session is selected and consent is explicitly toggled.
- Start recording now sends the selected call room, participant, consent, project, episode, and purpose metadata through the existing recorder/upload path.

Still not done:

- Prisma validation/generation/migration.
- Device compile and runtime smoke.
- Participant-specific consent creation/update from the phone.
- Account deletion UX check.
- Privacy label inventory.
- LiveKit/Twilio/provider room join flow.
- Transcription provider execution after upload verification.

## Current implementation progress update: consent mutation before recording

The capture app now attempts to save participant consent to Nest before starting local recording. The Start button path is:

1. User selects a Quipsly capture session.
2. User explicitly toggles that everyone consented to record and transcribe.
3. iOS calls `POST /api/mobile/capture/consent`.
4. Nest verifies room access and creates/updates `RecordingConsent` for the signed-in participant.
5. iOS starts local recording with the returned room, participant, and consent IDs.

This is still not App Store submission-ready until compile/device validation, schema migration, account deletion UX, privacy labels, and provider-room behavior are complete. It does move the capture lane away from ad hoc local recording and toward durable consent evidence.

## Current implementation progress update: explicit consent states

Consent is no longer grant-only plumbing. The mobile consent endpoint and iOS capture board now support explicit grant, decline, and revoke actions.

Current behavior:

- grant creates or updates a `RecordingConsent` with audio recording and transcription allowed
- decline records that this participant should not be recorded
- revoke stops local capture in the iOS UI before updating the consent state
- the session list explains granted, declined, revoked, and not-created states in plain next-action language

This improves App Store posture because the app now has a visible and reversible consent state instead of a single checkbox pretending consent is permanent.

## Current implementation progress update: room join contract

The mobile app now has a `Prepare call room` action backed by `POST /api/mobile/capture/rooms/join`.

This does not make Quipsly App Store-ready for live voice calls by itself. It does create the correct product boundary:

- Quipsly verifies the user can access the room.
- Quipsly returns provider state and next action.
- LiveKit rooms can receive a short-lived join token when server credentials are configured.
- Planned rooms fail calmly instead of pretending a call can start.

## Current implementation progress update: room lifecycle state

Nest now exposes a provider-neutral mobile room-state route for opening a room, marking local/provider recording state, stopping recording state, and ending a room.

The iOS capture board can:

- open a planned room
- mark the room as recording when local capture starts
- stop local capture and move the room out of recording state
- end the room when the call is over

Boundary: this is Quipsly-owned room state. It does not start LiveKit, Twilio, or server-side egress recording by itself. The native LiveKit SDK now links in the app target, but actual provider join, visible participant state, and provider recording controls still need device/simulator proof before in-app calls are production-ready.

Provider recording update:

The team runway now has first LiveKit egress start/stop controls. These controls are consent-gated and create held evidence when configuration or consent is missing. They are not App Store-ready by themselves because iOS still needs real room-join proof, visible participant/recording indicators, interruption handling, and upload/reconciliation validation.

Provider verification update:

The team runway now has first storage reconciliation for provider/server-mix recordings. Reconciliation must happen before transcript work. This is still not enough for App Store submission because device testing must prove the user-visible recording state, background/interruption behavior, local fallback, upload recovery, and provider room UI.

## Current implementation progress update: mobile provider readiness language

The iOS capture board now distinguishes provider-room readiness from local recording fallback:

- session detail lines include provider state
- session API includes provider room ID, provider readiness, provider next action, and whether provider join can be prepared
- sessions explain whether they are planned/local fallback or LiveKit-ready
- `Prepare call room` stores and displays the provider join response
- changing sessions clears stale provider-join state
- starting local recording first prepares the room join state, then records only after consent and room-state updates

This still does not make provider calls production-ready. The app now links the native LiveKit SDK and has a provider-room seam, but it still needs real Nest-issued join proof, participant list behavior, provider audio route proof, and provider recording indicators. The current improvement is user-facing honesty: the app can show whether a provider room is ready while preserving local capture as the safe fallback.

## Current implementation progress update: mobile readiness endpoint and privacy matrix

Nest now exposes `GET /api/mobile/capture/readiness` for the capture app, App Review prep, and agents. It reports:

- signed-in state
- public privacy/account-deletion routes
- explicit recording policy
- provider readiness booleans
- upload/transcript readiness booleans
- Stripe boundary status
- App Store readiness flags

The endpoint reports configuration booleans only. It must not expose provider, Stripe, storage, or transcription secrets.

A first App Store privacy-label and reviewer matrix lives at:

`/Users/wall-e/Dev/high-ground-studio/docs/quipsly/ios-capture-privacy-label-matrix.md`

Still needed for App Store-ready in-app calls:

- Keep the first production meeting provider configured. Decision v1 is LiveKit for provider rooms/egress, with local segmented recording fallback.
- Prove the linked provider Swift SDK against a Nest-issued room packet on simulator/device and harden the actual room UI.
- Add visible participant and recording indicators.
- Define recording/egress policy and local fallback behavior.
- Validate interruption handling, background behavior, and upload recovery on real devices.

Decision note:

`/Users/wall-e/Dev/high-ground-studio/docs/quipsly/coaching-meeting-spine-decision.md`

## Current implementation progress update: transcript job visibility

Mobile upload completion now preserves the queued transcript job ID returned by Nest capture records and shows it in the capture board.

A first authenticated transcript runner route exists at `POST /api/mobile/capture/transcripts/run`. It can execute Deepgram-backed transcription when configured, but it deliberately holds jobs with clear error messages when provider credentials, cloud object paths, asset verification, or route-size limits are not ready.

App Store boundary:

This improves the visible user story from recording to transcript queue, but submission readiness still needs device validation, privacy labels, transcription-provider disclosure, data-retention policy, and a production worker strategy for long recordings.

## Current implementation progress update: coaching packet output

Completed transcript segments can now produce a reviewable coaching packet: summary note, highlight notes, and action-item candidates. The team runway shows those packet records so operators can see the post-transcription value chain.

This remains review-first. The app should not tell clients that candidate action items are official commitments until a coach or authorized user approves them.

## Current implementation progress update: operator transcript controls

The team coaching/capture runway now has controls to run transcript jobs and build or rebuild coaching packets from completed transcripts.

Important boundaries:

- unverified or missing recording assets hold instead of faking success
- missing Deepgram credentials hold instead of pretending transcription happened
- oversized recordings hold for a future background worker
- packets are candidate review artifacts, not final coaching instructions

This improves the App Store story because recorded audio now has a visible post-upload path: recording asset, transcript job, transcript segments, review packet, notes, and action items.

## Current implementation progress update: iOS readiness surface

The iOS capture app now reads Nest's `GET /api/mobile/capture/readiness` endpoint and shows a capture-readiness card inside the recording surface. The card displays:

- signed-in state
- provider room readiness
- upload/transcript readiness
- Stripe boundary state
- App Store risk language
- privacy and account deletion links

This is meant to keep sensitive readiness visible in the actual capture workflow instead of buried in a planning document.

The iOS auth callback scheme was also changed from the Mac-specific `quipslymac` scheme to the shared `quipsly` scheme, and the Xcode project now declares that URL scheme for the generated Info.plist.

Validation now passed:

- Prisma schema validation.
- Quipsly TypeScript validation.
- iOS capture app simulator build with `DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer`.
- Local mobile capture contract smoke against `http://127.0.0.1:3000`.

Still not proven:

- Live `https://nest.quipsly.com` mobile capture API routes. The current live smoke returns deployed 404 HTML for the capture routes, which means the local route work has not been promoted live yet.
- Actual ASWebAuthenticationSession callback on device/simulator.
- App Store reviewer account flow.
- Native LiveKit room join proof and participant/recording UI.
- Provider recording indicators.

Validation caveats:

- Workspace `pnpm` validation currently trips the unrelated `apps/desktop-companion` Electron exotic subdependency policy. Narrow validation used local project binaries instead.
- The system developer directory points at Command Line Tools, so Xcode validation requires an explicit `DEVELOPER_DIR` unless that machine setting changes.

Repeatable smoke command:

```bash
node /Users/wall-e/Dev/high-ground-studio/scripts/quipsly-mobile-capture-contract-smoke.mjs --base-url=http://127.0.0.1:3000
node /Users/wall-e/Dev/high-ground-studio/scripts/quipsly-mobile-capture-contract-smoke.mjs --base-url=https://nest.quipsly.com
```

Authenticated route contract checks can be enabled by supplying a short-lived native access token through `QUIPSLY_MOBILE_CAPTURE_BEARER_TOKEN` or `--token=...`. Do not paste personal session cookies into this smoke.

## Current implementation progress update: account deletion request path

The iOS capture app now has an Account section with sign-out and account deletion review request controls.

Implemented pieces:

- `UserAccountDeletionRequestStatus` and `UserAccountDeletionRequest` in Prisma schema.
- Authenticated Nest endpoint `POST /api/account/deletion-request`.
- `AccountDeletionClient` in the iOS app.
- `AccountSafetyPanel` in the iPhone/iPad mobile shell.
- Team coaching/capture runway shows recent account deletion requests.
- Mobile Nest URL handling now normalizes either `https://nest.quipsly.com` or `https://nest.quipsly.com/api` so auth/session/capture clients do not double-prefix API paths.

Product boundary:

This is a deletion request and review workflow, not instant destructive account deletion. That is intentional because Quipsly accounts can own coaching bookings, Stripe evidence, consent records, recordings, transcripts, notes, and action items. The user can initiate deletion in-app, and Quipsly must review export, retention, payment, consent, and legal obligations before destructive action.

Still needed before App Store submission:

- Prisma validation/generation/migration.
- Device compile/runtime smoke.
- Public privacy/deletion policy copy that matches this workflow.
- Confirmation that Apple App Review accepts this as the in-app deletion initiation path for current account behavior.

## Current implementation progress update: public privacy and deletion routes

Nest now has public policy routes that match the mobile app account surface:

- `https://nest.quipsly.com/privacy`
- `https://nest.quipsly.com/privacy/account-deletion`

The iOS Account section links to those paths using the configured Quipsly/Nest base URL. This avoids hardcoding HighGroundOdyssey.com for an App Store app whose capture API is currently configured against Nest.

Product boundary:

- The privacy page explains explicit recording consent, transcription, stored coaching/capture records, diagnostics, and publication receipts.
- The deletion page explains that deletion is a reviewed request because coaching records can include bookings, payment evidence, consent history, recordings, transcripts, notes, and action items.
- These routes are still beta policy surfaces. Legal/privacy review, device validation, and backend schema rollout remain required before App Store submission.

## Current implementation progress update: deletion operator transitions

The team coaching/capture runway now has a non-destructive operator flow for account deletion requests:

- operators can move a request through reviewing, export-preparing, ready-for-deletion, completed, canceled, or rejected states
- each transition accepts an operator note
- transition history is appended to request metadata
- the controls explicitly do not erase accounts, bookings, payment evidence, recordings, transcripts, notes, or action items

This is the right App Store shape for Quipsly's current risk profile: the iOS app can initiate deletion, and the operator runway can prove review progress while preserving payment, consent, retention, and export obligations.

Still needed before App Store submission:

- Prisma validation/generation/migration.
- Device compile/runtime smoke.
- Public privacy/deletion policy copy that matches this workflow.
- Confirmation that Apple App Review accepts this as the in-app deletion initiation path for current account behavior.
- A separate destructive deletion/export executor after retention and legal obligations are intentionally defined.
