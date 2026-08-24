export const SESSION_AUDIO_AUDITION_CONTRACT_VERSION = 1 as const;
export const SESSION_AUDIO_AUDITION_MANIFEST_KIND =
  "quipsly-session-audio-audition-manifest-v1" as const;
export const SESSION_AUDIO_AUDITION_QUEUE_KIND =
  "quipsly-session-audio-audition-queue-v1" as const;
export const SESSION_AUDIO_AUDITION_RESULT_KIND =
  "quipsly-session-audio-audition-result-v1" as const;
export const SESSION_AUDIO_AUDITION_PROFILE =
  "transcript-audition-aac-lc-128k-v1" as const;
export const SESSION_AUDIO_AUDITION_CONTROL_PREFIX =
  "media-vault/control/session-audio-audition" as const;
export const SESSION_AUDIO_AUDITION_MANIFEST_PREFIX =
  `${SESSION_AUDIO_AUDITION_CONTROL_PREFIX}/manifests` as const;
export const SESSION_AUDIO_AUDITION_QUEUE_PREFIX =
  `${SESSION_AUDIO_AUDITION_CONTROL_PREFIX}/queue` as const;
export const SESSION_AUDIO_AUDITION_RESULT_PREFIX =
  `${SESSION_AUDIO_AUDITION_CONTROL_PREFIX}/results` as const;
export const SESSION_AUDIO_AUDITION_DEAD_LETTER_PREFIX =
  `${SESSION_AUDIO_AUDITION_CONTROL_PREFIX}/dead-letter` as const;

const SAFE_ID = /^[A-Za-z0-9_-]{8,240}$/;
const SAFE_BUCKET = /^[a-z0-9][a-z0-9._-]{1,221}[a-z0-9]$/;
const SOURCE_OBJECT = /^media-vault\/recordings\/[A-Za-z0-9/_\-.]+$/;
const TARGET_OBJECT =
  /^media-vault\/proxy\/session-audition\/[A-Za-z0-9_-]+\/[A-Za-z0-9_-]+\/[A-Za-z0-9_-]+\.m4a$/;
const GENERATION = /^[1-9][0-9]*$/;
const SHA256 = /^[0-9a-f]{64}$/;

export type SessionAudioAuditionStatus =
  | "queued"
  | "processing"
  | "completed"
  | "failed-terminal";

export type SessionAudioAuditionLease = {
  id: string;
  executionId: string;
  claimedAt: string;
  expiresAt: string;
  attempt: number;
};

export type SessionAudioAuditionSource = {
  bucketName: string;
  objectName: string;
  generation: string;
  sizeBytes: number;
  sha256: string;
  contentType: string;
  durationSeconds: number;
  roomId: string;
  recordingAssetId: string;
  finalizationUploadSessionId: string;
};

export type SessionAudioAuditionTarget = {
  bucketName: string;
  objectName: string;
  generation?: string;
  contentType: "audio/mp4";
  profile: typeof SESSION_AUDIO_AUDITION_PROFILE;
};

export type SessionAudioAuditionTechnicalEvidence = {
  sourceDurationSeconds: number;
  durationSeconds: number;
  durationDeltaSeconds: number;
  sourceAudioOrdinal: 0;
  audioCodec: "aac";
  sampleRateHz: 48_000;
  channelCount: 1 | 2;
  bitRate: number;
  hasVideo: false;
  decodedToEnd: true;
};

export type SessionAudioAuditionManifest = {
  kind: typeof SESSION_AUDIO_AUDITION_MANIFEST_KIND;
  version: typeof SESSION_AUDIO_AUDITION_CONTRACT_VERSION;
  jobId: string;
  roomId: string;
  requestedByUserId: string;
  requestedByEmail: string;
  source: SessionAudioAuditionSource;
  target: Omit<SessionAudioAuditionTarget, "generation">;
  status: SessionAudioAuditionStatus;
  queuedAt: string;
  updatedAt: string;
  lease: SessionAudioAuditionLease | null;
  resultObjectName: string | null;
  failure: { code: string; message: string; failedAt: string } | null;
  originalRemainsSourceTruth: true;
};

export type SessionAudioAuditionQueueReceipt = {
  kind: typeof SESSION_AUDIO_AUDITION_QUEUE_KIND;
  version: typeof SESSION_AUDIO_AUDITION_CONTRACT_VERSION;
  jobId: string;
  manifestObjectName: string;
  manifestGeneration: string;
  enqueuedAt: string;
};

