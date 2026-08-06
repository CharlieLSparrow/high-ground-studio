import type { AudioMasterySourceBinding } from "./audio-mastery.js";

export const STUDIO_SOURCE_TRANSCRIPT_CONTRACT_VERSION = 1 as const;
export const STUDIO_SOURCE_TRANSCRIPT_JOB_KIND = "quipsly-studio-source-transcript-job-v1" as const;
export const STUDIO_SOURCE_TRANSCRIPT_RESULT_KIND = "quipsly-studio-source-transcript-result-v1" as const;

export type StudioSourceTranscriptAuthorizationKind =
  | "participant-consent-confirmed"
  | "licensed-or-permitted-source";

export type StudioSourceTranscriptAuthorization = {
  kind: StudioSourceTranscriptAuthorizationKind;
  statementVersion: "quipsly-studio-transcription-authorization-v1";
  accepted: true;
  acceptedAt: string;
  acceptedByEmail: string;
  importRole: string;
  purpose: "episode-production-transcription-and-review";
};

export type StudioSourceTranscriptProviderRequest = {
  name: "openai-whisper-local";
  model: string;
  language: string | null;
  wordTimestamps: true;
  speakerDiarization: false;
};

export type StudioSourceTranscriptJob = {
  kind: typeof STUDIO_SOURCE_TRANSCRIPT_JOB_KIND;
  version: typeof STUDIO_SOURCE_TRANSCRIPT_CONTRACT_VERSION;
  jobId: string;
  transcriptJobId: string;
  projectId: string;
  episodeProductionId: string;
  episodeSlug: string;
  sourceId: string;
  requestedByEmail: string;
  queuedAt: string;
  source: AudioMasterySourceBinding;
  authorization: StudioSourceTranscriptAuthorization;
  provider: StudioSourceTranscriptProviderRequest;
  boundaries: {
    originalRemainsSourceTruth: true;
    transcriptIsAppendOnlyProviderEvidence: true;
    confidenceIsNotMeasuredAccuracy: true;
    correctionsRequirePlaybackReview: true;
    createsNoTasksGoalsOrEdits: true;
  };
};

export type StudioSourceTranscriptWord = {
  index: number;
  segmentOrdinal: number;
  startSeconds: number;
  endSeconds: number;
  word: string;
  punctuatedWord: string;
  confidence: number | null;
  speakerLabel: string | null;
};

export type StudioSourceTranscriptSegment = {
  ordinal: number;
  startSeconds: number;
  endSeconds: number;
  text: string;
  confidence: number | null;
  speakerLabel: string | null;
  wordStartIndex: number;
  wordEndIndexExclusive: number;
};

export type StudioSourceTranscriptResult = {
  kind: typeof STUDIO_SOURCE_TRANSCRIPT_RESULT_KIND;
  version: typeof STUDIO_SOURCE_TRANSCRIPT_CONTRACT_VERSION;
  jobId: string;
  transcriptJobId: string;
  completedAt: string;
  source: AudioMasterySourceBinding;
  language: string | null;
  provider: {
    name: "openai-whisper-local";
    model: string;
    rawEvidenceSha256: string;
    rawEvidenceSizeBytes: number;
    rawEvidenceLocator: string;
    capabilities: {
      segmentTiming: "provider";
      wordTiming: "provider";
      wordConfidence: "provider";
      segmentConfidence: "unavailable";
      speakerDiarization: "unavailable";
      alternatives: "unavailable";
    };
  };
  segments: StudioSourceTranscriptSegment[];
  words: StudioSourceTranscriptWord[];
  coverage: {
    segmentCount: number;
    wordCount: number;
    timedWordCount: number;
    confidenceWordCount: number;
    speakerLabeledWordCount: 0;
    transcriptStartSeconds: number;
    transcriptEndSeconds: number;
  };
  worker: {
    executionId: string;
    buildId: string;
    imageDigest: string | null;
    attempt: number;
  };
  boundaries: StudioSourceTranscriptJob["boundaries"] & {
    completeSourceRead: true;
    providerEvidenceRetained: true;
  };
};

