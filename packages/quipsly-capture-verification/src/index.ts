export const LONG_SOURCE_VERIFICATION_VERSION = 1 as const;
export const LONG_SOURCE_QUEUE_CONTRACT =
  "quipsly-mobile-capture-long-verification-queue-v1" as const;
export const LONG_SOURCE_QUEUE_PREFIX =
  "media-vault/control/mobile-capture-verification-queue" as const;
export const LONG_SOURCE_DEAD_LETTER_PREFIX =
  "media-vault/control/mobile-capture-verification-dead-letter" as const;
export const SYNCHRONOUS_CAPTURE_VERIFICATION_LIMIT_BYTES =
  2 * 1024 * 1024 * 1024;
export const MAX_LONG_VIDEO_SOURCE_BYTES = 128 * 1024 * 1024 * 1024;

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const SHA256_PATTERN = /^[0-9a-f]{64}$/;
const SAFE_OBJECT_NAME_PATTERN =
  /^media-vault\/recordings\/[a-zA-Z0-9/_\-.]+$/;

export type LongSourceVerificationStatus =
  | "queued"
  | "verifying"
  | "bytes-verified"
  | "failed-terminal";

export type LongSourceVerificationLease = {
  id: string;
  executionId: string;
  claimedAt: string;
  expiresAt: string;
  attempt: number;
};

export type LongSourceByteEvidence = {
  expectedSha256: string;
  computedSha256: string;
  expectedSizeBytes: number;
  streamedSizeBytes: number;
  bucketName: string;
  objectName: string;
  generation: string;
  crc32c: string | null;
  md5Hash: string | null;
  workerBuildId: string;
  workerImageDigest: string | null;
  verifiedAt: string;
};

export type LongSourceVerificationState = {
  version: typeof LONG_SOURCE_VERIFICATION_VERSION;
  status: LongSourceVerificationStatus;
  queueObjectName: string;
  queuedAt: string;
  objectGeneration: string;
  lease: LongSourceVerificationLease | null;
  evidence: LongSourceByteEvidence | null;
  failure: {
    code: string;
    message: string;
    failedAt: string;
  } | null;
};

export type LongSourceQueueReceipt = {
  kind: typeof LONG_SOURCE_QUEUE_CONTRACT;
  version: typeof LONG_SOURCE_VERIFICATION_VERSION;
  uploadSessionId: string;
  manifestObjectName: string;
  manifestGeneration: string;
  enqueuedAt: string;
};

export type LongSourceWorkerManifest = {
  kind: "quipsly-mobile-capture-gcs-resumable-v2";
  version: 2;
  uploadSessionId: string;
  sourceType: "video";
  expectedSizeBytes: number;
  sha256: string;
  contentType: string;
  bucketName: string;
  objectName: string;
  actorUserId: string;
  projectId: string;
  projectSlug: string;
  recordingConsentId: string;
  captureId: string;
  startReceiptId: string | null;
  consentVersion: string | null;
  processingDisposition: "eligible" | "preservation-only";
  roomReadinessBindingVersion: 0 | 1;
  longSourceVerification: LongSourceVerificationState;
};

export function normalizeUploadSessionId(value: string) {
  const normalized = value.trim().toLowerCase();
  return UUID_PATTERN.test(normalized) ? normalized : null;
}

export function buildLongSourceQueueObjectName(uploadSessionId: string) {
  const normalized = normalizeUploadSessionId(uploadSessionId);
  if (!normalized) throw new Error("Upload session ID must be a UUID.");
  return `${LONG_SOURCE_QUEUE_PREFIX}/${normalized}.json`;
}

export function buildLongSourceDeadLetterObjectName(uploadSessionId: string) {
  const normalized = normalizeUploadSessionId(uploadSessionId);
  if (!normalized) throw new Error("Upload session ID must be a UUID.");
  return `${LONG_SOURCE_DEAD_LETTER_PREFIX}/${normalized}.json`;
}

