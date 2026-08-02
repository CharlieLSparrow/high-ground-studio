# Coaching held-release and transcript playback operation — 2026-08-02

## Outcome

Quipsly operated one retained **synthetic** coaching recording from preserved
local source bytes through separate-participant consent, explicit processing
release, durable local transcription, canonical media promotion, protected
playback, range delivery, and the transcript correction desk.

This is engineering acceptance evidence, **not a genuine coaching session**.
No claim, task, goal, Session note, review packet, client delivery, publication,
or human transcript approval was created from it.

## Canonical identities

- Session room: `qa-retained-coaching-next-session-20260807`
- Private Nest: `qa-retained-coaching-engagement`
- RecordingAsset: `cmsc8ee1j0001qyxlxdja8ho8`
- Upload session: `aba9da45-c487-488d-99ae-13ffbf27f7bc`
- Capture: `63bb2121-fc4d-40f8-92f3-1e060dc1e6bf`
- TranscriptJob: `cmsc8ee1w0003qyxlk5dzpzbd`
- StudioVideoSource: `cmsc9i69k000iqyxl4dth7a3o`
- StudioMediaAsset: `cmsc9i69u000jqyxl5rh76vph`
- Nest attachment: `cmscb3spw0000juxllgacqcc8`
- Registration receipt: `cmscb3sqc0001juxll1xxo9v9`
- Protected playback: `/api/ingest/media/cmsc9i69k000iqyxl4dth7a3o`

## Consent and release

The retained room has three audible participants with independently persisted
`GRANTED` consent under policy `2026-07-18.capture-consent-v2`:

| Participant | Role | Consented at (UTC) | Audio | Video | Transcript |
| --- | --- | --- | --- | --- | --- |
| Retained coach | COACH | 2026-08-02 20:01:56.031 | yes | yes | yes |
| Retained client | CLIENT | 2026-08-02 20:19:54.934 | yes | yes | yes |
| Retained room producer | PRODUCER | 2026-08-02 20:22:01.206 | yes | yes | yes |

The recording first remained held. The scoped retained coach then used the
rendered release control after the ledger showed all three grants. The durable
finalization receipt records both processing and transcript disposition as
`RELEASED` at `2026-08-02 20:37:54.099 UTC`, with this reason:

> Synthetic local coaching acceptance: all three participants granted current
> audio and transcription consent; exact bytes and immutable receipt were
> reviewed.

The coach has the scoped `COACH` role and Nest owner grant. The client and room
producer are nonstaff. The release did not mutate or copy the source recording.
Nest recognizes this exceptional boundary only from the persisted source-profile
contract `quipsly-nest-external-recording-import-v1`, with source
`nest-session-recordings` and `originalPreserved=true`. A native Capture source
cannot inherit the external-import release path merely because its START/STOP
receipts are absent.

## Exact source and local transcript operation

The canonical local-vault source is:

`capture-vault/objects/media-vault/recordings/mobile/qa-retained-coaching-next-session-20260807/qa-retained-coaching-next-session-20260807-coach/aba9da45-c487-488d-99ae-13ffbf27f7bc/quipsly-synthetic-coaching-import.wav`

- Bytes: `756742`
- SHA-256: `309adeddf1851bf9929718113c5bf058d4501c65f59187e14b39a8de792a90e0`
- Content type: `audio/wav`
- Duration: `17.157914` seconds

The first local-worker attempt failed closed when an old ingest-root form did
not resolve to the configured media-vault object root. It did not treat an
unresolved path as trusted media. The retry used the canonical `objects/` root
and its generation/size/hash/type sidecar.

The durable lifecycle-owned worker used local OpenAI Whisper
`large-v3-turbo` on CPU and completed at `2026-08-02 21:07:45.032 UTC`:

- 5 immutable provider segments;
- 46 timed provider words;
- raw provider receipt SHA-256
  `ff4f69902e924b79fa26511decb518373e00fdea515b4a8aaca83a1641565e7b`;
- `humanReviewed: false`;
- `downstreamWorkCreated: false`;
- `sourceMutationAllowed: false`; and
- requester repaired from the already-preserved
  `requestedByUserId` receipt to `cms8qtbe50000qxxlwchgvza9`.

The provider heard “Quipsley” in the first segment. That error is deliberately
preserved as provider truth until a person listens and accepts a correction.

