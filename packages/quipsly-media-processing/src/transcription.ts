export const CAPTURE_TRANSCRIPT_CONTRACT_VERSION = 1 as const;
export const CAPTURE_TRANSCRIPT_MANIFEST_KIND =
  "quipsly-capture-transcript-manifest-v1" as const;
export const CAPTURE_TRANSCRIPT_QUEUE_KIND =
  "quipsly-capture-transcript-queue-v1" as const;
export const CAPTURE_TRANSCRIPT_RESULT_KIND =
  "quipsly-capture-transcript-result-v1" as const;
export const CAPTURE_TRANSCRIPT_MANIFEST_PREFIX =
  "media-vault/control/transcript/manifests" as const;
export const CAPTURE_TRANSCRIPT_QUEUE_PREFIX =
  "media-vault/control/transcript/queue" as const;
export const CAPTURE_TRANSCRIPT_RESULT_PREFIX =
  "media-vault/control/transcript/results" as const;
export const CAPTURE_TRANSCRIPT_RAW_PREFIX =
  "media-vault/control/transcript/provider-responses" as const;
export const CAPTURE_TRANSCRIPT_DEAD_LETTER_PREFIX =
  "media-vault/control/transcript/dead-letter" as const;

const SAFE_ID = /^[A-Za-z0-9_-]{8,128}$/;
const SAFE_BUCKET = /^[a-z0-9][a-z0-9._-]{1,221}[a-z0-9]$/;
const SAFE_SOURCE_OBJECT = /^media-vault\/recordings\/[A-Za-z0-9/_\-.]+$/;
const SHA256 = /^[0-9a-f]{64}$/;
const GENERATION = /^[1-9][0-9]*$/;
const LANGUAGE = /^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/;

export type CaptureTranscriptStatus =
  | "queued"
  | "processing"
  | "completed"
  | "failed-terminal";

export type CaptureTranscriptLease = {
  id: string;
  executionId: string;
  claimedAt: string;
  expiresAt: string;
  attempt: number;
};

export type CaptureTranscriptSourceBinding = {
  bucketName: string;
  objectName: string;
  generation: string;
  sizeBytes: number;
  sha256: string;
  contentType: string;
  roomId: string;
  recordingAssetId: string;
};

export type CaptureTranscriptProviderRequest = {
  name: "deepgram";
  model: string;
  language: string | null;
  smartFormat: true;
  punctuate: true;
  diarize: true;
  diarizeModel: "latest" | "v1" | "v2" | null;
  multichannel: boolean;
  utterances: true;
  paragraphs: true;
};

export type CaptureTranscriptManifest = {
  kind: typeof CAPTURE_TRANSCRIPT_MANIFEST_KIND;
  version: typeof CAPTURE_TRANSCRIPT_CONTRACT_VERSION;
  jobId: string;
  actorUserId: string;
  actorEmail: string;
  source: CaptureTranscriptSourceBinding;
  provider: CaptureTranscriptProviderRequest;
  status: CaptureTranscriptStatus;
  attemptCount: number;
  queuedAt: string;
  updatedAt: string;
  lease: CaptureTranscriptLease | null;
  resultObjectName: string | null;
  failure: {
    code: string;
    message: string;
    failedAt: string;
  } | null;
};

export type CaptureTranscriptQueueReceipt = {
  kind: typeof CAPTURE_TRANSCRIPT_QUEUE_KIND;
  version: typeof CAPTURE_TRANSCRIPT_CONTRACT_VERSION;
  jobId: string;
  manifestObjectName: string;
  manifestGeneration: string;
  enqueuedAt: string;
};

export type CaptureTranscriptWordAnchor = {
  index: number;
  startSeconds: number;
  endSeconds: number;
  word: string;
  punctuatedWord: string;
  confidence: number | null;
  speakerLabel: string | null;
  channel: number | null;
};

export type CaptureTranscriptSegment = {
  ordinal: number;
  startSeconds: number;
  endSeconds: number;
  text: string;
  confidence: number | null;
  speakerLabel: string | null;
  channel: number | null;
  providerShape: "deepgram-utterance" | "deepgram-word-group";
  wordStartIndex: number;
  wordEndIndexExclusive: number;
};