export function parseLongSourceQueueReceipt(
  value: unknown,
): LongSourceQueueReceipt {
  const candidate = asRecord(value);
  const uploadSessionId = string(candidate.uploadSessionId)?.toLowerCase() ?? "";
  const expectedManifestName =
    `media-vault/control/mobile-capture-resumable/${uploadSessionId}.json`;
  if (
    candidate.kind !== LONG_SOURCE_QUEUE_CONTRACT ||
    candidate.version !== LONG_SOURCE_VERIFICATION_VERSION ||
    !normalizeUploadSessionId(uploadSessionId) ||
    candidate.manifestObjectName !== expectedManifestName ||
    !nonempty(string(candidate.manifestGeneration)) ||
    !isIsoDate(candidate.enqueuedAt)
  ) {
    throw new Error("Long-source queue receipt is invalid.");
  }
  return {
    kind: LONG_SOURCE_QUEUE_CONTRACT,
    version: LONG_SOURCE_VERIFICATION_VERSION,
    uploadSessionId,
    manifestObjectName: expectedManifestName,
    manifestGeneration: string(candidate.manifestGeneration)!,
    enqueuedAt: string(candidate.enqueuedAt)!,
  };
}

export function parseLongSourceWorkerManifest(
  value: unknown,
  expectedUploadSessionId: string,
): LongSourceWorkerManifest {
  const candidate = asRecord(value);
  const uploadSessionId = normalizeUploadSessionId(expectedUploadSessionId);
  const state = parseLongSourceVerificationState(
    candidate.longSourceVerification,
    expectedUploadSessionId,
  );
  const sha256 = string(candidate.sha256)?.toLowerCase() ?? "";
  const captureId = normalizeUploadSessionId(
    string(candidate.captureId)?.toLowerCase() ?? "",
  );
  const size = Number(candidate.expectedSizeBytes);
  const objectName = string(candidate.objectName) ?? "";
  const contentType = string(candidate.contentType)?.toLowerCase() ?? "";
  if (
    !uploadSessionId ||
    candidate.kind !== "quipsly-mobile-capture-gcs-resumable-v2" ||
    candidate.version !== 2 ||
    candidate.uploadSessionId !== uploadSessionId ||
    candidate.sourceType !== "video" ||
    !Number.isSafeInteger(size) ||
    size <= SYNCHRONOUS_CAPTURE_VERIFICATION_LIMIT_BYTES ||
    size > MAX_LONG_VIDEO_SOURCE_BYTES ||
    !SHA256_PATTERN.test(sha256) ||
    !contentType.startsWith("video/") ||
    !SAFE_OBJECT_NAME_PATTERN.test(objectName) ||
    !nonempty(string(candidate.bucketName)) ||
    !nonempty(string(candidate.actorUserId)) ||
    !nonempty(string(candidate.projectId)) ||
    !nonempty(string(candidate.projectSlug)) ||
    !nonempty(string(candidate.recordingConsentId)) ||
    !captureId ||
    candidate.captureId !== captureId ||
    !["eligible", "preservation-only"].includes(
      string(candidate.processingDisposition) ?? "",
    ) ||
    Number(candidate.roomReadinessBindingVersion) !== 1 ||
    !nonempty(string(candidate.startReceiptId)) ||
    !SHA256_PATTERN.test(string(candidate.consentVersion) ?? "")
  ) {
    throw new Error("Long-source upload manifest is invalid.");
  }
  return {
    kind: "quipsly-mobile-capture-gcs-resumable-v2",
    version: 2,
    uploadSessionId,
    sourceType: "video",
    expectedSizeBytes: size,
    sha256,
    contentType,
    bucketName: string(candidate.bucketName)!,
    objectName,
    actorUserId: string(candidate.actorUserId)!,
    projectId: string(candidate.projectId)!,
    projectSlug: string(candidate.projectSlug)!,
    recordingConsentId: string(candidate.recordingConsentId)!,
    captureId,
    startReceiptId: string(candidate.startReceiptId)!,
    consentVersion: string(candidate.consentVersion)!,
    processingDisposition: candidate.processingDisposition as
      | "eligible"
      | "preservation-only",
    roomReadinessBindingVersion: 1,
    longSourceVerification: state,
  };
}