const SAFE_ID = /^[A-Za-z0-9_-]{8,160}$/;
const SHA256 = /^[0-9a-f]{64}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const LANGUAGE = /^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/;

export function newStudioSourceTranscriptJob(
  input: Omit<StudioSourceTranscriptJob, "kind" | "version" | "boundaries">,
): StudioSourceTranscriptJob {
  return parseStudioSourceTranscriptJob({
    ...input,
    kind: STUDIO_SOURCE_TRANSCRIPT_JOB_KIND,
    version: STUDIO_SOURCE_TRANSCRIPT_CONTRACT_VERSION,
    boundaries: transcriptBoundaries(),
  });
}

export function parseStudioSourceTranscriptJob(
  value: unknown,
  expectedJobId?: string,
): StudioSourceTranscriptJob {
  const row = record(value);
  const jobId = requiredId(row.jobId, "jobId");
  const provider = record(row.provider);
  const boundaries = record(row.boundaries);
  if (
    row.kind !== STUDIO_SOURCE_TRANSCRIPT_JOB_KIND
    || row.version !== STUDIO_SOURCE_TRANSCRIPT_CONTRACT_VERSION
    || (expectedJobId && expectedJobId !== jobId)
    || provider.name !== "openai-whisper-local"
    || provider.wordTimestamps !== true
    || provider.speakerDiarization !== false
    || !hasTranscriptBoundaries(boundaries)
  ) throw new Error("Studio source transcript job contract is invalid.");
  const language = provider.language == null ? null : requiredText(provider.language, "provider.language");
  if (language && !LANGUAGE.test(language)) throw new Error("provider.language is invalid.");
  return {
    kind: STUDIO_SOURCE_TRANSCRIPT_JOB_KIND,
    version: STUDIO_SOURCE_TRANSCRIPT_CONTRACT_VERSION,
    jobId,
    transcriptJobId: requiredId(row.transcriptJobId, "transcriptJobId"),
    projectId: requiredId(row.projectId, "projectId"),
    episodeProductionId: requiredId(row.episodeProductionId, "episodeProductionId"),
    episodeSlug: requiredSlug(row.episodeSlug, "episodeSlug"),
    sourceId: requiredId(row.sourceId, "sourceId"),
    requestedByEmail: requiredEmail(row.requestedByEmail, "requestedByEmail"),
    queuedAt: isoDate(row.queuedAt, "queuedAt"),
    source: parseSource(row.source),
    authorization: parseAuthorization(row.authorization),
    provider: {
      name: "openai-whisper-local",
      model: requiredText(provider.model, "provider.model"),
      language,
      wordTimestamps: true,
      speakerDiarization: false,
    },
    boundaries: transcriptBoundaries(),
  };
}