export type CaptureTranscriptStoredObject = {
  bucketName: string;
  objectName: string;
  generation: string;
  sizeBytes: number;
  sha256: string;
  contentType: "application/json";
};

export type CaptureTranscriptResult = {
  kind: typeof CAPTURE_TRANSCRIPT_RESULT_KIND;
  version: typeof CAPTURE_TRANSCRIPT_CONTRACT_VERSION;
  jobId: string;
  manifestObjectName: string;
  source: CaptureTranscriptSourceBinding;
  provider: {
    name: "deepgram";
    model: string;
    requestId: string;
    durationSeconds: number | null;
    channels: number | null;
  };
  rawProviderResponse: CaptureTranscriptStoredObject;
  segments: CaptureTranscriptSegment[];
  words: CaptureTranscriptWordAnchor[];
  worker: {
    executionId: string;
    buildId: string;
    imageDigest: string | null;
  };
  completedAt: string;
};

export function normalizeCaptureTranscriptJobId(value: string) {
  const normalized = value.trim();
  return SAFE_ID.test(normalized) ? normalized : null;
}

export function buildCaptureTranscriptManifestObjectName(jobId: string) {
  return `${CAPTURE_TRANSCRIPT_MANIFEST_PREFIX}/${requiredJobId(jobId)}.json`;
}

export function buildCaptureTranscriptQueueObjectName(jobId: string) {
  return `${CAPTURE_TRANSCRIPT_QUEUE_PREFIX}/${requiredJobId(jobId)}.json`;
}

export function buildCaptureTranscriptResultObjectName(jobId: string) {
  return `${CAPTURE_TRANSCRIPT_RESULT_PREFIX}/${requiredJobId(jobId)}.json`;
}

export function buildCaptureTranscriptRawObjectName(jobId: string) {
  return `${CAPTURE_TRANSCRIPT_RAW_PREFIX}/${requiredJobId(jobId)}.json`;
}

export function buildCaptureTranscriptDeadLetterObjectName(jobId: string) {
  return `${CAPTURE_TRANSCRIPT_DEAD_LETTER_PREFIX}/${requiredJobId(jobId)}.json`;
}

export function newCaptureTranscriptManifest(input: Omit<
  CaptureTranscriptManifest,
  | "kind"
  | "version"
  | "status"
  | "attemptCount"
  | "lease"
  | "resultObjectName"
  | "failure"
>) {
  return parseCaptureTranscriptManifest({
    ...input,
    kind: CAPTURE_TRANSCRIPT_MANIFEST_KIND,
    version: CAPTURE_TRANSCRIPT_CONTRACT_VERSION,
    status: "queued",
    attemptCount: 0,
    lease: null,
    resultObjectName: null,
    failure: null,
  }, input.jobId);
}

export function parseCaptureTranscriptQueueReceipt(
  value: unknown,
): CaptureTranscriptQueueReceipt {
  const row = record(value);
  const jobId = normalizedText(row.jobId);
  if (
    row.kind !== CAPTURE_TRANSCRIPT_QUEUE_KIND
    || row.version !== CAPTURE_TRANSCRIPT_CONTRACT_VERSION
    || !normalizeCaptureTranscriptJobId(jobId)
    || row.manifestObjectName !== buildCaptureTranscriptManifestObjectName(jobId)
    || !GENERATION.test(normalizedText(row.manifestGeneration))
    || !isIsoDate(row.enqueuedAt)
  ) {
    throw new Error("Capture transcript queue receipt is invalid.");
  }
  return {
    kind: CAPTURE_TRANSCRIPT_QUEUE_KIND,
    version: CAPTURE_TRANSCRIPT_CONTRACT_VERSION,
    jobId,
    manifestObjectName: buildCaptureTranscriptManifestObjectName(jobId),
    manifestGeneration: normalizedText(row.manifestGeneration),
    enqueuedAt: normalizedText(row.enqueuedAt),
  };
}

