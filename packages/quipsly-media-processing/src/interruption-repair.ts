export const INTERRUPTION_REPAIR_CONTRACT_VERSION = 1 as const;
export const INTERRUPTION_REPAIR_MANIFEST_KIND =
  "quipsly-interruption-repair-manifest-v1" as const;
export const INTERRUPTION_REPAIR_QUEUE_KIND =
  "quipsly-interruption-repair-queue-v1" as const;
export const INTERRUPTION_REPAIR_RESULT_KIND =
  "quipsly-interruption-repair-result-v1" as const;
export const INTERRUPTION_REPAIR_CONTROL_PREFIX =
  "media-vault/control/interruption-repair" as const;
export const INTERRUPTION_REPAIR_MANIFEST_PREFIX =
  `${INTERRUPTION_REPAIR_CONTROL_PREFIX}/manifests` as const;
export const INTERRUPTION_REPAIR_QUEUE_PREFIX =
  `${INTERRUPTION_REPAIR_CONTROL_PREFIX}/queue` as const;
export const INTERRUPTION_REPAIR_RESULT_PREFIX =
  `${INTERRUPTION_REPAIR_CONTROL_PREFIX}/results` as const;
export const INTERRUPTION_REPAIR_DEAD_LETTER_PREFIX =
  `${INTERRUPTION_REPAIR_CONTROL_PREFIX}/dead-letter` as const;
export const INTERRUPTION_REPAIR_PROFILE =
  "lossless-container-remux-v1" as const;

const SAFE_ID = /^[A-Za-z0-9_-]{8,128}$/;
const SAFE_PATH_PART = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const SAFE_BUCKET = /^[a-z0-9][a-z0-9._-]{1,221}[a-z0-9]$/;
const SAFE_SOURCE_OBJECT = /^media-vault\/recordings\/[A-Za-z0-9/_\-.]+$/;
const SAFE_TARGET_OBJECT = /^media-vault\/repair\/[A-Za-z0-9/_\-.]+\.webm$/;
const GENERATION = /^[1-9][0-9]*$/;
const SHA256 = /^[0-9a-f]{64}$/;

export type InterruptionRepairLease = {
  id: string;
  executionId: string;
  claimedAt: string;
  expiresAt: string;
  attempt: number;
};

export type InterruptionRepairSource = {
  bucketName: string;
  objectName: string;
  generation: string;
  sizeBytes: number;
  sha256: string;
  contentType: string;
  recordingAssetId: string;
  uploadSessionId: string;
};

export type InterruptionRepairTarget = {
  bucketName: string;
  objectName: string;
  contentType: "audio/webm" | "video/webm";
  profile: typeof INTERRUPTION_REPAIR_PROFILE;
};

export type InterruptionRepairStatus =
  | "queued"
  | "processing"
  | "completed"
  | "failed-terminal";

export type InterruptionRepairManifest = {
  kind: typeof INTERRUPTION_REPAIR_MANIFEST_KIND;
  version: typeof INTERRUPTION_REPAIR_CONTRACT_VERSION;
  jobId: string;
  projectId: string;
  projectSlug: string;
  actorUserId: string;
  actorEmail: string;
  captureId: string;
  captureGroupId: string;
  source: InterruptionRepairSource;
  target: InterruptionRepairTarget;
  status: InterruptionRepairStatus;
  queuedAt: string;
  updatedAt: string;
  lease: InterruptionRepairLease | null;
  resultObjectName: string | null;
  failure: { code: string; message: string; failedAt: string } | null;
  originalRemainsSourceTruth: true;
};

export type InterruptionRepairQueueReceipt = {
  kind: typeof INTERRUPTION_REPAIR_QUEUE_KIND;
  version: typeof INTERRUPTION_REPAIR_CONTRACT_VERSION;
  jobId: string;
  manifestObjectName: string;
  manifestGeneration: string;
  enqueuedAt: string;
};

