# Transcript terminology memory architecture

Date: 2026-08-06

Status: first production slice implemented; matched accuracy qualification pending

Related program: `docs/research/2026-08-05-quipsly-feature-depth-program.md`

## Product promise

Quipsly remembers how a Nest spells the people, shows, clients, products,
places, titles, and specialist terms that matter. A user manages that memory
once. Each transcription provider receives the safest compatible projection,
and every job preserves exactly what influenced it.

Vocabulary is context, not truth. It may improve recognition, but it may also
cause a false insertion. No terminology change rewrites an existing provider
transcript, accepted correction, source anchor, note, task, goal, or edit.

## Why this is a system rather than a glossary field

Provider mechanisms are materially different:

| Provider family | Current adaptation mechanism | Quipsly compilation consequence |
| --- | --- | --- |
| Local OpenAI Whisper CLI | `initial_prompt`; optional `carry_initial_prompt` for each decode window | send a bounded list of desired canonical spellings; retain prompt hash and adapter mode; do not carry the prompt without matched hallucination testing |
| Apple Speech | prepared custom language model | compile an on-device model artifact per supported locale/version and retain its identity; do not claim parity with prompt-based jobs |
| Google Speech-to-Text | phrase sets, custom classes, and optional boost values on supported models | compile phrases/classes separately, version boost policy, and evaluate false insertions |
| Deepgram Nova/Flux | repeated keyterms with a request-wide token limit; Flux can update terms during streaming | prioritize a bounded set, retain included/omitted terms, and version any mid-session change |

Primary references:

- [OpenAI Whisper transcription implementation](https://github.com/openai/whisper/blob/main/whisper/transcribe.py)
- [Apple `SFSpeechLanguageModel`](https://developer.apple.com/documentation/speech/sfspeechlanguagemodel)
- [Google Speech-to-Text model adaptation](https://docs.cloud.google.com/speech-to-text/docs/v1/adaptation)
- [Deepgram keyterm prompting](https://developers.deepgram.com/docs/keyterm)

The canonical Quipsly model must therefore describe user intent rather than a
vendor request. Provider adapters own compilation. A provider result is never
silently normalized to make it look as though a term succeeded.

## Implemented first slice

### Canonical data

`StudioTranscriptTerminologyTerm` is the current project projection. It stores:

- canonical spelling;
- aliases used for discovery and future provider adapters;
- category;
- optional pronunciation and context hints;
- priority, active/archive state, and current revision; and
- creator identity snapshots.

`StudioTranscriptTerminologyRevision` is the append-only mutation history.
Create, update, archive, and restore write a complete snapshot. Optimistic
revision checks and serializable transactions prevent a collaborator's edit
from being overwritten silently.

`StudioTranscriptTerminologyCandidate` is the review queue for correction-
derived suggestions. The model exists, but automatic candidate creation and
decision UI are intentionally not enabled in this slice. An accepted transcript
correction must never mutate project vocabulary without a separate decision.

### Immutable job snapshot

Before queueing local Whisper, Nest reads at most 50 active terms in priority
order and builds `quipsly-transcript-terminology-snapshot-v1`. The snapshot
retains:

- exact term IDs and revisions;
- canonical text, aliases, category, pronunciation/context hints, and priority;
- a canonical term-set SHA-256;
- a revision token;
- compiled time;
- exact provider prompt and SHA-256;
- included and omitted term IDs; and
- explicit non-truth and non-rewrite boundaries.

The local Whisper adapter currently sends only canonical spellings in the
prompt. It deliberately does not send aliases, pronunciation hints, or context
notes because Whisper's free-text prompt cannot guarantee a canonical mapping;
including alternatives could encourage the wrong output. Those fields remain
available to adapters that have explicit phrase/pronunciation controls.

The CLI receives the prompt through an argument vector, not a shell. The current
adapter applies it only to the first decode window; it does not use
`carry_initial_prompt`. Input characters, term count, prompt length, IDs, mode,
and hashes are validated before work begins. The result receipt must match the
exact job snapshot or it fails integrity validation. Historical receipts retain
their older carried-window mode and remain inspectable rather than being
reinterpreted.

New attempts use processing type `source-transcript-v2`. This is a rolling-
deploy capability boundary rather than a cosmetic version label: a pre-
terminology worker watches only `source-transcript` and therefore cannot claim
or falsely satisfy a job that requires the new adapter. Current workers accept
both types so historical queues remain recoverable.

An older `source-transcript` row may still be reused when no terminology is
active. It can never satisfy a terminology-bearing retry even when its source
and snapshot JSON otherwise match; only the v2 queue boundary is eligible.

### Retry and history semantics

A queued/completed job can be reused only when all of these still match:

- episode production;
- immutable source SHA, generation, and size;
- language;
- terminology term-set hash;
- compiled provider prompt hash; and
- provider adapter mode.

Changing vocabulary therefore creates a new `TranscriptJob` and processing job.
The old attempt and its correction/review evidence remain available. The UI says
`Create a new attempt with updated terminology`; it does not label the older
transcript incorrect merely because the glossary changed.

### User experience

Audio Studio now contains a project terminology desk before the source-clock
transcription controls. Owners and editors can:

- add a preferred spelling with aliases, category, priority, pronunciation,
  and context notes;
- edit it as a new revision;
- archive or restore it;
- see how many terms and correction-derived candidates exist; and
- see whether the current transcript used the active revision token.

Viewers can inspect vocabulary and provenance but cannot mutate it.

## Accuracy qualification

This capability is implemented, not yet qualified as an accuracy improvement.
Qualification requires matched attempts over the same immutable source windows:

1. Freeze a retained reference window and human-reviewed transcript truth.
2. Run the same provider/model/language once without terms and once with the
   exact snapshot.
3. Compare:
   - named-entity error rate;
   - whole-window WER;
   - correct canonical capitalization;
   - false terminology insertions;
   - non-terminology regressions;
   - word-timing drift;
   - runtime and human correction effort.
4. Keep podcast, coaching, overlap, noisy, and Shared Watch strata separate.
5. Promote a terminology policy to a default only when retained validation
   improves critical-term recall without breaching false-insertion or overall
   regression thresholds.

Initial dogfood should include `Quipsly`, `High Ground Odyssey`, `Homer`,
`Scott Sparrow`, `Shure MV7i`, and any episode-specific proper nouns that occur
in retained source audio. A human must confirm the reference words against
playback. The agent may queue and compare provider attempts but must not invent
that listening result.

## 2026-08-06 retained dogfood result

The first operated terminology run used a retained 12-second Audio Studio
fixture containing mouth/non-speech noise. It exposed two independent defects:

1. The local lifecycle had restarted the mobile-capture transcript worker but
   reused an older Episode media worker. That older process claimed the first
   terminology-bearing legacy job without applying its vocabulary. New attempts
   now use `source-transcript-v2`, and the lifecycle was restarted at the actual
   worker-ownership boundary. The corrected v2 receipt matched the queued term
   and prompt hashes exactly.
2. Carrying the prompt through every Whisper decode window produced repeated
   hallucinated speech. Limiting the prompt to the first window removed that
   repetition, but Whisper still emitted seven very-low-confidence words inside
   only 0.08 seconds. That is not plausible speech and is not an accuracy win.

Audio Studio now derives a deterministic quality receipt from immutable
provider timing and confidence evidence. Implausible word density, collapsed
word timing, repeated phrase patterns, and a majority of very-low-confidence
words route the attempt to `review-required`. The words and raw provider JSON
remain available for protected playback review, while the UI says `Provider
transcript needs review` instead of `ready`. These heuristics are triage, not
measured accuracy; human-reviewed reference audio remains the qualification
standard.

## Next slices

1. Add correction-to-candidate creation with a clear `Remember this spelling`
   action and separate accept/reject ledger.
2. Add a matched prompted/unprompted experiment action over retained evaluation
   windows, with named-entity and regression scorecards.
3. Add episode/session overrides that compile on top of the Nest vocabulary
   without mutating it.
4. Add provider adapters and capability display for Apple custom language
   models, Google phrase sets/classes, and hosted keyterms.
5. Add impact navigation from a superseded correction to derived notes, tasks,
   goals, clips, captions, and edits.
6. Add portable JSON/CSV export and restore for terminology plus revisions.

## Boundaries that remain

- Vocabulary never authorizes transcription; consent/license evidence remains
  a separate gate.
- Vocabulary does not change source media.
- Vocabulary does not create corrections, tasks, goals, notes, edits, or
  publications.
- Provider confidence remains distinct from measured accuracy.
- A provider receipt proves which context was sent, not that the provider used
  it correctly.
- Existing transcripts remain immutable evidence even when a better attempt is
  available.