export type SessionAudioAuditionResult = {
  kind: typeof SESSION_AUDIO_AUDITION_RESULT_KIND;
  version: typeof SESSION_AUDIO_AUDITION_CONTRACT_VERSION;
  jobId: string;
  manifestObjectName: string;
  source: SessionAudioAuditionSource;
  output: SessionAudioAuditionTarget & {
    generation: string;
    sizeBytes: number;
    sha256: string;
    crc32c: string;
    metadata: SessionAudioAuditionTechnicalEvidence;
  };
  worker: {
    executionId: string;
    buildId: string;
    imageDigest: string | null;
    attempt: number;
  };
  completedAt: string;
  originalRemainsSourceTruth: true;
};

export function normalizeSessionAudioAuditionJobId(value: string) {
  const normalized = value.trim();
  return SAFE_ID.test(normalized) ? normalized : null;
}

export function buildSessionAudioAuditionManifestObjectName(jobId: string) {
  return `${SESSION_AUDIO_AUDITION_MANIFEST_PREFIX}/${requiredJobId(jobId)}.json`;
}

export function buildSessionAudioAuditionQueueObjectName(jobId: string) {
  return `${SESSION_AUDIO_AUDITION_QUEUE_PREFIX}/${requiredJobId(jobId)}.json`;
}

export function buildSessionAudioAuditionResultObjectName(jobId: string) {
  return `${SESSION_AUDIO_AUDITION_RESULT_PREFIX}/${requiredJobId(jobId)}.json`;
}

export function buildSessionAudioAuditionDeadLetterObjectName(jobId: string) {
  return `${SESSION_AUDIO_AUDITION_DEAD_LETTER_PREFIX}/${requiredJobId(jobId)}.json`;
}

export function buildSessionAudioAuditionTargetObjectName(input: {
  roomId: string;
  recordingAssetId: string;
  jobId: string;
}) {
  return [
    "media-vault/proxy/session-audition",
    requiredId(input.roomId, "room"),
    requiredId(input.recordingAssetId, "recording asset"),
    `${requiredJobId(input.jobId)}.m4a`,
  ].join("/");
}

export function newSessionAudioAuditionManifest(
  input: Omit<
    SessionAudioAuditionManifest,
    | "kind"
    | "version"
    | "status"
    | "lease"
    | "resultObjectName"
    | "failure"
    | "originalRemainsSourceTruth"
  >,
) {
  return parseSessionAudioAuditionManifest(
    {
      ...input,
      kind: SESSION_AUDIO_AUDITION_MANIFEST_KIND,
      version: SESSION_AUDIO_AUDITION_CONTRACT_VERSION,
      status: "queued",
      lease: null,
      resultObjectName: null,
      failure: null,
      originalRemainsSourceTruth: true,
    },
    input.jobId,
  );
}

export function parseSessionAudioAuditionQueueReceipt(value: unknown) {
  const row = record(value);
  const jobId = text(row.jobId);
  if (
    row.kind !== SESSION_AUDIO_AUDITION_QUEUE_KIND ||
    row.version !== SESSION_AUDIO_AUDITION_CONTRACT_VERSION ||
    !normalizeSessionAudioAuditionJobId(jobId) ||
    row.manifestObjectName !==
      buildSessionAudioAuditionManifestObjectName(jobId) ||
    !GENERATION.test(text(row.manifestGeneration)) ||
    !isIsoDate(row.enqueuedAt)
  )
    throw new Error("Session audio audition queue receipt is invalid.");
  return {
    kind: SESSION_AUDIO_AUDITION_QUEUE_KIND,
    version: SESSION_AUDIO_AUDITION_CONTRACT_VERSION,
    jobId,
    manifestObjectName: text(row.manifestObjectName),
    manifestGeneration: text(row.manifestGeneration),
    enqueuedAt: text(row.enqueuedAt),
  } satisfies SessionAudioAuditionQueueReceipt;
}

