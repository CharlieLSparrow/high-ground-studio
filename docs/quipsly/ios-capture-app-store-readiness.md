# iOS Capture App Store Readiness

Quipsly Capture / `HighGroundCapture` is being prepared as an explicit-consent coaching, podcast, interview, and field-note capture app.

## Canonical 2026-07-18 candidate

The release candidate is now the iPhone-only, iOS 17 capture-first shell documented in [`apps/mobile-capture/HighGroundCapture/CAPTURE_ARCHITECTURE.md`](../../apps/mobile-capture/HighGroundCapture/CAPTURE_ARCHITECTURE.md). Its customer navigation is **Today**, **Record**, **Work**, **Library**, and **Account**. Older editor, manuscript, iPad, reviewer-report, and 360 surfaces described later in this file are supporting history or separate Studio work; they are not evidence that those features ship in Quipsly Capture.

The candidate uses protected owner-partitioned source, upload-job, and room-receipt ledgers; crash-safe Start/Stop receipts; durable database room-receipt and upload-reservation ledgers; separate LiveKit media and CallKit presentation/audio-activation roles; and direct private-GCS resumable v2 uploads with exact server verification. New uploads do not stream media through Cloud Run. Unsafe legacy multipart/chunk ingress returns `410` before reading request bytes. The local recording UUID binds the device source, room `captureId`, upload idempotency key, GCS control manifest, quota reservation, and final server evidence.

A clean offline launch is deliberately Library-only: a recently verified account-bound identity can access only that owner's protected local artifacts. A verified online session is required to begin a new take so access and consent can be revalidated; network loss never stops an already-active local recording.

Automated build, security, accessibility, and contract evidence is recorded separately from release proof. Do not describe the build as App Store ready while public Nest is unavailable, the additive room-receipt and upload-reservation schema is not proved live, physical-iPhone capture/background transfer is unproved, reviewer credentials/session proof is unavailable, or the legal/account-deletion fulfillment workflow is incomplete.

## App-owned truth

- Quipsly owns the session, participant, consent, recording, transcript, packet, note, action-item, and receipt state.
- Stripe, calendar, transcription, and provider-room systems are evidence providers, not the source of truth.
- The app must not hide recording, auto-record in the background, or imply provider/payment state without receipts.
- Paid one-to-one coaching sessions must not join, start recording, or prepare
  provider recording evidence until Quipsly has payment evidence. The app can
  show the session and next action, but capture stays held.

## Call architecture decision

- Production coaching, podcast, and research calls should happen inside Quipsly-owned session rooms.
- LiveKit/WebRTC is the first provider path for the actual in-app room media. The `HighGroundCapture` Xcode project now links the LiveKit Swift package so the provider-room controller can compile into a real media client instead of permanently falling back to "SDK missing."
- CallKit starts with the native room workflow so Quipsly calls can feel native on iOS, but it owns only presentation and the system audio-activation boundary. LiveKit is the provider media engine. Neither is local-recording truth, and a failed/timed-out CallKit activation must tear down the provider connection and clear connected UI rather than implying a usable room.
- Normal Phone and FaceTime calls are fallback/import sources only. A user may manually import Apple call recordings, Notes transcripts, or other external evidence later, but Quipsly should not depend on regular Phone calls as the production capture path.
- A Twilio or similar PSTN bridge may be useful later for dial-in clients, but it stays an evidence/provider layer around a Quipsly session, not the source of booking, consent, recording, transcript, or packet truth.

## Current native readiness artifacts

