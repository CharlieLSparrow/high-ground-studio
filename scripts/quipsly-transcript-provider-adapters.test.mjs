import assert from "node:assert/strict";
import test from "node:test";

import {
  deepgramEvaluationRequestConfig,
  normalizeDeepgramEvaluationWords,
  normalizeOpenAIDiarizedEvaluationWords,
  openAIDiarizedEvaluationRequestConfig,
} from "../packages/quipsly-media-processing/src/transcript-provider-adapters.ts";

test("Deepgram adapter preserves real word timing and speaker evidence", () => {
  const words = normalizeDeepgramEvaluationWords({
    results: {
      channels: [{ alternatives: [{ words: [
        { word: "hello", punctuated_word: "Hello,", start: 0.1, end: 0.4, speaker: 0 },
        { word: "Homer", punctuated_word: "Homer.", start: 0.5, end: 0.9, speaker: 1 },
      ] }] }],
    },
  });
  assert.deepEqual(words, [
    { text: "Hello,", startSeconds: 0.1, endSeconds: 0.4, speakerId: "0" },
    { text: "Homer.", startSeconds: 0.5, endSeconds: 0.9, speakerId: "1" },
  ]);
});
test("OpenAI adapter preserves segment speakers without inventing word timing", () => {
  const words = normalizeOpenAIDiarizedEvaluationWords({
    segments: [
      { type: "transcript.text.segment", id: "seg_1", start: 0, end: 2, speaker: "A", text: "Hello, Homer." },
      { type: "transcript.text.segment", id: "seg_2", start: 2, end: 3, speaker: "B", text: "Hey!" },
    ],
  });
  assert.deepEqual(words, [
    { text: "Hello", startSeconds: null, endSeconds: null, speakerId: "A" },
    { text: "Homer", startSeconds: null, endSeconds: null, speakerId: "A" },
    { text: "Hey", startSeconds: null, endSeconds: null, speakerId: "B" },
  ]);
});

test("evaluation configs pin evidence boundaries", () => {
  assert.throws(() => deepgramEvaluationRequestConfig({ modelVersion: "latest" }), /exact Deepgram model version/);
  assert.deepEqual(deepgramEvaluationRequestConfig({ modelVersion: "2026-05-01.0" }), {
    endpoint: "https://api.deepgram.com/v1/listen",
    model: "nova-3",
    version: "2026-05-01.0",
    language: "en-US",
    diarize_model: "v2",
    smart_format: true,
    punctuate: true,
    utterances: true,
    mip_opt_out: true,
  });
  assert.deepEqual(openAIDiarizedEvaluationRequestConfig({}), {
    endpoint: "https://api.openai.com/v1/audio/transcriptions",
    model: "gpt-4o-transcribe-diarize",
    response_format: "diarized_json",
    chunking_strategy: "auto",
    language: "en",
  });
});
