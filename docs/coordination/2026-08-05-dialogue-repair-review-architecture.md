# Dialogue Repair Review architecture

Date: 2026-08-05

Status: source-bound candidate, review, proposal, renderer, and retained impact
scan foundation implemented; browser review persistence and human operation
remain open

## Outcome

A podcast or coaching editor can find an objectionable mouth click, plosive,
sibilant burst, breath, clipped syllable, or noise event; hear it in transcript
context; audition a conservative repair at matched loudness; keep, strengthen,
or reject the proposal; and retain a source-bound review receipt. Quipsly never
changes the original recording and never presents an unqualified detector as an
automatic truth source.

The first retained acceptance target is a real High Ground Odyssey voice track
containing the mouth sounds noticed during the August 2026 recording check. The
second is a consented coaching source. Synthetic fixtures exercise mechanics;
they do not qualify listening quality.

## Existing authority to reuse

The slice composes the current contracts:

- `AudioMasterySourceBinding` owns exact asset, provider, generation, digest,
  byte count, and content type;
- `AudioDiagnosisCorpus` and `AudioDiagnosisRun` own detector qualification and
  already enforce that qualification permits listening triage only;
- source-clock waveform, broad-band spectral evidence, transcript words, and
  protected playback already provide shared navigation;
- `AudioTreatmentJob`, worker receipts, output diagnosis, A/B audition,
  promotion, and delivery preserve versioning and approval;
- append-only review receipts preserve actor, source, decision, and time.

Do not add a generic `enhancedAudioUrl`, mutate the canonical media record, or
store a detached list of timestamps without source identity.

## Technical decision

Use two independent lanes:

1. **Candidate evidence** finds ranges worth listening to. Candidate types are
   label-specific and must earn qualification on a versioned corpus. A human
   can also create a candidate directly while listening; that does not pretend
   the detector found it.
2. **Treatment experiments** render one source-bound, parameterized derivative.
   They must decode completely, preserve timing and channel count within an
   explicit tolerance, publish before/after measurements, and remain
   unpromoted until human approval.

The installed FFmpeg build already exposes `adeclick`, `adeclip`, `afftdn`,
`afwtdn`, `arnndn`, and `deesser`. The first shipping treatment should be a
range-scoped conservative `adeclick` experiment because it directly addresses
the observed issue and can reuse the current FFmpeg worker. `adeclick` supports
timeline enablement, so a reviewed range plus a short treatment pad can be processed
without subjecting the entire performance to a repair algorithm.

Noise suppression and neural speech enhancement remain separate treatment
families. DeepFilterNet is a promising 48 kHz full-band offline experiment, but
it is not a dependency until its license, model provenance, deterministic
packaging, delay compensation, speech-naturalness evaluation, and retained
false-positive behavior pass a dedicated decision record. Apple voice
processing is appropriate for call echo cancellation; it must not replace the
unprocessed local master or be confused with offline mastering.

## Canonical contracts

### Dialogue event candidate

Each candidate carries:

- stable candidate ID and label;
- exact source binding and detector/corpus versions;
- source-clock start/end plus pre/post audition roll that never widens the
  processed range;
- detector score and interpretable evidence, or `human-marked` origin;
- overlapping transcript word anchors and speaker/source ownership;
- state: unreviewed, confirmed, false positive, or needs comparison;
- a listening receipt before it may trigger a treatment experiment.

Candidate decisions are append-only. A later detector can add a new prediction
without rewriting an earlier false-positive decision.

### Repair experiment

The first profile is `dialogue-declick-conservative-v1`:

- exact approved candidate range plus a separately versioned 20 ms treatment
  pad; audition pre/post roll is context only and cannot widen processing;
- ordered graph: decode -> range-scoped de-click -> measure -> diagnose ->
  complete-decode verify -> loudness-matched audition;
- explicit FFmpeg version and all filter parameters;
- 48 kHz, 24-bit PCM WAV derivative;
- source and output digests, sizes, durations, channel counts, loudness, true
  peak, and signal observations;
- source-byte preservation and no-edit-clock-shift assertions;
- unpromoted experiment status.

A stronger profile is a separate derivative and review choice, not an in-place
overwrite. Rejection records why: missed event, speech damage, lisping, timing
artifact, ambience mismatch, or no audible benefit.

## Review UX

The Session Truth Console opens the same selected clock range in four linked
views:

1. high-resolution waveform and repair spectrogram;
2. transcript words and speaker/source ownership;
3. candidate evidence and detector qualification status;
4. source/candidate A/B playback with loudness matching on by default.