- `HighGroundCapture/PrivacyInfo.xcprivacy` declares no tracking, app-functionality collection for name/email, user ID, device ID, audio, photos-or-videos, and other session/user-content data, plus required-reason API entries for app-specific `UserDefaults`, file metadata, and the `E174.1` capture storage-headroom check. The exact signed Build 28 app contains 14 app/SDK privacy manifests; the aggregate validator requires all 11 resulting App Store types and catches Google Sign-In's additional phone, coarse-location, other-data, other-usage, and analytics disclosures instead of trusting the root app manifest alone.
- The project uses an explicit microphone purpose string: Quipsly records coaching calls, podcast sessions, interviews, and field notes after the user explicitly starts recording.
- Native account entry supports Firebase email/password sign-in, account creation, verification email, and enumeration-safe password recovery through Firebase's public REST API, then verifies Quipsly app access through `/api/mac/session-check` with a Firebase bearer token. Current `accounts:lookup` state must show a verified mailbox before any token or cached offline identity is stored, and refresh rechecks that state. Account creation does not grant Capture beta recording/upload access; Nest remains the access authority. Google-origin accounts are guided toward the same email, recovery, web Google sign-in, or support rather than a duplicate identity. The old browser/native handoff endpoints are not the iOS product path.
- Recorder UI shows capture readiness, consent state, visible recording state, local fallback, upload/transcript readiness, privacy/deletion routes, and preserved-upload recovery.
- `LocalRecordingLibrary`, the upload-job ledger, and the room-receipt outbox use protected owner partitions. Library listing, playback, sharing, retry, deletion, and receipt delivery fail closed unless the current verified Quipsly actor owns the artifact; legacy unowned rows remain preserved but quarantined.
- The Library has one destructive operation: the current owner can explicitly delete one local original after reviewing cloud-verification state, optionally sharing a copy, and acknowledging irreversible deletion. Active recording/upload/verification work blocks the action. The app commits a protected tombstone with deletion time, original byte count, and cloud-verification state before removing bytes, never automatically prunes sources, and does not delete cloud media or account evidence through this action.
- The five-tab candidate exposes join/mute/leave controls but no end-user provider-recording or receipt-slot action. Nest retains staff/operator egress start/stop/reconcile routes, and production START is interlocked until an idempotent durable command/outbox, per-room lock, and provider reconciliation exist. STOP/reconcile remain available for safety. Only non-production integration can opt into START with both `LIVEKIT_EGRESS_ENABLED=true` and `LIVEKIT_EGRESS_UNSAFE_LOCAL_DEV=true`. Joining a room still does not start recording.
- Provider room runtime now has an explicit LiveKit dependency validation path. `ProviderRoomController` uses a real LiveKit `Room.connect(url:token:)` path when the SDK is linked, while CallKit presents the native call surface. Server join preparation still only returns a short-lived room-scoped token; actual provider join happens in the native client, and recording remains separate.
- Supporting legacy Session/Studio panels—not the five-tab Capture candidate—distinguish LiveKit join readiness from server-recording readiness and expose provider/storage diagnostics for operators.
- The legacy Session live-room panel includes a `CallKitBoundaryCard`; the Capture candidate instead keeps equivalent join-versus-recording truth in its compact live-room disclosure and source-truth copy.
- Provider recording receipt slots are not counted as recordings and cannot run transcription. They are visible evidence slots only until verified provider media is attached.
- Legacy Session/Studio after-capture and lifecycle cards decode provider receipt slots and shared `safeActions`; these are supporting operator history, not current Capture navigation or App Review evidence.
- The iPad Session surface remains separate Studio work. It is not part of the iPhone-only Capture candidate.
- `UploadManager` exposes a retry path for recoverable direct private-GCS resumable v2 uploads. Its non-secret phase ledger is protected and owner-partitioned; the secret resumable capability remains in this-device Keychain. Legacy job/source evidence remains readable, but old server-buffered multipart/chunk transport is disabled; a preserved source must be re-enqueued through v2.
- Capability issuance writes a stable, exact-size Prisma reservation under per-account and per-Nest rolling-byte, issuance-rate, and active limits. Successful canonical finalize settles generation/size evidence and frees the active slot; retries cannot mutate their actor/project/object/type/size binding.
- Room Start/Stop outcomes are persisted transactionally in `CaptureRoomStateReceipt`, including deterministic terminal rejection evidence. Upload issuance/settlement is persisted in `MediaVaultUploadReservation`. These objects are now covered by the committed Prisma migration history. A dependent backend revision cannot receive traffic until `scripts/release/quipsly-schema-release.sh` has produced a passing exact-source receipt with fixture replay, verified backup, current production migration ledger, and zero schema diff. The historical additive SQL and targeted coaching-capture sync are recovery references only.
- In-app account deletion is distinct from local-original deletion. It exposes a reachable request, visible status, a 30-day target, and completion state. A dedicated fail-closed worker inventories ownership and retention ambiguity, deactivates access, deletes eligible private database/GCS/Firebase identity data, sends completion confirmation, and keeps a sanitized idempotent receipt. The local disposable loop passes; the remaining App Store gate is one controlled disposable production execution plus Account Holder retention approval and independent readback.
- `scripts/quipsly-ios-capture-app-store-static-smoke.mjs` guards the App Store-readiness invariants that are easy to accidentally regress: no tracking, privacy data and required-reason categories, explicit microphone and dependency-required camera purpose strings, modern app target, Firebase reviewer auth, explicit consent gate, visible recording state, protected resumable uploads, capture-first iPhone UX, privacy/deletion routes, and reviewer docs.
- `scripts/quipsly-mobile-capture-preflight.sh` is the default local health check for privacy manifest lint, Quipsly TypeScript, mobile capture contract syntax, iOS native auth invariants, App Store static invariants, upload idempotency, session evidence, and iOS simulator build.
- `docs/quipsly/ios-capture-reviewer-smoke-checklist.md` is the physical-device/TestFlight smoke path for reviewer and beta readiness.

## Local preflight

Run this before claiming the iOS capture lane is healthy:

```bash
scripts/quipsly-mobile-capture-preflight.sh
```

