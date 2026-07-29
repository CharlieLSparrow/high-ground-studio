# Quipsly Capture Source Evidence

Date: 2026-07-29

## Outcome

Every new Quipsly Capture source now carries enough durable evidence to answer
the rehearsal questions without trusting a toast, transient upload job, or the
version of the app used later to inspect it:

- what app build, iPhone runtime, camera profile, and audio route opened it;
- which exact capture group, Session, room, participant, and immutable source
  file it belongs to;
- whether its room-bound START and STOP receipts both committed;
- whether the complete local file still hashes and sizes exactly as recorded;
- whether Nest returned a matching server-computed hash, byte count, storage
  generation, and verification time; and
- which canonical source, media asset, transcript job, and object path Nest
  created.

The Library exposes this as **Review source evidence**. A real finalized source
can produce a versioned JSON evidence receipt only after Quipsly recomputes
SHA-256 from every local byte and confirms that the file did not change during
the read.

## Ownership and durability boundary

The immutable local media file remains source truth. Metadata is held in three
separate durable layers:

1. The protected per-source sidecar and aggregate local recording ledger own
   capture identity, capture-time runtime evidence, room receipt IDs, and the
   final verified cloud proof.
2. The protected upload ledger owns retryable transfer state until its proof
   has been copied into the permanent source ledger.
3. The keychain owns the resumable capability URL. It never appears in an
   evidence receipt, preferences, logs, or backup.

Verified upload finalization is ordered as a recoverable transaction:

1. Nest must return matching server-computed SHA-256 and byte count.
2. Quipsly records the returned generation, verification time, canonical IDs,
   and object path in the still-durable upload job.
3. Quipsly durably commits that proof to the exact owner-partitioned source
   row.
4. Only then does it remove the resumable job from the protected upload
   ledger.
5. Only after job-ledger removal commits does it delete the keychain
   capability and publish the completion notification.

If step 3 fails, the verified job becomes held and both local bytes and upload
proof remain. If step 4 fails, the in-memory removal is rolled back and the
durable job can replay idempotently after relaunch. A crash can therefore cause
safe duplicate work but cannot create a verified source with its only
cryptographic receipt already discarded.

## Capture-time evidence

`CaptureRuntimeEvidence` snapshots these values before audio or video bytes
begin:

- `CFBundleShortVersionString` and `CFBundleVersion`;
- the hardware model identifier returned by `uname`;
- system name and version; and
- the active `AVAudioSession` input port name and port type.

Audio and video write the snapshot into the source profile. Video also retains
the negotiated and decoded media profiles already used to fail closed on
codec, dimensions, orientation, and track drift. The evidence describes the
recorder at capture time; it is never reconstructed from the later review
device.

The source ledger and per-source sidecar schemas advance to versions 6 and 3.
Every added property remains optional so existing Build 8 recordings and older
recovery sidecars continue to decode.

## Portable receipt

The exported schema is:

`quipsly-capture-source-evidence` version `1`.

It includes:

- source and capture-group IDs;
- media kind, filename, title, Session context, timing, duration, and byte
  count;
- the complete versioned source profile;
- START and STOP receipt IDs and whether both are required and present;
- freshly computed local SHA-256 and byte count;
- stored local-ledger hash comparison when one exists;
- server verification, canonical IDs, object path, generation, and time; and
- explicit booleans for every source-truth check.

It deliberately excludes:

- the raw Quipsly account identifier or email;
- authentication tokens and resumable or signed URLs;
- the absolute local sandbox path; and
- media bytes.

The owner is represented only by a SHA-256 fingerprint so two receipts can be
correlated without exposing the account identity.

Evidence files are immutable snapshots, not a mutable “latest” file. Each name
contains the source ID, generation time, and a fresh UUID. Files use complete
data protection, live under the current owner's hashed Application Support
partition, and are excluded from backup. Preparing a newer receipt never
deletes or overwrites an older one.

## User experience

Every real Library source exposes one reachable evidence screen with four
plain-language sections:

- Source identity
- Captured with
- Room boundary
- Cloud copy

The screen distinguishes “not verified” from “verified” and “not required”
from “missing.” Exact identifiers remain selectable for support, but long
hashes are shortened in the visual summary. The share action is absent until
the full local hash succeeds.

Preview mode is intentionally non-operational. It demonstrates the layout,
labels itself synthetic, and exposes neither prepare nor share controls.

Nest exposes the other side of the comparison in the authenticated Session
**Recordings** workspace:

- it reads the canonical `RecordingAsset`, applied room START/STOP receipts, and
  latest `MobileCaptureFinalizationReceipt` for the source;
- it independently compares room, capture, upload-session, actor, recording,
  START-receipt, SHA-256, byte-size, bucket, object-path, and object-generation
  identity;
- it whitelists only capture app/build, hardware model, OS, and microphone
  route from the reported source profile;
- it never sends actor IDs, signed/resumable URLs, camera unique IDs, or raw
  metadata JSON to the browser; and
- it reports `Verified match`, `Held`, `Drift`, or `Incomplete` rather than
  collapsing transport, policy, and integrity into one success badge.

This is a read-only projection over existing canonical rows. It adds no table,
migration, copied evidence store, or phone-controlled authority. The phone
receipt is useful for side-by-side rehearsal review, but Nest recomputes its
own result instead of importing that receipt as truth.

## Security and failure policy

Evidence preparation fails closed when:

- the source is not finalized and playback eligible;
- the source is outside the active owner partition;
- the local file is absent or not a regular file;
- the account, source identity, file size, or modification date changes while
  hashing;
- a room-bound capture lacks either START or STOP proof; or
- a cloud copy claims verified but its hash, size, generation, or timestamp
  does not match the local source.

An incomplete room boundary or mismatched cloud proof remains visible in the
review screen and receipt checks. It is never silently upgraded into success.

## Verification

- Source evidence contract: 23/23.
- Capture durability contract: 79/79.
- Universal arm64/x86_64 iOS simulator build: passed.
- Operated iPhone 17 Pro simulator journey:
  `testSourceEvidencePreviewShowsTruthBoundariesWithoutCreatingAReceipt`:
  passed.
- Nest source-evidence model and Session Recordings UI: 25/25 focused tests
  pass alongside the existing Session review suite.
- Strict Quipsly TypeScript check: passed.
- Quipsly production build with the release build-time database boundary:
  passed, including all 150 App Router pages.
- Full mobile preflight remains the release gate and includes the new source
  evidence contract.

The remaining acceptance boundary is physical iPhone work: create real
standalone and room-bound sources, prepare and share their receipts, relaunch,
upload, and compare the local and cloud proof readback. Simulator and static
contracts do not substitute for camera, microphone, route, background upload,
thermal, or physical storage behavior.
