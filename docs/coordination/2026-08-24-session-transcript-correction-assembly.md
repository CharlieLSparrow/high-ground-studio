# Session transcript correction assembly

Date: 2026-08-24

## Problem closed

The mentor report could assemble two participant-owned transcripts, but the
ordinary browser and Capture correction endpoint still returned only the newest
TranscriptJob. Mutation lookup also searched only that newest job. A coach could
therefore see one side of a call and receive “segment not found” when reviewing
a valid turn owned by the other participant source.

## Production behavior

- One shared selector chooses one current source per participant. A matching
  capture-group identity outranks bounded wall-clock clustering; legacy sources
  retain the coherent-take fallback.
- An ordinary Session transcript read assembles ready participant-isolated
  sources on the reusable Session program clock. Focused-source reads remain
  exactly one RecordingAsset for diagnostics and recovery.
- Every assembled passage carries its TranscriptJob, RecordingAsset,
  source-local boundaries, program boundaries, and protected source playback.
- Mutation lookup finds the TranscriptJob that owns the globally identified
  segment instead of assuming the newest job owns every passage.
- If another participant source is held or changes identity, the exact current
  source stays visible and the Session assembly reports `incomplete`; Quipsly
  does not blend held evidence into the conversation.

## UX and playback authority

The browser reads the interleaved conversation on Session time. Playing a turn
switches the protected player to that turn's exact participant source and seeks
using source-local time. Playback-review coverage is keyed by source identity
and second, so listening to the same second on another recording cannot
authorize a correction.

Capture decodes each passage's source and program coordinates. It displays
Session time but seeks and validates corrections on source time. Local playback
is enabled only when the passage's RecordingAsset is the exact retained original
on that iPhone; another participant's turn remains readable but cannot borrow
the wrong local file as review evidence.

## Automated evidence

- 47 focused server tests pass across source selection, clock assembly,
  correction assembly, multi-job mutation targeting, correction API, and mentor
  report export.
- 26 browser correction-desk interaction tests pass, including exact participant
  source switching before seek.
- Strict Quipsly TypeScript passes.
- A signing-independent generic iOS Simulator build passes.
- The App Store static gate and the broader mobile Capture contract gate pass;
  their transcript and Session-conversation assertions now follow the current
  centralized source-validation and first-class conversation boundaries.

## Honest remaining acceptance

No automated test proves a real coach/client transcript is perceptually aligned
or that a physical iPhone has the intended participant original. The release
flight must open the same assembled Session in browser and Capture, play turns
from both people, prove each player identifies the correct RecordingAsset, make
one correction on each source, refresh and cross-read it, and verify that an
iPhone without the other original cannot accept review against its local file.