The preflight now routes the native build through
`apps/mobile-capture/HighGroundCapture/scripts/validate-livekit-provider-room.sh --build-simulator`
so LiveKit package resolution and simulator build use bounded timeouts and full
Xcode without changing global `xcode-select`.

Run only the App Store static invariant guard when you are changing privacy, auth, recorder, upload, deletion, or review-copy surfaces:

```bash
node scripts/quipsly-ios-capture-app-store-static-smoke.mjs
```

Validate the source-owned aggregate privacy questionnaire on every privacy or
SDK change, and inspect all bundled manifests for each signed candidate:

```bash
pnpm quipsly:capture:privacy -- --strict
pnpm quipsly:capture:privacy -- --strict --archive <QuipslyCapture.xcarchive>
```

Optional route smoke when a local or preview Nest is running:

```bash
RUN_ROUTE_SMOKE=1 BASE_URL=http://127.0.0.1:3000 scripts/quipsly-mobile-capture-preflight.sh
```

For a real native upload/finalization dogfood run without cloud credentials,
configure the development-only local Capture vault explicitly:

```bash
QUIPSLY_CAPTURE_DOGFOOD_ROOT="$(mktemp -d)/quipsly-capture-vault"
export QUIPSLY_LOCAL_CAPTURE_VAULT_ROOT="$QUIPSLY_CAPTURE_DOGFOOD_ROOT"
export QUIPSLY_LOCAL_CAPTURE_UPLOAD_ORIGIN="http://127.0.0.1:3012"
export QUIPSLY_LOCAL_MEDIA_ROOTS="$QUIPSLY_CAPTURE_DOGFOOD_ROOT/objects:/tmp/quipsly-media-ingest"
pnpm --filter quipsly exec next dev --hostname 127.0.0.1 --port 3012
```

This lane is accepted only outside production with a loopback PostgreSQL
`DATABASE_URL`, a credential-free loopback HTTP origin, and a dedicated
directory below the operating-system temporary directory. It preserves
immutable objects and manifest generations, but it does not satisfy GCS,
staging, TestFlight, physical-device, backup, or production-readiness gates.
Read `/api/mobile/capture/readiness` and require
`activeUploadBackend: "local-development"` before running the local journey.
Never point `QUIPSLY_LOCAL_MEDIA_ROOTS` at a broad user or repository directory.

Optional local coaching payment boundary smoke:

```bash
RUN_ROUTE_SMOKE=1 RUN_COACHING_PAYMENT_SMOKE=1 BASE_URL=http://127.0.0.1:3000 scripts/quipsly-mobile-capture-preflight.sh
```

Optional generated signed-in smoke, only after Firebase Admin credentials are healthy for the target environment:

```bash
RUN_GENERATED_AUTH_SMOKE=1 RUN_COACHING_GENERATED_AUTH_SMOKE=1 BASE_URL=http://127.0.0.1:3000 scripts/quipsly-mobile-capture-preflight.sh
```

Optional reviewer/native auth contract smoke, after the reviewer account exists
and has at least one planned coaching or podcast capture session:

```bash
QUIPSLY_MOBILE_CAPTURE_AUTH_EMAIL=<reviewer email> \
QUIPSLY_MOBILE_CAPTURE_AUTH_PASSWORD=<reviewer password> \
RUN_NATIVE_AUTH_CONTRACT_SMOKE=1 \
BASE_URL=https://nest.quipsly.com \
scripts/quipsly-mobile-capture-preflight.sh
```

Direct native-auth smoke, useful when you only need to prove the reviewer
account and mobile-capture session contract:

```bash
QUIPSLY_MOBILE_CAPTURE_AUTH_EMAIL=<reviewer email> \
QUIPSLY_MOBILE_CAPTURE_AUTH_PASSWORD=<reviewer password> \
node scripts/quipsly-mobile-capture-native-auth-smoke.mjs \
  --base-url=https://nest.quipsly.com \
  --json
```

For local operator machines, prefer a password file or macOS Keychain instead
of putting reviewer passwords into shell history:

```bash
QUIPSLY_MOBILE_CAPTURE_AUTH_EMAIL=<reviewer email> \
node scripts/quipsly-mobile-capture-native-auth-smoke.mjs \
  --base-url=https://nest.quipsly.com \
  --password-keychain-service=quipsly-capture-reviewer \
  --password-keychain-account=<reviewer email> \
  --json
```

Direct reviewer visible-session smoke, useful when you need a compact
App Review/TestFlight proof that the reviewer account has a real capture room
visible to the native app:

```bash
bash scripts/quipsly-capture-live-reviewer-proof.sh
```

That wrapper is the preferred local operator path. It checks the static reviewer
runway contract, reads the reviewer password from macOS Keychain, and then runs
the live visible-session proof. It is read-only by default and reuses retained
private QA Sessions. If the account has no suitable Session, creation must be
explicit with `QUIPSLY_CAPTURE_REVIEWER_CREATE_SESSION=1`; do not grow the
retained corpus on every proof run. It does not charge, invite, publish, start
recording, or create external calendar events.

