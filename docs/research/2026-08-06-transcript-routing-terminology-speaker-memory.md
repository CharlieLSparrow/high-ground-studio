# Transcript routing, terminology, and speaker memory

Date: 2026-08-06

Status: architecture decision and first implementation slice

## Decision

Quipsly will route transcription from the **source topology before the provider**.
An isolated participant-owned microphone or camera track already carries a more
reliable speaker identity than diarization can infer. Mixed-room recordings need
speaker separation, but their provider labels remain candidates until reviewed.

Every transcription run becomes an immutable, source-bound attempt with its
provider, exact model/configuration, timing capability, terminology snapshot,
speaker authority, privacy policy, and source bytes preserved. Corrections,
speaker assignments, accepted text, and downstream regeneration remain separate
records.

This is deliberately not a provider switch. It is the routing contract required
to compare providers honestly and change defaults only after retained podcast and
coaching evidence shows an improvement.

## What the audit found

Quipsly already has more foundation than the UI currently exposes:

- versioned provider attempts and raw-response storage;
- Deepgram Nova-3 with a pinned v2 diarizer in the evaluation path;
- OpenAI diarized and local Whisper comparison adapters;
- terminology snapshots, immutable term revisions, and measured terminology
  experiments;
- word, speaker, timing, entity, correction-effort, cost, and latency evaluation;
- Apple SpeechAnalyzer/SpeechTranscriber capture-side transcription; and
- reviewed speaker attribution and source-clock correction workflows.

The production Capture worker previously chose one Deepgram configuration for
every source: it always requested diarization even when a track belonged to one
known participant, and it did not compile the project's terminology snapshot
into the provider request. The worker now derives isolated versus mixed topology
from canonical `RecordingAsset` ownership, disables diarization for a known
participant track, freezes the current project vocabulary, and submits each
validated keyterm as its own provider parameter.

The hosted Nova model revision is still requested as explicit `version=latest`
because the repository has no measured, verified standard-model revision to pin
yet. That moving request is now visible in the immutable manifest rather than
implicit provider behavior. The retained corpus must select a fixed version
before Quipsly can claim model-revision reproducibility.

The native audit also found a correctness mismatch: Capture used Apple's plain
`.transcription` preset while its receipt claimed `audio-time-range`. Apple's
preset contract does not include that attribute. The implementation now uses the
custom initializer and explicitly requests `.audioTimeRange`; the iOS simulator
target builds with that correction.

## Canonical routing plan

`TranscriptRoutingPlan` is now a pure, versioned contract in
`packages/quipsly-media-processing/src/transcript-routing.ts`. It records:

- the immutable source ID, SHA-256, size, and topology;
- source-bound, provider-candidate, or unresolved speaker authority;
- the primary attempt and optional evaluation comparisons;
- exact provider/model, language, timing granularity, and diarization policy;
- the terminology snapshot applied to each compatible attempt; and
- invariant boundaries preventing provider output from becoming reviewed truth.

Current deterministic policy:

| Source | Primary path | Speaker authority | Comparisons when explicitly evaluating |
| --- | --- | --- | --- |
| Participant-isolated and on-device available | Apple on-device, time indexed | Canonical source binding | Deepgram without diarization; OpenAI lexical |
| Participant-isolated, cloud required | Deepgram without diarization | Canonical source binding | OpenAI lexical |
| Mixed-room, cloud allowed | Deepgram Nova-3, exact model revision, diarizer v2 | Provider candidate | OpenAI lexical plus diarized segment comparison |
| Unknown, cloud allowed | Deepgram with diarizer v2 | Provider candidate or unresolved | OpenAI lexical plus diarized segment comparison |
| Mixed-room, cloud forbidden | Explicitly unsupported | None invented | None |

An unsupported privacy/topology combination fails clearly. It does not silently
produce speaker-free text and imply that speaker identity is trustworthy.

## Provider-specific use

### Apple on device

Use for private, offline-capable, low-latency transcript evidence on supported
devices. Request time-indexed final results explicitly. For participant-isolated
sources, speaker identity comes from the source binding. Do not claim native
speaker diarization.

### Deepgram

Keep as the measured production baseline while the retained corpus grows. Use
Nova-3 and an exact provider/model revision in release evidence. Apply the v2
diarizer only to mixed or unknown sources. Compile a validated project term set
to Nova-3 keyterms, preserve the exact term snapshot and request receipt, and
reject malformed or oversized configurations before submission.

