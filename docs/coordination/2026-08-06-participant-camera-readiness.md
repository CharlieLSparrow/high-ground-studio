# Participant camera readiness

Date: 2026-08-06

## Product problem

Quipsly already refused to claim deterministic camera assembly without reviewed
speaker and source identity. The editor, however, exposed that truth mostly as
scattered warnings. A producer could see that a camera was missing or ambiguous
without a compact answer to four practical questions: whether the take contains
video, whose cameras are present, whether speaker identity is reviewed, and
what exact surface resolves the next gap.

The older warning actions also routed camera identity problems to Guided sync.
Synchronization and camera ownership are separate evidence boundaries, so that
path could not actually resolve the stated problem.

## Implemented contract

`planCaptureTakeMaterialization` now derives one read-only
`cameraReadiness` projection from the sources selected for the exact take,
canonical transcript blocks, playback-reviewed participant attribution, and
existing speaker-camera mappings.

The states deliberately form an evidence ladder:

1. `NO_VIDEO_SOURCES`: audio work may continue, but there is no camera source.
2. `SPEAKER_REVIEW_REQUIRED`: a camera exists, but the voice identity needed to
   connect it to a person is not reviewed.
3. `CAMERA_IDENTITY_REQUIRED`: video exists without participant ownership.
4. `PRIMARY_ANGLE_REQUIRED`: speaker and camera evidence exist, but the primary
   mapping remains missing or ambiguous.
5. `READY`: every reviewed speaker has an explicit synchronized mapping.

The projection contains counts plus per-participant missing, ambiguous, or
mapped coverage. It creates no database row, changes no source, and does not
approve an edit.

## Operator experience

The materialization panel now displays **Participant camera readiness** before
its issue list. Its action follows the evidence:

- no video opens the exact Session in recording-source mode;
- unresolved speaker identity opens the exact RecordingAsset transcript review;
- camera identity or primary-angle gaps open automated-edit evidence;
- ready state presents no repair action.

The existing issue actions follow the same contract. Missing video returns to
Session sources and camera ambiguity opens the primary-camera decision. Neither
is mislabeled as synchronization work.

## Operated evidence

The retained High Ground Odyssey QA take contains two protected audio sources
and no video. In the rendered editor it reported `NO_VIDEO_SOURCES` and linked
to:

`/sessions/cmsfpfwrt000db9xld8ppuon4?mode=recordings`

The same run proved both source URLs returned range media, advanced during
playback, and paused together. The exact-source speaker-review handoff still
selected its intended RecordingAsset and TranscriptJob, an unavailable source
still failed closed with 404, and there were zero browser exceptions. No source
media or publication state changed.

A synthetic two-camera fixture with one reviewed participant and two eligible
cameras reported `PRIMARY_ANGLE_REQUIRED`. The planner did not silently choose
an angle.

## Verification

```bash
pnpm --filter quipsly exec jest --runInBand --runTestsByPath \
  'src/lib/episode-production/capture-take-materialization.test.ts' \
  'src/app/(app)/editor/CaptureTakeMaterializationPanel.test.tsx' \
  'src/app/api/episode-production/capture-takes/route.test.ts' \
  'src/app/(app)/sessions/[roomId]/session-episode-assembly-evidence.test.ts'
node --test scripts/quipsly-retained-materialized-capture-playback-operation.test.mjs
QUIPSLY_RETAINED_CAPTURE_PLAYBACK_OPERATION=1 \
DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/high_ground_studio \
  node scripts/quipsly-retained-materialized-capture-playback-operation.mjs
pnpm --filter quipsly typecheck
git diff --check
```

## Next physical-device gate

The projection is not a substitute for device acceptance. The next gate is a
new Session with an actual iPhone video source, separate high-quality audio,
reviewed alignment, completed transcript, and a proof-watch/listen of the
assembled timeline. Multiple cameras for one participant must remain held until
the producer selects a primary angle.