When the visible session is proved and the LiveKit room seam needs deeper
evidence, run:

```bash
bash scripts/quipsly-capture-consent-room-live-proof.sh
```

This proof grants explicit app-owned reviewer consent, inspects side-effect-free
room diagnostics, and prepares a short-lived LiveKit join token with token
details redacted. It still must prove that preparing the room does not join
provider media, start local or provider recording, mutate Stripe, mutate
Calendar, send invites, or touch media/storage.

If the Keychain item is missing, store it first:

```bash
bash scripts/quipsly-store-capture-reviewer-password.sh
```

The lower-level smoke remains available when CI or another secret manager is
providing credentials directly:

```bash
QUIPSLY_CAPTURE_REVIEWER_EMAIL=<reviewer email> \
QUIPSLY_CAPTURE_REVIEWER_PASSWORD=<reviewer password> \
node scripts/quipsly-capture-reviewer-session-smoke.mjs \
  --base-url=https://nest.quipsly.com \
  --json
```

The reviewer visible-session smoke also supports `--password-file`,
`--password-keychain-service`, and `--password-keychain-account`.

This mirrors the iOS app path: fetch Firebase client config, sign in with
Firebase email/password, verify the Quipsly bearer session through
`/api/mac/session-check`, then prove authenticated mobile capture sessions are
visible. It must not print tokens or passwords. It should fail if the reviewer
account has no visible capture session, because an empty signed-in app is not a
review-ready capture experience.

The reviewer visible-session smoke reports the candidate room, participant,
recording-consent state, lifecycle/readiness state, recordability boundary, and
next safe action so reviewer setup failures are obvious before a device build is
handed to anyone.

Authenticated capture review digest:

```bash
curl -H "Authorization: Bearer <reviewer firebase id token>" \
  https://nest.quipsly.com/api/mobile/capture/review-digest
```

This side-effect-free packet returns
`packetKind:"quipsly-mobile-capture-review-digest-v1"` and summarizes visible
capture sessions, consent, payment evidence, provider readiness, local fallback,
recording evidence, transcript state, packet state, blockers, and next actions.
It does not join a room, start recording, mutate payment state, or create
external side effects. Use it as the single reviewer/agent readback after
reviewer setup and before handing a build to TestFlight or App Review.

Each visible capture session also includes
`actionPacket.packetKind:"quipsly-capture-action-packet-v1"`. This packet is
the compact control truth for the native app, reviewers, and agents: whether the
room can be joined, whether local recording can start, whether a provider
recording receipt slot can be prepared, whether transcription or packet building
can run, what blockers remain, and what the next safe action is. Native capture
deliberately keeps `canStartProviderRecording:false`; provider/server recording
start is a separate Nest staff/operator action with explicit consent and receipt
proof. Provider recording readiness must never be inferred from room join
readiness. The readiness panel should also show when provider egress is
configured but production START remains interlocked, so App Review, beta testers,
humans, and agents can see that joining, local recording, and server recording
are separate states.

Legacy native iPhone/iPad Session screens, outside the five-tab Capture candidate, show this readback in
`MobileCaptureReviewDigestPanel`, and each session can render
`MobileCaptureActionPacketCard` beside readiness, journey, and lifecycle cards.
Reviewer setup can be checked in the app without asking testers to run curl
commands.

The digest panel includes `ReviewerDigestBoundaryCard`, which labels the packet
as read-only and repeats that refresh does not join rooms, start recording,
charge, publish, schedule, invite, upload, or delete media.

Those legacy Session screens also show
`AppReviewProofPanel`: a read-only proof path explaining reviewer account setup,
explicit consent, no hidden recording, local-source safety, recoverable upload
failure, and inspectable transcript/packet/receipt evidence. This panel does
not join rooms, start recording, charge, publish, or mutate external systems; it
exists so App Review, beta testers, humans, and agents can see the safety model
before touching controls.

The lifecycle card also renders the shared `safeActions` list from Nest. Each
row shows whether the action is currently safe, why, and its boundary. This is
reviewer and operator guidance only; it does not start recording, charge,
publish, or mutate external systems by itself.

## Reviewer account and visible-session setup

The reviewer login and reviewer session are two separate pieces of evidence.
Both are required before TestFlight/App Review proof is meaningful.

Source-only setup contract:

```bash
node scripts/quipsly-capture-reviewer-runway-static-smoke.mjs
```

This smoke verifies the admin login card, coaching reviewer preset, runway route,
native visible-session smoke, review digest route, and checklist language stay
aligned. It does not sign in, mutate data, charge, invite, publish, or record.

1. Open `/admin/users` as a Quipsly admin.
2. Use the `Capture reviewer setup` card to create or repair the Firebase
   email/password reviewer login, Quipsly user record, free starter state, and
   Home Nest.
