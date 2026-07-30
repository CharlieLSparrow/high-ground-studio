# Quipsly Capture iPhone Architecture

Status: implementation baseline
Last reviewed: 2026-07-30
Minimum OS: iOS 17
Primary product: local-first, consent-aware audio and production-source capture for coaching, podcasts, research interviews, and creator video

## Product promise

Quipsly Capture must make one promise and keep it under stress:

> When the user taps Record after consent, Quipsly saves the explicitly chosen high-quality audio, solo camera-and-microphone, or podcast camera source on this iPhone. Network, room-provider, transcript, and editor work may continue later, but none of them can erase or pretend to replace the local source. Only the current user can remove that iPhone's local original through a separate, explicit, irreversible Library action.

The live room is coordination. Its remote audio is not secretly mixed into the local file. Remote production audio requires double-ended participant tracks or verified provider egress. The local device file is the production source for this microphone. A server-verified upload proves durable preservation of those exact bytes; only a separately released processing receipt may make them an editor input or transcript source.

## Capture v1 scope

The implemented iPhone candidate exposes five focused surfaces:

1. **Today** — upcoming/recent Quipsly sessions plus actor-scoped canonical goals, committed tasks, personal focus blocks, weekly commitments, source-linked research cues, blockers, and one clear next action. Protected offline work is read-only; task/focus/annotation decisions require a current verified session. Resolving a research cue changes only its annotation overlay and never the preserved source.
2. **Record** — session choice, source-specific consent, Audio / Solo video / Podcast camera modes, real microphone or camera preflight, persistent capture state, elapsed time, controlled pause/switch/stop boundaries, and compact room controls.
3. **Work** — actor-scoped projects, tasks, goals, notes, and reusable canonical tags without exposing desktop editor administration.
4. **Library** — every local source, its upload state, size, duration, server verification, and recovery action.
5. **Account** — identity, upload policy, storage, privacy, local-original controls, and in-app account-deletion request initiation.

Capture v1 does not compile a native 360 editor, publisher, sample manuscript,
sample clips, placeholder preview, or simulated-success action. The retired
facade graph was removed from the target rather than hidden behind navigation.
Nest owns collaborative episode state and QuipslyStudio owns deep media editing,
review, export, and publishing handoff.

## UX rules

- The primary Record control appears without scrolling.
- Consent and microphone access are requested in context, never on launch.
- Joining a room is not recording. Starting provider egress is not local recording. Each action has a separate visible state.
- Record, pause, resume, interruption, finalization, local save, upload, and server verification are different states with different language.
- The app never says “uploaded” when it only received an HTTP success. It says “Verified in Quipsly” only after the server returns durable storage evidence.
- Failure language leads with what is safe: “Saved on this iPhone. Upload will retry.”
- Diagnostics and receipt detail live behind disclosure. They do not displace the main task.
- Recording state uses text, shape, timer, and VoiceOver—not color alone.
- The app respects Dynamic Type, Reduce Motion, 44-point minimum controls, and accessible progress values.

### Quick capture and personal work

Record exposes Note, Task, Goal, and Source as local-first capture actions. Note,
Task, and Goal can target either the selected Session or the signed-in user's
private Home Nest; they do not require an invented Session. Source always lands
in the private personal Inbox before deliberate Research Nest filing.

The phone persists one client-generated UUID, the explicit destination, text,
due/reminder/recurrence intent, and up to eight canonical tag IDs or new tag
labels before sync. A Home Nest choice clears Session tag IDs and permits only
new private Home Nest tag names. Nest creates or reuses those names inside the
destination project and links the same vocabulary to the canonical note, task,
or goal. Offline retries reuse the UUID and must either read back the identical
record or fail closed as an identity conflict; they never send, schedule,
publish, or create a provider calendar event.

## System boundaries

```text
Quipsly session + consent ledger
            |
            v
Capture experience state machine ----> LiveKit media / CallKit presentation
            |                                      |
            +--> owner-partitioned protected       +-- coordination only
                 room-receipt outbox
            v
Local recorder -> immutable local source -> protected owner ledger
                                            |
                                            v
                                  background upload queue
                                            |
                                            v
                              verified cloud object + receipt
                                            |
                                            v
                            consent-bound processing gate
                               /                    \
                       released                    held
                          |                          |
                          v                          v
              Studio attachment / transcript   preservation only
```

Quipsly owns session, participant, consent, recording, upload, transcript, and attachment meaning. Firebase proves identity. LiveKit, GCS, transcription providers, Stripe, and Calendar provide evidence; they do not become product truth.

