# Quipsly Capture for iPhone

Status: capture-first implementation baseline complete; live-service, schema, physical-device, and legal release proof still required

Minimum OS: iOS 17

Canonical architecture: [`CAPTURE_ARCHITECTURE.md`](./CAPTURE_ARCHITECTURE.md)

Verification and release gates: [`CAPTURE_VERIFICATION.md`](./CAPTURE_VERIFICATION.md)

## Product outcome

Quipsly Capture is the calm field recorder for Quipsly sessions. A creator can find or create a session, record explicit consent, capture a high-quality local source, see exactly where that source is in the upload lifecycle, and recover without losing the original when the network or server fails. The app never prunes a source automatically; only the signed-in owner can explicitly remove a local original after an irreversible-deletion confirmation and protected tombstone write.

The shipped iPhone navigation is deliberately limited to:

1. **Today** — next session and next safe action.
2. **Record** — consent-aware local recording plus optional room controls.
3. **Library** — local sources and honest upload/verification state.
4. **Account** — identity, network policy, storage, privacy, deletion, and sign out.

The older manuscript, 360 editor, publishing, and reviewer-report prototypes are not Capture navigation. They remain separate Studio research and must not be treated as finished Capture features.

## Implemented baseline

| Workstream | Current result | Gate |
|---|---|---|
| Product UX | Four focused native SwiftUI destinations, concise sign-in, deterministic preview fixtures | Simulator visually reviewed; UI suite passes |
| Consent | Honest recorder attestation plus independent receipts for every signed-in participant; live revocation/readiness changes pause capture | Automated gating proof passes; multi-account live proof pending |
| Local audio | Seven-state lifecycle, 48 kHz / 192 kbps mono AAC, metering, projected storage reserve checks at start/resume/runtime, explicit interruption resume, delegate-confirmed finalization | Simulator build passes; device audio and forced low-storage proof pending |
| Local durability | Preallocated UUID, durable armed/START journals before recorder start, protected owner sidecars and last-known-good ledgers, decode-validated recovery vs. explicit needs-repair state, no automatic pruning, explicit user-only local-original deletion with a durable tombstone | Source/build proof passes; force-quit and damaged-container device drills pending |
| Interruptions | Visible pause on interruption or route loss; never silently resumes after the interruption | Source/build proof passes; device drill pending |
| Upload | Canonical direct-to-GCS resumable session, persisted SHA-256/size/phase, file-backed background transfer, bounded retry, exact verified finalize, durable actor/Nest byte and issuance reservations, and separate held/released processing truth; unsafe server-buffered legacy ingress disabled before body read | Backend contract proof passes; schema deployment and iOS live background transfer pending |
| Authentication | Native sign-in/create/verify/reset lifecycle; verified-mailbox Firebase/Quipsly bearer path with coalesced refresh, one-401 recovery, and owner-bound room-receipt retries | Automated owner-isolation and accessibility proof passes; live email delivery, expiry, and account-switch proof pending |
| Server ingest | Authenticated actor/project binding, safe session IDs and paths, immutable consent ownership, protected playback | Typecheck and focused security tests pass |
| Durable server ledgers | Transactional `CaptureRoomStateReceipt` replay plus `MediaVaultUploadReservation` quotas/completion evidence | Apply and verify additive schema sync before backend deployment |
| Privacy | iPhone-only target, iOS 17 floor, purpose strings, privacy manifest, explicit local-original deletion, and in-app account-deletion request | Static App Store checks pass; full account-deletion fulfillment remains a release blocker |

The local-original action and account deletion are intentionally different. Local deletion removes only one source file from the current iPhone after explicit confirmation, preserves a protected audit tombstone, and leaves cloud/account evidence untouched. The account screen currently submits a deletion request; it does not yet prove whole-account execution, required retention handling, completion timing, or completion confirmation.

## Release sequence

1. Keep the generic Simulator, unsigned Release device build, focused UI suite, backend security tests, and static contract checks green.
2. Apply `ops/quipsly-coaching-capture-additive.sql` and verify `scripts/quipsly-coaching-capture-schema-sync.mjs` against the target database before deploying the backend that uses the durable room-receipt and upload-reservation ledgers.
3. Apply and read back the reviewed private-bucket CORS policy, including `x-goog-if-generation-match`, then restore a healthy Nest deployment and prove a real reviewer account can see a real session.
4. On a physical iPhone, record with built-in, Bluetooth, and USB microphones; inspect each playable source on disk/in Library.
5. Repeat through lock/unlock, background, call/alarm/Siri interruption, route loss, force quit, low storage, and offline launch. A clean offline launch is Library-only; network loss during an already-active take must not stop local recording.
6. Prove the preserved recording later uploads directly to private GCS in the background and becomes **Verified in Quipsly**. Then separately prove that an explicit local-original deletion leaves its owner-bound tombstone and does not delete server/account evidence.
7. Join a real Nest-issued LiveKit room packet and prove LiveKit media transport, CallKit presentation/audio activation, and local recording remain separate.
8. Complete the account-deletion executor/retention/confirmation workflow, then reconcile production legal surfaces, App Store privacy answers, screenshots, review notes, and reviewer credentials with the candidate build.
9. Ship through TestFlight, then repeat the critical source/save/upload proof on the distributed build.

## Current release blockers

- Live public Quipsly/Nest reviewer, policy, account-deletion, readiness, and session surfaces checked on 2026-07-18 return HTTP 503. One earlier transient `www.quipsly.com` root probe returned HTTP 500; a later root retry returned HTTP 503. Reviewer login, visible-session, policy, account-deletion, and direct-upload proof cannot yet pass against production.
- The additive durable room-receipt and upload-reservation schema is implemented in source but is not yet proved applied in the live database; capability issuance depends on it.
- The reviewed private-bucket CORS policy is not proved applied/read back; browser create-only upload requires `x-goog-if-generation-match` to be allowed.
- Production provider-egress START is deliberately interlocked until the durable command/outbox, per-room lock, and provider reconciliation design is implemented and deployed. This is a release blocker only if provider recording enters submission scope; local-first v1 keeps end-user egress deferred and proves the interlock and honest UI instead.
- No reachable physical iPhone is available for microphone, route/interruption, lock/background, and background-transfer acceptance testing.
- The account-deletion route records a request but the approved retention matrix, disclosed completion timeframe, executor/anonymizer, and completion confirmation are incomplete. Production Terms and Privacy surfaces must be finalized and reachable.

## Sequenced production increments

- Local camera/video recording is now the next production-source increment.
  It follows the source/clock/editor contract in
  `docs/quipsly/production-source-capture.md`; simulator camera demos do not
  count as delivery.
- Simultaneous multicamera capture remains deferred until the single-camera
  source lane passes real-device 4K, thermal, storage, recovery, upload, and
  editor-alignment gates.
- Async verification for future video sources above the current 2 GiB audio-first limit and cleanup of expired resumable control manifests.
- Automatic local retention/pruning. The v1 app never silently deletes source recordings; its implemented deletion path is explicit, owner-only, one-original-at-a-time, and tombstoned.
- End-user provider-egress controls.
- Native editing, publishing, manuscript, and 360 reframing inside the Capture app.

These are separate product increments. None may create a second, hidden definition of recording or upload success.
