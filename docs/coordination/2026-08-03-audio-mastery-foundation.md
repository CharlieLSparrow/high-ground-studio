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

## Audition and transparency checkpoint

The editor now treats delivery compliance and sound preference as separate
questions. A completed mastering result exposes the verification decode's full
one-second measurement series to authorized project members, then opens a
focused source-to-master audition desk with:

- transport-synchronized source/master switching at the same playhead;
- overlaid three-second short-term loudness curves and the profile tolerance;
- source and preview integrated LUFS and true-peak evidence;
- direct listening jumps to the loudest source moment, quietest sustained
  passage, and largest aligned processing shift;
- explicit language that measurements prove delivery readiness, not that a
  reviewer will prefer the sound;
- an unpromoted 24-bit WAV derivative while the immutable source remains truth.

The operated browser pass uncovered a real authorization defect: registered
`StudioAssetVariant` playback inherited neither the owning asset's project
scope nor its Capture processing lineage. The protected media route therefore
returned 404 for the mastered bytes even though the verification receipt was
valid. Variant sources now inherit the owning original's project authorization
and recursively inherit any Capture release or hold. Outsiders still receive a
non-disclosing 404.

The repaired retained Episode 4 Part 2 proof loaded both media elements to
browser `readyState=4`. Playback advanced from 3.62 seconds on the immutable
source to 4.67 seconds after switching to the mastered preview, without
resetting the playhead. The full-width desk had no horizontal overflow at a
1280 by 720 viewport and produced no browser error logs.

Current standards and product research informed this boundary:

- Apple Podcasts asks for approximately -16 dB LKFS, plus or minus one, no
  more than -1 dBFS true peak, measured using ITU-R BS.1770-5:
  <https://podcasters.apple.com/support/893-audio-requirements>
- EBU R128 version 5.0 retains -23 LUFS programme loudness plus Loudness Range
  and Maximum True Peak descriptors: <https://tech.ebu.ch/publications/r128>
- ITU-R BS.1770-5 remains the measurement basis:
  <https://www.itu.int/rec/R-REC-BS.1770-5-202311-I/en>
- Descript exposes Studio Sound intensity and basic level monitoring, while
  Adobe Audition exposes repair controls and match-loudness workflows. Quipsly's
  differentiator is not another opaque enhancement toggle; it is an
  auditionable, reversible, evidence-bearing processing graph.

Checkpoint verification:

- audio engine and real FFmpeg: 8/8;
- focused authorization, privacy, comparison, and fail-closed tests: 10/10;
- Quipsly TypeScript 7 typecheck: passed;
- Quipsly production build: all 165 routes passed;
- signed-in retained-media operation and synchronized A/B playback: passed.