export function parseLongSourceVerificationState(
  value: unknown,
  uploadSessionId: string,
): LongSourceVerificationState {
  const candidate = asRecord(value);
  const status = string(candidate.status);
  const queueObjectName = buildLongSourceQueueObjectName(uploadSessionId);
  if (
    candidate.version !== LONG_SOURCE_VERIFICATION_VERSION ||
    !["queued", "verifying", "bytes-verified", "failed-terminal"].includes(
      status ?? "",
    ) ||
    candidate.queueObjectName !== queueObjectName ||
    !isIsoDate(candidate.queuedAt) ||
    !nonempty(string(candidate.objectGeneration))
  ) {
    throw new Error("Long-source verification state is invalid.");
  }
  const lease = candidate.lease == null ? null : parseLease(candidate.lease);
  const evidence =
    candidate.evidence == null ? null : parseEvidence(candidate.evidence);
  const failure =
    candidate.failure == null ? null : parseFailure(candidate.failure);
  if (
    (status === "verifying" && !lease) ||
    (status !== "verifying" && lease) ||
    (status === "bytes-verified" && !evidence) ||
    (status !== "bytes-verified" && evidence) ||
    (status === "failed-terminal" && !failure) ||
    (status !== "failed-terminal" && failure)
  ) {
    throw new Error("Long-source verification state has contradictory evidence.");
  }
  return {
    version: LONG_SOURCE_VERIFICATION_VERSION,
    status: status as LongSourceVerificationStatus,
    queueObjectName,
    queuedAt: string(candidate.queuedAt)!,
    objectGeneration: string(candidate.objectGeneration)!,
    lease,
    evidence,
    failure,
  };
}

export function newLongSourceQueuedState(input: {
  uploadSessionId: string;
  objectGeneration: string;
  queuedAt: string;
}): LongSourceVerificationState {
  if (!nonempty(input.objectGeneration) || !isIsoDate(input.queuedAt)) {
    throw new Error("Long-source queue evidence is incomplete.");
  }
  return {
    version: LONG_SOURCE_VERIFICATION_VERSION,
    status: "queued",
    queueObjectName: buildLongSourceQueueObjectName(input.uploadSessionId),
    queuedAt: input.queuedAt,
    objectGeneration: input.objectGeneration,
    lease: null,
    evidence: null,
    failure: null,
  };
}

export function claimLongSourceVerification(input: {
  state: LongSourceVerificationState;
  leaseId: string;
  executionId: string;
  now: Date;
  leaseDurationMs: number;
}): LongSourceVerificationState | null {
  const { state, now } = input;
  const claimable =
    state.status === "queued" ||
    (state.status === "verifying" &&
      new Date(state.lease!.expiresAt).getTime() <= now.getTime());
  if (
    !claimable ||
    !nonempty(input.leaseId) ||
    !nonempty(input.executionId) ||
    !Number.isSafeInteger(input.leaseDurationMs) ||
    input.leaseDurationMs < 60_000
  ) {
    return null;
  }
  return {
    ...state,
    status: "verifying",
    lease: {
      id: input.leaseId,
      executionId: input.executionId,
      claimedAt: now.toISOString(),
      expiresAt: new Date(
        now.getTime() + input.leaseDurationMs,
      ).toISOString(),
      attempt: (state.lease?.attempt ?? 0) + 1,
    },
    evidence: null,
    failure: null,
  };
}

export function releaseLongSourceVerificationClaim(input: {
  state: LongSourceVerificationState;
  leaseId: string;
}): LongSourceVerificationState | null {
  if (
    input.state.status !== "verifying" ||
    input.state.lease?.id !== input.leaseId
  ) {
    return null;
  }
  return {
    ...input.state,
    status: "queued",
    lease: null,
    evidence: null,
    failure: null,
  };
}

export function completeLongSourceVerification(input: {
  state: LongSourceVerificationState;
  leaseId: string;
  evidence: LongSourceByteEvidence;
}): LongSourceVerificationState {
  const evidence = parseEvidence(input.evidence);
  if (
    input.state.status !== "verifying" ||
    input.state.lease?.id !== input.leaseId ||
    evidence.generation !== input.state.objectGeneration ||
    evidence.expectedSha256 !== evidence.computedSha256 ||
    evidence.expectedSizeBytes !== evidence.streamedSizeBytes
  ) {
    throw new Error("Long-source completion does not match its active claim.");
  }
  return {
    ...input.state,
    status: "bytes-verified",
    lease: null,
    evidence,
    failure: null,
  };
}

