# Transcript provider evidence ledger

Date: 2026-08-03

Status: implemented locally; genuine provider corpus execution remains consent,
credential, and human-reference gated

## Outcome

Quipsly now has an executable, append-only path from a human-approved accuracy
window to comparable provider evidence. The implementation does not change the
canonical transcript, infer reference truth from a provider, or expose private
words in the ordinary Session response.

The new ledger preserves:

- a create-once provider data-policy snapshot and server-computed hash;
- exact evaluation window, source SHA, consent revision, and human-reference
  hash;
- provider, model, adapter, request configuration, run key, request ID,
  latency, observed cost, and capability boundary;
- raw private provider response plus a server-computed response hash;
- normalized word, speaker, and real timing evidence;
- server-computed WER, speaker error, and timing drift; and
- separate append-only human correction-time and operation-count observations.

Exact actor/operation replay returns the same record. A changed replay fails.
The same window/run key cannot silently become different provider evidence.

## Provider boundary research

The current adapter contract follows the providers' official documentation:

- Deepgram batch uses Nova-3 with an operator-supplied exact speech-model
  version, `diarize_model=v2`, word timing, word speaker labels, and
  `mip_opt_out=true`. `latest` is rejected for release evaluation because it
  can move between runs.
- OpenAI uses `gpt-4o-transcribe-diarize`, `diarized_json`, and automatic
  chunking required for these 60–180 second windows. The documented response
  provides speaker-tagged segment times rather than word times, so Quipsly
  stores word timing as unavailable instead of interpolating it.
- Apple SpeechAnalyzer remains a physical-device candidate with on-device
  timing and no claimed built-in multi-speaker diarization contract.

Primary references:

- [OpenAI transcription API](https://platform.openai.com/docs/api-reference/audio/createTranscription)
- [OpenAI API data controls](https://platform.openai.com/docs/models/default-usage-policies-by-endpoint)
- [Deepgram speaker diarization](https://developers.deepgram.com/docs/diarization)
- [Deepgram model versioning](https://developers.deepgram.com/docs/version)
- [Deepgram model-improvement opt out](https://developers.deepgram.com/docs/the-deepgram-model-improvement-partnership-program)
- [Apple SpeechAnalyzer](https://developer.apple.com/documentation/Speech/SpeechAnalyzer)

## Operator and crash-recovery path

`pnpm quipsly:transcript:providers:run` can operate OpenAI or Deepgram against
the protected runner export. It:

1. authenticates to Nest with a bearer token kept out of command arguments;
2. downloads the protected source and verifies its SHA-256 before upload;
3. extracts transcript-turn-aligned 60–180 second windows into deterministic
   mono 16 kHz PCM WAV derivatives, verifies codec/channel/rate/duration, and
   records the original SHA, exact in/out points, derivative SHA, byte size,
   and extraction-contract version;
4. invokes the selected provider with a recorded configuration;
5. writes the raw result to a create-once mode-0600 private receipt before
   asking Nest to append it; and
6. posts an idempotent candidate operation and writes a privacy-safe summary.

An interrupted run reuses the private receipt and does not call the provider a
second time. Retrying different evidence requires a new run key. `--dry-run`
authenticates, exports, downloads, and verifies sources without provider calls
or Nest mutation. It still builds and probes the derivative so corpus mistakes
are discovered before any provider receives media. Two independent dry runs
must produce the same derivative checksum; the executable runner test proves
that boundary.

The runner deliberately requires a dated policy JSON file. It cannot know an
account's effective retention or training controls from public documentation,
and does not invent them.

Long-form source recordings remain immutable. A reviewer selects start and end
transcript turns in Nest; Quipsly requires every included turn and every second
of the selected range to be playback-reviewed. Reference word timing and the
frozen provider snapshot are rebased to the derivative's zero point. The
original protected recording is never replaced by the evaluation derivative.
Nest validates the derivative receipt against the frozen source SHA and window,
shows its checksum on each scorecard, and rejects a second provider candidate
if it used different audio bytes for the same window.

## Reviewer UX

The Private transcription lab now displays provider scorecards beside frozen
windows. It shows separate WER, speaker error, word-timing p95, latency,
observed cost, correction-pass count, failure/retry state, and policy receipt.
Unsupported evidence says **Unavailable**. The protected runner export is an
explicit authenticated download; ordinary Session projections contain metrics
and hashes but no raw response, transcript/reference text, storage path, policy
URL, or reviewer identity.

## Verification

- Prisma generation and validation passed.
- Migration 51 applied to local PostgreSQL; schema status is current.
- Quipsly and media-processing strict typechecks passed.
- Provider adapter tests prove Deepgram word timing/speakers, OpenAI's
  non-invented word-timing boundary, and pinned request configuration.
- The provider-runner test generates a 70-second source, extracts the same
  5–65 second window twice, probes both outputs, and proves identical SHA-256
  and byte length without calling a provider.
- Local database integration proves append, exact replay, changed-replay
  conflict, server-computed zero WER, separate correction receipt, private
  export, public text exclusion, and outsider denial.
- Route and React tests prove authentication, body bounds, explicit mutations,
  no-store private download, scorecard rendering, and unavailable timing.

## Remaining evidence gates

- Complete and classify genuine podcast and coaching references using the new
  transcript-aligned window selector.
- Supply scoped provider keys and capture each account's effective policy
  receipt before uploading consented media.
- Execute both providers on at least six podcast and six coaching windows.
- Run the Apple candidate on a physical iPhone and measure battery, thermal,
  offline, recovery, and timing behavior.
- Measure real human correction effort in the desk and compare downstream
  notes, tasks, commitments, and edit proposals—not WER alone.
- Preserve a dated decision receipt before changing any production default.