export function parseCaptureTranscriptManifest(
  value: unknown,
  expectedJobId?: string,
): CaptureTranscriptManifest {
  const row = record(value);
  const jobId = normalizedText(row.jobId);
  const expected = expectedJobId
    ? normalizeCaptureTranscriptJobId(expectedJobId)
    : normalizeCaptureTranscriptJobId(jobId);
  const status = normalizedText(row.status) as CaptureTranscriptStatus;
  const source = parseSource(row.source);
  const provider = parseProviderRequest(row.provider);
  const attemptCount = nonNegativeSafeInteger(row.attemptCount);
  const lease = row.lease == null ? null : parseLease(row.lease);
  const resultObjectName = row.resultObjectName == null
    ? null
    : normalizedText(row.resultObjectName);
  const failure = row.failure == null ? null : parseFailure(row.failure);
  if (
    row.kind !== CAPTURE_TRANSCRIPT_MANIFEST_KIND
    || row.version !== CAPTURE_TRANSCRIPT_CONTRACT_VERSION
    || !expected
    || jobId !== expected
    || !requiredText(row.actorUserId)
    || !isEmail(row.actorEmail)
    || !["queued", "processing", "completed", "failed-terminal"].includes(status)
    || !isIsoDate(row.queuedAt)
    || !isIsoDate(row.updatedAt)
    || Date.parse(normalizedText(row.updatedAt)) < Date.parse(normalizedText(row.queuedAt))
    || (status === "processing" && !lease)
    || (status !== "processing" && lease)
    || (lease && lease.attempt !== attemptCount)
    || (status === "completed"
      && resultObjectName !== buildCaptureTranscriptResultObjectName(jobId))
    || (status !== "completed" && resultObjectName)
    || (status === "failed-terminal" && !failure)
    || (status !== "failed-terminal" && failure)
  ) {
    throw new Error("Capture transcript manifest is invalid.");
  }
  return {
    kind: CAPTURE_TRANSCRIPT_MANIFEST_KIND,
    version: CAPTURE_TRANSCRIPT_CONTRACT_VERSION,
    jobId,
    actorUserId: normalizedText(row.actorUserId),
    actorEmail: normalizedText(row.actorEmail).toLowerCase(),
    source,
    provider,
    status,
    attemptCount,
    queuedAt: normalizedText(row.queuedAt),
    updatedAt: normalizedText(row.updatedAt),
    lease,
    resultObjectName,
    failure,
  };
}

export function parseCaptureTranscriptResult(
  value: unknown,
  expectedManifest: CaptureTranscriptManifest,
): CaptureTranscriptResult {
  const row = record(value);
  const providerRow = record(row.provider);
  const workerRow = record(row.worker);
  const words = array(row.words).map(parseWordAnchor);
  const segments = array(row.segments).map(parseSegment);
  const result: CaptureTranscriptResult = {
    kind: CAPTURE_TRANSCRIPT_RESULT_KIND,
    version: CAPTURE_TRANSCRIPT_CONTRACT_VERSION,
    jobId: normalizedText(row.jobId),
    manifestObjectName: normalizedText(row.manifestObjectName),
    source: parseSource(row.source),
    provider: {
      name: "deepgram",
      model: normalizedText(providerRow.model),
      requestId: normalizedText(providerRow.requestId),
      durationSeconds: providerRow.durationSeconds == null
        ? null
        : nonNegativeFinite(providerRow.durationSeconds),
      channels: providerRow.channels == null
        ? null
        : positiveSafeInteger(providerRow.channels),
    },
    rawProviderResponse: parseStoredObject(row.rawProviderResponse),
    segments,
    words,
    worker: {
      executionId: normalizedText(workerRow.executionId),
      buildId: normalizedText(workerRow.buildId),
      imageDigest: workerRow.imageDigest == null
        ? null
        : normalizedText(workerRow.imageDigest),
    },
    completedAt: normalizedText(row.completedAt),
  };
  if (
    row.kind !== CAPTURE_TRANSCRIPT_RESULT_KIND
    || row.version !== CAPTURE_TRANSCRIPT_CONTRACT_VERSION
    || result.jobId !== expectedManifest.jobId
    || result.manifestObjectName
      !== buildCaptureTranscriptManifestObjectName(expectedManifest.jobId)
    || !sameSource(result.source, expectedManifest.source)
    || providerRow.name !== "deepgram"
    || result.provider.name !== expectedManifest.provider.name
    || result.provider.model !== expectedManifest.provider.model
    || !result.provider.requestId
    || result.rawProviderResponse.objectName
      !== buildCaptureTranscriptRawObjectName(expectedManifest.jobId)
    || segments.length === 0
    || words.length === 0
    || !isContiguous(words.map((word) => word.index))
    || !isContiguous(segments.map((segment) => segment.ordinal))
    || !segments.every((segment) => (
      segment.wordEndIndexExclusive <= words.length
      && segment.wordStartIndex < segment.wordEndIndexExclusive
    ))
    || !segmentsCoverWords(segments, words.length)
    || !result.worker.executionId
    || !result.worker.buildId
    || !isIsoDate(result.completedAt)
  ) {
    throw new Error("Capture transcript result is invalid.");
  }
  return result;
}

