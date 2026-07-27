# Quipsly production capture seam

Date: 2026-07-26

## Outcome

Quipsly now has one implementable source architecture across Nest, iPhone, and
Mac without pretending that a web call or virtual camera is a production
master.

Nest owns Episode Room identity, access, consent, chat, prepared-clip commands,
server-clock exchange, and source status. Quipsly Capture and Quipsly Studio own
local immutable media. LiveKit is the audio-only conversation path. Studio owns
alignment and non-destructive editorial decisions.

## Implemented

- authenticated, room-authorized capture-clock endpoint in Nest;
- bounded three-sample iPhone clock burst stored with audio/video source
  profiles;
- bounded three-sample Mac clock burst measured after the accepted START and
  before local media opens, stored identically with the WAV and silent MOV;
- fractional receipt dates and lossless decimal-string monotonic nanoseconds,
  with backward-compatible decoding for earlier Swift receipts;
- native Mac camera/Core Audio inventory and production route policy;
- crash-recoverable Mac 48 kHz/24-bit PCM WAV recorder;
- in-progress, interrupted, failed, and finalized source receipts;
- streamed SHA-256 and byte-count finalization off the UI actor;
- Episode Capture Setup recording/recovery UI;
- immutable multi-file Canon card ingest with independent source/copy hashes;
- technical media probe and durable card-import receipts;
- automatic local editor attachment for finalized Mac audio and verified Canon
  masters, with capture-group provenance and a separate attachment receipt;
- LiveKit 2.15.1 linked into the native Mac app for audio-only rooms;
- exact Core Audio-to-LiveKit input/output UID verification with no
  name-matching fallback;
- direct physical MV7i, non-MV7i, virtual-rehearsal, and blocked route states;
- authenticated Nest room-join requests with automatic Firebase token refresh
  and one bounded retry after a 401;
- authenticated Episode Room catalog loading through the same native account,
  limited to the sessions already authorized by Nest;
- stable episode, participant, and call-room identity projected from Nest
  instead of reusing editable display titles;
- fail-closed local recording for an authorized room unless consent,
  `canRecordNow`, and the server capture-readiness verdict all agree;
- final Nest readiness revalidation when Record is pressed; failed refreshes
  and rooms removed from the authorized catalog lock recording instead of
  reusing stale evidence or silently switching episodes;
- an explicit Local-only / solo-source choice that does not infer Nest consent
  or collaboration state;
- room switching starts a fresh capture group while preserving finalized media
  and receipts from the prior group;
- native join, mute, unmute, leave, participant-count, and connection-state
  controls in Episode Capture Setup;
- separate call-event receipts that contain exact routes and capture-group
  identity but never contain a participant token, bearer token, or provider
  secret;
- a backward-compatible canonical upload identity contract: each file owns a
  unique resumable `uploadSessionId`, while Mac audio, Canon/iPhone video, and
  later source boundaries may share the one applied-START `captureId` and
  `captureGroupId`;
- fail-closed manifest normalization that recognizes a distinct capture ID only
  when room, actor, and capture readiness evidence agree exactly, plus
  long-video worker verification of that independent identity;
- a protected Mac room-state outbox with exact owner/session/room binding,
  idempotent START/STOP identities, last-known-good and per-receipt recovery,
  corrupt-ledger quarantine, launch-time orphan closure, and ordered replay;
- Nest-applied START as a hard prerequisite for opening the Mac audio engine,
  followed by local-first WAV finalization and durable STOP delivery;
- closed-take UX that keeps the capture group available for companion camera
  sources while requiring a new group before another recording interval;
- an explicit, recoverable Mac canonical-upload outbox for finalized room WAVs:
  exact preflight re-hash, unique per-file upload identity, shared take
  identity, direct file-backed private-storage PUT, strict capability host
  validation, exact Nest verification readback, and unconditional local
  retention;
- the same protected outbox now accepts finalized silent camera-reference MOVs
  without a parallel protocol, preserves the receipt's verified account and
  exact applied START identity, and rejects owner, source, room, consent,
  START, byte-count, or digest drift;
- source-specific relaunch recovery and Episode Capture Setup controls for WAV
  and MOV uploads, with explicit separation between exact-byte preservation,
  canonical Episode Room projection, proxy readiness, alignment, transcript,
  and publication state;
- immutable same-take authority for Canon card originals: only an exact,
  agreeing finalized-source binding may carry account, room, consent, capture
  group, and applied START into the card receipt and canonical outbox;
- explicit local-only Canon handling when no same-take authority exists, with
  no later authorization from the room currently selected in the UI;
- durable per-card upload/retry/hold/verification recovery, exact receipt and
  managed-byte revalidation, and an intentionally clockless source profile
  that keeps card timestamps unreviewed until waveform/drift/human approval;
- an explicit Mac take-acceptance auditor that freshly re-hashes and probes the
  finalized WAV/MOV pair, rejects cross-take identity, authority, clock,
  media-shape, or duration drift, and persists a create-once JSON receipt;
- a Take acceptance workspace that separates machine pass from mandatory
  full-playback, headphone, waveform/lip-sync, end-drift, and editor-placement
  review;
- local paired-lane clock placement renamed to `capture-clock-proposed`, with
  the historical false-strong label normalized instead of treated as reviewed
  alignment;
- explicit UX that joining sends no video, starts no recording, and leaves the
  local WAV recorder independent;
- an agent-state responsiveness repair found by launching the real app:
  `/state` now sends cached JSON before a coalesced, generation-bound utility
  task may touch a stale short-export manifest on external storage;
