# Automated editing on visible audio evidence

Date: 2026-08-04

## Outcome

The episode editor now projects deterministic edit proposals and review
candidates over the actual decoded Capture signal profile on the same source
clock as its playhead. The map shows:

- compacted decoded RMS windows and sample-peak needles;
- measured low-energy intervals without calling RMS loudness or silence;
- reversible edit-proposal ranges;
- transcript, overlap, retake, and speaker/camera review ranges;
- the current source playhead and exact selected range; and
- the immutable RecordingAsset, source SHA-256, and signal-profile binding.

The map now orders proposals and checks chronologically, reconciles selection
when analysis arrives asynchronously, and exposes Previous/Next navigation.
Navigation seeks the exact source range and opens a centered 15-second view;
60-second and whole-program views remain one click away. At most twelve nearby
decision chips render at once while navigation still traverses the full bounded
proposal set. This fixes the prior long-episode failure mode where every range
rendered as an unordered, nearly invisible whole-program mark.

Selecting a range moves the existing editor playhead but does not claim that a
person listened, does not apply the proposal, and does not change source media.
Proof-listen and proof-watch remain explicit operations that append durable
review receipts. Camera-transition evidence now uses proof-watch language and
playback instead of presenting every candidate as audio-only.

## API and trust boundary

`POST /api/ai-edit` returns a bounded 180-window visualization only when the
deterministic source resolver identifies exactly one verified, released Capture
recording. The public client validates the immutable hashes, duration,
thresholds, finite waveform values, and 360-point hard ceiling before rendering
anything. Held, missing, or ambiguous sources render an honest no-waveform
state; transcript timing is never substituted as audio evidence.

The edit-analysis endpoint still persists the complete proposal set and review
boundary before returning it. The visualization is a private, no-store response
projection from the same full-resolution signal profile used to corroborate
gaps. It is not a second source of truth.

## Operated retained proof

The rendered operation used the retained High Ground Odyssey production
`deterministic-edit-evidence-20260803` and its verified 13-second Capture source:

- immutable RecordingAsset `qa-edit-signal-recording-20260803`;
- immutable source SHA-256 of 64 `d` characters;
- signal profile `23f507037896474069896dcf1a93b95980844d27c73a3c99758def3207e25b98`;
- three decoded windows: signal, -78 dBFS low energy, then signal;
- the measured 4.0-7.0 second range-skip proposal rendered above that window;
- selecting the proposal moved the shared editor playhead to 4.0 seconds;
- the chronological decision navigator selected the next decision and opened
  the 15-second evidence view;
- direct source-clock scrubbing moved the same playhead to 8 seconds;
- the proposal remained unapplied and source media remained unchanged; and
- the rendered editor had no browser exception or horizontal overflow.

This operation deliberately did not record a proof-listen receipt. The retained
signal fixture proves decoded evidence and UI timing, but it does not yet expose
its exact audio bytes through protected editor playback. Quipsly must never call
black/silent program-monitor playback proof that the bound RecordingAsset was
heard.

The map and its legacy proposal card now disable that false-proof path for every
signal-bound range and explain why. This hold affects only the proof claim; the
source-bound proposal remains visible and its reversible draft action remains a
separate deliberate choice.

## Verification

- map, client contract, deterministic analysis, server source resolver, and edit API focused tests passed;
- retained-operation static contract: 2 tests;
- rendered retained operation: passed;
- isolated 166-route production build: passed;
- strict Quipsly TypeScript, local stack doctor, and repository health: passed.

## Next boundary

Exact protected-source proof playback is now implemented and operated in
`2026-08-04-protected-source-automated-edit-proof.md`. Next, add
sync-discontinuity and camera-cut lanes to this map and operate an accepted and
undone reversible edit against protected real podcast media before permitting
any claim of automated-edit readiness.