## App layers

### Presentation

SwiftUI views render immutable view state and send user intents to one capture experience model. Views do not call multiple services in an ad-hoc order.

### Experience coordinator

`CaptureExperienceModel` owns the user-visible state machine and coordinates:

- session selection and refresh;
- explicit consent changes;
- microphone permission and local recorder preparation;
- Nest room-state transitions;
- local start/pause/resume/mark/stop;
- provider-room join/leave;
- local-library and upload status;
- calm recovery messages.

The coordinator pins one immutable session context for the life of a recording or connected room. Local start and Stop never wait on a Nest network response. Before `AVAudioRecorder.record()` can run, the app preallocates the source UUID, commits `START_RECORDING` to an owner-partitioned protected outbox, and commits an `armed` source row plus a per-source owner sidecar. Any failed journal write means nothing is recorded. Stop appends the matching boundary after delegate-confirmed finalization and inherits the immutable Start owner/context even if authentication changed during the take. An acknowledged Start remains journaled until its matching Stop is acknowledged, and startup reconciliation closes any start-only boundary left by process death. Slow service, network loss, suspension, and relaunch therefore cannot disable Stop or discard a healthy local take. Outbox delivery and each authenticated retry are owner-bound, so a receipt cannot cross accounts during token refresh. Nest persists accepted and rejected receipt outcomes in the database, so a retry receives the original terminal result rather than re-evaluating an old device event against newer room state.

### Local capture

`AudioCaptureController` owns `AVAudioRecorder` for the audio-first v1 lane. `CaptureAudioSessionCoordinator` is the sole policy owner for the process-wide `AVAudioSession` shared by local capture, playback, CallKit, and LiveKit. CallKit owns native call presentation and the activation boundary; LiveKit owns provider-room media transport. Neither owns local-recording truth. LiveKit automatic audio-session management is disabled; its engine is enabled only after CallKit activates the process audio session and disabled again on deactivation. A failed or timed-out activation tears down the provider connection and clears the visible connected state instead of implying a usable room. The recorder writes 48 kHz / 192 kbps mono AAC into a unique file, meters input level, tracks pause/interruption/user-mark segments, finalizes the file, then registers its exact duration and byte count.

Capture state is explicit; microphone permission is a separate preflight state:

```text
idle -> preparing -> recording <-> paused
          |             |            |
          v             v            v
        failed       finalizing -> saved
```

Audio interruption or any loss of the selected external route pauses visibly, even if iOS could silently fall back to another microphone. The app never silently resumes recording. The audio session is deactivated only when no recorder, player, CallKit, or provider-room lease remains. Capture start and resume check a 256 MiB hard reserve plus projected encoder/container finalization growth. While recording, the app rechecks capacity every two seconds and automatically stops and finalizes with a visible reason before crossing that floor.

The current source is one AAC/M4A container, not independently finalized segments or a CAF/ALAC stream. After process death, launch reconciliation first performs a bounded header/duration check and durably leaves the source in the non-playable `Validating preserved audio` state. That persisted state is requeued after another termination or relaunch. A sequential utility task then opens the file through `AVAudioFile` and reads decoded frames through the declared end without blocking `MainActor`; only a successful, durable result promotes it to `Recovered locally`. An open, zero-frame, truncated, or corrupt container moves to `Audio needs repair`; its bytes, path, UUID, and owner evidence stay preserved, but the app disables playback and upload retry and never claims the file is playable. Moving capture to independently finalized segments or CAF/ALAC remains deferred until physical-device lock/background, long-take, and ingestion compatibility have been proved.

Local video is now a user-reachable production-source lane. It is a separate
`AVCaptureSession` implementation behind a serial actor/executor, using
`AVCaptureMovieFileOutput`, ten-second movie fragments, storage and thermal
interlocks, and foreground-only camera behavior. It writes the same protected
local source ledger and direct resumable-upload contract instead of adding a
second product-truth path. Podcast-room mode records a video-only master while
LiveKit owns realtime audio; solo mode may record the explicitly selected
microphone with the movie. Front/rear switching closes one valid source and
opens another in the same capture group rather than risking an unrecoverable
mid-file input mutation. The full source/clock/editor contract is documented in
`docs/quipsly/production-source-capture.md`.