export function claimCaptureTranscriptManifest(input: {
  manifest: CaptureTranscriptManifest;
  leaseId: string;
  executionId: string;
  now: Date;
  leaseDurationMs: number;
}) {
  const { manifest, now } = input;
  if (manifest.status === "completed" || manifest.status === "failed-terminal") {
    return null;
  }
  if (
    manifest.status === "processing"
    && manifest.lease
    && Date.parse(manifest.lease.expiresAt) > now.getTime()
  ) {
    return null;
  }
  if (
    !normalizeCaptureTranscriptJobId(input.leaseId)
    || !requiredText(input.executionId)
    || !Number.isSafeInteger(input.leaseDurationMs)
    || input.leaseDurationMs < 60_000
  ) {
    throw new Error("Capture transcript lease binding is invalid.");
  }
  const attempt = manifest.attemptCount + 1;
  return parseCaptureTranscriptManifest({
    ...manifest,
    status: "processing",
    attemptCount: attempt,
    updatedAt: now.toISOString(),
    lease: {
      id: input.leaseId,
      executionId: normalizedText(input.executionId),
      claimedAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + input.leaseDurationMs).toISOString(),
      attempt,
    },
    resultObjectName: null,
    failure: null,
  }, manifest.jobId);
}

export function releaseCaptureTranscriptLease(input: {
  manifest: CaptureTranscriptManifest;
  leaseId: string;
  now: Date;
}) {
  assertActiveLease(input.manifest, input.leaseId);
  return parseCaptureTranscriptManifest({
    ...input.manifest,
    status: "queued",
    updatedAt: input.now.toISOString(),
    lease: null,
  }, input.manifest.jobId);
}

export function completeCaptureTranscriptManifest(input: {
  manifest: CaptureTranscriptManifest;
  leaseId: string;
  result: CaptureTranscriptResult;
  now: Date;
}) {
  assertActiveLease(input.manifest, input.leaseId);
  parseCaptureTranscriptResult(input.result, input.manifest);
  return parseCaptureTranscriptManifest({
    ...input.manifest,
    status: "completed",
    updatedAt: input.now.toISOString(),
    lease: null,
    resultObjectName: buildCaptureTranscriptResultObjectName(
      input.manifest.jobId,
    ),
    failure: null,
  }, input.manifest.jobId);
}

export function failCaptureTranscriptManifest(input: {
  manifest: CaptureTranscriptManifest;
  leaseId: string;
  code: string;
  message: string;
  now: Date;
}) {
  assertActiveLease(input.manifest, input.leaseId);
  if (!requiredText(input.code) || !requiredText(input.message)) {
    throw new Error("Capture transcript failure evidence is incomplete.");
  }
  return parseCaptureTranscriptManifest({
    ...input.manifest,
    status: "failed-terminal",
    updatedAt: input.now.toISOString(),
    lease: null,
    resultObjectName: null,
    failure: {
      code: normalizedText(input.code),
      message: normalizedText(input.message),
      failedAt: input.now.toISOString(),
    },
  }, input.manifest.jobId);
}