export function parseStudioSourceTranscriptResult(
  value: unknown,
  expectedJob?: StudioSourceTranscriptJob | unknown,
): StudioSourceTranscriptResult {
  const row = record(value);
  const job = expectedJob ? parseStudioSourceTranscriptJob(expectedJob) : null;
  const jobId = requiredId(row.jobId, "jobId");
  const transcriptJobId = requiredId(row.transcriptJobId, "transcriptJobId");
  const source = parseSource(row.source);
  const provider = record(row.provider);
  const capabilities = record(provider.capabilities);
  const coverage = record(row.coverage);
  const worker = record(row.worker);
  const boundaries = record(row.boundaries);
  if (
    row.kind !== STUDIO_SOURCE_TRANSCRIPT_RESULT_KIND
    || row.version !== STUDIO_SOURCE_TRANSCRIPT_CONTRACT_VERSION
    || (job && (job.jobId !== jobId || job.transcriptJobId !== transcriptJobId || !sameSource(job.source, source) || provider.model !== job.provider.model))
    || provider.name !== "openai-whisper-local"
    || capabilities.segmentTiming !== "provider"
    || capabilities.wordTiming !== "provider"
    || capabilities.wordConfidence !== "provider"
    || capabilities.segmentConfidence !== "unavailable"
    || capabilities.speakerDiarization !== "unavailable"
    || capabilities.alternatives !== "unavailable"
    || !hasTranscriptBoundaries(boundaries)
    || boundaries.completeSourceRead !== true
    || boundaries.providerEvidenceRetained !== true
  ) throw new Error("Studio source transcript result contract is invalid.");

  const segments = array(row.segments).map(parseSegment);
  const words = array(row.words).map(parseWord);
  if (!segments.length || !words.length) throw new Error("Studio source transcript result is empty.");
  assertOrderedTranscript(segments, words);
  const transcriptStartSeconds = segments[0].startSeconds;
  const transcriptEndSeconds = segments.at(-1)!.endSeconds;
  if (
    nonNegativeInteger(coverage.segmentCount, "coverage.segmentCount") !== segments.length
    || nonNegativeInteger(coverage.wordCount, "coverage.wordCount") !== words.length
    || nonNegativeInteger(coverage.timedWordCount, "coverage.timedWordCount") !== words.length
    || nonNegativeInteger(coverage.confidenceWordCount, "coverage.confidenceWordCount") !== words.filter((word) => word.confidence != null).length
    || nonNegativeInteger(coverage.speakerLabeledWordCount, "coverage.speakerLabeledWordCount") !== 0
    || Math.abs(nonNegativeNumber(coverage.transcriptStartSeconds, "coverage.transcriptStartSeconds") - transcriptStartSeconds) > 0.001
    || Math.abs(nonNegativeNumber(coverage.transcriptEndSeconds, "coverage.transcriptEndSeconds") - transcriptEndSeconds) > 0.001
  ) throw new Error("Studio source transcript coverage receipt is inconsistent.");
  const language = row.language == null ? null : requiredText(row.language, "language");
  if (language && !LANGUAGE.test(language)) throw new Error("language is invalid.");
  return {
    kind: STUDIO_SOURCE_TRANSCRIPT_RESULT_KIND,
    version: STUDIO_SOURCE_TRANSCRIPT_CONTRACT_VERSION,
    jobId,
    transcriptJobId,
    completedAt: isoDate(row.completedAt, "completedAt"),
    source,
    language,
    provider: {
      name: "openai-whisper-local",
      model: requiredText(provider.model, "provider.model"),
      rawEvidenceSha256: requiredSha256(provider.rawEvidenceSha256, "provider.rawEvidenceSha256"),
      rawEvidenceSizeBytes: positiveInteger(provider.rawEvidenceSizeBytes, "provider.rawEvidenceSizeBytes"),
      rawEvidenceLocator: requiredText(provider.rawEvidenceLocator, "provider.rawEvidenceLocator"),
      capabilities: {
        segmentTiming: "provider",
        wordTiming: "provider",
        wordConfidence: "provider",
        segmentConfidence: "unavailable",
        speakerDiarization: "unavailable",
        alternatives: "unavailable",
      },
    },
    segments,
    words,
    coverage: {
      segmentCount: segments.length,
      wordCount: words.length,
      timedWordCount: words.length,
      confidenceWordCount: words.filter((word) => word.confidence != null).length,
      speakerLabeledWordCount: 0,
      transcriptStartSeconds,
      transcriptEndSeconds,
    },
    worker: {
      executionId: requiredId(worker.executionId, "worker.executionId"),
      buildId: requiredText(worker.buildId, "worker.buildId"),
      imageDigest: worker.imageDigest == null ? null : requiredText(worker.imageDigest, "worker.imageDigest"),
      attempt: positiveInteger(worker.attempt, "worker.attempt"),
    },
    boundaries: { ...transcriptBoundaries(), completeSourceRead: true, providerEvidenceRetained: true },
  };
}