### OpenAI

Evaluate the general transcription model for lexical and terminology quality.
Evaluate the diarized model on genuinely mixed sources, retaining its segment-
level timing boundary. The diarized model does not accept prompt vocabulary, so
it must never claim that Quipsly terminology was applied. Consented acoustic
speaker references may become a separate evaluation lane, but not an implicit
global biometric profile.

### AssemblyAI

Evaluate semantic speaker identification only as an optional candidate mapper
after diarization. Inferring names or roles from what people say is useful for
review triage, but it is not persistent voice identity and cannot outrank source
ownership or human confirmation.

## Speaker memory

Quipsly should distinguish four things that competitors often blur:

1. **Source ownership:** this microphone/camera/local master belongs to a known
   Session participant. This is the strongest automatic authority.
2. **Diarization cluster:** provider speaker A/B/0/1 in one attempt. This is local
   to that attempt and not a person record.
3. **Reviewed mapping:** a person confirms that cluster A corresponds to Scott
   in this source or source set.
4. **Acoustic reference:** a separately consented voice sample used by a provider
   to propose identity. It needs granular purpose, retention, deletion, and
   audit controls and remains a candidate until the policy is proven.

This prevents a correction in one transcript from rewriting historical provider
evidence or turning a convenient label into an invisible biometric identity
system.

## Terminology memory

The existing canonical term and revision models remain the truth. Provider
payloads are deterministic projections:

- OpenAI/local Whisper prompt text;
- Deepgram Nova-3 keyterms;
- OpenAI general-transcription keywords where supported; and
- no implied terminology input for a provider/model that cannot accept it.

Each attempt stores the exact snapshot hash, included/omitted terms, compiler
version, provider request hash, and validation outcome. Pronunciation hints and
aliases remain structured Quipsly evidence even when a specific provider only
accepts canonical spellings.

Terminology improves a candidate transcript; it never makes the resulting word
human-confirmed. Historical attempts are immutable and are not silently rewritten
when a glossary changes.

## Delivery sequence

1. **Completed now:** request Apple time ranges explicitly and make the receipt
   describe the real custom configuration.
2. **Completed now:** add and test the pure topology-first routing contract.
3. **Completed now:** compile strict Deepgram Nova-3 keyterm projections from
   canonical terms and aliases, retaining the snapshot, included variants,
   token budget, and provider-use boundaries; persist and submit that projection
   from the production Capture worker.
4. **Completed now:** evolve the Capture transcript manifest so `diarize` is
   topology-driven rather than structurally forced to `true`, while historical
   jobs still parse and replay their original provider request.
5. Persist the complete routing plan beside new attempts and expose its
   explanation in the
   Transcript Quality Lab.
6. Build a retained two-person HGO and coaching reference corpus with clean,
   overlap, names, acronyms, noisy/mobile, and external-mic windows.
7. Compare routing candidates on word error, speaker error, critical-entity
   accuracy, timing, correction time, latency, failure, privacy, and cost.
8. Change production defaults only when a measured policy beats the baseline;
   keep rollback to the prior routing revision immediate.

## Explicit non-decisions

- Do not change the production provider merely because another model is newer.
- Do not diarize a known one-person source to rediscover identity already held
  by the source graph.
- Do not merge two provider attempts into an unexplained synthetic transcript.
- Do not treat semantic speaker names or acoustic matches as verified identity.
- Do not silently regenerate notes, tasks, goals, clips, or edits after a text
  correction; show the impact and let the responsible person reconcile it.

## Primary sources reviewed

- [Apple SpeechTranscriber presets](https://developer.apple.com/documentation/speech/speechtranscriber/preset)
  and [WWDC25 SpeechAnalyzer guidance](https://developer.apple.com/videos/play/wwdc2025/277/)
- [Deepgram keyterm prompting](https://developers.deepgram.com/docs/keyterm),
  [diarization](https://developers.deepgram.com/docs/diarization), and
  [multichannel versus diarization](https://developers.deepgram.com/docs/multichannel-vs-diarization)
- [OpenAI speech-to-text guide](https://developers.openai.com/api/docs/guides/speech-to-text)
- [AssemblyAI speaker identification](https://www.assemblyai.com/docs/speech-understanding/speaker-identification)