Preview and movie orientation are not a fixed portrait assumption.
`AVCaptureDevice.RotationCoordinator` supplies the device- and gravity-aware
horizon-level preview and capture angles. Preview follows its own coordinator;
immediately before the durable START receipt, the actor snapshots and locks the
movie angle, orientation, camera ID, and negotiated format into source-profile
schema v3. One immutable movie keeps one orientation. The UI tells the creator
to frame before Start and to pause or stop before changing orientation. After
finalization, the recorded QuickTime transform and presentation shape must
agree with that receipt or upload is held while the local original remains
watchable.

The actor-isolated capture service, controller, typed source ledger, controlled
source boundaries, real `AVCaptureVideoPreviewLayer`, source-mode preflight,
source-specific consent/readiness, full-track finalized-file validation, and
upload handoff are implemented. The UI may record a safe local original even
when cloud processing is unavailable; it must then say that upload is held.
Finalized MOV validation does not trust the armed camera profile as recorded
truth. It decodes every audio and video track through EOF, requires exactly one
video track, and persists the actual encoded dimensions, presentation
dimensions, transform-derived rotation, codec, nominal frame rate, audio track
shape, and asset duration. A missing legacy negotiated profile, unexpected or
missing audio track, dimension/codec mismatch, material frame-rate drift, or
portrait/landscape presentation mismatch creates a visible source-integrity
hold. The original stays playable and preserved, but cannot upload under a
silently false source label. Library video playback uses `AVPlayer` and the
same process-wide audio-session coordinator as audio playback; watching never
edits, uploads, or removes the original.
The synchronous finalizer accepts at most 2 GiB. A larger video is upload
eligible only when Nest advertises the dedicated long-source verifier and its
maximum size; otherwise it stays in an explicit local upload-held state.
Raising the request limit, trusting client metadata as server verification, or
silently splitting a continuous master into short files are not acceptable
substitutes.

### Local recording ledger

`LocalRecordingLibrary` persists one record per source file with:

- stable local ID and relative file name;
- session/participant/project/episode context;
- start, stop, duration, bytes, and segment evidence;
- `armed`, `saved`, `queued`, `uploading`, `held`, `awaitingVerification`, `verified`, or `needsRepair` state;
- server media/source IDs and honest upload/verification state;
- last failure and server verification detail.

The ledger is written atomically with iOS data protection. Each owned source and room receipt also has an independently protected owner sidecar plus a last-known-good aggregate. If a canonical ledger is unreadable, Quipsly copies it to quarantine, keeps the canonical bytes read-only, loads only provable last-known-good/sidecar evidence, and blocks new writes instead of replacing the index with an empty file. `UploadManager` owns a separate protected upload-job ledger keyed back to the local recording ID, and the room receipt outbox is protected separately. Source files live in persistent app storage with data protection suitable for recording through lock and background upload after first unlock. No source is excluded from backup, automatically expired, or silently pruned.

Every source record, upload job, and room receipt is bound to the stable Quipsly actor ID returned by the verified session endpoint. Library listing, playback, sharing, retry, and outbox delivery recheck that binding. A different signed-in account cannot discover or operate another account's local artifacts. Older unowned ledger entries remain physically preserved but quarantined until an explicit migration or recovery flow assigns them; sign-out never erases source media.

Local-original deletion is a narrowly separate Library operation. It requires the current owner, a dedicated confirmation sheet, an explicit irreversible-deletion acknowledgement, and no active recording, upload, or verification task. The UI shows whether Quipsly has a verified cloud copy and allows the user to share/export first; if no verified copy exists, it warns that deletion may remove the only recoverable bytes. Before deleting the file, the app atomically commits a protected tombstone containing deletion time, original byte count, and cloud-verification state. That tombstone survives relaunch and prevents reconciliation from misreporting the intentional deletion as a missing file. This action removes only the local original from that iPhone; it does not delete cloud media, receipts, transcripts, or the Quipsly account.

The local recording UUID is also the room `captureId` and the canonical upload-session idempotency key. That one opaque identifier ties the device source ledger, Start/Stop receipt ledger, background job, GCS control manifest, and final server evidence together without depending on a filename or mutable title.

### Upload queue

`UploadManager` uses one background `URLSession` identifier and file-backed upload tasks. It persists jobs independently from in-memory tasks and reconciles `getAllTasks()` after launch or background wake. The iOS background-transfer daemon necessarily retains the authorized request for the lifetime of its task; Quipsly's own durable app storage never writes that capability into the JSON job ledger.