export function parseSessionAudioAuditionManifest(
  value: unknown,
  expectedJobId?: string,
) {
  const row = record(value);
  const jobId = text(row.jobId);
  const source = parseSource(row.source);
  const target = parseTarget(row.target);
  const status = text(row.status) as SessionAudioAuditionStatus;
  const lease = row.lease == null ? null : parseLease(row.lease);
  const resultObjectName =
    row.resultObjectName == null ? null : text(row.resultObjectName);
  const failure = row.failure == null ? null : parseFailure(row.failure);
  const manifest: SessionAudioAuditionManifest = {
    kind: row.kind as typeof SESSION_AUDIO_AUDITION_MANIFEST_KIND,
    version: Number(row.version) as 1,
    jobId,
    roomId: text(row.roomId),
    requestedByUserId: text(row.requestedByUserId),
    requestedByEmail: text(row.requestedByEmail).toLowerCase(),
    source,
    target,
    status,
    queuedAt: text(row.queuedAt),
    updatedAt: text(row.updatedAt),
    lease,
    resultObjectName,
    failure,
    originalRemainsSourceTruth: row.originalRemainsSourceTruth as true,
  };
  if (
    manifest.kind !== SESSION_AUDIO_AUDITION_MANIFEST_KIND ||
    manifest.version !== 1 ||
    !normalizeSessionAudioAuditionJobId(jobId) ||
    (expectedJobId && expectedJobId !== jobId) ||
    !SAFE_ID.test(manifest.roomId) ||
    manifest.roomId !== source.roomId ||
    !SAFE_ID.test(manifest.requestedByUserId) ||
    !isEmail(manifest.requestedByEmail) ||
    source.bucketName !== target.bucketName ||
    target.objectName !==
      buildSessionAudioAuditionTargetObjectName({
        roomId: source.roomId,
        recordingAssetId: source.recordingAssetId,
        jobId,
      }) ||
    !isIsoDate(manifest.queuedAt) ||
    !isIsoDate(manifest.updatedAt) ||
    !["queued", "processing", "completed", "failed-terminal"].includes(
      status,
    ) ||
    (status === "processing") !== Boolean(lease) ||
    (status === "completed") !== Boolean(resultObjectName) ||
    (status === "failed-terminal") !== Boolean(failure) ||
    (resultObjectName !== null &&
      resultObjectName !== buildSessionAudioAuditionResultObjectName(jobId)) ||
    manifest.originalRemainsSourceTruth !== true
  )
    throw new Error("Session audio audition manifest is invalid.");
  return manifest;
}

export function parseSessionAudioAuditionResult(
  value: unknown,
  expected: SessionAudioAuditionManifest,
) {
  const row = record(value);
  const output = record(row.output);
  const result: SessionAudioAuditionResult = {
    kind: row.kind as typeof SESSION_AUDIO_AUDITION_RESULT_KIND,
    version: Number(row.version) as 1,
    jobId: text(row.jobId),
    manifestObjectName: text(row.manifestObjectName),
    source: parseSource(row.source),
    output: {
      ...parseTarget(output),
      generation: text(output.generation),
      sizeBytes: positiveInteger(output.sizeBytes),
      sha256: text(output.sha256).toLowerCase(),
      crc32c: text(output.crc32c),
      metadata: parseTechnical(output.metadata),
    },
    worker: parseWorker(row.worker),
    completedAt: text(row.completedAt),
    originalRemainsSourceTruth: row.originalRemainsSourceTruth as true,
  };
  if (
    result.kind !== SESSION_AUDIO_AUDITION_RESULT_KIND ||
    result.version !== 1 ||
    result.jobId !== expected.jobId ||
    result.manifestObjectName !==
      buildSessionAudioAuditionManifestObjectName(expected.jobId) ||
    JSON.stringify(result.source) !== JSON.stringify(expected.source) ||
    result.output.objectName !== expected.target.objectName ||
    result.output.bucketName !== expected.target.bucketName ||
    Math.abs(
      result.output.metadata.sourceDurationSeconds -
        expected.source.durationSeconds,
    ) > 0.25 ||
    !GENERATION.test(result.output.generation) ||
    !SHA256.test(result.output.sha256) ||
    !result.output.crc32c ||
    !isIsoDate(result.completedAt) ||
    result.originalRemainsSourceTruth !== true
  )
    throw new Error("Session audio audition result is invalid.");
  return result;
}

