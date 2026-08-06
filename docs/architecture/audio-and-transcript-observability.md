# Audio and transcript observability

Status: implemented local and generation-bound cloud signal observability, append-only classifier review, and independent corpus ground truth; production corpus collection remains
Last reviewed: 2026-08-06

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

Local and cloud Nest media now share the same complete-decode signal-profile
contract. Cloud analysis accepts only an immutable GCS URI with an exact object
generation, SHA-256, size, and content type. Its create-once manifest, queue,
result, retry lease, and terminal dead letter are separate from the media. Nest
rechecks the current source binding before registering the result, and the
editor exposes a retained configuration-required state rather than pretending
that analysis succeeded. One failing proxy, alignment, mastering, or signal
lane cannot starve the others; the shared job attempts them sequentially and
reports failures per lane.

Local Nest media also has a source-bound logarithmic spectral tile pyramid for
whole-source, one-minute, and ten-second inspection. It shares the protected
playback clock in Studio and coaching, preserves fractional source tails, and
never presents visible energy as an automatic EQ or edit decision. See
`docs/architecture/audio-spectral-evidence.md`.

## Audible-event classifier qualification

Capture can now run Apple's versioned general sound classifier over a finalized
local source after byte finalization. The durable receipt records the exact
source SHA-256 and byte count, detector and classifier identities, window and
overlap configuration, known-classification-set hash, source-clock suggestions,
and explicit no-edit boundaries. The classifier output is listening triage; its
score is neither audibility nor accuracy.

`StudioAudibleEventAnalysisReceipt` is the canonical detector-analysis ledger.
It binds one completed parsed receipt to the exact Nest, original asset,
original source, immutable source hash/generation/byte count, detector
configuration, and append-only supersession chain. Episode JSON is now a
compatibility projection and migration fallback; coaching Sessions and Episode
workflows consume the same source-owned evidence without manufacturing an
Episode container.

Nest exposes those suggestions on the shared Audible Event Map and Session
review surface. A reviewer must
play the complete bounded protected-source context before appending one of three
decisions: confirmed, false positive, or needs comparison. The server derives
the suggestion from the canonical analysis ledger, independently re-inspects
the immutable media source, and rejects invalid registration hashes, stale
analysis IDs, event IDs, source identities, incomplete playback coverage, and
idempotency conflicts. Canonical local paths are realpath-normalized before
hashing so `/var` and `/private/var` aliases cannot split identity or weaken the
authorized-root symlink boundary.

`StudioAudibleEventReviewReceipt` is intentionally separate from Dialogue
Repair. It snapshots the source, detector configuration, suggestion, actor,
decision, and playback evidence without creating a treatment candidate or
authorizing a timeline/edit/promotion change. Current UI state is a projection
over append-only receipts. Surface-level confirmation rates can measure the
precision of reviewed suggestions and false positives per source hour; they
cannot measure recall because the detector never surfaced the missing events.
Recall requires independently labeled positive and negative corpus windows.

The private Audio Studio qualification lab now supplies that missing boundary.
`StudioAudibleEventTruthReceipt` stores one append-only, playback-complete
positive event or one explicit class-absent window. It binds exact source bytes,
detector analysis and configuration, podcast/coaching workload, calibration,
validation, or retained-challenge split, reviewed source-clock range, optional
event range, and a human listening note. A correction supersedes one current
receipt without deleting it. Contradictory active positive and absent evidence
for the same class, source, and range fails closed.

The project projection scores only validation and retained-challenge evidence;
calibration labels remain visible but cannot qualify the detector they helped
tune. It excludes every unlabeled source interval, merges overlapping reviewed
windows before calculating hours, and reports per-class true/false positives,
misses, precision, recall, F1, false positives per labeled hour, onset/offset
error, and podcast/coaching coverage. Stored analysis snapshots are re-parsed
and re-hashed before measurement. One invalid source or detector binding fails
the complete projection instead of disappearing from an attractive scorecard.

The default listening-triage gate remains deliberately demanding: 20 positive
events across five sources, 15 minutes of explicit negative audio, both
podcast and coaching evidence, at least 0.85 precision, at least 0.80 recall,
and at most one false positive per labeled hour. Passing cannot authorize a
treatment, edit, derivative promotion, or production-default change.

The guarded retained operation
`scripts/quipsly-retained-audible-event-review-operation.mjs` runs the real
Apple framework against exact local episode bytes, verifies the returned source
binding, and attaches the receipt using an optimistic episode update. Dry-run is
the default. The parallel retained coaching operation registers the same
canonical contract without an Episode. Both realpath the source and canonicalize
optional successful-receipt fields before hashing. Neither manufactures a
listening review. See
`docs/coordination/2026-08-06-unified-audible-event-analysis-ledger.md`.

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

- physical-iPhone runtime, real-time-factor, battery, thermal, and interruption
  qualification over short and 60–120 minute retained captures;
- independently labeled audible-event corpus windows so precision, recall,
  false positives per hour, and boundary error can be calculated honestly;
- cloud execution for the same source-bound spectral contract;
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
- A cloud signal result is accepted only after exact-generation materialization,
  complete decode, bounded waveform and frequency evidence, unchanged source
  hash readback, and create-once replay.
- A full-transcript accuracy claim requires complete playback-backed review or
  a separately identified, controlled reference transcript.
- A classifier suggestion remains unqualified until the complete bounded source
  context is played and an append-only review receipt is recorded.
- A classifier review never authorizes repair, editing, timeline changes, or
  derivative promotion.
- Confirmation rate over surfaced suggestions is never labeled recall.

The committed `b3d257d85a78231a87131dcda3a73dc142ae5c0d` credentialed fixture
proved the cloud boundary against `high-ground-odyssey-media`: one 8-second
source produced 80 waveform windows and 80 six-band frequency windows, replay
retained the first result generation, the source hash remained unchanged, and
an independent all-version readback found no fixture source or control objects
after cleanup. Provider recording was not enabled or required. See
`docs/coordination/2026-08-05-cloud-audio-signal-profile.md`.