The canonical v2 path is a server-owned, direct-to-private-GCS resumable session. The app computes a streaming SHA-256 and exact byte count, persists its non-secret protocol phase in an atomic protected ledger, stores its app-owned copy of the secret resumable capability only in this-device Keychain, uploads the immutable file with a file-backed background task, then calls authenticated finalize. Finalize verifies object generation, type, exact size, GCS CRC32C, and a server-streamed SHA-256 before the app says the cloud copy is verified. Byte verification does not by itself authorize Studio attachment or transcription.

Capability issuance is also a durable database operation. A stable request UUID reserves exact bytes against configurable per-account and per-Nest rolling-byte, issuance-rate, and active-reservation limits under transaction/advisory locks. Byte-identical retries reuse one reservation; changed bindings fail. An expired or abandoned mobile-v2 row preserves its immutable binding and may be renewed in place only after fresh quota checks; an expired generic browser reservation is terminal. Verified canonical finalization (and verified proxy registration in the browser lane) records exact size and object generation and releases the active slot. In-memory rate limits are not an authorization boundary.

Required upload behavior:

- idempotent server upload ID scoped to the authenticated actor;
- exact expected byte count and SHA-256 bound immutably to the upload session;
- bounded exponential retry with jitter for transient failures;
- ambiguous transfer failures first check committed object evidence, then rotate to a fresh resumable capability rather than replaying byte zero into a partially consumed session;
- no automatic retry for authentication/authorization/validation failures;
- explicit cellular, expensive-network, and constrained-network policy;
- source file is immutable while an upload task is active;
- force-quit recovery occurs on next foreground launch;
- automatic deletion and retention pruning remain disabled; only the explicit, owner-confirmed local-original operation described above may remove source bytes.

Legacy job/source ledgers remain readable so an upgrade cannot hide a local original, but the old server-buffered multipart and chunk endpoints now return `410` before reading headers or body bytes; they cannot safely be the recovery transport. A preserved pre-v2 source must be re-enqueued through resumable v2. Cloud Run local `/tmp` is not part of the canonical media path. Server control manifests use generation-preconditioned GCS writes; finalize is lease-protected and idempotently reconciles byte/source evidence. It creates episode attachment and transcript work only when the immutable Start binding and versioned participant-consent snapshot authorize those separate actions. Legacy or incomplete bindings normalize to preservation-only and remain held until an explicit, staff-only audited release; transcript release still requires current all-party transcription consent.

### API client and authentication

All mobile requests should flow through one typed API client that:

- normalizes the Nest base URL once;
- obtains a fresh Firebase token before a request;
- retries one time after a 401 following token refresh;
- decodes a common error envelope;
- applies request IDs and safe structured logging;
- never logs passwords, tokens, signed URLs, or recording content.

Every network action requires a currently verified Quipsly session, not merely the presence of an old refresh token. A recently verified, account-bound cached identity may unlock only that actor's protected local Library when Nest is unreachable. The offline shell does not permit a new recording, consent change, upload, room action, transcript, or account mutation; an online-verified session is required to begin a new v1 take so server consent and access can be revalidated.

Native account entry supports sign-in, account creation, email verification, and enumeration-safe password recovery. Firebase password credentials are not enough by themselves: the app resolves current `accounts:lookup` state and requires a verified mailbox before it writes any credential or offline identity to Keychain or asks Nest to merge an identity. The same verification check runs after token refresh. Creating an identity does not grant Capture beta recording/upload access; Nest remains the access authority. Google-origin accounts are directed to use the same email, password recovery when available, or Quipsly's web Google sign-in/support path rather than creating a duplicate identity.

## Server authorization requirements

Every capture mutation validates the authenticated actor and the requested object graph. Client-provided slugs and IDs are lookup hints, not authorization.