export function claimSessionAudioAuditionManifest(input: {
  manifest: SessionAudioAuditionManifest;
  leaseId: string;
  executionId: string;
  now: Date;
  leaseDurationMs: number;
}) {
  const { manifest } = input;
  if (manifest.status === "completed" || manifest.status === "failed-terminal")
    return null;
  if (
    manifest.status === "processing" &&
    manifest.lease &&
    Date.parse(manifest.lease.expiresAt) > input.now.getTime()
  )
    return null;
  return parseSessionAudioAuditionManifest(
    {
      ...manifest,
      status: "processing",
      updatedAt: input.now.toISOString(),
      lease: {
        id: input.leaseId,
        executionId: input.executionId,
        claimedAt: input.now.toISOString(),
        expiresAt: new Date(
          input.now.getTime() + input.leaseDurationMs,
        ).toISOString(),
        attempt: (manifest.lease?.attempt ?? 0) + 1,
      },
    },
    manifest.jobId,
  );
}

export function releaseSessionAudioAuditionLease(input: {
  manifest: SessionAudioAuditionManifest;
  leaseId: string;
  now: Date;
}) {
  requireLease(input.manifest, input.leaseId);
  return parseSessionAudioAuditionManifest(
    {
      ...input.manifest,
      status: "queued",
      lease: null,
      updatedAt: input.now.toISOString(),
    },
    input.manifest.jobId,
  );
}

export function completeSessionAudioAuditionManifest(input: {
  manifest: SessionAudioAuditionManifest;
  leaseId: string;
  result: SessionAudioAuditionResult;
  now: Date;
}) {
  requireLease(input.manifest, input.leaseId);
  parseSessionAudioAuditionResult(input.result, input.manifest);
  return parseSessionAudioAuditionManifest(
    {
      ...input.manifest,
      status: "completed",
      lease: null,
      resultObjectName: buildSessionAudioAuditionResultObjectName(
        input.manifest.jobId,
      ),
      updatedAt: input.now.toISOString(),
    },
    input.manifest.jobId,
  );
}

export function failSessionAudioAuditionManifest(input: {
  manifest: SessionAudioAuditionManifest;
  leaseId: string;
  code: string;
  message: string;
  now: Date;
}) {
  requireLease(input.manifest, input.leaseId);
  return parseSessionAudioAuditionManifest(
    {
      ...input.manifest,
      status: "failed-terminal",
      lease: null,
      resultObjectName: null,
      failure: {
        code: boundedText(input.code, 120),
        message: boundedText(input.message, 2_000),
        failedAt: input.now.toISOString(),
      },
      updatedAt: input.now.toISOString(),
    },
    input.manifest.jobId,
  );
}

function parseSource(value: unknown): SessionAudioAuditionSource {
  const row = record(value);
  const source = {
    bucketName: text(row.bucketName),
    objectName: text(row.objectName),
    generation: text(row.generation),
    sizeBytes: positiveInteger(row.sizeBytes),
    sha256: text(row.sha256).toLowerCase(),
    contentType: text(row.contentType).toLowerCase(),
    durationSeconds: Number(row.durationSeconds),
    roomId: text(row.roomId),
    recordingAssetId: text(row.recordingAssetId),
    finalizationUploadSessionId: text(row.finalizationUploadSessionId),
  };
  if (
    !SAFE_BUCKET.test(source.bucketName) ||
    !SOURCE_OBJECT.test(source.objectName) ||
    !GENERATION.test(source.generation) ||
    !SHA256.test(source.sha256) ||
    !/^(audio|video)\/[a-z0-9.+-]+$/.test(source.contentType) ||
    !Number.isFinite(source.durationSeconds) ||
    source.durationSeconds <= 0 ||
    !SAFE_ID.test(source.roomId) ||
    !SAFE_ID.test(source.recordingAssetId) ||
    !/^[0-9a-f-]{36}$/i.test(source.finalizationUploadSessionId)
  )
    throw new Error("Session audio audition source is invalid.");
  return source;
}

function parseTarget(
  value: unknown,
): Omit<SessionAudioAuditionTarget, "generation"> {
  const row = record(value);
  const target = {
    bucketName: text(row.bucketName),
    objectName: text(row.objectName),
    contentType: row.contentType as "audio/mp4",
    profile: row.profile as typeof SESSION_AUDIO_AUDITION_PROFILE,
  };
  if (
    !SAFE_BUCKET.test(target.bucketName) ||
    !TARGET_OBJECT.test(target.objectName) ||
    target.contentType !== "audio/mp4" ||
    target.profile !== SESSION_AUDIO_AUDITION_PROFILE
  ) {
    throw new Error("Session audio audition target is invalid.");
  }
  return target;
}