function parseSource(value: unknown): CaptureTranscriptSourceBinding {
  const row = record(value);
  const result: CaptureTranscriptSourceBinding = {
    bucketName: normalizedText(row.bucketName),
    objectName: normalizedText(row.objectName),
    generation: normalizedText(row.generation),
    sizeBytes: positiveSafeInteger(row.sizeBytes),
    sha256: normalizedText(row.sha256).toLowerCase(),
    contentType: normalizedText(row.contentType).toLowerCase(),
    roomId: normalizedText(row.roomId),
    recordingAssetId: normalizedText(row.recordingAssetId),
  };
  if (
    !SAFE_BUCKET.test(result.bucketName)
    || !SAFE_SOURCE_OBJECT.test(result.objectName)
    || !GENERATION.test(result.generation)
    || !SHA256.test(result.sha256)
    || !(
      result.contentType.startsWith("audio/")
      || result.contentType.startsWith("video/")
    )
    || !normalizeCaptureTranscriptJobId(result.roomId)
    || !normalizeCaptureTranscriptJobId(result.recordingAssetId)
  ) {
    throw new Error("Capture transcript source binding is invalid.");
  }
  return result;
}

function parseProviderRequest(value: unknown): CaptureTranscriptProviderRequest {
  const row = record(value);
  const language = row.language == null ? null : normalizedText(row.language);
  const diarizeModel = row.diarizeModel == null
    ? null
    : normalizedText(row.diarizeModel) as CaptureTranscriptProviderRequest["diarizeModel"];
  const multichannel = row.multichannel == null ? false : row.multichannel;
  const result: CaptureTranscriptProviderRequest = {
    name: "deepgram",
    model: normalizedText(row.model),
    language,
    smartFormat: true,
    punctuate: true,
    diarize: true,
    diarizeModel,
    multichannel: multichannel === true,
    utterances: true,
    paragraphs: true,
  };
  if (
    row.name !== result.name
    || !result.model
    || result.model.length > 128
    || (language !== null && !LANGUAGE.test(language))
    || row.smartFormat !== true
    || row.punctuate !== true
    || row.diarize !== true
    || (diarizeModel !== null && !["latest", "v1", "v2"].includes(diarizeModel))
    || (row.multichannel != null && typeof row.multichannel !== "boolean")
    || row.utterances !== true
    || row.paragraphs !== true
  ) {
    throw new Error("Capture transcript provider request is invalid.");
  }
  return result;
}

function parseLease(value: unknown): CaptureTranscriptLease {
  const row = record(value);
  const result: CaptureTranscriptLease = {
    id: normalizedText(row.id),
    executionId: normalizedText(row.executionId),
    claimedAt: normalizedText(row.claimedAt),
    expiresAt: normalizedText(row.expiresAt),
    attempt: positiveSafeInteger(row.attempt),
  };
  if (
    !normalizeCaptureTranscriptJobId(result.id)
    || !result.executionId
    || !isIsoDate(result.claimedAt)
    || !isIsoDate(result.expiresAt)
    || Date.parse(result.expiresAt) <= Date.parse(result.claimedAt)
  ) {
    throw new Error("Capture transcript lease is invalid.");
  }
  return result;
}

function parseFailure(value: unknown) {
  const row = record(value);
  const result = {
    code: normalizedText(row.code),
    message: normalizedText(row.message),
    failedAt: normalizedText(row.failedAt),
  };
  if (!result.code || !result.message || !isIsoDate(result.failedAt)) {
    throw new Error("Capture transcript failure is invalid.");
  }
  return result;
}

function parseStoredObject(value: unknown): CaptureTranscriptStoredObject {
  const row = record(value);
  const result: CaptureTranscriptStoredObject = {
    bucketName: normalizedText(row.bucketName),
    objectName: normalizedText(row.objectName),
    generation: normalizedText(row.generation),
    sizeBytes: positiveSafeInteger(row.sizeBytes),
    sha256: normalizedText(row.sha256).toLowerCase(),
    contentType: "application/json",
  };
  if (
    !SAFE_BUCKET.test(result.bucketName)
    || !GENERATION.test(result.generation)
    || !SHA256.test(result.sha256)
    || row.contentType !== result.contentType
  ) {
    throw new Error("Capture transcript stored object is invalid.");
  }
  return result;
}

