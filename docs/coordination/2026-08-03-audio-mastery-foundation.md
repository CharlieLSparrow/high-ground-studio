# Audio mastery foundation checkpoint

Date: 2026-08-03

## Outcome

Quipsly now has a production-shaped local audio mastery lane: complete-source
standards measurement, a reversible source-bound proposal, an optional
double-pass 24-bit PCM derivative, independent verification, recoverable job
execution, private Nest registration, and an accessible Episode-editor
loudness visualization.

## Operated proof

The signed-in local Nest editor was operated against Episode 4 Part 2 with a
new 12-second, four-level audio fixture imported through the real episode media
API.

- source asset: `cmse192a8000e8jxldysq5b1u`;
- source measurement: -46.56 LUFS integrated, -40.0 dBTP true peak, 4.1 LU
  loudness range;
- verified derivative: -15.97 LUFS integrated, -9.44 dBTP true peak;
- database job: `audio_mastery_0da76578fbf34d34b85dc66d5fb1a225`;
- final job state: `completed`;
- registered variant: `audio-master-preview`, `audio/wav`;
- source-preserved and verification-pass receipts both read back `true`.

Reloading the editor rehydrated the completed measurement, graph, and verified
output from the canonical job. This caught and repaired an initial invalid
Prisma unique lookup for workspace-scoped project slugs. An older Episode 4
fixture correctly failed because its temporary source bytes no longer existed;
the media-root boundary was not weakened.

A second clean worker/control-plane run caught two additional release defects:
profile-specific FFmpeg offsets are now carried only by measurements bound to
that exact profile, and receipt integrity uses canonical structural JSON
comparison because PostgreSQL JSONB may reorder object keys. The already
verified output reconciled successfully after the comparator repair without a
second render.

## Verification

- audio contract/worker/real FFmpeg suite: 8/8, including separate Apple and
  EBU profile-bound analysis;
- API authorization, public-receipt privacy, and fail-closed service suites:
  7/7;
- Quipsly strict TypeScript: passed;
- media processing package strict TypeScript: passed;
- media processor strict TypeScript: passed;
- real signed-in browser operation: passed;
- persisted browser reload/readback: passed;
- PostgreSQL receipt plus registered variant readback: passed.

## Scope boundary

This is local Nest qualification. It did not run a production migration,
deploy a cloud revision, create a GCS mastering job, promote a derivative,
change a production source, publish, send a message, or touch TestFlight.
Cloud outbox/worker qualification and explicit approval/promotion are next.
