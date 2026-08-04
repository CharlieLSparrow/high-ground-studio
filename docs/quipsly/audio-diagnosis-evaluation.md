# Audio diagnosis evaluation

Status: evaluation contract and local seed corpus implemented; detector is not qualified

Quipsly audio diagnosis is a listening-priority tool, not an automatic repair
authority. A detector may point a person to likely clipping, dropouts, hum,
plosives, sibilance, room-tone shifts, or level inconsistency. It may not alter
source media or approve a treatment from an aggregate score.

## Evidence contract

The versioned corpus distinguishes three states for every diagnosis label:

- positive truth events with an exact source hash and time range;
- explicitly reviewed negative labels for a source;
- unlabeled evidence, which is never silently counted as negative.

Synthetic injections are useful for deterministic calibration, but they do not
replace playback review on consented or licensed real recordings. Human truth
events carry the reviewer, review time, and playback range.

Each detector run records its exact corpus revision, detector version,
configuration hash, source hashes, and unapplied predictions. Evaluation uses
one-to-one intersection matching and reports per-label precision, recall, F1,
false positives per evaluated hour, boundary error, missed truth, and unscored
predictions.

## Qualification boundary

The default policy requires, per diagnosis label:

- at least 20 positive events across five cases;
- at least 15 minutes of explicitly labeled negative audio;
- at least five playback-reviewed truth events;
- precision of at least 0.85 and recall of at least 0.80;
- no more than one false positive per evaluated hour.

Passing qualifies only the **listening triage** use case. Treatment remains a
separate, source-bound proposal with human review.

## Operated seed corpus

Run:

```bash
pnpm quipsly:audio-diagnosis-evaluation:test
pnpm quipsly:audio-diagnosis-corpus
```

The local corpus generates four temporary 48 kHz float WAV sources with FFmpeg:
a clean tone, full-scale clipping, an injected digital dropout, and an
intentional pause that resembles a dropout. It hashes each source before and
after analysis and fails if bytes change.

The intentional-pause trap is deliberate. The current window rule correctly
finds the synthetic dropout but also flags the pause, producing 0.50 precision
and an obviously unacceptable false-positive rate on the tiny corpus. The
report therefore remains `insufficient-evidence`; Quipsly does not convert a
successful demo into a production-quality claim.