## Promotion and protected playback proof

The retained coach used the transcript desk's **Prepare protected playback**
action. It called the canonical recording promotion route with the exact
RecordingAsset. Promotion reused the already verified source and media rows,
created a Nest attachment, and registered playback behind the existing project
access and Capture release gates. It copied no blob, altered no source, ran no
second transcript, and created no episode production for this coaching Nest.

The signed-in coach then loaded and played the real `<audio>` element from
`00:00`. Browser readback showed:

- `currentTime: 1.212865` after operation;
- `duration: 17.157914`;
- `readyState: 4`; and
- one buffered range covering `0` through `17.157914`.

An authenticated HTTP boundary check independently proved:

- full GET: HTTP `200`, `756742` bytes, `audio/wav`, `Accept-Ranges: bytes`;
- full response SHA-256 exactly matched the preserved source;
- `Range: bytes=128-511`: HTTP `206`, 384 bytes,
  `Content-Range: bytes 128-511/756742`;
- range SHA-256
  `71af471a1cc97d9529c17f5ae7fa16b7a90c7be81d8543a303d0b6def70b43aa`
  exactly matched bytes 128–511 read from the immutable source;
- signed-out request: HTTP `401`, `private, no-store`;
- unrelated verified nonstaff account with no Nest/room/booking grant: HTTP
  `404`, `private, no-store`; and
- the live response emits both Next's router variants and the route's separate
  `Vary: Authorization, Cookie` line.

The old fixture named `outsider` is actually a collaborating room producer with
an active Nest `VIEWER` grant, so it correctly received HTTP `200` and cannot be
used as privacy evidence. The auth seed now has a distinct
`privacy-outsider` identity that is deliberately absent from every retained
project grant, booking, room, and participant.

## Human review boundary

In the rendered correction desk, the coach test session:

1. played the first segment from its protected timestamp;
2. opened **Correct against playback**;
3. staged “This is a synthetic Quipsly coaching workflow recording.” with the
   reason “Product name recognition.”; and
4. observed **Accept reviewed correction** remain disabled while the exact
   listening attestation was unchecked.

The staged form was canceled. Database readback remains:

- transcript corrections: `0`;
- segment verifications: `0`; and
- playback-reviewed segments: `0 of 5`.

This is the intended remaining human-only gate. A real person must listen,
check the exact-timestamp attestation, and accept or revise the text. Automated
operation must not impersonate that decision.

## Workflow receipt truth and legacy reconciliation

`asset-register` rows describe registration that already completed in the same
transaction; no registration worker exists or is needed. New registration rows
now write `completed` receipts with started/completed timestamps and
`quipsly-asset-registration-receipt-v1` provenance. Actual video
`asset-proxy` work remains queued.

The guarded reconciliation operator is dry-run-first and requires the explicit
confirmation `RECONCILE_ASSET_REGISTRATION_RECEIPTS`. Its local plan found 68
legacy queued rows:

- 7 still referenced canonical StudioMediaAsset rows and were reconciled;
- 61 had missing/null historical assets and remained held; and
- no source media was read, copied, or mutated.

The retained promotion receipt is now `completed`, with its prior creation time
preserved as `startedAt` and reconciliation at
`2026-08-02 21:40:57.276 UTC`.

## Credential cleanup

The four local Firebase emulator identities received new random passwords after
the browser operation. The prior and replacement owner-only credential
directories, plus byte-proof scratch files, were moved to macOS Trash. No
password or bearer token was printed or retained in the repository.

## Verification

- 21 local lifecycle, worker, consent-fixture, and reconciliation tests passed.
- 82 focused Nest session/transcript/promotion tests passed.
- 245 repository Quipsly contract tests passed.
- `@high-ground/quipsly-domain` TypeScript passed.
- Quipsly Next route generation and TypeScript passed.
- Local doctor passed Nest health, signed-out shell, transcript worker, media
  worker, exact runtime worktree, Auth emulator, Docker, PostgreSQL, and retired
  owner-override checks.

## Explicitly not proven here

- human acceptance of the staged transcript correction;
- a genuine coaching session and human-reviewed notes/tasks/goals;
- physical-iPhone capture, interruption recovery, or upload from this session;
- TestFlight/App Store delivery; or
- a Studio proof-listen/export of a real coaching deliverable.

Those remain completion gates in the unified product goal.