The primary keyboard journey is previous/next candidate, play context, toggle
source/candidate, confirm false positive, render conservative repair, approve,
and move on. The editor can lengthen the range, but the UI shows the original
prediction separately from the human-selected treatment range.

Batch review becomes available only after individual review works well. It may
group candidates and queue experiments, but approval remains per source and
profile revision. A global `Fix all` control is intentionally absent.

## Qualification

### Fast deterministic lane

- contract parsing and fail-closed source drift;
- exact range and handle clamping;
- FFmpeg filtergraph escaping and parameter allowlist;
- complete decode, duration/channel preservation, and versioned output;
- no mutation of source bytes;
- review receipt and promotion authorization rules;
- accessible keyboard and screen-reader state.

### Corpus lane

- generated impulse, clipped, plosive-like, sibilant, clean-speech, music, and
  intentional-percussive traps;
- human-reviewed retained podcast and coaching windows;
- per-label precision, recall, false positives per hour, onset/offset error,
  and human correction effort;
- explicit negative labels; unlabeled audio never counts as negative;
- holdout challenge split that cannot tune thresholds.

### Real-work lane

For each retained source, preserve the exact source digest, candidate ranges,
before/after WAVs, measurements, a blind or randomized loudness-matched listen,
reviewer decisions, and final promoted/non-promoted state. The slice is not
accepted because a filter ran. It is accepted when a person can repair a real
problem faster, understand every change, and reliably reject damage.

## Build order

1. Extend treatment contracts and the local worker with a source-bound,
   range-scoped conservative de-click profile.
2. Add human-marked dialogue candidates and the append-only review decision;
   this makes the treatment useful before detector qualification.
3. Put the linked review journey in the existing evidence desk.
4. Operate the real High Ground Odyssey mouth-noise window and preserve the
   receipt.
5. Build and evaluate event detectors against the corpus; expose only labels
   that meet the listening-triage policy.
6. Add stronger de-click, de-clip, plosive, de-ess, and noise families one at a
   time, each with independent evaluation and rollback.

## Primary evidence

- [FFmpeg audio filters](https://www.ffmpeg.org/ffmpeg-filters.html)
- [Essentia onset detection](https://essentia.upf.edu/reference/streaming_OnsetDetection.html)
- [DeepFilterNet](https://github.com/Rikorose/DeepFilterNet)
- [Apple AVAudioEngine](https://developer.apple.com/documentation/AVFAudio/audio-engine)

## Implementation checkpoint

The shared media contract now distinguishes human marks, unqualified detector
suggestions, and qualified detector snapshots. Every candidate binds immutable
source bytes, exact source-clock range, transcript context, and audition roll.
Audition roll is deliberately independent from the fixed 20 ms treatment pad,
so listening to seconds of context cannot expand the processed range.

An append-only review receipt requires the same source/range snapshot and
source-context playback coverage. A false-positive or needs-comparison decision
cannot authorize a render. The first conservative profile accepts only a
confirmed `mouth-click`; other event labels require their own qualified
treatment family. The resulting FFmpeg graph enables `adeclick` only inside the
reviewed range plus pad, writes a versioned 48 kHz/24-bit PCM derivative, and
leaves promotion as a separate approval.

The real renderer fixture proves source-byte preservation, complete output
decode, duration/channel preservation, a changed synthetic reviewed impulse,
and sample-identical untreated audio containing a second impulse. JSONB-style
object key reordering cannot invalidate or alter the canonical proposal.

The retained impact scanner operates without persisting a treatment preview or
review decision. Its first packet was quarantined after an in-graph subtraction
compared unreconciled filter branches. Its second was quarantined because the
values were correct but impact ranks were assigned after source-clock sorting.
The corrected packet independently decodes source and treated streams, streams
their difference in bounded memory, and preserves twelve source-only WAV and
spectral listening contexts for the exact 21.8-second Charlie sound check:

`/Users/wall-e/Movies/Quipsly Experiments/Dialogue Repair/charlie-sound-check-20260805-v004`

Its exact source SHA-256 is
`998e1e52510dea2a9e0cc1ba6154de63cf34cae95073cd809f19f789ec629669`.
The strongest unqualified treatment-impact suggestions begin at 11.41, 21.64,
and 17.53 seconds. Those are triage suggestions, not assertions that a mouth
click exists. No treatment, human review, promotion, delivery, or publication
claim has been created.