export type InterruptionRepairTechnicalEvidence = {
  durationSeconds: number;
  streamCount: number;
  hasAudio: boolean;
  hasVideo: boolean;
  audioCodec: string | null;
  videoCodec: string | null;
  decodedToEnd: true;
  packetPayloadReencoded: false;
};

export type InterruptionRepairResult = {
  kind: typeof INTERRUPTION_REPAIR_RESULT_KIND;
  version: typeof INTERRUPTION_REPAIR_CONTRACT_VERSION;
  jobId: string;
  manifestObjectName: string;
  source: InterruptionRepairSource;
  output: InterruptionRepairTarget & {
    generation: string;
    sizeBytes: number;
    sha256: string;
    crc32c: string;
    metadata: InterruptionRepairTechnicalEvidence;
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

export function normalizeInterruptionRepairJobId(value: string) {
  const normalized = value.trim();
  return SAFE_ID.test(normalized) ? normalized : null;
}

export function buildInterruptionRepairManifestObjectName(jobId: string) {
  return `${INTERRUPTION_REPAIR_MANIFEST_PREFIX}/${requiredJobId(jobId)}.json`;
}

export function buildInterruptionRepairQueueObjectName(jobId: string) {
  return `${INTERRUPTION_REPAIR_QUEUE_PREFIX}/${requiredJobId(jobId)}.json`;
}

export function buildInterruptionRepairResultObjectName(jobId: string) {
  return `${INTERRUPTION_REPAIR_RESULT_PREFIX}/${requiredJobId(jobId)}.json`;
}

export function buildInterruptionRepairDeadLetterObjectName(jobId: string) {
  return `${INTERRUPTION_REPAIR_DEAD_LETTER_PREFIX}/${requiredJobId(jobId)}.json`;
}

export function buildInterruptionRepairTargetObjectName(input: {
  projectSlug: string;
  recordingAssetId: string;
  jobId: string;
}) {
  return [
    "media-vault/repair",
    safePathPart(input.projectSlug),
    safePathPart(input.recordingAssetId),
    `${requiredJobId(input.jobId)}.webm`,
  ].join("/");
}

export function newInterruptionRepairManifest(
  input: Omit<
    InterruptionRepairManifest,
    "kind" | "version" | "status" | "lease" | "resultObjectName" | "failure" | "originalRemainsSourceTruth"
  >,
) {
  return parseInterruptionRepairManifest({
    ...input,
    kind: INTERRUPTION_REPAIR_MANIFEST_KIND,
    version: INTERRUPTION_REPAIR_CONTRACT_VERSION,
    status: "queued",
    lease: null,
    resultObjectName: null,
    failure: null,
    originalRemainsSourceTruth: true,
  }, input.jobId);
}

export function parseInterruptionRepairManifest(
  value: unknown,
  expectedJobId?: string,
): InterruptionRepairManifest {
  const row = record(value);
  const jobId = text(row.jobId);
  const source = parseSource(row.source);
  const target = parseTarget(row.target);
  const status = text(row.status) as InterruptionRepairStatus;
  const lease = row.lease == null ? null : parseLease(row.lease);
  const resultObjectName = row.resultObjectName == null
    ? null
    : text(row.resultObjectName);
  const failure = row.failure == null ? null : parseFailure(row.failure);
  const manifest: InterruptionRepairManifest = {
    kind: row.kind as InterruptionRepairManifest["kind"],
    version: Number(row.version) as 1,
    jobId,
    projectId: text(row.projectId),
    projectSlug: text(row.projectSlug),
    actorUserId: text(row.actorUserId),
    actorEmail: text(row.actorEmail).toLowerCase(),
    captureId: text(row.captureId),
    captureGroupId: text(row.captureGroupId),
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
    manifest.kind !== INTERRUPTION_REPAIR_MANIFEST_KIND
    || manifest.version !== INTERRUPTION_REPAIR_CONTRACT_VERSION
    || !normalizeInterruptionRepairJobId(jobId)
    || (expectedJobId && jobId !== expectedJobId)
    || !SAFE_ID.test(manifest.projectId)
    || !SAFE_PATH_PART.test(manifest.projectSlug)
    || !SAFE_ID.test(manifest.actorUserId)
    || !isEmail(manifest.actorEmail)
    || !manifest.captureId
    || !manifest.captureGroupId
    || source.bucketName !== target.bucketName
    || !isIsoDate(manifest.queuedAt)
    || !isIsoDate(manifest.updatedAt)
    || !["queued", "processing", "completed", "failed-terminal"].includes(status)
    || (status === "processing") !== Boolean(lease)
    || (status === "completed") !== Boolean(resultObjectName)
    || (status === "failed-terminal") !== Boolean(failure)
    || (resultObjectName !== null
      && resultObjectName !== buildInterruptionRepairResultObjectName(jobId))
    || target.objectName !== buildInterruptionRepairTargetObjectName({
      projectSlug: manifest.projectSlug,
      recordingAssetId: source.recordingAssetId,
      jobId,
    })
    || manifest.originalRemainsSourceTruth !== true
  ) {
    throw new Error("Interruption repair manifest is invalid.");
  }
  return manifest;
}

export function parseInterruptionRepairQueueReceipt(
  value: unknown,
): InterruptionRepairQueueReceipt {
  const row = record(value);
  const receipt: InterruptionRepairQueueReceipt = {
    kind: row.kind as InterruptionRepairQueueReceipt["kind"],
    version: Number(row.version) as 1,
    jobId: text(row.jobId),
    manifestObjectName: text(row.manifestObjectName),
    manifestGeneration: text(row.manifestGeneration),
    enqueuedAt: text(row.enqueuedAt),
  };
  if (
    receipt.kind !== INTERRUPTION_REPAIR_QUEUE_KIND
    || receipt.version !== INTERRUPTION_REPAIR_CONTRACT_VERSION
    || !normalizeInterruptionRepairJobId(receipt.jobId)
    || receipt.manifestObjectName !== buildInterruptionRepairManifestObjectName(receipt.jobId)
    || !GENERATION.test(receipt.manifestGeneration)
    || !isIsoDate(receipt.enqueuedAt)
  ) {
    throw new Error("Interruption repair queue receipt is invalid.");
  }
  return receipt;
}

export function claimInterruptionRepairManifest(input: {
  manifest: InterruptionRepairManifest;
  leaseId: string;
  executionId: string;
  now: Date;
  leaseDurationMs: number;
}) {
  if (input.manifest.status === "completed" || input.manifest.status === "failed-terminal") return null;
  if (
    input.manifest.status === "processing"
    && input.manifest.lease
    && Date.parse(input.manifest.lease.expiresAt) > input.now.getTime()
  ) return null;
  if (
    !normalizeInterruptionRepairJobId(input.leaseId)
    || !input.executionId.trim()
    || !Number.isSafeInteger(input.leaseDurationMs)
    || input.leaseDurationMs < 60_000
  ) throw new Error("Interruption repair lease binding is invalid.");
  return parseInterruptionRepairManifest({
    ...input.manifest,
    status: "processing",
    updatedAt: input.now.toISOString(),
    lease: {
      id: input.leaseId,
      executionId: input.executionId.trim(),
      claimedAt: input.now.toISOString(),
      expiresAt: new Date(input.now.getTime() + input.leaseDurationMs).toISOString(),
      attempt: (input.manifest.lease?.attempt ?? 0) + 1,
    },
    resultObjectName: null,
    failure: null,
  }, input.manifest.jobId);
}

export function completeInterruptionRepairManifest(input: {
  manifest: InterruptionRepairManifest;
  leaseId: string;
  result: InterruptionRepairResult;
  now: Date;
}) {
  assertLease(input.manifest, input.leaseId);
  parseInterruptionRepairResult(input.result, input.manifest);
  return parseInterruptionRepairManifest({
    ...input.manifest,
    status: "completed",
    updatedAt: input.now.toISOString(),
    lease: null,
    resultObjectName: buildInterruptionRepairResultObjectName(input.manifest.jobId),
    failure: null,
  }, input.manifest.jobId);
}

export function releaseInterruptionRepairLease(input: {
  manifest: InterruptionRepairManifest;
  leaseId: string;
  now: Date;
}) {
  assertLease(input.manifest, input.leaseId);
  return parseInterruptionRepairManifest({
    ...input.manifest,
    status: "queued",
    updatedAt: input.now.toISOString(),
    lease: null,
    resultObjectName: null,
    failure: null,
  }, input.manifest.jobId);
}

export function failInterruptionRepairManifest(input: {
  manifest: InterruptionRepairManifest;
  leaseId: string;
  code: string;
  message: string;
  now: Date;
}) {
  assertLease(input.manifest, input.leaseId);
  if (!input.code.trim() || !input.message.trim()) throw new Error("Repair failure evidence is incomplete.");
  return parseInterruptionRepairManifest({
    ...input.manifest,
    status: "failed-terminal",
    updatedAt: input.now.toISOString(),
    lease: null,
    resultObjectName: null,
    failure: {
      code: input.code.trim(),
      message: input.message.trim(),
      failedAt: input.now.toISOString(),
    },
  }, input.manifest.jobId);
}

export function parseInterruptionRepairResult(
  value: unknown,
  manifest: InterruptionRepairManifest,
): InterruptionRepairResult {
  const row = record(value);
  const outputRow = record(row.output);
  const metadataRow = record(outputRow.metadata);
  const workerRow = record(row.worker);
  const result: InterruptionRepairResult = {
    kind: row.kind as InterruptionRepairResult["kind"],
    version: Number(row.version) as 1,
    jobId: text(row.jobId),
    manifestObjectName: text(row.manifestObjectName),
    source: parseSource(row.source),
    output: {
      ...parseTarget(outputRow),
      generation: text(outputRow.generation),
      sizeBytes: positiveInteger(outputRow.sizeBytes),
      sha256: text(outputRow.sha256).toLowerCase(),
      crc32c: text(outputRow.crc32c),
      metadata: {
        durationSeconds: positiveNumber(metadataRow.durationSeconds),
        streamCount: positiveInteger(metadataRow.streamCount),
        hasAudio: metadataRow.hasAudio === true,
        hasVideo: metadataRow.hasVideo === true,
        audioCodec: text(metadataRow.audioCodec) || null,
        videoCodec: text(metadataRow.videoCodec) || null,
        decodedToEnd: metadataRow.decodedToEnd as true,
        packetPayloadReencoded: metadataRow.packetPayloadReencoded as false,
      },
    },
    worker: {
      executionId: text(workerRow.executionId),
      buildId: text(workerRow.buildId),
      imageDigest: text(workerRow.imageDigest) || null,
      attempt: positiveInteger(workerRow.attempt),
    },
    completedAt: text(row.completedAt),
    originalRemainsSourceTruth: row.originalRemainsSourceTruth as true,
  };
  if (
    result.kind !== INTERRUPTION_REPAIR_RESULT_KIND
    || result.version !== INTERRUPTION_REPAIR_CONTRACT_VERSION
    || result.jobId !== manifest.jobId
    || result.manifestObjectName !== buildInterruptionRepairManifestObjectName(manifest.jobId)
    || !sameSource(result.source, manifest.source)
    || !sameTarget(result.output, manifest.target)
    || !GENERATION.test(result.output.generation)
    || !SHA256.test(result.output.sha256)
    || !result.output.crc32c
    || (!result.output.metadata.hasAudio && !result.output.metadata.hasVideo)
    || result.output.metadata.decodedToEnd !== true
    || result.output.metadata.packetPayloadReencoded !== false
    || !result.worker.executionId
    || !result.worker.buildId
    || !isIsoDate(result.completedAt)
    || result.originalRemainsSourceTruth !== true
  ) throw new Error("Interruption repair result is invalid.");
  return result;
}

function parseSource(value: unknown): InterruptionRepairSource {
  const row = record(value);
  const source = {
    bucketName: text(row.bucketName),
    objectName: text(row.objectName),
    generation: text(row.generation),
    sizeBytes: positiveInteger(row.sizeBytes),
    sha256: text(row.sha256).toLowerCase(),
    contentType: text(row.contentType).toLowerCase(),
    recordingAssetId: text(row.recordingAssetId),
    uploadSessionId: text(row.uploadSessionId).toLowerCase(),
  };
  if (
    !SAFE_BUCKET.test(source.bucketName)
    || !SAFE_SOURCE_OBJECT.test(source.objectName)
    || !GENERATION.test(source.generation)
    || !SHA256.test(source.sha256)
    || !["audio/webm", "video/webm"].includes(source.contentType)
    || !SAFE_ID.test(source.recordingAssetId)
    || !SAFE_ID.test(source.uploadSessionId)
  ) throw new Error("Interruption repair source is invalid.");
  return source;
}

function parseTarget(value: unknown): InterruptionRepairTarget {
  const row = record(value);
  const target = {
    bucketName: text(row.bucketName),
    objectName: text(row.objectName),
    contentType: text(row.contentType).toLowerCase() as InterruptionRepairTarget["contentType"],
    profile: text(row.profile) as typeof INTERRUPTION_REPAIR_PROFILE,
  };
  if (
    !SAFE_BUCKET.test(target.bucketName)
    || !SAFE_TARGET_OBJECT.test(target.objectName)
    || !["audio/webm", "video/webm"].includes(target.contentType)
    || target.profile !== INTERRUPTION_REPAIR_PROFILE
  ) throw new Error("Interruption repair target is invalid.");
  return target;
}

function parseLease(value: unknown): InterruptionRepairLease {
  const row = record(value);
  const lease = {
    id: text(row.id),
    executionId: text(row.executionId),
    claimedAt: text(row.claimedAt),
    expiresAt: text(row.expiresAt),
    attempt: positiveInteger(row.attempt),
  };
  if (!normalizeInterruptionRepairJobId(lease.id) || !lease.executionId || !isIsoDate(lease.claimedAt) || !isIsoDate(lease.expiresAt)) {
    throw new Error("Interruption repair lease is invalid.");
  }
  return lease;
}

function parseFailure(value: unknown) {
  const row = record(value);
  const failure = { code: text(row.code), message: text(row.message), failedAt: text(row.failedAt) };
  if (!failure.code || !failure.message || !isIsoDate(failure.failedAt)) throw new Error("Interruption repair failure is invalid.");
  return failure;
}

function sameSource(left: InterruptionRepairSource, right: InterruptionRepairSource) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function sameTarget(left: InterruptionRepairTarget, right: InterruptionRepairTarget) {
  return left.bucketName === right.bucketName
    && left.objectName === right.objectName
    && left.contentType === right.contentType
    && left.profile === right.profile;
}

function assertLease(manifest: InterruptionRepairManifest, leaseId: string) {
  if (manifest.status !== "processing" || manifest.lease?.id !== leaseId) throw new Error("Interruption repair lease is no longer active.");
}

function requiredJobId(value: string) {
  const normalized = normalizeInterruptionRepairJobId(value);
  if (!normalized) throw new Error("Interruption repair job ID is invalid.");
  return normalized;
}

function safePathPart(value: string) {
  const normalized = value.trim();
  if (!SAFE_PATH_PART.test(normalized)) throw new Error("Interruption repair path component is invalid.");
  return normalized;
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function positiveInteger(value: unknown) {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number <= 0) throw new Error("Expected a positive safe integer.");
  return number;
}

function positiveNumber(value: unknown) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) throw new Error("Expected a positive number.");
  return number;
}

function isIsoDate(value: unknown) {
  return typeof value === "string" && value.length > 0 && Number.isFinite(Date.parse(value));
}

function isEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}