3. Open `/coaching` as a Quipsly staff/admin user.
4. In the local session creator, load the `Reviewer-safe capture session
   preset`.
5. Confirm the account email is `reviewer-capture@dev.test`, or replace it with
   the actual reviewer account.
6. Use `Create booking and capture room` when the goal is a visible iOS capture
   session. Do not use a hold-only path for App Review.
7. Confirm the session appears in authenticated mobile capture sessions before
   claiming the app is review-ready.
8. Run `node scripts/quipsly-capture-reviewer-session-smoke.mjs --json` against
   the target Nest environment and keep the JSON with App Review/TestFlight
   handoff notes.

Boundary: the reviewer session setup writes Quipsly-owned booking, room,
requested consent, and calendar receipt-slot state. It does not charge, invite,
publish, start recording, or create an external calendar event.

Scheduling evidence follows the same rule. Quipsly owns booking holds,
confirmed bookings, planned capture rooms, reschedule/cancel state, and calendar
receipt slots. External calendars are evidence providers. Operators can attach a
calendar provider event ID or event link after the external action happens, but
the app must not imply that a calendar invitation was created, updated, or
canceled unless that receipt is present.

If the generated signed-in smoke reports `Firebase Admin credential unavailable`, check `/api/auth/firebase-admin-preflight` first. On 2026-07-05, live `https://nest.quipsly.com/api/auth/firebase-admin-preflight` was healthy, while local ADC was expired and non-interactive `gcloud auth application-default print-access-token --project=quipsly-reef` failed with reauthentication required. That is a local credential blocker, not proof that the deployed app auth is broken.

Optional legacy LiveKit dependency probe, only if the package strategy changes again:

```bash
RUN_LIVEKIT_PROBE=1 LIVEKIT_TIMEOUT_SECONDS=900 scripts/quipsly-mobile-capture-preflight.sh
```

The old source-SDK probe is intentionally separate from the app build because package metadata can resolve while binary artifact downloads stall. The active app-target decision is the binary package `client-sdk-swift-xcframework.git @ 2.15.1`, validated through the project-level resolver below. Do not reintroduce half-installed source-SDK package references in the Xcode project.

Optional LiveKit artifact doctor before attaching the Swift package:

```bash
RUN_LIVEKIT_ARTIFACT_DOCTOR=1 scripts/quipsly-mobile-capture-preflight.sh
```

To test the actual heavy downloads without modifying the iOS project:

```bash
DOWNLOAD=1 scripts/quipsly-livekit-artifact-doctor.sh
```

This checks the exact binary artifacts the app-target LiveKit package resolves today:
`LiveKit.xcframework.zip`, `RustLiveKitUniFFI.xcframework.zip`, and `LiveKitWebRTC.xcframework.zip`.

Current project-level LiveKit resolver:

```bash
apps/mobile-capture/HighGroundCapture/scripts/validate-livekit-provider-room.sh
```

This script uses full Xcode through `DEVELOPER_DIR` without changing global
`xcode-select`, verifies that the Xcode project links
`https://github.com/livekit/client-sdk-swift-xcframework.git`, and resolves the LiveKit
package graph with a bounded timeout.

Run the current local build proof when package resolution is healthy:

```bash
apps/mobile-capture/HighGroundCapture/scripts/validate-livekit-provider-room.sh --build-simulator
```

This has passed locally with the binary package linked. The next proof after package resolution and simulator build is a real Nest-issued join packet on simulator/device.

If package resolution or binary artifacts hang, do not revert to hidden fallback
behavior. Keep the project reference, report the resolver/artifact blocker, and
make the native UI honest about whether the current build is provider-media
ready.

Provider room join and provider recording are separate App Review truths. Joining a LiveKit room must not start recording. Provider recording/egress needs explicit consent, a visible start action, visible recording state, and server-side receipt evidence before Quipsly treats it as transcript-ready.

## Legacy Session context sync

The older Session surface has a local-first session-context panel for quick notes, goals, and tasks. It is supporting Studio history, not a Capture v1 destination. Local drafts remain useful if a phone is offline, but the shared source of truth is Nest:

- Read/write route: `/api/mobile/capture/sessions/context`.
- Storage owner: `CallRoom.metadataJson.captureSessionContext`.
- Side effects: none. Saving context does not start recording, charge Stripe, schedule Google Calendar, mutate LiveKit, upload files, publish, or invite anyone.
- Native behavior: `Load Nest` pulls the shared context into the phone draft, and `Save Nest` explicitly pushes the current draft back to Nest.

This is intentionally not a second notes system. It is the capture-room prep surface that later packet, transcript, follow-up, and review workflows can read.

## Runtime UI smoke seam

The iOS target now supports a DEBUG-only launch environment override for simulator/UI proof:

```bash
QUIPSLY_CAPTURE_UI_TEST_EMAIL="reviewer@example.com" \
QUIPSLY_CAPTURE_UI_TEST_PASSWORD="..." \
QUIPSLY_CAPTURE_UI_TEST_BASE_URL="http://127.0.0.1:3012" \
apps/mobile-capture/HighGroundCapture/scripts/run-capture-runtime-ui-smoke.sh
```

This does not bypass auth. It makes the real native Firebase login and Quipsly bearer verification point at the intended Nest backend in DEBUG builds. The smoke expects a signed-in account with at least one capture session, then verifies the five-tab shell, selected session, consent strip, dominant local recorder, subordinate provider-room disclosure, join control, and source-truth copy.

For a one-shot generated-user proof, run the generated mobile capture auth smoke with runtime UI enabled:

```bash
node scripts/quipsly-mobile-capture-generated-auth-smoke.mjs \
  --base-url=http://127.0.0.1:3012 \
  --run-runtime-ui-smoke=1
```

That path creates a disposable Firebase user, exchanges it into Quipsly, seeds a LiveKit-backed `CallRoom`, proves the server/mobile contracts, launches the real native iOS UI smoke with generated credentials, then cleans up the disposable user and room. It does not print the generated password, Firebase token, session cookie, database URL, or bearer token.

Historical proof from 2026-07-08: the generated-user runtime UI path passed against `http://127.0.0.1:3012`, including 96 authenticated mobile contract checks and disposable artifact cleanup. It predates this candidate and must be rerun before release; it is not part of the final 2026-07-18 6/6 deterministic UI result.

Stable runtime landmarks:

- `CaptureSessionChooser`
- `CaptureConsentStrip`
- `CaptureRecorderHero`
- `CaptureStartButton`
- `CaptureLiveRoomDisclosure`
- `CaptureProviderRoomControls`
- `ProviderJoinRoomButton`
- `CaptureSourceTruthFootnote`
- `CaptureStudioHandoffCard_<session-id>`
- `CaptureAttachToStudioButton_<session-id>`
- `CaptureStudioPromotionStatus_<session-id>`

Latest local end-to-end proof from 2026-07-19: `CaptureRoomRuntimeSmokeTests.testConsentedCapturePlaybackAndCrashRecovery()` passed in `/tmp/QuipslyCaptureStudioReuse-20260719-1300.xcresult` (116.910 seconds). Beyond capture, playback, process-loss recovery, offline protection, and upload verification, it operated the primary Record shell's real Studio handoff and waited for durable `Studio media ready` readback. Independent storage and database checks matched one 62,428-byte source at SHA-256 `8e8fa6367a29adc067868fc97c97da81bf88e8dbb3dd01f548ea387783da8d18`, the same finalization and promotion source/media IDs, the same canonical project, one attachment/import, `local-development` storage truth, preserved original, and consent-held transcript. Authenticated full/range playback matched the local object byte-for-byte, and a bearer-authenticated replay returned `already-promoted` without changing row counts. This is local simulator/vault evidence only; physical-device and production media-vault gates below remain open.

## App Store Connect labels to review manually

Before TestFlight or App Store submission, generate Xcode's privacy report from an archive and reconcile it with App Store Connect labels. Current expected categories:

- Contact info: name and email, linked to user, app functionality.
- Identifiers: app-owned user ID, device ID, and session IDs, linked to user, app functionality.
- Audio data: recordings, linked to user, app functionality.
- Photos or videos: local camera sources and immutable camera-switch segments,
  linked to user, app functionality.
- User content: transcripts, notes, packets, and action items, linked to user, app functionality.
- Diagnostics: only if crash/log tooling is added; do not claim it until a real SDK exists.
- Tracking: no.

The source and packaged app declare `ITSAppUsesNonExemptEncryption = NO`.
Current app-owned CryptoKit calls are SHA-256 integrity/identifier hashing; the
app otherwise uses operating-system HTTPS/TLS and the linked LiveKit/WebRTC
transport and does not enable a custom or LiveKit end-to-end encryption
feature. This is evidence for no **non-exempt** encryption, not a substitute
for the account holder's export-compliance responsibility when dependencies or
media security behavior change. The archive verifier requires the declaration
in the packaged binary. If App Store Connect still reports Missing Compliance,
inspect that exact processed build rather than guessing through its legal
questionnaire.

## Review notes draft

Quipsly Capture records only after the signed-in user selects a Quipsly
session, chooses local audio, coordinated separate audio-plus-video masters,
solo camera-and-microphone video, or video-only podcast camera, confirms that
everyone who may be captured was told and agreed, and current required
participant consent permits the Start boundary.
Recording state is shown in the app while capture is active. The candidate is
designed to store recordings locally first and upload them directly to private
Google Cloud Storage with an authenticated resumable v2 session; production
upload claims remain conditional on the live schema, CORS, reviewer, and
physical-device gates below. Quipsly labels a copy verified only after checking
its object generation, exact size, type, CRC32C, SHA-256, and ownership. The
app never prunes local sources automatically. The signed-in owner may
separately delete one local original after an explicit irreversible-deletion
confirmation; this preserves a protected audit tombstone and does not delete
cloud or account evidence. Users can initiate account deletion in the app and
follow its 30-day-target status. Eligible private accounts can be completed by
the controlled inventory/executor/Firebase/GCS/email workflow with durable
recovery and completion receipts; shared or retention-ambiguous accounts fail
closed for reviewed handling. Production execution proof remains required.