function parseAuthorization(value: unknown): StudioSourceTranscriptAuthorization {
  const row = record(value);
  const kind = row.kind === "participant-consent-confirmed" || row.kind === "licensed-or-permitted-source"
    ? row.kind
    : invalid("authorization.kind");
  if (
    row.statementVersion !== "quipsly-studio-transcription-authorization-v1"
    || row.accepted !== true
    || row.purpose !== "episode-production-transcription-and-review"
  ) throw new Error("Studio source transcription authorization is incomplete.");
  return {
    kind,
    statementVersion: "quipsly-studio-transcription-authorization-v1",
    accepted: true,
    acceptedAt: isoDate(row.acceptedAt, "authorization.acceptedAt"),
    acceptedByEmail: requiredEmail(row.acceptedByEmail, "authorization.acceptedByEmail"),
    importRole: requiredSlug(row.importRole, "authorization.importRole"),
    purpose: "episode-production-transcription-and-review",
  };
}

function parseSegment(value: unknown, index: number): StudioSourceTranscriptSegment {
  const row = record(value);
  const startSeconds = nonNegativeNumber(row.startSeconds, `segments[${index}].startSeconds`);
  const endSeconds = nonNegativeNumber(row.endSeconds, `segments[${index}].endSeconds`);
  if (endSeconds < startSeconds) throw new Error(`segments[${index}] has a reversed range.`);
  return {
    ordinal: nonNegativeInteger(row.ordinal, `segments[${index}].ordinal`),
    startSeconds,
    endSeconds,
    text: requiredText(row.text, `segments[${index}].text`),
    confidence: nullableConfidence(row.confidence, `segments[${index}].confidence`),
    speakerLabel: nullableText(row.speakerLabel),
    wordStartIndex: nonNegativeInteger(row.wordStartIndex, `segments[${index}].wordStartIndex`),
    wordEndIndexExclusive: nonNegativeInteger(row.wordEndIndexExclusive, `segments[${index}].wordEndIndexExclusive`),
  };
}

function parseWord(value: unknown, index: number): StudioSourceTranscriptWord {
  const row = record(value);
  const startSeconds = nonNegativeNumber(row.startSeconds, `words[${index}].startSeconds`);
  const endSeconds = nonNegativeNumber(row.endSeconds, `words[${index}].endSeconds`);
  if (endSeconds < startSeconds) throw new Error(`words[${index}] has a reversed range.`);
  return {
    index: nonNegativeInteger(row.index, `words[${index}].index`),
    segmentOrdinal: nonNegativeInteger(row.segmentOrdinal, `words[${index}].segmentOrdinal`),
    startSeconds,
    endSeconds,
    word: requiredText(row.word, `words[${index}].word`),
    punctuatedWord: requiredText(row.punctuatedWord, `words[${index}].punctuatedWord`),
    confidence: nullableConfidence(row.confidence, `words[${index}].confidence`),
    speakerLabel: nullableText(row.speakerLabel),
  };
}

function assertOrderedTranscript(segments: StudioSourceTranscriptSegment[], words: StudioSourceTranscriptWord[]) {
  for (let index = 0; index < segments.length; index += 1) {
    const segment = segments[index];
    if (segment.ordinal !== index || segment.wordStartIndex > segment.wordEndIndexExclusive || segment.wordEndIndexExclusive > words.length) {
      throw new Error("Studio source transcript segment indexing is invalid.");
    }
    if (index > 0 && segment.startSeconds < segments[index - 1].startSeconds) throw new Error("Studio source transcript segments are not ordered.");
    const ownedWords = words.slice(segment.wordStartIndex, segment.wordEndIndexExclusive);
    if (!ownedWords.length || ownedWords.some((word) => word.segmentOrdinal !== segment.ordinal || word.startSeconds < segment.startSeconds - 0.05 || word.endSeconds > segment.endSeconds + 0.05)) {
      throw new Error("Studio source transcript word ownership is invalid.");
    }
  }
  for (let index = 0; index < words.length; index += 1) {
    if (words[index].index !== index || (index > 0 && words[index].startSeconds < words[index - 1].startSeconds)) {
      throw new Error("Studio source transcript words are not ordered.");
    }
  }
}

