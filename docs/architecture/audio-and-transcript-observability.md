# Audio and transcript observability

Status: implemented baseline
Last reviewed: 2026-08-03

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

The untranscribed tail is a timing observation, not automatically a dropout.
It can be expected silence. Signal analysis must establish whether audible
material exists before Quipsly labels words or audio as missing.

## Capture evidence

Capture source-profile schema v3 now preserves the selected input data source
alongside the existing route name and port type. It also snapshots the actual
`AVAudioSession` sample rate and input channel count at the capture boundary.
Those are deliberately separate from the requested encoder settings.

The iPhone source evidence sheet shows the encoded format, hardware input,
capture pipeline, and pause timeline. Missing legacy fields render as unknown;
old recordings are not rewritten with guessed values.

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

The next audio-observability slice should add deterministic source analysis and
a real evaluation corpus:

- waveform and navigable transcript alignment;
- peak, integrated loudness, clipping, silence, channel imbalance, and dropout
  observations with exact time ranges;
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
- An external microphone name and hardware format survive capture, local
  library readback, upload metadata, Nest ingestion, and transcript review.
- A full-transcript accuracy claim requires complete playback-backed review or
  a separately identified, controlled reference transcript.