The canonical English (U.S.) listing, screenshot plan, field limits, review
journey, and fail-closed blocker ledger now live in
[`ios-capture-app-store-listing.md`](./ios-capture-app-store-listing.md) and
`release/app-store/quipsly-capture/en-US.json`. Validate the source packet with
`pnpm quipsly:capture:app-store-metadata`; the stricter `--submission` mode must
remain red until approved screenshots and every delivery-layer proof exist.

## Remaining blockers before App Store submission

The canonical TestFlight distribution target is now **Quipsly Capture 1.0
(28)**, provider build `ed68117d-5604-45c3-b9f7-239e7cd2af4f`. Apple reports
the build identity and the editable App Store 1.0 version now has that exact
Build 28 ID assigned. Build 28 is the public TestFlight rehearsal target;
physical-iPhone acceptance remains open. The unreleased source build number is
29 so post-Build-28 work cannot be archived or pictured under an already-used
provider identity. Build 6/8/9 sections below are historical evidence, not
current installation instructions.

The credentialed read-only submission audit is:

```bash
pnpm quipsly:capture:app-store-submission-readiness -- \
  --api-key-path /absolute/private/app-store-connect-key.json \
  --output /absolute/private/submission-readiness-build28.json
```

Exit `2` means the read succeeded but submission is still blocked. This first
auditor deliberately preserves the legal, privacy, physical-device, deletion,
and other manual gates even after every machine-readable provider check is
green; it cannot itself authorize submission. The separately saved and
reloaded compatibility receipt is now consumed as completed evidence. Exit `0`
is therefore reserved for a future evidence-complete contract that consumes
those separate proofs. The operator has no mutation or submit mode and never prints
review contact details, demo credentials, screenshot upload capabilities, or
API-key material.

Live configuration and independent readback through 2026-08-05 prove the safe
listing, App Review detail, exact Build 28 assignment, manual release type, and
editable 1.0 record. The bounded operator configured and Apple read back:

- `USES_THIRD_PARTY_CONTENT` content rights;
- all 24 current age-rating answers, with Apple reporting `TWELVE_PLUS`;
- `usesIdfa: false`;
- an active Free price with the United States base territory; and
- a complete 175-territory App Availability inventory with only `USA` enabled,
  automatic future-territory enablement off, and no blocking status for the
  available territory.

The latest API provider receipts are owner-only files at
`/private/tmp/quipsly-app-store-build28-assignment.json` and
`/private/tmp/quipsly-app-store-build28-readiness.json`. They report the exact
Build 28 ID assigned and every machine-verifiable configuration check passing
except the five absent approved screenshots. The provider-only Mac/Vision
choices were independently saved and reloaded through App Store Connect on
August 5; their owner-only visual receipt is
`/Users/wall-e/Dev/Quipsly QA Artifacts/Capture Build 28/provider/app-store-iphone-only-availability-readback-20260805T2008Z.jpeg`
at SHA-256 `6b2e473fac7085c470c97c9df38b94e0785f3c26767210d3c5c1d7a1b368f3fd`.
The remaining legal and real-device gates below stay deliberately manual.

The first exact-Build-28 screenshot run preserved four complete 1320x2868
drafts and exposed a fifth-journey defect: the privacy controls existed below
the viewport, but the test asserted hit-testing before scrolling to them and
would then have captured a different portion of Account. The journey now
scrolls until both Privacy policy and Request account deletion are visibly
hittable and captures that exact surface. A complete five-image rerun passed
from clean detached source `9387c6254a1d5a6e78aae2ae01193ab38af72451`
with a source-isolated receipt under
`/Users/wall-e/Dev/Quipsly QA Artifacts/Capture App Store Drafts/9387c6254a1d/20260805T193614Z-87685`.
It remains explicitly ineligible because DEBUG fixture evidence is not an
exact signed/TestFlight recapture.

Apple still reports zero screenshot sets for the `en-US` version and no App
Store review submission. The source-backed configuration operator cannot
upload screenshots, publish App Privacy, change DSA identity, create a review
submission, submit a version, or release the app. Mutation JWTs are short-lived
and unscoped because Apple supports the JWT `scope` claim only for GET requests;
the operator, exact target confirmation, and Team Admin key role provide the
write boundary.

The remaining release gates are therefore:

1. Complete and verify the account-level EU DSA trader determination in App
   Store Connect.
