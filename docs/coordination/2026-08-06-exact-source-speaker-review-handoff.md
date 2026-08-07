# Exact-source speaker-review handoff

Date: 2026-08-06

## Product problem

The Episode materialization correctly refused to claim camera-assembly
readiness, but its generic speaker/camera warning did not lead to a resolution.
Tracing the existing review surfaces found a more serious identity defect:
`?source=<RecordingAsset>` constrained the Session packet, while the transcript
correction desk independently loaded the room's newest TranscriptJob.

That could send a producer from an exact-source warning to playback, words, and
speaker controls for a different recording.

## Boundary repair

`readTranscriptCorrectionDesk` now accepts an optional RecordingAsset identity
and constrains the nested TranscriptJob query inside the already authorized
Session. Reconciliation reloads retain the same constraint. If no accessible job
matches, the desk returns `SOURCE_TRANSCRIPT_NOT_FOUND` with HTTP 404 rather than
falling back.

The API and client carry that source identity end to end. Exact-source mode
returns a visible focus receipt and suppresses the current room-wide evaluation
scorecard, because those measurements are not yet source-selectable. It is more
honest to omit a metric than show one from another job.

The take planner now distinguishes two speaker-review conditions:

- `speaker-labels-unavailable`: the provider emitted no diarization labels, so
  the producer must review speaker names per turn against protected playback;
- `speaker-attribution-incomplete`: a provider cluster exists but lacks a
  playback-reviewed Session participant identity, so `Identify a voice once`
  is valid.

The editor links each condition to the matching exact-source review anchor.
Participant-camera missing or ambiguity remains a separate camera-readiness
action. Missing sources open the exact Session recording workspace; primary
camera ambiguity opens automated-edit evidence. Neither is treated as an
alignment problem.

## Retained rendered proof

From the already materialized retained Episode, the visible warning opened:

`/sessions/cmsfpfwrt000db9xld8ppuon4?mode=transcript&source=cmsi2v4l4000rlqxl78h1w8t3#transcript-correction-review`

The correction response selected TranscriptJob
`cmsi6pqf7000uazxlrp1ytaea`, retained the exact RecordingAsset identity, returned
no room-wide evaluation payload, and rendered **Listen, correct, preserve the
source**. A request for `recording-not-in-this-session` returned HTTP 404 with
`SOURCE_TRANSCRIPT_NOT_FOUND`.

The journey had no horizontal overflow or browser exception. It created no
speaker correction or attribution, changed no source media, and started no
publication. A person must still listen before accepting any speaker name.

## Verification

```bash
pnpm --filter quipsly exec jest --runInBand --runTestsByPath \
  'src/lib/server/transcript-corrections.test.ts' \
  'src/app/api/mobile/capture/transcripts/corrections/route.test.ts' \
  'src/app/(app)/sessions/[roomId]/transcript-correction-desk.test.tsx' \
  'src/lib/episode-production/capture-take-materialization.test.ts' \
  'src/app/(app)/editor/CaptureTakeMaterializationPanel.test.tsx'
node --test scripts/quipsly-retained-materialized-capture-playback-operation.test.mjs
QUIPSLY_RETAINED_CAPTURE_PLAYBACK_OPERATION=1 \
DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/high_ground_studio \
  node scripts/quipsly-retained-materialized-capture-playback-operation.mjs
pnpm --filter quipsly typecheck
git diff --check
```
