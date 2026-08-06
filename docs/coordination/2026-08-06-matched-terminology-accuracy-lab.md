# Matched terminology accuracy lab checkpoint

Date: 2026-08-06

Scope: critical-term truth and byte-matched baseline comparisons

External mutation: none

## Outcome

Quipsly can now measure whether project vocabulary actually improves a
transcript. A terminology prompt is no longer treated as a quality feature just
because a provider accepted it or returned confident words.

Every newly approved private evaluation window freezes the active project
terminology beside the playback-reviewed reference. The private receipt keeps
the preferred spelling, aliases, category, priority, term revisions, complete
term-set hash, terms genuinely present in the reference, and prompted terms
that were absent. The latter are important: a prompt can improve a real name
while also hallucinating another name into silence or unrelated speech.

No schema migration was necessary. `TranscriptEvaluationWindow` already owns
an immutable private provider snapshot whose complete content participates in
the window key. `TranscriptEvaluationCandidate.metricsJson` already owns
derived candidate measurements. Extending those receipts preserves the
existing source, consent, authorization, correction, and privacy boundaries
without creating another corpus system.

## Measurements

Successful candidates now retain these terminology measurements in addition
to word, speaker, and timing evidence:

- prompted term count;
- distinct reference term count;
- reference occurrence count;
- matched and missed occurrences;
- candidate terminology mentions;
- false prompted mentions;
- concept recall and precision; and
- preferred-spelling rate.

The ordinary evidence board exposes only aggregate counts and rates. It does
not expose transcript text, term text, reviewer identity, source path, or raw
provider output.

## Matched experiment contract

An optional `quipsly-transcript-terminology-experiment-v1` request receipt
declares one of two arms:

- `baseline`: the frozen terminology snapshot is named but zero terms are sent
  to the provider;
- `project-terminology`: the same snapshot is named and the exact prompt hash
  and complete applied-term count are preserved.

Both arms must share one comparison key, window, derivative checksum,
provider/model/adapter, and all non-terminology provider configuration. The
server rejects stale term hashes, invented arm configuration, mismatched
derivatives, and duplicate run identities.

The board scores only complete pairs. It reports baseline-to-terminology WER,
critical-term recall, false prompted mentions, incomplete arms, and one of four
bounded verdicts:

- `improved`;
- `regressed`;
- `mixed`; or
- `insufficient-evidence`.

A term recall gain cannot produce `improved` when general WER regresses beyond
the tolerance, critical-term recall falls, or false prompted mentions rise.
No verdict changes production routing.

## Provider capability and operated runner

The private provider runner now owns the complete matched operation instead of
requiring an operator to assemble two unrelated commands. With
`--terminology-experiment`, it:

1. downloads and SHA-verifies the protected source once;
2. creates and probes one exact mono 16 kHz PCM derivative;
3. runs a baseline arm and a project-terminology arm against those same bytes;
4. writes each raw provider receipt create-once with mode `0600` before the
   candidate append;
5. gives each arm a stable, idempotent run key; and
6. appends both immutable candidates for the existing matched board.

Deepgram Nova-3 is eligible because its current pre-recorded API supports
repeated native `keyterm` parameters. Local open-source Whisper is eligible
through a first-window `initial_prompt` and now has a provider adapter that
preserves real word timestamps while explicitly reporting speaker attribution
as unavailable. OpenAI `gpt-4o-transcribe-diarize` remains an eligible
unprompted accuracy/diarization benchmark, but the runner rejects it for this
experiment because the current Audio API explicitly does not support `prompt`
with that model. Quipsly does not synthesize or mislabel a provider feature.

Primary capability references:

- [Deepgram Nova-3 keyterm prompting](https://developers.deepgram.com/docs/keyterm)
- [OpenAI Audio API transcription parameters](https://platform.openai.com/docs/api-reference/audio/createTranscription)

Example local matched run after a genuine window exists:

```bash
QUIPSLY_BEARER_TOKEN=... pnpm quipsly:transcript:providers:run -- \
  --provider local-whisper \
  --terminology-experiment \
  --room-id ROOM_ID \
  --base-url http://127.0.0.1:3012 \
  --run-key terminology-YYYYMMDD \
  --policy PRIVATE_LOCAL_POLICY.json \
  --evidence-dir PRIVATE_EVIDENCE_DIRECTORY
```

The command remains a protected operator tool. It does not change the
production transcript provider, rewrite a transcript, or authorize downstream
regeneration.

## Operated evidence

- The local retained database currently has three active High Ground Odyssey
  terms: Quipsly, High Ground Odyssey, and Homer.
- It has zero approved human-reference windows. The authenticated Transcription
  Evidence desk rendered `0/12` reviewed windows and `0` matched terminology
  pairs, explained that genuine references are missing, and displayed no fake
  score.
- The retained coaching Session rendered the private accuracy lab but remained
  blocked by held transcription, missing protected playback, zero persisted
  segments, and zero reviewed reference words. No approval control became
  available and no transcript truth was invented.
- A disposable PostgreSQL operation created an isolated project vocabulary,
  source-bound consented recording, reviewed reference, baseline candidate,
  and project-terminology candidate. It rejected an arm with the wrong applied
  term count, measured baseline term recall at 0%, measured the prompted arm at
  100%, exported the frozen private runner contract, denied the outsider, and
  removed the fixture afterward.
- Focused media, server, API, board, and local-database tests pass. Production
  typechecks pass for Quipsly and the shared media package.
- A controlled local runner operation invoked a deterministic fake Whisper
  executable twice, verified the baseline and prompted requests used one
  derivative checksum, retained different arm identities, and appended both
  candidate payloads through the API boundary. It did not claim transcription
  accuracy or call an external provider.

The database operation is contract evidence, not a provider benchmark or a
human High Ground Odyssey quality result.

## Next real-work gate

Use the existing Session correction desk to listen through and approve a real
60-180 second High Ground Odyssey window containing Quipsly, High Ground
Odyssey, Homer, or another reviewed project term. Run the paired command, time
one human correction pass per arm, and inspect the matched verdict. Repeat with
coaching names, commitments, and dates before proposing a production default.

The next productization step is a leased run-control record and operator queue,
so Nest can request, observe, retry, and reconcile this exact operation without
placing provider secrets in the web process. The create-once receipt directory
and idempotent candidate keys are already the crash boundary for that worker.