function parseTechnical(value: unknown): SessionAudioAuditionTechnicalEvidence {
  const row = record(value);
  const evidence = {
    sourceDurationSeconds: Number(row.sourceDurationSeconds),
    durationSeconds: Number(row.durationSeconds),
    durationDeltaSeconds: Number(row.durationDeltaSeconds),
    sourceAudioOrdinal: Number(row.sourceAudioOrdinal) as 0,
    audioCodec: row.audioCodec as "aac",
    sampleRateHz: Number(row.sampleRateHz) as 48_000,
    channelCount: Number(row.channelCount) as 1 | 2,
    bitRate: Number(row.bitRate),
    hasVideo: row.hasVideo as false,
    decodedToEnd: row.decodedToEnd as true,
  };
  if (
    !Number.isFinite(evidence.sourceDurationSeconds) ||
    evidence.sourceDurationSeconds <= 0 ||
    !Number.isFinite(evidence.durationSeconds) ||
    evidence.durationSeconds <= 0 ||
    !Number.isFinite(evidence.durationDeltaSeconds) ||
    evidence.durationDeltaSeconds < 0 ||
    evidence.durationDeltaSeconds > 0.25 ||
    Math.abs(
      Math.abs(evidence.durationSeconds - evidence.sourceDurationSeconds) -
        evidence.durationDeltaSeconds,
    ) > 0.001 ||
    evidence.sourceAudioOrdinal !== 0 ||
    evidence.audioCodec !== "aac" ||
    evidence.sampleRateHz !== 48_000 ||
    ![1, 2].includes(evidence.channelCount) ||
    !Number.isSafeInteger(evidence.bitRate) ||
    evidence.bitRate < 64_000 ||
    evidence.bitRate > 256_000 ||
    evidence.hasVideo !== false ||
    evidence.decodedToEnd !== true
  ) {
    throw new Error("Session audio audition technical evidence is invalid.");
  }
  return evidence;
}

function parseLease(value: unknown): SessionAudioAuditionLease {
  const row = record(value);
  const lease = {
    id: text(row.id),
    executionId: text(row.executionId),
    claimedAt: text(row.claimedAt),
    expiresAt: text(row.expiresAt),
    attempt: positiveInteger(row.attempt),
  };
  if (
    !lease.id ||
    !lease.executionId ||
    !isIsoDate(lease.claimedAt) ||
    !isIsoDate(lease.expiresAt)
  )
    throw new Error("Session audio audition lease is invalid.");
  return lease;
}

function parseFailure(value: unknown) {
  const row = record(value);
  const failure = {
    code: text(row.code),
    message: text(row.message),
    failedAt: text(row.failedAt),
  };
  if (!failure.code || !failure.message || !isIsoDate(failure.failedAt))
    throw new Error("Session audio audition failure is invalid.");
  return failure;
}

function parseWorker(value: unknown): SessionAudioAuditionResult["worker"] {
  const row = record(value);
  const worker = {
    executionId: text(row.executionId),
    buildId: text(row.buildId),
    imageDigest: row.imageDigest == null ? null : text(row.imageDigest),
    attempt: positiveInteger(row.attempt),
  };
  if (!worker.executionId || !worker.buildId)
    throw new Error("Session audio audition worker evidence is invalid.");
  return worker;
}

function requireLease(manifest: SessionAudioAuditionManifest, leaseId: string) {
  if (manifest.status !== "processing" || manifest.lease?.id !== leaseId)
    throw new Error(
      "Session audio audition lease no longer owns the manifest.",
    );
}

function requiredJobId(value: string) {
  const id = normalizeSessionAudioAuditionJobId(value);
  if (!id) throw new Error("Session audio audition job id is invalid.");
  return id;
}

function requiredId(value: string, label: string) {
  const id = value.trim();
  if (!SAFE_ID.test(id))
    throw new Error(`Session audio audition ${label} is invalid.`);
  return id;
}

function positiveInteger(value: unknown) {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number <= 0)
    throw new Error("Expected a positive safe integer.");
  return number;
}

function record(value: unknown): Record<string, any> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, any>)
    : {};
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}
function isIsoDate(value: unknown) {
  const parsed = Date.parse(text(value));
  return Number.isFinite(parsed);
}
function isEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}
function boundedText(value: string, maximum: number) {
  const normalized = value.trim();
  if (!normalized) throw new Error("Required text is missing.");
  return normalized.slice(0, maximum);
}