- Session list: actor can view the room/project.
- Consent: store an honest recorder attestation for every person who may be heard, plus independent receipts for every signed-in non-observer participant. Provider egress always requires independent all-party receipts.
- Room state: role-based, transactional receipt transition with required immutable capture/receipt IDs, the durable `CaptureRoomStateReceipt` database ledger, a uniqueness constraint, and the actual device occurrence timestamp. Replayed receipts return their original accepted or rejected outcome; concurrent recorders update active-capture state without last-write-wins metadata races. A factual Stop after another actor closed the room is stored as a terminal applied no-op. A live consent/readiness monitor pauses local capture when Nest returns a revocation or newly missing participant receipt; network failure alone never stops local source capture.
- Upload creation/finalize: actor owns the upload; session/participant/consent relationships are server-derived. Automatic processing requires an applied actor-owned Start and the exact versioned all-party consent snapshot bound when the upload was created. Missing, legacy, rejected, or changed evidence preserves verified bytes but holds downstream processing.
- Media playback: authenticated project/media access is required before bytes or signed URLs are returned.
- Promotion: one idempotent, transaction/lock-protected per-source path creates the canonical Studio attachment only after processing release; upload must not create one asset and promotion create another. The iPhone hands off the newest `captureGroupId` with the exact recording-asset IDs it reviewed. Nest re-reads the actor-accessible Session, refuses a changed source set, preflights every source before the first promotion, and then converges each identity through the existing path. A camera flip or coordinated podcast take therefore cannot silently attach only the latest movie while leaving its microphone master or other camera segment behind. A mid-group failure is returned as explicit retryable partial truth; retries reuse completed identities, original bytes remain unchanged, and synchronization stays a human-reviewed alignment proposal.
- Transcript: verified cloud media plus its own all-party transcription authorization and released processing receipt. The current bounded handler is request-bound; moving it to a durable worker/lease remains post-candidate reliability work.
- Reviewed release: a staff-only endpoint requires exact immutable object verification and a substantive audit reason. It cannot rewrite the original Start/consent binding. Media may be released while transcription remains held.

`CaptureRoomStateReceipt` and `MediaVaultUploadReservation` are introduced through `ops/quipsly-coaching-capture-additive.sql` and checked, including required indexes, by `scripts/quipsly-coaching-capture-schema-sync.mjs`; this repository's legacy CallRoom lane is not owned by a normal Prisma migration. The additive schema sync must be applied and verified in the target database before deploying a backend that reads either durable ledger.

## State vocabulary

### Capture

- **Ready** — session selected, consent valid, microphone available, storage sufficient.
- **Recording** — local recorder confirmed active; persistent red shape, label, timer, and Stop control visible.
- **Paused** — source remains open; timer and UI clearly paused.
- **Finalizing** — Stop was requested, but local file has not yet been validated and registered.
- **Saved on this iPhone** — local source exists and ledger metadata is durable.

### Upload

- **Queued** — source is safe locally; no network task active.
- **Uploading** — file-backed background task active.
- **Waiting for network/Wi-Fi** — policy or connectivity is holding the task.
- **Held** — a user/actionable failure requires retry.
- **Awaiting verification** — bytes were accepted but durable receipt is incomplete.
- **Cloud copy verified; review held** — exact durable server evidence is present, but editor attachment/transcription remains blocked.
- **Verified in Quipsly** — exact durable server evidence is present and processing is released for its authorized downstream uses.

## Privacy, security, and App Store rules

- The microphone and camera purpose strings are specific and localized. Audio mode never requests camera access. Camera access is requested only after the person explicitly chooses Solo video or Podcast camera and taps Prepare; merely opening Record or joining the audio room does not open the camera.
- Audio/video permission is requested only when the relevant user action needs it.
- Local-only capture does not request Photos access. “Save to Photos” would request add-only access at that moment.
- Recording requires explicit consent and a persistent visible and accessible indication.
- Keychain stores credentials. Recording files use iOS data protection.
- `PrivacyInfo.xcprivacy` and App Store privacy answers must match actual name, email, user ID, audio, content, diagnostics, and device-ID behavior. The capture storage preflight declares Apple's disk-space required-reason category with reason `E174.1`.
- Account deletion initiation remains available in the app, but it is not the local-original deletion described above. Submission also requires an approved retention policy, stated completion timeframe, destructive/anonymizing executor, and completion confirmation; the request ledger alone is not final deletion proof.
- One-to-one real-time coaching payment and any IAP-requiring products remain separately classified.

## Observability

Use privacy-safe structured events for:

- permission requested/result;
- local prepare/start/pause/resume/interruption/finalize/result;
- local ledger recovery;
- upload enqueued/task associated/progress/retry/held/verified;
- room join/connect/disconnect;
- server transition rejected or compensated.

Events include opaque IDs and state changes, never tokens or media payloads. Build success, local capture success, cloud verification, and editorial success are separate gates.

## Test strategy

### Automated

- State-machine transition, session pinning, receipt outbox, and offline independence tests.
- Local-ledger atomic persistence and disk reconciliation tests.
- Owner-isolation and confirmed local-original deletion/tombstone recovery tests.
- Upload job reconciliation, idempotency, retry/backoff, auth refresh, and retention tests.
- API decoding and authorization-boundary contract tests.
- SwiftUI happy-path tests for Today -> consent -> Record -> Stop -> Library.
- UI accessibility audit at default and large Dynamic Type.
- Backend tests for actor binding, state transitions, all-party consent, replayed finalize, and media access.

