import type { TranscriptEvaluationWord } from "./transcript-evaluation.js";

export const QUIPSLY_TRANSCRIPT_PROVIDER_ADAPTER_VERSION =
  "quipsly-transcript-provider-adapter-v1" as const;

export const OPENAI_DIARIZED_TRANSCRIPT_MODEL =
  "gpt-4o-transcribe-diarize" as const;
export const DEEPGRAM_TRANSCRIPT_MODEL = "nova-3" as const;
export const DEEPGRAM_DIARIZATION_MODEL = "v2" as const;

function record(value: unknown, field: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${field} must be an object.`);
  }
  return value as Record<string, unknown>;
}
function array(value: unknown, field: string) {
  if (!Array.isArray(value)) throw new Error(`${field} must be an array.`);
  return value;
}

function text(value: unknown, field: string) {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${field} must be non-empty text.`);
  return value.trim();
}

function nonNegative(value: unknown, field: string) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new Error(`${field} must be a non-negative number.`);
  }
  return value;
}

function tokenize(value: string) {
  return value.match(/[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)*/gu) ?? [];
}

export function normalizeDeepgramEvaluationWords(
  response: unknown,
): TranscriptEvaluationWord[] {
  const root = record(response, "Deepgram response");
  const results = record(root.results, "Deepgram response.results");
  const channels = array(results.channels, "Deepgram response.results.channels");
  if (channels.length !== 1) {
    throw new Error("The evaluation adapter requires exactly one Deepgram channel; use a distinct multichannel evaluation contract for isolated tracks.");
  }
  const channel = record(channels[0], "Deepgram response channel");
  const alternatives = array(channel.alternatives, "Deepgram response alternatives");
  if (!alternatives.length) throw new Error("Deepgram returned no transcript alternative.");
  const alternative = record(alternatives[0], "Deepgram response alternative");
  return array(alternative.words, "Deepgram response words").map((value, index) => {
    const word = record(value, `Deepgram word ${index}`);
    const startSeconds = nonNegative(word.start, `Deepgram word ${index}.start`);
    const endSeconds = nonNegative(word.end, `Deepgram word ${index}.end`);
    if (endSeconds < startSeconds) throw new Error(`Deepgram word ${index} has a reversed time range.`);
    const speaker = word.speaker;
    if (typeof speaker !== "number" && typeof speaker !== "string") {
      throw new Error(`Deepgram word ${index} is missing diarization evidence.`);
    }
    return {
      text: text(word.punctuated_word ?? word.word, `Deepgram word ${index}.text`),
      startSeconds,
      endSeconds,
      speakerId: String(speaker),
    };
  });
}

export function normalizeOpenAIDiarizedEvaluationWords(
  response: unknown,
): TranscriptEvaluationWord[] {
  const root = record(response, "OpenAI diarized response");
  const segments = array(root.segments, "OpenAI diarized response.segments");
  const words = segments.flatMap((value, index) => {
    const segment = record(value, `OpenAI diarized segment ${index}`);
    const start = nonNegative(segment.start, `OpenAI diarized segment ${index}.start`);
    const end = nonNegative(segment.end, `OpenAI diarized segment ${index}.end`);
    if (end < start) throw new Error(`OpenAI diarized segment ${index} has a reversed time range.`);
    const speakerId = text(segment.speaker, `OpenAI diarized segment ${index}.speaker`);
    return tokenize(text(segment.text, `OpenAI diarized segment ${index}.text`)).map((token) => ({
      text: token,
      // The documented diarized response has segment timestamps, not word
      // timestamps. Null is a deliberate evidence boundary, not a missing
      // interpolation implementation.
      startSeconds: null,
      endSeconds: null,
      speakerId,
    }));
  });
  if (!words.length) throw new Error("OpenAI returned no diarized transcript words.");
  return words;
}

export function deepgramEvaluationRequestConfig(input: {
  modelVersion: string;
  language?: string;
}) {
  const modelVersion = text(input.modelVersion, "Deepgram modelVersion");
  if (modelVersion === "latest") {
    throw new Error("Release evaluation requires an exact Deepgram model version, not latest.");
  }
  return {
    endpoint: "https://api.deepgram.com/v1/listen",
    model: DEEPGRAM_TRANSCRIPT_MODEL,
    version: modelVersion,
    language: input.language?.trim() || "en-US",
    diarize_model: DEEPGRAM_DIARIZATION_MODEL,
    smart_format: true,
    punctuate: true,
    utterances: true,
    mip_opt_out: true,
  } as const;
}

export function openAIDiarizedEvaluationRequestConfig(input: {
  language?: string;
}) {
  return {
    endpoint: "https://api.openai.com/v1/audio/transcriptions",
    model: OPENAI_DIARIZED_TRANSCRIPT_MODEL,
    response_format: "diarized_json",
    chunking_strategy: "auto",
    language: input.language?.trim() || "en",
  } as const;
}
