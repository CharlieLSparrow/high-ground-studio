# Audio mastery processing-map checkpoint

Date: 2026-08-04

## Outcome

Quipsly's source-to-master audition desk now explains *where* its automatic
mastering changed the program instead of asking a reviewer to mentally subtract
two loudness curves.

The new shared-clock processing map keeps two different measurements separate:

- **delivery delta** is the mastered three-second short-term loudness minus the
  source short-term loudness at the same decoded moment;
- **shape delta** subtracts the complete-program integrated loudness shift from
  that delivery delta, exposing relative dynamic-shape changes that would
  otherwise disappear behind uniform normalization.

The UI explicitly says these LU differences are not compressor gain-reduction
measurements and cannot identify a processor or certify subjective quality.
Whole-program, 60-second, and 15-second views stay centered on the synchronized
audition playhead. The map shows source-signal observations, supports direct
clock selection, and reports the selected delivery and shape deltas, mean
absolute shape change, and largest shape-change time.

This extends the standards boundary documented in
`2026-08-03-audio-mastery-foundation.md`: BS.1770 complete-decode measurements
remain delivery evidence, matched-loudness A/B remains the listening default,
and the immutable source remains truth.

## Operated retained proof

The rendered local editor was operated against the retained Episode 4 Part 2
mastery fixture:

- project: `high-ground-odyssey`;
- episode: `episode-4-part-2`;
- source asset: `cmse192a8000e8jxldysq5b1u`;
- mastery receipt: `audio_mastery_9cafe8cc6c684e90bcb07ca008bfd48c`;
- map-selected source time: 8.15 seconds;
- both protected audio elements loaded metadata;
- mastered playback advanced from the selected clock position;
- switching to the immutable source preserved active playback and the shared
  time;
- the detail view became active;
- the 1280 by 900 dialog had no horizontal overflow;
- the browser raised no application exceptions;
- canonical source-asset and mastery-receipt snapshots were structurally equal
  before and after the audition.

The existing retained media test operator initially received the correct
access-denied editor instead of protected HGO content. Local PostgreSQL now has
an explicit active `EDITOR` grant for that dedicated test identity, with the
note `Local-only retained media and audio-transparency acceptance operator.`
No authorization rule was bypassed, no production/cloud identity changed, and
no source or proposal was promoted.

## Verification

- processing math, view bounds, empty-evidence behavior, monitor gain, and
  review-moment helpers: 8 tests;
- rendered processing-map semantics and zoom interaction: 1 test;
- retained-operation contract test: 1 test;
- signed-in retained Episode 4 operation: passed;
- strict Quipsly TypeScript: passed before the retained operation;
- production build: all 166 routes passed with an explicit 8 GB Node heap
  (the default 4 GB TypeScript worker limit was insufficient for this monorepo);
- immutable source and mastery receipt: unchanged.

## Next boundary

The processing map is intentionally not the final unified audio workspace.
Next, the same clock should carry reversible treatment deltas, transcript words
and confidence/review state, capture/sync boundaries, and durable listening
receipts. A reviewer should be able to move from a measured mastering change to
the exact words, source condition, synchronization evidence, and matched-level
A/B without changing surfaces or losing context.
