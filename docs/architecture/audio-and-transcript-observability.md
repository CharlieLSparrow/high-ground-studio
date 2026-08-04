# Audio and transcript observability

Status: implemented signal and high-resolution spectral observability; production corpus gate remains
Last reviewed: 2026-08-04

Quipsly treats captured audio, provider inference, and playback-backed review as
three different kinds of evidence. The product must never collapse them into a
single confidence or accuracy number.

## Product contract

Every transcript review surface answers four separate questions:

1. **What audio did Quipsly preserve?** The source profile records the encoded
   format and, when Capture can observe them, the active input route, input data
   source, hardware sample rate, hardware channel count, capture pipeline, and
   pause policy.
2. **What did the provider infer?** Provider, model, locale, timed-word coverage,
   speaker clusters, and provider-supplied confidence remain attached to the
   transcript version.
3. **What has actually been checked?** Review coverage counts corrected,
   confirmed-as-is, and unchecked segments independently of provider confidence.
4. **What accuracy has been measured?** Word error rate is calculated only from
   playback-reviewed reference text. The UI states whether that reference is a
   reviewed sample or the complete transcript.

Provider confidence is a prioritization signal, not a measured accuracy claim.
It may be absent, and confidence scales are not assumed to be comparable across
providers. The initial low-confidence attention threshold of `0.65` is applied
only to Deepgram word confidence. Other providers do not receive invented
confidence or a copied threshold.

## Canonical evidence projection

`apps/quipsly/src/lib/transcript-evidence.ts` is the deterministic projection
used by Nest. It combines immutable source-profile facts, transcript-provider
metadata, word timing/confidence, speaker attribution overlays, and correction
overlays. It does not modify source audio or provider output.

The projection exposes:

- declared, hardware, and decoded audio shape with an explicit
  `MATCH`, `DRIFT`, or `NOT_MEASURED` result;
- provider/model/locale and timed/confidence coverage;
- mean and median confidence without relabeling either as accuracy;
- low-confidence and unchecked attention segments with exact playback times;
- correction and confirmed-as-is coverage;
- Levenshtein word error count and WER for the reviewed reference scope;
- transcript start, end, recording duration, and untranscribed tail duration;
- provider speaker-cluster and real-participant attribution coverage.

It also carries a bounded, deterministic signal profile produced from decoded
source samples on the iPhone:

- overall and windowed RMS dBFS, sample peak dBFS, and decoded-frame coverage;
- clipped-frame and near-silent-frame fractions;
- left/right RMS and stereo-balance observations when the source has at least
  two channels;
- exact-time clipping, near-digital-silence, stereo-imbalance, and
  possible-dropout listening candidates;
- exact-time pause, interruption, user-mark, and app-background boundaries,
  including the displaced audio route when iOS reports one.

The signal algorithm averages channel energy, not channel samples, so valid
out-of-phase stereo material cannot cancel into apparent silence. Waveform
payloads are capped at 1,200 points on-device and compacted to at most 180
points in Nest while retaining each group’s maximum RMS and peak so visible
transients are not averaged away.

The untranscribed tail is a timing observation, not automatically a dropout.
It can be expected silence. When decoded signal exists after the final
transcript word, Nest raises an exact-time listening target; it still does not
assert which words, if any, are missing.

The Episode editor now consumes this evidence through one additional source
boundary. Exact edit analysis retains up to 1,200 validated Capture waveform
points rather than the 180-point display projection, binds the signal profile
and immutable recording identity into the proposal set, and requires one
unambiguous currently released source. A fully covered low-energy transcript
gap may become an unapplied, proof-listen-first range proposal whose persisted
timeline metadata can always be restored. Signal above the source threshold
inside a word gap becomes a possible-missing-transcript candidate instead of a
silence cut.
See `docs/coordination/2026-08-03-signal-and-speaker-edit-evidence.md`.

## Capture evidence

Capture source-profile schema v3 now preserves the selected input data source
alongside the existing route name and port type. It also snapshots the actual
`AVAudioSession` sample rate and input channel count at the capture boundary.
Those are deliberately separate from the requested encoder settings.

The iPhone source evidence sheet shows the encoded format, hardware input,
capture pipeline, and pause timeline. Missing legacy fields render as unknown;
old recordings are not rewritten with guessed values.

A newly finalized audio take is now decoded through its declared end before it
becomes upload-eligible. In the same pass, Capture records the bounded signal
profile. A zero-frame, truncated, corrupt, or incomplete decode keeps its bytes
but enters the repair state; it is not uploaded or described as playable. A
silent but structurally valid source remains preserved and uploadable with a
visible warning because silence alone is not corruption.

RMS dBFS is labeled explicitly as **not LUFS**. Complete-source BS.1770/R128
measurement now exists for local Nest media in the processing worker; the
product still does not relabel the cheaper bounded Capture observation as
loudness. See `docs/architecture/audio-mastery.md` for the source-bound
measurement, reversible proposal, independently verified preview, and
non-promotion contract.

Local Nest media also has a source-bound logarithmic spectral tile pyramid for
whole-source, one-minute, and ten-second inspection. It shares the protected
playback clock in Studio and coaching, preserves fractional source tails, and
never presents visible energy as an automatic EQ or edit decision. See
`docs/architecture/audio-spectral-evidence.md`.

## Correction and provenance

Provider segments remain immutable. A reviewer can play an exact time range,
correct the text, or explicitly confirm the provider words as-is. The accepted
transcript is a projection over those append-only correction overlays.

An agent may rank attention, diagnose likely errors, or propose a correction.
Accepting exact words as playback-backed reference requires actual source-audio
evidence. This is a narrow evidence requirement, not a blanket requirement that
all derived notes, tasks, goals, or reversible internal decisions wait for a
person.

## Next maturity layer

The next audio-observability slice should extend this deterministic source
analysis and operate a real evaluation corpus:

- standards-conformant integrated loudness and true-peak analysis in the media
  worker, preserving the on-device RMS/sample-peak evidence separately;
- cloud execution for the same source-bound spectral and signal contracts;
- capture-route changes and pause/interruption boundaries on the same timeline;
- side-by-side provider candidates without replacing the canonical source;
- named speaker evaluation and domain vocabulary tests;
- baseline WER by microphone, environment, provider/model, and language;
- regression gates using genuine podcast and coaching recordings with consent;
- correction export/import so a reviewed reference remains portable.

Signal diagnostics remain observations until their thresholds are validated on
Quipsly's own production corpus. A red badge must identify a measurable
condition, never merely express that a model is uncertain.

## Acceptance gates

- A legacy recording renders missing evidence as unknown, never zero or good.
- Provider confidence, measured WER, and review coverage appear separately.
- WER is absent until at least one segment has playback-backed reference text.
- Sample WER cannot be presented as whole-transcript accuracy.
- Every attention item seeks to the exact source time without editing the file.
- Fresh iPhone audio decodes through EOF and persists a bounded signal profile
  before the upload queue accepts it.
- Silence is never asserted to be a dropout without listening; UI and evidence
  call the deterministic condition a possible-dropout candidate.
- RMS is never labeled or displayed as LUFS.
- An external microphone name and hardware format survive capture, local
  library readback, upload metadata, Nest ingestion, and transcript review.
- A full-transcript accuracy claim requires complete playback-backed review or
  a separately identified, controlled reference transcript.
