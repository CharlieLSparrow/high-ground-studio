# Capture source rendezvous and optional provider witness

Date: 2026-08-05

## Outcome

One recording encounter has one server-owned `CallRoom.captureGroupId`.
iPhone audio, iPhone video, browser-retained sources, external imports, and an
optional provider room composite keep distinct immutable bytes and source
receipts while rendezvousing under that take identity.

Provider recording is not the synchronization authority. It can be useful as:

- a redundant conversational witness;
- a recovery/listening reference if a local device source is damaged or late;
- another waveform rail during human alignment review; and
- a convenient room mix for fast transcript or editorial triage after its own
  consent, byte-verification, and processing gates pass.

Local protected masters remain sufficient. Their immutable START receipts and
device clock samples establish a rough placement proposal. Complete decoded
signal evidence, an opening shared event, a later drift measurement, and an
explicit reviewer establish the saved placement. Quipsly does not claim sample
accuracy from clock arithmetic or provider availability.

## Changes

- Episode Room alignment links now open `/editor` rather than the separate live
  cut surface, and preserve the exact `captureGroup` query value.
- The editor projects the complete source set for that take, including role,
  baseline, proposed offset, uncertainty, recording identity, and current
  spine/target selection.
- The UI says directly that provider media is an optional witness/recovery rail
  and that local masters do not depend on it to rendezvous.
- Provider recording receipt-slot manifests and real LiveKit egress manifests
  carry `CallRoom.captureGroupId`. A verified provider composite therefore
  joins the same Studio handoff group when it exists.
- `StudioMediaAsset` remains reusable media truth and does not gain a redundant
  capture-group column. Capture grouping stays on CallRoom/RecordingAsset
  provenance and the episode import projection.
- An invalid `captureGroupId` field in the Episode Room Media Vault Prisma
  selection was removed. That stale projection crashed actual Episode Rooms
  even though component and TypeScript checks passed.

## Operated local evidence

A clearly labeled local-only episode fixture under the High Ground Odyssey Nest
contained two distinct protected-source registrations in one capture group:

- QA protected microphone master, group baseline, `+0.000s`, `±6.2ms`;
- QA protected iPhone camera master, `+0.240s`, `±8.5ms`.

The signed-in retained-coach browser journey:

1. loaded the real Episode Room after the Prisma repair;
2. rendered both alignment candidates and two exact-take links;
3. followed `Review this take` into the deep editor with the group preserved;
4. rendered both separate masters and the provider/local boundary copy;
5. completed full immutable-source signal profiling for both sources;
6. applied `+0.240s` only as a rough timeline anchor; and
7. confirmed that final placement approval remained disabled because no human
   opening-event or later-drift review was claimed.

No reviewed-sync receipt, timeline save, provider recording, external mutation,
deployment, TestFlight action, or publication occurred.

## Verification

- Episode Room Media Vault local PostgreSQL integration: 5/5 passed.
- Editor, Episode Room, and provider-evidence focused suites: 25/25 passed.
- Quipsly domain TypeScript: passed.
- Quipsly application TypeScript: passed.
- Real signed-in Episode Room and editor operation: passed with the approval
  hold intentionally retained.

## Remaining release boundary

- Operate the same flow with independent physical iPhone/browser masters rather
  than a local duplicate-media fixture.
- Confirm live hardware audio routing and retained-source upload on the MV7i,
  Homer’s selected iPhone/browser combination, and the exact production Nest.
- Keep provider egress optional. If enabled later, require the existing visible
  start action, current all-party consent, durable command/outbox, reconciliation
  receipt, exact-byte verification, and zero implicit spine promotion.