2. Publish accurate App Privacy answers. Apple requires the answers to cover
   Quipsly and integrated third parties across every platform; the public API
   does not expose a trustworthy publication readback for this gate.
3. Capture, visually approve, and upload all five planned largest-iPhone
   screenshots from the exact Build 28 experience with synthetic/private-safe
   content. Draft simulator compositions remain layout evidence only.
4. Install Build 28 from TestFlight on a physical iPhone and prove the Episode
   9 workspace opens without the prior crash, then prove microphone
   and camera permission/fidelity, front/back switching, pause/resume,
   interruptions, route loss, force-quit and offline recovery, direct upload,
   assembled playback, timeline alignment, and same-ID Nest/Studio readback.
   If USB/CoreDevice is unavailable, the fresh privacy-bounded Account support
   snapshot can independently prove only exact Build 28 installation and
   authenticated production mode; run
   `pnpm quipsly:capture:physical-install-readback`. The remaining physical
   capture assertions still require operating the app.
5. Join a Nest-issued LiveKit room and prove provider transport, CallKit audio
   activation, and local recording stay visibly separate through failure and
   recovery. Provider egress must remain interlocked unless it explicitly
   enters release scope.
6. Operate production account deletion with a disposable eligible account and
   independently read back Firebase, database, storage, email confirmation,
   retention, and completion evidence. A request row is not completion.
7. Reconcile the signed archive privacy report, production Terms/Privacy/
   deletion pages, reviewer notes, and published App Privacy answers before
   creating the review submission.

Historical candidate and delivery details remain below for audit and rollback.

## 2026-07-29 Quipsly Capture Build 8 external-beta checkpoint

- This is an Apple beta-review submission checkpoint, not external approval,
  TestFlight installation, physical-device operation, App Store submission, or
  public release proof.
- Exact committed source
  `3d414de4e22d4f6e3f659a5a6e47015dd51fbc0c` produced signed
  `Quipsly Capture 1.0 (8)`. Its 19,313,476-byte IPA has SHA-256
  `8e637fa67c5def105e5292a4aa7c37c827c226344663164c08e3576b92617056`
  and independently passes strict nested signing, App Store provisioning,
  TestFlight entitlements, app/extension version parity, privacy-manifest,
  camera/microphone purpose-string, background-mode, and export-compliance
  inspection. The exact detached-source release result passed all 32 native UI
  scenarios.
- Production `nest.quipsly.com` revision `studio-00425-gij` is healthy at 100%
  traffic and passes 104/104 public mobile contracts. Its source
  `9a12b33d1f60374bfaa8dd89372c71db4becddff` has the same Nest, Prisma,
  and shared-domain source as Build 8; intervening changes affect only the
  native Capture target and release/rehearsal tooling.
- The private external group `Quipsly Capture Rehearsal` contains Build 8 and
  the intended tester. Automatic notification, beta app/build localization,
  a synthetic reviewer account with visible consent-gated sessions, current
  review notes, and a real reachable review contact are configured.
- The App Store Connect API applied the review-detail update and submitted
  Build 8. Provider readback reports external state
  `WAITING_FOR_BETA_REVIEW`, review state `WAITING_FOR_REVIEW`, and no missing
  review phone or password. The redacted mode-0600 receipt is
  `/private/tmp/quipsly-capture-app-store-connect/build-8-external-submitted.json`.
- Build 6 has provider-side installed evidence on a trusted iPhone. Build 8
  does not yet have external approval, tester notification, installation,
  app-owned version readback, or physical audio/video/camera-switch/upload/
  assembled-playback proof. Those statements remain intentionally open.

## 2026-07-29 Quipsly Capture Build 9 qualified-candidate checkpoint

- Exact committed source
  `b44e2a90968a7cccc6a3bae137fc97039050cc4b` produced signed
  `Quipsly Capture 1.0 (9)` from a disposable detached worktree.
- Full preflight, strict TypeScript 7, the universal LiveKit-linked simulator
  build, 729/729 App Store checks, and all 36 deterministic native UI
  scenarios pass.
- The 20,023,041-byte IPA has SHA-256
  `365fd2e8d90d3b1558fbfd7212d8d9459d2ddeeac7557407a56e898254ff972c`
  and passes signing, App Store provisioning, app/extension version parity,
  entitlement, privacy-manifest, purpose-string, background-mode, and
  export-compliance inspection.
- This checkpoint is not an upload or TestFlight claim. The exact release
  receipt records `uploadAttempted: false`, `uploadPerformed: false`,
  `testerAssignmentPerformed: false`, and
  `physicalTestFlightInstallReadbackPerformed: false`.
- Build 8 remains the current external-beta submission until a fresh
  App Store Connect login/API key permits Build 9 upload and provider readback.
  See
  [`2026-07-29-capture-build-9-qualified-candidate.md`](../coordination/2026-07-29-capture-build-9-qualified-candidate.md).
