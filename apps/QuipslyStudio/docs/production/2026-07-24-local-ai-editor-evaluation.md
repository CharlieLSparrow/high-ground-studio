# Local AI editor evaluation — 2026-07-24

## Outcome

Quipsly should use a staged local workflow:

1. Transcribe locally.
2. Retrieve a broad, episode-balanced candidate pool with deterministic code.
3. Ask a small local language model to annotate every retrieved candidate by canonical ID.
4. Add mechanical audio and visual evidence.
5. Let a human preview and explicitly create a draft Short.

The language model must not be the recall layer, calculate timestamps, delete
scripted candidates, create a Short automatically, or make a publication
decision.

## What was tested

The main corpus was the reviewed 59.43-minute Episode 4 delivery clock and the
six produced Shorts in `config/episode4-produced-shorts-v005.json`. The
transcript came from the audio-only export of that exact delivery branch. A
benchmark refuses different source clocks unless the caller supplies an
explicit timebase explanation.

The second corpus was the real Episode 3 Short 02 review. Its transcript sounds
potentially usable, but the human disposition was `refine` because of dark
framing, mic/face overlap, six long pauses, and 45.18% silence. Human notes were
held out of model prompts; only mechanical measurements were supplied to the
evidence-aware lane.

All runs were proposal-only. No source media, Quipsly session, review decision,
Short, render, upload, schedule, or publication was changed.

## Episode 4 results

Recall means that a candidate overlapped at least 25% of a produced Short.

| Workflow | Candidates | Recall @6 | @12 | @24 | @48 | @72 |
|---|---:|---:|---:|---:|---:|---:|
| Global deterministic top-K | 24 | 1/6 | 1/6 | 2/6 | 2/6 | 2/6 |
| Stratified deterministic retrieval | 72 | 0/6 | 1/6 | 3/6 | 5/6 | 6/6 |
| Qwen story-only scan | 12 | 1/6 | 1/6 | 1/6 | 1/6 | 1/6 |
| Qwen hybrid selection | 8 | 1/6 | 1/6 | 1/6 | 1/6 | 1/6 |
| Qwen scripted-lead rerank | 9 | 1/6 | 1/6 | 1/6 | 1/6 | 1/6 |
| Script pool + required Qwen annotations | 72 | 1/6 | 2/6 | 3/6 | 5/6 | 6/6 |

The broad script pool had complete recall but poor ranking. Requiring Qwen to
annotate all 12 leads in every 10-minute window improved early recall without
losing any pool member. At rank 24, recall tied the script while mean gold
coverage improved from 0.3873 to 0.4919. At rank 48, coverage improved from
0.6953 to 0.7822. The six-window annotation pass took 233.3 seconds.

Pure model scanning is rejected as a product workflow. All three selection
variants missed the reviewed leadership moment and returned no candidates in
the final window containing two produced Shorts. A smaller provider smoke test
also showed that Qwen could copy canonical UUIDs and write useful titles, but
split one coherent 43-second thought into three 13–16-second fragments.

## Transcription results

The first 600 seconds of Episode 4 contain three produced Shorts.

| Local ASR lane | Runtime | Recall @6 | Recall @12 | Mean coverage @12 |
|---|---:|---:|---:|---:|
| whisper.cpp `base.en` | 78s | 3/3 | 3/3 | 0.8353 |
| OpenAI Whisper `large-v3-turbo` CLI | 227s | 2/3 | 3/3 | 0.9569 |

Use `base.en` for a fast scout transcript. Run `large-v3-turbo` for selected
ranges or a deliberate high-quality episode pass when word timing and boundary
precision matter. A bigger ASR model should not block the first useful review
queue.

## Episode 3 critic results

| Model | Transcript only | Mechanical evidence | Total runtime |
|---|---|---|---:|
| Qwen3 8B | `needs-more-evidence` | `refine` | 14.2s |
| Llama 3 8B | `refine` | `refine` | 11.3s |
| DeepSeek R1 32B | `refine` | `refine` | 34.0s |

Only Qwen abstained when audio and visual evidence were unavailable. With
non-leaking audio measurements it matched the human `refine` disposition and
named the long pauses and silence fraction as risks. The 32B model was slower
and did not improve the review boundary.

## Product contract now implemented

- `script/local_editorial_provider.py` exposes an Ollama-backed,
  schema-constrained proposal provider and a `--doctor` readiness check.
- The provider accepts only canonical UUID transcript IDs and rejects invented
  IDs, invalid ranges, and oversized ranges.
- `LocalEditorialProposal.swift` defines the app-side proposal envelope and a
  pure resolver that converts transcript IDs to source-clock ranges.
- Resolved candidates retain provider, model, prompt version, and
  `proposal-not-applied` status.
- No provider or resolver API materializes a `ShortClipCandidate`.

