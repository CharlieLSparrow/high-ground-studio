# Quipsly private transcript provider evaluation

Status: implemented evaluation contract; private corpus creation and provider
execution remain operator- and consent-gated.

Quipsly does not select a podcast or coaching transcription provider from a
vendor confidence number. Provider confidence values are not comparable across
models. The production decision is made from the same human-approved High
Ground windows using separate measurements for word error, speaker error,
timing drift, human correction time, latency, cost, policy, and failures.

The evaluator is intentionally downstream of immutable source capture and
upstream of provider selection. It does not upload media, call a provider,
modify a transcript, or approve AI output.

## Current provider facts and architecture consequences

### Deepgram batch

Deepgram's May 2026 batch diarization v2 is selected through
`diarize_model`. `diarize_model=latest` currently resolves to v2 but can move to
a future generally available diarizer, while `diarize_model=v2` pins the
comparison. The legacy `diarize=true` request remains on v1. The shipping worker
stores the exact request and raw response so an old job can be replayed without
silently changing provider truth.

Evaluation rule:

- benchmark a pinned `v2` identity for release decisions;
- treat `latest` as a separate candidate identity when testing future upgrades;
- retain word start/end, anonymous provider speaker labels, raw response hash,
  adapter version, and request-config hash;
- record the current model-improvement opt-out state in a dated policy receipt.

Official references:

- [Deepgram batch diarization v2 announcement](https://developers.deepgram.com/changelog/2026/5/13)
- [Deepgram pre-recorded API](https://developers.deepgram.com/reference/speech-to-text/listen-pre-recorded)
- [Deepgram model-improvement controls](https://developers.deepgram.com/docs/the-deepgram-model-improvement-partnership-program)

### OpenAI diarized transcription

`gpt-4o-transcribe-diarize` returns speaker annotations with
`response_format=diarized_json`. Inputs longer than 30 seconds require a
chunking strategy. Known-speaker references can be supplied for up to four
speakers. The diarized model does not expose the word-timestamp option available
to other transcription response shapes.

Evaluation rule:

- preserve returned diarized segments and do not fabricate word timestamps;
- evaluate text and speaker attribution where evidence exists;
- leave word-timing metrics unavailable rather than interpolating segment time;
- benchmark known-speaker references as a distinct request configuration;
- capture the account's effective retention/data-control policy before any
  coaching media is sent.

Official references:

- [OpenAI transcription API](https://platform.openai.com/docs/api-reference/audio/createTranscription)
- [OpenAI API data controls](https://platform.openai.com/docs/models/default-usage-policies-by-endpoint)

### Apple on-device SpeechAnalyzer

On iOS 26, `SpeechAnalyzer` with `SpeechTranscriber` supports long-form,
conversational on-device transcription. Language assets are installed through
`AssetInventory`, results arrive asynchronously, and the audio-time-range
option can support playback synchronization. The documented transcriber does
not provide a built-in multi-speaker diarization contract. Apple's permission
guidance says the explicit `SFSpeechRecognizer.requestAuthorization` flow is
for the older recognizer that can send speech to Apple; `SpeechAnalyzer`
transcriber modules do not send the voice audio to Apple. Capture still ships a
plain-language `NSSpeechRecognitionUsageDescription`, and this prerecorded-file
lane does not request microphone access.

Evaluation rule:

- run only on eligible physical hardware with the exact app, OS, locale asset,
  and transcriber configuration recorded;
- evaluate text, latency, battery/thermal behavior, offline recovery, and time
  ranges;
- report speaker metrics as unavailable unless a separately identified,
  independently evaluated diarizer supplies them;
- never infer that on-device transcription consent is equivalent to consent to
  upload or share the resulting text.

Official references:

- [Apple SpeechAnalyzer documentation](https://developer.apple.com/documentation/Speech/SpeechAnalyzer)
- [Apple speech-recognition permission guidance](https://developer.apple.com/documentation/Speech/asking-permission-to-use-speech-recognition)
- [WWDC25: Bring advanced speech-to-text to your app with SpeechAnalyzer](https://developer.apple.com/videos/play/wwdc2025/277/)

#### Implemented Capture lane

Quipsly Capture now has a production-bound on-device candidate lane for iOS 26
and later. It is deliberately not promoted as the default provider yet.

The iPhone workflow:

1. checks `SpeechTranscriber` and locale support without downloading a model;
2. requires a second explicit action before `AssetInventory` installs a model;
3. fingerprints the immutable local recording before recognition;
4. extracts an audio-only protected temporary derivative for video sources;
5. keeps only finalized `SpeechTranscriber` results and their real time ranges;
6. fingerprints the original again and discards the result if the bytes changed;
7. writes a create-once, request-versioned transcript sidecar under complete
   file protection, with its own SHA-256, account owner, app/build, device/OS,
   locale, preset, config hash, and an explicit
   `speakerDiarization=unavailable` declaration; later attempts cannot
   overwrite earlier evidence;
8. preserves the sidecar locally while the matching recording is not verified;
9. submits finalized text only through the authenticated Nest boundary; and
10. retains the sidecar plus a separate protected submission receipt for crash
    recovery and idempotent replay.

Nest accepts the candidate only after rechecking, inside one serializable and
per-recording locked transaction:

- current signed-in account and Session mutation access;
- `RecordingAsset.status=VERIFIED`, cloud object identity, SHA-256, byte count,
  and immutable finalization evidence;
- current all-party source and transcription consent;
- bounded, ordered, non-empty finalized timing ranges;
- sidecar and recognition-configuration hashes; and
- exact idempotency intent for the client request UUID.

Acceptance creates one new immutable completed `TranscriptJob` version with
provider `apple-speech-transcriber-on-device`. It creates no provider words,
speaker labels, notes, tasks, goals, calendar events, messages, deliveries, or
publication effects. Those remain separate human review decisions.

Automated evidence as of 2026-08-01:

- focused Nest ingestion and cloud-run route suites: 11 tests passed;
- Quipsly TypeScript passed;
- iOS 17 deployment-target build against the iOS 26.2 SDK passed for both
  simulator architectures;
- the built app contains the speech-purpose disclosure;
- a Foundation runtime probe proved the protected create-only sidecar write
  rejects a second write and preserves the first bytes;
- the canonical upload ledger now preserves `RecordingAsset` identity
  separately from Studio `MediaAsset` identity.

Physical-device evidence is still required before this candidate can become a
default. The first acceptance pass must cover audio and 4K-camera movie input,
installed and missing-model states, airplane-mode recognition after install,
foreground interruption/retry, battery/thermal behavior on a long recording,
account switch denial, transcript-consent revocation denial, byte-mismatch
denial, crash/relaunch sidecar recovery, idempotent submission replay, playback
timing review, and a full HGO/coaching correction pass.

## Private High Ground corpus

The corpus is a collection of short, immutable windows—not whole recordings.
Short windows make exact human review achievable and keep the dynamic-programming
alignment bounded. Each window must have:

- a source-byte SHA-256 and duration, with no source path in the aggregate
  report;
- a current consent receipt covering this evaluation use;
- an exact human-approved reference revision with words, speaker identities,
  and real timing where a reviewer has checked timing;
- one create-once candidate receipt per provider/model/adapter/config identity;
- a dated provider-policy receipt;
- an optional measured correction pass performed in Quipsly by a human.

Machine captions, publication copy, summaries, scripts, and prior provider
transcripts cannot become reference truth merely because they already exist.
The evaluator rejects anything other than `human-approved`.

The initial useful corpus should contain at least twelve 60–180 second windows:

| Workload | Required conditions |
| --- | --- |
| Podcast | clean Charlie speech; clean Homer speech; normal exchange; overlap/interruption; watched-clip bleed; degraded remote audio |
| Coaching | coach/client turn-taking; names and domain terms; commitments/dates; interruption/emotional speech; quiet/distant voice; noisy or recovery-prone capture |

Long episodes and sessions remain acceptance tests after provider selection.
They are not a substitute for a controlled corpus.

## Metrics

The implemented evaluator produces:

- standard word error count and rate: substitutions + deletions + insertions,
  divided by human-reference words;
- speaker error after an optimal anonymous-label mapping, including missing
  speaker attribution;
- exact matched-word start-time mean, p50, and p95 drift;
- wall-clock latency and real-time factor;
- observed cost plus observation coverage, without inventing a value when
  billing evidence is absent;
- measured correction time and correction-operation count;
- policy receipt hashes and retryable/non-retryable failure counts.

Alignment minimizes word edits and then maximizes exact word matches. That
secondary rule prevents an equally valid WER path from degrading speaker and
timing evidence.

There is deliberately no combined provider score or automatic winner. Podcast
and coaching may select different defaults, and coaching can require a stricter
policy gate even when another provider is slightly more accurate.

## Privacy and durability contract

Private corpus inputs contain transcript text, source hashes, internal speaker
identities, reviewer identity, policy URLs, and correction observations. Keep
them in the private evaluation store; do not commit them to Git.

Aggregate reports contain metrics, safe IDs, source/reference hashes, provider
identity, request-config hash, and policy-receipt hash. They omit transcript
text, speaker and reviewer identities, provider policy URLs, and source paths.
The CLI writes reports with a create-only filesystem precondition so a rerun
cannot silently replace evidence.

## Operator workflow

1. Confirm current all-party consent specifically permits the evaluation and
   intended provider processing.
2. Select source-linked windows without copying or rewriting the recording.
3. Correct each reference against playback in Nest or Capture and explicitly
   approve the resulting revision.
4. Run every candidate on the exact same source bytes. Store raw response,
   request configuration, adapter version, elapsed time, cost evidence, and
   provider policy receipt before normalization.
5. Correct each successful candidate in Quipsly and record actual review time
   and operations. Do not estimate correction effort from WER.
6. Build an aggregate report:

   ```bash
   cd /Users/wall-e/Dev/high-ground-studio-product
   pnpm quipsly:transcript:evaluate -- \
     --input /path/to/private-corpus-revision.json \
     --output /path/to/create-once-evaluation-report.json
   ```

7. Review the separate podcast and coaching evidence with a human. Record the
   chosen default, fallback, policy requirements, model/config pin, and rollback
   trigger as a decision receipt.
8. Re-run the corpus as a new revision before any model, diarizer, adapter, data
   policy, or operating-system upgrade is promoted.

The public synthetic fixture at
`docs/quipsly/examples/transcript-evaluation-corpus.example.json` documents the
shape without containing High Ground speech or identities.

## Activation gates

Provider evaluation is operationally complete only when:

- both podcast and coaching windows have human-approved references;
- Deepgram, OpenAI diarized, and physical-device Apple candidates have receipts,
  or a dated decision receipt explicitly excludes one;
- at least one real correction pass per provider/workload has been timed inside
  Quipsly;
- failure and retry behavior has been exercised;
- a separate-account reviewer can see only an authorized aggregate/report;
- the selected provider's exact config and policy are mounted in staging;
- consent revocation prevents text projection without rewriting immutable raw
  evidence;
- one full HGO episode and one full coaching session pass transcription,
  correction, notes/tasks review, and cross-surface readback before production
  default activation.