function parseSource(value: unknown): AudioMasterySourceBinding {
  const row = record(value);
  const provider = row.provider === "local" || row.provider === "gcs" ? row.provider : invalid("source.provider");
  return {
    assetId: requiredId(row.assetId, "source.assetId"),
    provider,
    locator: requiredText(row.locator, "source.locator"),
    generation: requiredText(row.generation, "source.generation"),
    sha256: requiredSha256(row.sha256, "source.sha256"),
    sizeBytes: positiveInteger(row.sizeBytes, "source.sizeBytes"),
    contentType: requiredText(row.contentType, "source.contentType"),
  };
}

function sameSource(left: AudioMasterySourceBinding, right: AudioMasterySourceBinding) {
  return left.assetId === right.assetId && left.provider === right.provider && left.locator === right.locator
    && left.generation === right.generation && left.sha256 === right.sha256 && left.sizeBytes === right.sizeBytes
    && left.contentType === right.contentType;
}

function transcriptBoundaries(): StudioSourceTranscriptJob["boundaries"] {
  return {
    originalRemainsSourceTruth: true,
    transcriptIsAppendOnlyProviderEvidence: true,
    confidenceIsNotMeasuredAccuracy: true,
    correctionsRequirePlaybackReview: true,
    createsNoTasksGoalsOrEdits: true,
  };
}
function hasTranscriptBoundaries(value: Record<string, unknown>) {
  return value.originalRemainsSourceTruth === true
    && value.transcriptIsAppendOnlyProviderEvidence === true
    && value.confidenceIsNotMeasuredAccuracy === true
    && value.correctionsRequirePlaybackReview === true
    && value.createsNoTasksGoalsOrEdits === true;
}
function record(value: unknown): Record<string, unknown> { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
function array(value: unknown): unknown[] { return Array.isArray(value) ? value : []; }
function requiredText(value: unknown, field: string) { const result = typeof value === "string" ? value.trim() : ""; if (!result) throw new Error(`${field} is required.`); return result; }
function nullableText(value: unknown) { return value == null ? null : requiredText(value, "text"); }
function requiredId(value: unknown, field: string) { const result = requiredText(value, field); if (!SAFE_ID.test(result)) throw new Error(`${field} is invalid.`); return result; }
function requiredSlug(value: unknown, field: string) { const result = requiredText(value, field); if (!/^[a-z0-9][a-z0-9_-]{0,119}$/i.test(result)) throw new Error(`${field} is invalid.`); return result; }
function requiredEmail(value: unknown, field: string) { const result = requiredText(value, field).toLowerCase(); if (!EMAIL.test(result)) throw new Error(`${field} is invalid.`); return result; }
function requiredSha256(value: unknown, field: string) { const result = requiredText(value, field).toLowerCase(); if (!SHA256.test(result)) throw new Error(`${field} is invalid.`); return result; }
function isoDate(value: unknown, field: string) { const result = requiredText(value, field); if (!Number.isFinite(Date.parse(result))) throw new Error(`${field} is invalid.`); return result; }
function finiteNumber(value: unknown, field: string) { const result = Number(value); if (!Number.isFinite(result)) throw new Error(`${field} is invalid.`); return result; }
function nonNegativeNumber(value: unknown, field: string) { const result = finiteNumber(value, field); if (result < 0) throw new Error(`${field} must be non-negative.`); return result; }
function positiveInteger(value: unknown, field: string) { const result = finiteNumber(value, field); if (!Number.isSafeInteger(result) || result < 1) throw new Error(`${field} must be a positive integer.`); return result; }
function nonNegativeInteger(value: unknown, field: string) { const result = nonNegativeNumber(value, field); if (!Number.isSafeInteger(result)) throw new Error(`${field} must be an integer.`); return result; }
function nullableConfidence(value: unknown, field: string) { if (value == null) return null; const result = finiteNumber(value, field); if (result < 0 || result > 1) throw new Error(`${field} must be between zero and one.`); return result; }
function invalid(field: string): never { throw new Error(`${field} is invalid.`); }