The local provider is an implementation detail behind a Quipsly contract.
Ollama is suitable for local development because it has structured outputs and
an MIT-licensed runtime. A future packaged runtime can use
[`llama.cpp`](https://github.com/ggml-org/llama.cpp), whose server supports
OpenAI-compatible chat, embeddings, reranking, schema-constrained JSON, and
Metal, without changing the app-side proposal schema.

## Human surface to build

Add a visible **Scout moments locally** action next to transcript readiness.
The resulting surface should be a review queue, not an AI chat:

- group candidates by 10-minute chapter/window so the whole episode stays
  represented;
- show the deterministic source range and transcript excerpt;
- show AI title, hook, rationale, risk, model, prompt version, and elapsed time;
- show separate badges for transcript confidence, audio evidence, visual
  evidence, and evidence still missing;
- provide **Preview** and **Create draft Short** as distinct actions;
- keep boundary handles human-editable and label them as script-owned;
- never translate an AI score into Keep, Reject, Approved, Exported, or
  Published truth.

The first useful surface can consume the proposal envelope without changing the
existing `ShortClipCandidate` data model. Only **Create draft Short** should
materialize a candidate and enter the existing review workflow.

## Model and tool choices

### Incorporate now

- **Whisper `base.en` via whisper.cpp** for fast local scout transcripts.
  whisper.cpp is optimized for Apple Silicon with Metal/Core ML support.
- **Whisper `large-v3-turbo`** for selected-range refinement, captions, and
  deliberate high-quality passes. OpenAI releases Whisper code and weights
  under MIT.
- **Qwen3 8B** for candidate annotations, hooks, titles, rationales, evidence
  synthesis, and cautious Short criticism. Qwen3 open weights use Apache 2.0.
- **Deterministic retrieval and FFmpeg measurements** for recall, source-clock
  truth, silence, loudness, duration, and media validation.

Primary sources:

- [OpenAI Whisper](https://github.com/openai/whisper)
- [whisper.cpp](https://github.com/ggml-org/whisper.cpp)
- [Qwen3](https://github.com/QwenLM/Qwen3)
- [Ollama structured outputs](https://docs.ollama.com/capabilities/structured-outputs)

### Add next, behind experiments

- **Silero VAD** for very cheap speech/non-speech segmentation before ASR and
  pause-risk evidence. It is MIT licensed, about 2 MB, and supports ONNX.
- **pyannote Community-1** for optional speaker diarization. The toolkit is MIT
  licensed and runs offline after download, but initial model access requires
  accepting Hugging Face conditions and using a token, so it should be an
  optional setup rather than a core dependency.
- **OpenCV or Apple Vision** for face-safe vertical framing evidence and subject
  tracking. OpenCV is Apache 2.0; Apple Vision is the lower-friction native API
  even though it is not open source.
- **DeepFilterNet** for opt-in denoised preview renders. It is MIT/Apache-2.0
  dual licensed. Never overwrite production audio; compare a derivative preview
  against the source.

Primary sources:

- [Silero VAD](https://github.com/snakers4/silero-vad)
- [pyannote.audio](https://github.com/pyannote/pyannote-audio)
- [OpenCV](https://github.com/opencv/opencv)
- [DeepFilterNet](https://github.com/Rikorose/DeepFilterNet)

### Research later

- **Qwen3 Embedding 0.6B** for clustering duplicate moments, topic grouping, and
  finding callbacks across episodes.
- **Qwen3-VL** for sampled-frame visual criticism, crop-risk explanation, and
  contact-sheet review. It is Apache 2.0, but should operate on sparse frames,
  not ingest full video continuously.

Primary sources:

- [Qwen3 Embedding](https://github.com/QwenLM/Qwen3-Embedding)
- [Qwen3-VL](https://github.com/QwenLM/Qwen3-VL)

### Do not make defaults

- **Llama 3 8B:** slightly faster in the small critic test, but less disciplined
  about missing evidence and governed by Meta's custom Community License rather
  than a permissive open-source license.
- **DeepSeek R1 32B:** MIT-licensed and usable for occasional offline analysis,
  but it was slower and no better in the tested review decision.
- **70B local models:** unnecessary for this workflow and costly in storage,
  memory pressure, startup time, and support complexity.
- **Any model-authored timestamp arithmetic:** rejected. Models cite canonical
  segment or candidate IDs; Quipsly resolves source time.

## Storage and operational policy

This Mac currently has about 19 GiB free on the internal volume. Ollama models
occupy about 174 GiB and the Whisper cache about 2.2 GiB. Do not download more
models into the current default store. Before broader experimentation, move the
model/cache store to a dedicated fast SSD or deliberately prune unused models
with explicit approval.

Keep model weights, caches, transcripts, benchmark reports, and generated media
outside Git. Record the model, quantization, prompt version, source clock, and
runtime metrics with every proposal run.

## Durable evidence

- Full Episode 4 transcript:
  `/Volumes/My Passport/Episode_and_Shorts_Test/review-board/transcript-full-asr/episode-04/20260724-082038-566697-transcript-chunks`
- Winning Episode 4 annotation benchmark:
  `/Volumes/My Passport/Episode_and_Shorts_Test/review-board/local-ai-editor-benchmarks/20260724-085751-local-ai-editor-benchmark`
- Qwen Episode 3 critic:
  `/Volumes/My Passport/Episode_and_Shorts_Test/review-board/local-ai-short-critic-benchmarks/20260724-084001-local-ai-short-critic`
- Llama Episode 3 critic:
  `/Volumes/My Passport/Episode_and_Shorts_Test/review-board/local-ai-short-critic-benchmarks/20260724-084020-local-ai-short-critic`
- DeepSeek Episode 3 critic:
  `/Volumes/My Passport/Episode_and_Shorts_Test/review-board/local-ai-short-critic-benchmarks/20260724-090431-local-ai-short-critic`
- whisper.cpp base comparison:
  `/Volumes/My Passport/Episode_and_Shorts_Test/review-board/transcript-full-asr/episode-04/20260724-base-whispercpp-compare`

These artifacts are evidence and proposals, not release, export, or publication
receipts.
