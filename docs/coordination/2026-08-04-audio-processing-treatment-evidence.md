# Shared audio-processing evidence checkpoint

Date: 2026-08-04

## Outcome

Quipsly now uses one source-clock processing-map contract for automatic
mastering and reversible source treatment. A reviewer can move from the compact
editor status to a dedicated evidence desk, see what changed at an exact decoded
moment, and switch between the immutable source and the candidate without
losing the playhead or active playback.

The treatment desk exposes both complete-decode diagnoses instead of discarding
the output diagnosis after the processing worker completes. It reports the
before and after RMS, sample peak, estimated signal floor, and observation
counts, alongside their deltas. Source and treatment observations have distinct
map lanes. Loudness matching remains the default monitor mode so a louder signal
does not masquerade as a better signal.

The language preserves an important technical boundary: short-term loudness
difference is not compressor gain reduction, and amplitude statistics cannot
prove frequency response, phase integrity, speech naturalness, or subjective
quality. The evidence narrows where a person should listen; it does not replace
listening.

## Architecture

`AudioProcessingChangeMap` is a reusable client contract over two public,
privacy-safe measurement series on the same decoded source clock. It provides:

- whole-program, 60-second, and 15-second views;
- direct clock selection shared with both audio elements;
- level delta and dynamic-shape delta after removing the uniform integrated
  loudness shift;
- separate source and candidate signal-observation lanes;
- selected-time evidence and aggregate shape-change summaries;
- product-specific labels and scientific caveats without duplicating the math.

The audio-treatment public status now returns the already-receipted source and
candidate diagnoses through the same privacy-safe projection used by mastering.
It does not expose provider paths, worker internals, or mutable registration
details. The treatment derivative remains an unpromoted experiment and the
original asset remains source truth.

## UX repair found by operating the app

The first retained operation found that treatment evidence was rendered inside
the editor media list's short scrolling card. The evidence existed, but its map
had no practically operable width and the deeper comparison was easy to miss.

The editor now keeps a compact treatment status card in that list and opens the
full comparison in a dedicated responsive modal. The desk prevents background
scroll, accepts Escape and backdrop dismissal, pauses both feeds on close, and
returns keyboard focus to the button that opened it.

## Retained Episode 4 proof

The signed-in local operation used retained High Ground Odyssey media and its
completed processing receipts:

- project `high-ground-odyssey`, episode `episode-4-part-2`;
- mastery source `cmse192a8000e8jxldysq5b1u`, receipt
  `audio_mastery_9cafe8cc6c684e90bcb07ca008bfd48c`;
- treatment source `cmsecf2px0007q7xlyooqnys0`, receipt
  `audio_treatment_3076f60ac63d4242b55b23338a3324c3`;
- selected source-clock points 8.15 seconds for mastery and 4.96 seconds for
  treatment;
- both protected feeds loaded for both comparisons;
- playback advanced from each selected clock point;
- version switching preserved playback and clock position;
- treatment observations changed from one source flag to zero output flags;
- no browser exceptions or horizontal overflow;
- both canonical assets and both processing receipts were structurally equal
  before and after the rendered operation.

The operation is loopback- and local-PostgreSQL-only, uses the retained QA
credential from macOS Keychain, prints no credential, captures no screenshot,
and has no external side effect. Its current entrypoint is
`pnpm quipsly:retained:audio-processing`; the older mastery-specific alias is
retained for compatibility.

## Verification

- 17 focused UI, math, privacy-projection, and API tests passed;
- 13 FFmpeg diagnosis, mastering, treatment, and worker-contract tests passed;
- retained operation contract test passed;
- signed-in retained Episode 4 rendered operation passed;
- strict Quipsly TypeScript passed;
- full production build and repository-health results are recorded in the
  commit handoff for this slice.

## Next boundary

The next high-value step is to put transcript words, confidence and correction
state, capture discontinuities, drift/synchronization evidence, and durable
listening decisions on this same clock. That creates one explainable review
surface for audio mastery, transcription accuracy, and automated video edits
instead of independent dashboards that force reviewers to reconstruct context.