### Physical-device matrix

- Oldest supported iPhone plus current standard and Pro phones.
- Built-in, wired/USB, and Bluetooth microphones.
- Lock/unlock, app background, alarm/call/Siri interruption, route loss, low storage, thermal pressure.
- Offline, cellular, Low Data Mode, constrained network, expired auth, server 4xx/5xx, force quit, and relaunch.
- A real Nest-issued LiveKit join packet, participant changes, reconnect, CallKit reset, and simultaneous room/local-source behavior.

Simulator proof is necessary for layout, state, auth shell, and API fixtures, but it cannot prove camera, microphone fidelity, interruptions, Bluetooth routing, lock-screen recording, or real background transfer behavior.

## Release gates

1. iOS 17 generic device and current Simulator builds pass and their warning
   inventory is reviewed. The release contract also proves retired facade
   editor, publisher, exporter, placeholder media, hard-coded developer paths,
   and stale facade tests are absent from the Capture target.
2. Focused capture UI tests and backend contract tests pass.
3. A signed-in test account sees at least one real session.
4. A physical iPhone produces a playable local source through lock/interruption testing.
5. Network loss never stops an already-active local take; relaunch recovers its protected source/receipt state and later reaches a server-verified upload receipt. A clean offline launch is intentionally Library-only until session access and consent can be verified online.
6. Media playback and mutation routes reject unauthorized actors.
7. Privacy manifest/labels, production legal surfaces, complete account-deletion workflow, permission strings, and App Review notes are current.
8. TestFlight/device proof is recorded separately from build proof.

### Current external blockers (2026-07-18)

- The public Quipsly/Nest readiness, session, policy, and account-deletion surfaces checked during this audit return HTTP 503. One earlier transient `www.quipsly.com` root probe returned HTTP 500; a later root retry returned HTTP 503. A healthy deployed service and real signed-in reviewer session must be proved before release.
- The additive `CaptureRoomStateReceipt` and `MediaVaultUploadReservation` schema has not been proved applied in the live database; run and verify schema sync before the corresponding backend deploy. Upload capability issuance is launch-critical on the reservation table.
- The reviewed media-vault CORS policy has not been applied and read back from the live private bucket; browser create-only uploads require the `x-goog-if-generation-match` header to be allowed.
- Production LiveKit provider START is intentionally interlocked until a durable command/outbox, per-room lock, and provider reconciliation exist. This blocks release only if provider recording is included in submission scope; local-first v1 keeps end-user egress deferred and must prove the interlock plus honest UI. STOP/reconcile remain safety operations; only non-production integration can opt into START with both explicit unsafe-local flags.
- No available physical iPhone is currently reachable for microphone fidelity, route/interruption, lock/background, and direct-GCS background-transfer proof. Simulator and unsigned-device builds do not satisfy that gate.
- The app can submit an account-deletion request, but the approved retention matrix, disclosed fulfillment timeframe, executor/anonymizer, and completion confirmation are incomplete. Production Terms and Privacy surfaces must also be finalized and reachable.

## External references

- [Apple capture authorization](https://developer.apple.com/documentation/avfoundation/requesting-authorization-to-capture-and-save-media)
- [Apple audio interruptions](https://developer.apple.com/documentation/avfaudio/handling-audio-interruptions)
- [Apple audio route changes](https://developer.apple.com/documentation/avfaudio/responding-to-audio-route-changes)
- [Apple background URL sessions](https://developer.apple.com/documentation/foundation/urlsessionconfiguration/background(withidentifier:))
- [Apple file-backed uploads](https://developer.apple.com/documentation/foundation/urlsession/uploadtask(with:fromfile:))
- [Apple file protection](https://developer.apple.com/documentation/foundation/fileprotectiontype)
- [Apple required-reason APIs](https://developer.apple.com/documentation/bundleresources/describing-use-of-required-reason-api)
- [Apple HIG privacy](https://developer.apple.com/design/human-interface-guidelines/privacy)
- [Apple HIG accessibility](https://developer.apple.com/design/human-interface-guidelines/accessibility)
- [Apple App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/)
- [Apple account deletion guidance](https://developer.apple.com/support/offering-account-deletion-in-your-app/)
- [LiveKit Swift SDK](https://github.com/livekit/client-sdk-swift)
- [LiveKit AudioManager](https://docs.livekit.io/reference/client-sdk-swift/documentation/livekit/audiomanager/)