function parseWordAnchor(value: unknown): CaptureTranscriptWordAnchor {
  const row = record(value);
  const result: CaptureTranscriptWordAnchor = {
    index: nonNegativeSafeInteger(row.index),
    startSeconds: nonNegativeFinite(row.startSeconds),
    endSeconds: nonNegativeFinite(row.endSeconds),
    word: normalizedText(row.word),
    punctuatedWord: normalizedText(row.punctuatedWord),
    confidence: nullableConfidence(row.confidence),
    speakerLabel: row.speakerLabel == null
      ? null
      : normalizedText(row.speakerLabel),
    channel: row.channel == null ? null : nonNegativeSafeInteger(row.channel),
  };
  if (
    result.endSeconds < result.startSeconds
    || !result.word
    || !result.punctuatedWord
    || (row.speakerLabel != null && !result.speakerLabel)
  ) {
    throw new Error("Capture transcript word anchor is invalid.");
  }
  return result;
}

function parseSegment(value: unknown): CaptureTranscriptSegment {
  const row = record(value);
  const providerShape = normalizedText(row.providerShape) as
    CaptureTranscriptSegment["providerShape"];
  const result: CaptureTranscriptSegment = {
    ordinal: nonNegativeSafeInteger(row.ordinal),
    startSeconds: nonNegativeFinite(row.startSeconds),
    endSeconds: nonNegativeFinite(row.endSeconds),
    text: normalizedText(row.text),
    confidence: nullableConfidence(row.confidence),
    speakerLabel: row.speakerLabel == null
      ? null
      : normalizedText(row.speakerLabel),
    channel: row.channel == null ? null : nonNegativeSafeInteger(row.channel),
    providerShape,
    wordStartIndex: nonNegativeSafeInteger(row.wordStartIndex),
    wordEndIndexExclusive: positiveSafeInteger(row.wordEndIndexExclusive),
  };
  if (
    result.endSeconds < result.startSeconds
    || !result.text
    || !["deepgram-utterance", "deepgram-word-group"].includes(providerShape)
    || result.wordStartIndex >= result.wordEndIndexExclusive
    || (row.speakerLabel != null && !result.speakerLabel)
  ) {
    throw new Error("Capture transcript segment is invalid.");
  }
  return result;
}

function sameSource(
  left: CaptureTranscriptSourceBinding,
  right: CaptureTranscriptSourceBinding,
) {
  return left.bucketName === right.bucketName
    && left.objectName === right.objectName
    && left.generation === right.generation
    && left.sizeBytes === right.sizeBytes
    && left.sha256 === right.sha256
    && left.contentType === right.contentType
    && left.roomId === right.roomId
    && left.recordingAssetId === right.recordingAssetId;
}

function assertActiveLease(
  manifest: CaptureTranscriptManifest,
  leaseId: string,
) {
  if (
    manifest.status !== "processing"
    || !manifest.lease
    || manifest.lease.id !== leaseId
  ) {
    throw new Error("Capture transcript lease is no longer active.");
  }
}

function requiredJobId(value: string) {
  const normalized = normalizeCaptureTranscriptJobId(value);
  if (!normalized) throw new Error("Capture transcript job ID is invalid.");
  return normalized;
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function array(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function normalizedText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function requiredText(value: unknown) {
  return normalizedText(value).length > 0;
}

function isEmail(value: unknown) {
  const normalized = normalizedText(value);
  return normalized.length <= 320
    && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized);
}

function isIsoDate(value: unknown) {
  const normalized = normalizedText(value);
  return normalized.length > 0 && Number.isFinite(Date.parse(normalized));
}

function positiveSafeInteger(value: unknown) {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error("Expected a positive safe integer.");
  }
  return parsed;
}

function nonNegativeSafeInteger(value: unknown) {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new Error("Expected a non-negative safe integer.");
  }
  return parsed;
}

function nonNegativeFinite(value: unknown) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error("Expected a non-negative finite number.");
  }
  return parsed;
}

function nullableConfidence(value: unknown) {
  if (value == null) return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 1) {
    throw new Error("Expected confidence between zero and one.");
  }
  return parsed;
}

function isContiguous(values: number[]) {
  return values.every((value, index) => value === index);
}

function segmentsCoverWords(
  segments: CaptureTranscriptSegment[],
  wordCount: number,
) {
  let cursor = 0;
  for (const segment of segments) {
    if (segment.wordStartIndex !== cursor) return false;
    cursor = segment.wordEndIndexExclusive;
  }
  return cursor === wordCount;
}