- background loading for the large source-aware waveform map;
- bounded Studio launch status instead of an automatic external-root walk;
- a real playable fixture for the AV composition layering test.
- one canonical episode-source owner,
  `StudioEpisodeProduction.productionJson.importedMedia`, shared by the Episode
  Room, production editor API, media inventory, mobile capture sessions, and
  native Mac Episode Room catalog;
- legacy `timelineJson.importedMedia` read-through and opportunistic migration,
  with source/asset/recording/upload/storage identity deduplication;
- released-capture projection into canonical media, modern Studio attachment,
  immutable mobile attachment, source promotion readback, and an idempotent
  proxy/register workflow job;
- exact-byte, processing, transcript, proxy, and alignment evidence shown in
  the Mac setup screen and Episode Room without claiming sample-accurate sync;
- fail-closed shared Watch admission: a verified video is visibly **Proxying**
  until a registered playback derivative is ready.
- a strict shared capture-proxy manifest/queue/result contract with
  generation-pinned source authority and deterministic proxy targets;
- a complete database workflow outbox that repairs the commit-to-GCS dispatch
  gap on later bounded Nest reads;
- a non-root FFmpeg Cloud Run Job worker that re-verifies exact original bytes,
  creates H.264/AAC fast-start collaboration proxies, records technical
  evidence, retries transient faults, and dead-letters terminal drift;
- crash recovery that adopts a prior execution's create-once proxy only after
  validating its immutable job/source/profile/output metadata;
- bounded Nest reconciliation that repeats media authorization and atomically
  creates the proxy source, asset, variant, project attachment, canonical
  Episode Production projection, and completed workflow;
- a sixth professional release boundary for the media processor, with
  exact-commit materialization, pinned Cloud Build input, digest readback,
  least-privilege managed-folder IAM, and a no-override recovery scheduler.

## Verification

- `pnpm --filter quipsly typecheck`
- Quipsly contracts: 105/105
- capture-proxy focused control/worker/resumable contracts: 19/19
- real FFmpeg portrait acceptance: 720x1280, 30 fps, H.264/AAC, `yuv420p`,
  fast-start
- release-governance and changed-surface planning: 24/24 across six manifests
- canonical imported-media and mobile-session Jest: 14/14
- canonical upload/security/long-video identity contract tests: 24/24
- QuipslyVideoCore: 43/43, including protected room-boundary and canonical
  upload job durability, exact production storage-host validation, and
  persisted verified-session recovery
- clock route Jest: 4/4
- QuipslyVideoCore: 34/34, including exact LiveKit/Core Audio UID routing,
  physical-versus-virtual MV7i truth, secret-free room receipts, real-MP4
  byte-identical card ingest, provenance-bearing editor attachment, Nest
  catalog decoding, stable episode identity, selection policy, and
  inconsistent-consent fail-closed behavior
- HighGroundCapture generic iOS Simulator build
- QuipslyMac debug build with LiveKit 2.15.1 linked
- signed QuipslyMac build with the capture-clock bridge and Canon same-take
  authority (`com.highground.QuipslyMac`, Team `585GUXMY5M`)
- focused server alignment: 8/8, including long-uptime Mac monotonic values and
  the clockless Canon `needs-alignment` path
- current QuipslyVideoCore: 65/65
- real QuipslyMac launch and menu-command execution

The current Computer Use run could open the Episode Capture Setup command, but
macOS then presented stacked prompts asking the automation runtime for
persistent direct screen-and-audio access. That permission was not granted.
The new audio-room card therefore has compile and launch proof, but not a
completed second-window visual acceptance or a real room join.

## Hardware truth on this Mac

MOTIV Mix Virtual is available at 48 kHz, but a direct physical MV7i route is
not. EOS Webcam Utility is available, but a direct Canon R8 UVC device is not.
The iPhone Continuity Camera and microphone are visible. These routes are
reported as observed and are not promoted to physical-master status.

## Next acceptance gates

1. In the visible Episode Capture Setup window, grant Quipsly Studio camera and
   microphone permission, record a short MOV+WAV take, stop, reopen both files,
   run `Verify take`, inspect its append-only receipt and shared clock samples,
   then watch/listen through the mandatory human-review checklist. Repeat for
   at least 60 seconds with the MV7i attached directly, inspect both WAV
   channels, and listen through MV7i headphones.
2. With a second participant, join a real Nest/LiveKit room, record the local
   master concurrently, exercise mute/unmute/leave, compare the WAV against the
   call feed, and prove realtime voice processing did not alter the local
   master.
3. With the production native account, select an authorized Episode Room,
   verify a consent hold locks Record, grant every required participant's
   consent, refresh, and verify the same room unlocks without changing source
   identity.
4. Commit and deploy the media processor, apply/read back managed-folder and
   no-override invoker IAM, drive one private generation-pinned video fixture
   through queue, worker, Nest reconciliation, Episode Room Watch, and Studio,
   then rerun it to prove zero overwrite or duplication.
5. Attach finalized Mac/iPhone sources to one Episode Room capture group,
   propose alignment with uncertainty and drift, and review the result in the
   Studio timeline. Canonical source projection, proxy admission, executable
   local processing, and reconciliation contracts now pass; credentialed cloud
   processing and reviewed alignment remain.
6. Pass the long-take, route-loss, storage, interruption, recovery, physical
   iPhone, TestFlight, and real episode rehearsal matrices.
