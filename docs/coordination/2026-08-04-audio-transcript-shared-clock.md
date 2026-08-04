# Audio and transcript shared-clock checkpoint

Date: 2026-08-04

## Outcome

The Session transcript desk now has one selected source time owned by protected
media playback. The decoded-signal map, native audio/video controls, evidence-map
clicks, the selected-time slider, transcript samples, and speaker-attribution
samples all read and update that same clock.

The audio map adds a provider-timed word lane beneath the complete-decode signal
windows. It distinguishes:

- unchecked provider words;
- provider segments confirmed against playback;
- provider words inside a segment with an accepted correction; and
- provider-specific confidence attention, only when Quipsly has a qualified
  threshold for that provider.

Selecting or playing through a timed word shows its provider text, source bounds,
provider confidence, and segment review state at the playhead. It does not
pretend that an accepted segment correction changed the provider word timing or
that every word in the segment was individually wrong. Provider words and their
timestamps remain immutable evidence underneath the correction overlay.

## Why the confidence lanes are separate

Deepgram's current documentation describes word confidence as a calibrated
provider probability, recommends evaluating thresholds on the application's own
data, and explicitly warns that confidence distributions cannot be compared
across providers or treated as a WER guarantee. Google and AssemblyAI likewise
return word time offsets and provider confidence as model output, not a
playback-reviewed reference.

Quipsly therefore keeps three concepts visibly separate:

1. provider confidence prioritizes what to listen to;
2. complete-decode signal and capture events describe source conditions; and
3. WER appears only for playback-reviewed reference text.

The retained MLX Whisper fixture has word confidence but no qualified
cross-provider threshold, so the UI shows the individual confidence and
explicitly says that no cross-provider threshold is being applied.

## Market boundary

- [Descript Studio Sound](https://help.descript.com/hc/en-us/articles/10327603613837-Studio-Sound)
  and [Riverside Magic Audio](https://support.riverside.fm/hc/en-us/articles/13395368921885-Apply-Magic-Audio-to-individual-tracks-in-the-editor)
  expose adjustable enhancement intensity and a path back to the original.
- [Auphonic](https://us.auphonic.com/help/web/production.html) exposes processing
  parameters, statistics, and editable automatic-cut positions.
- [Deepgram word confidence](https://developers.deepgram.com/docs/confidence)
  and [speaker diarization](https://developers.deepgram.com/docs/diarization)
  expose useful word and speaker evidence while documenting important
  calibration and model-version limits.

Quipsly's opportunity is not another opaque enhancement percentage. It is one
source-clock review surface where a person can see the source condition, model
inference, measured processing change, transcript review, and reversible edit
proposal before accepting anything.

## Operated retained proof

The rendered operation used `local-transcript-dogfood-episode-4` and its
protected 60-second Episode 4 source:

- 12 provider-timed words rendered on the map;
- zero of those words were mislabeled playback-reviewed before the operation;
- the absence of a cross-provider confidence threshold remained visible;
- a map click moved protected playback to 10.852 seconds;
- playing the retained speaker sample moved the shared map playhead to 3.833
  seconds and rendered the selected provider word with its provider confidence
  and unchecked state;
- the exact speaker-attribution request replay remained idempotent;
- provider segments, correction count, word-review count, and packet notes
  remained unchanged;
- a separate ungranted account received a non-disclosing 404;
- the rendered desk produced no browser exception or horizontal overflow.

The first retained attempt also caught a stale long-lived Next development
runtime after a production build reused `.next`. The launcher-owned local stack
was replaced from the current worktree, all 52 migrations were confirmed, and
the durable Nest, Firebase emulator, PostgreSQL, transcript worker, and media
worker passed the local doctor. Emulator-only QA identities were restored from
macOS Keychain without printing secrets or touching production accounts.

## Verification

- audio map, transcript desk, and transcript-evidence model: 18 focused tests;
- retained-operation static contract: 3 tests;
- rendered protected Episode 4 operation: passed;
- strict Quipsly TypeScript: passed;
- durable local service doctor: passed;
- full build and strict repository health are recorded in the commit handoff.

## Next boundary

Put synchronization drift/capture discontinuities and automated edit decisions
on adjacent lanes of this clock. A proposed filler removal, camera cut, silence
trim, or sync correction should select the exact source range, explain its audio
and transcript evidence, preview the reversible result, and preserve a durable
human decision. Provider comparison should continue on the approved real podcast
and coaching corpus rather than selecting a model from marketing claims.