export function failLongSourceVerification(input: {
  state: LongSourceVerificationState;
  leaseId: string;
  code: string;
  message: string;
  failedAt: string;
}): LongSourceVerificationState {
  if (
    input.state.status !== "verifying" ||
    input.state.lease?.id !== input.leaseId ||
    !/^[a-z0-9][a-z0-9-]{0,95}$/.test(input.code) ||
    !nonempty(input.message) ||
    input.message.length > 512 ||
    !isIsoDate(input.failedAt)
  ) {
    throw new Error("Long-source terminal failure is invalid.");
  }
  return {
    ...input.state,
    status: "failed-terminal",
    lease: null,
    evidence: null,
    failure: {
      code: input.code,
      message: input.message,
      failedAt: input.failedAt,
    },
  };
}

function parseLease(value: unknown): LongSourceVerificationLease {
  const candidate = asRecord(value);
  const attempt = Number(candidate.attempt);
  if (
    !nonempty(string(candidate.id)) ||
    !nonempty(string(candidate.executionId)) ||
    !isIsoDate(candidate.claimedAt) ||
    !isIsoDate(candidate.expiresAt) ||
    new Date(string(candidate.expiresAt)!).getTime() <=
      new Date(string(candidate.claimedAt)!).getTime() ||
    !Number.isSafeInteger(attempt) ||
    attempt < 1
  ) {
    throw new Error("Long-source verification lease is invalid.");
  }
  return {
    id: string(candidate.id)!,
    executionId: string(candidate.executionId)!,
    claimedAt: string(candidate.claimedAt)!,
    expiresAt: string(candidate.expiresAt)!,
    attempt,
  };
}

function parseEvidence(value: unknown): LongSourceByteEvidence {
  const candidate = asRecord(value);
  const expectedSizeBytes = Number(candidate.expectedSizeBytes);
  const streamedSizeBytes = Number(candidate.streamedSizeBytes);
  const expectedSha256 = string(candidate.expectedSha256)?.toLowerCase() ?? "";
  const computedSha256 = string(candidate.computedSha256)?.toLowerCase() ?? "";
  if (
    !SHA256_PATTERN.test(expectedSha256) ||
    !SHA256_PATTERN.test(computedSha256) ||
    !Number.isSafeInteger(expectedSizeBytes) ||
    expectedSizeBytes <= 0 ||
    !Number.isSafeInteger(streamedSizeBytes) ||
    streamedSizeBytes <= 0 ||
    !nonempty(string(candidate.bucketName)) ||
    !SAFE_OBJECT_NAME_PATTERN.test(string(candidate.objectName) ?? "") ||
    !nonempty(string(candidate.generation)) ||
    !nonempty(string(candidate.workerBuildId)) ||
    !isIsoDate(candidate.verifiedAt)
  ) {
    throw new Error("Long-source byte evidence is invalid.");
  }
  return {
    expectedSha256,
    computedSha256,
    expectedSizeBytes,
    streamedSizeBytes,
    bucketName: string(candidate.bucketName)!,
    objectName: string(candidate.objectName)!,
    generation: string(candidate.generation)!,
    crc32c: nullableString(candidate.crc32c),
    md5Hash: nullableString(candidate.md5Hash),
    workerBuildId: string(candidate.workerBuildId)!,
    workerImageDigest: nullableString(candidate.workerImageDigest),
    verifiedAt: string(candidate.verifiedAt)!,
  };
}

function parseFailure(value: unknown) {
  const candidate = asRecord(value);
  const code = string(candidate.code) ?? "";
  const message = string(candidate.message) ?? "";
  if (
    !/^[a-z0-9][a-z0-9-]{0,95}$/.test(code) ||
    !nonempty(message) ||
    message.length > 512 ||
    !isIsoDate(candidate.failedAt)
  ) {
    throw new Error("Long-source failure evidence is invalid.");
  }
  return { code, message, failedAt: string(candidate.failedAt)! };
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Expected an object.");
  }
  return value as Record<string, unknown>;
}

function string(value: unknown) {
  return typeof value === "string" ? value : null;
}

function nullableString(value: unknown) {
  return value == null ? null : nonempty(string(value)) ? string(value) : null;
}

function nonempty(value: string | null | undefined) {
  return Boolean(value?.trim());
}

function isIsoDate(value: unknown) {
  if (typeof value !== "string" || !value) return false;
  const parsed = new Date(value);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString() === value;
}
