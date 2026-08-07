export const CAPTURE_PROXY_CONTRACT_VERSION = 1 as const;
export * from "./audio-mastery.js";
export * from "./audio-alignment-evidence.js";
export * from "./audio-alignment-job.js";
export * from "./audio-mastery-review.js";
export * from "./audio-delivery.js";
export * from "./episode-program-delivery.js";
export * from "./episode-render-proof.js";
export * from "./spatial-render.js";
export * from "./external-source-proxy.js";
export * from "./source-visual-overview.js";
export * from "./audio-diagnosis-evaluation.js";
export * from "./audio-signal-diagnosis.js";
export * from "./audio-signal-profile.js";
export * from "./audio-spectral-evidence.js";
export * from "./audio-pair-correlation.js";
export * from "./episode-audio-mix.js";
export * from "./studio-source-transcript.js";
export * from "./transcript-terminology.js";
export * from "./transcript-terminology-evaluation.js";
export * from "./audio-treatment.js";
export * from "./audio-dialogue-repair.js";
export * from "./transcription.js";
export * from "./transcript-evaluation.js";
export * from "./transcript-evaluation-report-html.js";
export * from "./transcript-provider-adapters.js";
export * from "./transcript-routing.js";
export const CAPTURE_PROXY_MANIFEST_KIND =
  "quipsly-capture-proxy-manifest-v1" as const;
export const CAPTURE_PROXY_QUEUE_KIND =
  "quipsly-capture-proxy-queue-v1" as const;
export const CAPTURE_PROXY_RESULT_KIND =
  "quipsly-capture-proxy-result-v1" as const;
export const CAPTURE_PROXY_MANIFEST_PREFIX =
  "media-vault/control/capture-proxy/manifests" as const;
export const CAPTURE_PROXY_QUEUE_PREFIX =
  "media-vault/control/capture-proxy/queue" as const;
export const CAPTURE_PROXY_RESULT_PREFIX =
  "media-vault/control/capture-proxy/results" as const;
export const CAPTURE_PROXY_DEAD_LETTER_PREFIX =
  "media-vault/control/capture-proxy/dead-letter" as const;
export const COLLABORATION_PROXY_PROFILE =
  "collaboration-1080p-h264-aac-v1" as const;
export const EPISODE_COLLABORATION_PROXY_JOB_KIND =
  "quipsly-episode-collaboration-proxy-job-v1" as const;
export const EPISODE_COLLABORATION_PROXY_RESULT_KIND =
  "quipsly-episode-collaboration-proxy-result-v1" as const;
export const EPISODE_COLLABORATION_PROXY_CLOUD_MANIFEST_KIND =
  "quipsly-episode-collaboration-proxy-cloud-manifest-v1" as const;
export const EPISODE_COLLABORATION_PROXY_CLOUD_QUEUE_KIND =
  "quipsly-episode-collaboration-proxy-cloud-queue-v1" as const;
export const EPISODE_COLLABORATION_PROXY_CLOUD_CONTROL_PREFIX =
  "media-vault/control/capture-proxy/episode-collaboration" as const;
export const EPISODE_COLLABORATION_PROXY_CLOUD_MANIFEST_PREFIX =
  `${EPISODE_COLLABORATION_PROXY_CLOUD_CONTROL_PREFIX}/manifests` as const;
export const EPISODE_COLLABORATION_PROXY_CLOUD_QUEUE_PREFIX =
  `${EPISODE_COLLABORATION_PROXY_CLOUD_CONTROL_PREFIX}/queue` as const;
export const EPISODE_COLLABORATION_PROXY_CLOUD_RESULT_PREFIX =
  `${EPISODE_COLLABORATION_PROXY_CLOUD_CONTROL_PREFIX}/results` as const;
export const EPISODE_COLLABORATION_PROXY_CLOUD_DEAD_LETTER_PREFIX =
  `${EPISODE_COLLABORATION_PROXY_CLOUD_CONTROL_PREFIX}/dead-letter` as const;

const SAFE_ID = /^[A-Za-z0-9_-]{8,128}$/;
const SAFE_PATH_PART = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const SAFE_BUCKET = /^[a-z0-9][a-z0-9._-]{1,221}[a-z0-9]$/;
const SAFE_SOURCE_OBJECT =
  /^media-vault\/recordings\/[A-Za-z0-9/_\-.]+$/;
const SAFE_PROXY_OBJECT =
  /^media-vault\/proxy\/[A-Za-z0-9/_\-.]+\.mp4$/;
const SHA256 = /^[0-9a-f]{64}$/;
const GENERATION = /^[1-9][0-9]*$/;

export type CaptureProxyStatus =
  | "queued"
  | "processing"
  | "completed"
  | "failed-terminal";

export type CaptureProxyLease = {
  id: string;
  executionId: string;
  claimedAt: string;
  expiresAt: string;
  attempt: number;
};

export type CaptureProxySourceBinding = {
  bucketName: string;
  objectName: string;
  generation: string;
  sizeBytes: number;
  sha256: string;
  contentType: string;
  rawAssetId: string;
  sourceId: string;
  recordingAssetId: string;
  uploadSessionId: string;
};

export type CaptureProxyTargetBinding = {
  bucketName: string;
  objectName: string;
  contentType: "video/mp4";
  profile: "collaboration-1080p-h264-aac-v1";
};

export type CaptureProxyManifest = {
  kind: typeof CAPTURE_PROXY_MANIFEST_KIND;
  version: typeof CAPTURE_PROXY_CONTRACT_VERSION;
  jobId: string;
  projectId: string;
  projectSlug: string;
  episodeSlug: string;
  actorUserId: string;
  actorEmail: string;
  captureId: string;
  captureGroupId: string;
  source: CaptureProxySourceBinding;
  target: CaptureProxyTargetBinding;
  status: CaptureProxyStatus;
  queuedAt: string;
  updatedAt: string;
  lease: CaptureProxyLease | null;
  resultObjectName: string | null;
  failure: {
    code: string;
    message: string;
    failedAt: string;
  } | null;
};

export type CaptureProxyQueueReceipt = {
  kind: typeof CAPTURE_PROXY_QUEUE_KIND;
  version: typeof CAPTURE_PROXY_CONTRACT_VERSION;
  jobId: string;
  manifestObjectName: string;
  manifestGeneration: string;
  enqueuedAt: string;
};

export type CaptureProxyTechnicalEvidence = {
  durationSeconds: number;
  width: number;
  height: number;
  fps: number;
  hasAudio: boolean;
  videoCodec: "h264";
  audioCodec: "aac" | null;
  pixelFormat: "yuv420p";
  fastStart: true;
};

export type CaptureProxyResult = {
  kind: typeof CAPTURE_PROXY_RESULT_KIND;
  version: typeof CAPTURE_PROXY_CONTRACT_VERSION;
  jobId: string;
  manifestObjectName: string;
  source: CaptureProxySourceBinding;
  output: CaptureProxyTargetBinding & {
    generation: string;
    sizeBytes: number;
    sha256: string;
    crc32c: string;
    metadata: CaptureProxyTechnicalEvidence;
  };
  worker: {
    executionId: string;
    buildId: string;
    imageDigest: string | null;
  };
  completedAt: string;
};

export function normalizeCaptureProxyJobId(value: string) {
  const normalized = value.trim();
  return SAFE_ID.test(normalized) ? normalized : null;
}

export function buildCaptureProxyManifestObjectName(jobId: string) {
  return `${CAPTURE_PROXY_MANIFEST_PREFIX}/${requiredJobId(jobId)}.json`;
}

export function buildCaptureProxyQueueObjectName(jobId: string) {
  return `${CAPTURE_PROXY_QUEUE_PREFIX}/${requiredJobId(jobId)}.json`;
}

export function buildCaptureProxyResultObjectName(jobId: string) {
  return `${CAPTURE_PROXY_RESULT_PREFIX}/${requiredJobId(jobId)}.json`;
}

export function buildCaptureProxyDeadLetterObjectName(jobId: string) {
  return `${CAPTURE_PROXY_DEAD_LETTER_PREFIX}/${requiredJobId(jobId)}.json`;
}

export function buildCaptureProxyTargetObjectName(input: {
  projectSlug: string;
  episodeSlug: string;
  rawAssetId: string;
  jobId: string;
}) {
  return [
    "media-vault/proxy",
    safePathPart(input.projectSlug),
    safePathPart(input.episodeSlug),
    safePathPart(input.rawAssetId),
    `capture-${requiredJobId(input.jobId)}.mp4`,
  ].join("/");
}

export function newCaptureProxyManifest(input: Omit<
  CaptureProxyManifest,
  "kind" | "version" | "status" | "lease" | "resultObjectName" | "failure"
>) {
  return parseCaptureProxyManifest({
    ...input,
    kind: CAPTURE_PROXY_MANIFEST_KIND,
    version: CAPTURE_PROXY_CONTRACT_VERSION,
    status: "queued",
    lease: null,
    resultObjectName: null,
    failure: null,
  }, input.jobId);
}

export function parseCaptureProxyQueueReceipt(
  value: unknown,
): CaptureProxyQueueReceipt {
  const row = record(value);
  const jobId = normalizedText(row.jobId);
  if (
    row.kind !== CAPTURE_PROXY_QUEUE_KIND
    || row.version !== CAPTURE_PROXY_CONTRACT_VERSION
    || !normalizeCaptureProxyJobId(jobId)
    || row.manifestObjectName !== buildCaptureProxyManifestObjectName(jobId)
    || !GENERATION.test(normalizedText(row.manifestGeneration))
    || !isIsoDate(row.enqueuedAt)
  ) {
    throw new Error("Capture proxy queue receipt is invalid.");
  }
  return {
    kind: CAPTURE_PROXY_QUEUE_KIND,
    version: CAPTURE_PROXY_CONTRACT_VERSION,
    jobId,
    manifestObjectName: buildCaptureProxyManifestObjectName(jobId),
    manifestGeneration: normalizedText(row.manifestGeneration),
    enqueuedAt: normalizedText(row.enqueuedAt),
  };
}

export function parseCaptureProxyManifest(
  value: unknown,
  expectedJobId?: string,
): CaptureProxyManifest {
  const row = record(value);
  const source = parseSource(row.source);
  const target = parseTarget(row.target);
  const jobId = normalizedText(row.jobId);
  const expected = expectedJobId
    ? normalizeCaptureProxyJobId(expectedJobId)
    : jobId;
  const status = normalizedText(row.status) as CaptureProxyStatus;
  const lease = row.lease == null ? null : parseLease(row.lease);
  const resultObjectName = row.resultObjectName == null
    ? null
    : normalizedText(row.resultObjectName);
  const failure = row.failure == null
    ? null
    : parseFailure(row.failure);
  if (
    row.kind !== CAPTURE_PROXY_MANIFEST_KIND
    || row.version !== CAPTURE_PROXY_CONTRACT_VERSION
    || !expected
    || jobId !== expected
    || !["queued", "processing", "completed", "failed-terminal"].includes(status)
    || !requiredText(row.projectId)
    || !SAFE_PATH_PART.test(normalizedText(row.projectSlug))
    || !SAFE_PATH_PART.test(normalizedText(row.episodeSlug))
    || !requiredText(row.actorUserId)
    || !isEmail(row.actorEmail)
    || !requiredText(row.captureId)
    || !requiredText(row.captureGroupId)
    || !isIsoDate(row.queuedAt)
    || !isIsoDate(row.updatedAt)
    || (status === "processing" && !lease)
    || (status !== "processing" && lease)
    || (
      status === "completed"
      && resultObjectName !== buildCaptureProxyResultObjectName(jobId)
    )
    || (status !== "completed" && resultObjectName)
    || (status === "failed-terminal" && !failure)
    || (status !== "failed-terminal" && failure)
    || target.objectName !== buildCaptureProxyTargetObjectName({
      projectSlug: normalizedText(row.projectSlug),
      episodeSlug: normalizedText(row.episodeSlug),
      rawAssetId: source.rawAssetId,
      jobId,
    })
  ) {
    throw new Error("Capture proxy manifest is invalid.");
  }
  return {
    kind: CAPTURE_PROXY_MANIFEST_KIND,
    version: CAPTURE_PROXY_CONTRACT_VERSION,
    jobId,
    projectId: normalizedText(row.projectId),
    projectSlug: normalizedText(row.projectSlug),
    episodeSlug: normalizedText(row.episodeSlug),
    actorUserId: normalizedText(row.actorUserId),
    actorEmail: normalizedText(row.actorEmail).toLowerCase(),
    captureId: normalizedText(row.captureId),
    captureGroupId: normalizedText(row.captureGroupId),
    source,
    target,
    status,
    queuedAt: normalizedText(row.queuedAt),
    updatedAt: normalizedText(row.updatedAt),
    lease,
    resultObjectName,
    failure,
  };
}

export function parseCaptureProxyResult(
  value: unknown,
  expectedManifest: CaptureProxyManifest,
): CaptureProxyResult {
  const row = record(value);
  const source = parseSource(row.source);
  const outputRow = record(row.output);
  const target = parseTarget(outputRow);
  const metadata = parseTechnicalEvidence(outputRow.metadata);
  const worker = record(row.worker);
  const result: CaptureProxyResult = {
    kind: CAPTURE_PROXY_RESULT_KIND,
    version: CAPTURE_PROXY_CONTRACT_VERSION,
    jobId: normalizedText(row.jobId),
    manifestObjectName: normalizedText(row.manifestObjectName),
    source,
    output: {
      ...target,
      generation: normalizedText(outputRow.generation),
      sizeBytes: positiveSafeInteger(outputRow.sizeBytes),
      sha256: normalizedText(outputRow.sha256).toLowerCase(),
      crc32c: normalizedText(outputRow.crc32c),
      metadata,
    },
    worker: {
      executionId: normalizedText(worker.executionId),
      buildId: normalizedText(worker.buildId),
      imageDigest: worker.imageDigest == null
        ? null
        : normalizedText(worker.imageDigest),
    },
    completedAt: normalizedText(row.completedAt),
  };
  if (
    row.kind !== CAPTURE_PROXY_RESULT_KIND
    || row.version !== CAPTURE_PROXY_CONTRACT_VERSION
    || result.jobId !== expectedManifest.jobId
    || result.manifestObjectName
      !== buildCaptureProxyManifestObjectName(expectedManifest.jobId)
    || !sameSource(result.source, expectedManifest.source)
    || !sameTarget(result.output, expectedManifest.target)
    || !GENERATION.test(result.output.generation)
    || !SHA256.test(result.output.sha256)
    || !result.output.crc32c
    || !result.worker.executionId
    || !result.worker.buildId
    || !isIsoDate(result.completedAt)
  ) {
    throw new Error("Capture proxy result is invalid.");
  }
  return result;
}

export function claimCaptureProxyManifest(input: {
  manifest: CaptureProxyManifest;
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
    !normalizeCaptureProxyJobId(input.leaseId)
    || !requiredText(input.executionId)
    || !Number.isSafeInteger(input.leaseDurationMs)
    || input.leaseDurationMs < 60_000
  ) {
    throw new Error("Capture proxy lease binding is invalid.");
  }
  return parseCaptureProxyManifest({
    ...manifest,
    status: "processing",
    updatedAt: now.toISOString(),
    lease: {
      id: input.leaseId,
      executionId: normalizedText(input.executionId),
      claimedAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + input.leaseDurationMs).toISOString(),
      attempt: (manifest.lease?.attempt ?? 0) + 1,
    },
    resultObjectName: null,
    failure: null,
  }, manifest.jobId);
}

export function releaseCaptureProxyLease(input: {
  manifest: CaptureProxyManifest;
  leaseId: string;
  now: Date;
}) {
  assertActiveLease(input.manifest, input.leaseId);
  return parseCaptureProxyManifest({
    ...input.manifest,
    status: "queued",
    updatedAt: input.now.toISOString(),
    lease: null,
  }, input.manifest.jobId);
}

export function completeCaptureProxyManifest(input: {
  manifest: CaptureProxyManifest;
  leaseId: string;
  result: CaptureProxyResult;
  now: Date;
}) {
  assertActiveLease(input.manifest, input.leaseId);
  parseCaptureProxyResult(input.result, input.manifest);
  return parseCaptureProxyManifest({
    ...input.manifest,
    status: "completed",
    updatedAt: input.now.toISOString(),
    lease: null,
    resultObjectName: buildCaptureProxyResultObjectName(
      input.manifest.jobId,
    ),
    failure: null,
  }, input.manifest.jobId);
}

export function failCaptureProxyManifest(input: {
  manifest: CaptureProxyManifest;
  leaseId: string;
  code: string;
  message: string;
  now: Date;
}) {
  assertActiveLease(input.manifest, input.leaseId);
  if (!requiredText(input.code) || !requiredText(input.message)) {
    throw new Error("Capture proxy failure evidence is incomplete.");
  }
  return parseCaptureProxyManifest({
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

function parseSource(value: unknown): CaptureProxySourceBinding {
  const row = record(value);
  const result: CaptureProxySourceBinding = {
    bucketName: normalizedText(row.bucketName),
    objectName: normalizedText(row.objectName),
    generation: normalizedText(row.generation),
    sizeBytes: positiveSafeInteger(row.sizeBytes),
    sha256: normalizedText(row.sha256).toLowerCase(),
    contentType: normalizedText(row.contentType).toLowerCase(),
    rawAssetId: normalizedText(row.rawAssetId),
    sourceId: normalizedText(row.sourceId),
    recordingAssetId: normalizedText(row.recordingAssetId),
    uploadSessionId: normalizedText(row.uploadSessionId).toLowerCase(),
  };
  if (
    !SAFE_BUCKET.test(result.bucketName)
    || !SAFE_SOURCE_OBJECT.test(result.objectName)
    || !GENERATION.test(result.generation)
    || !SHA256.test(result.sha256)
    || !result.contentType.startsWith("video/")
    || !normalizeCaptureProxyJobId(result.rawAssetId)
    || !normalizeCaptureProxyJobId(result.sourceId)
    || !normalizeCaptureProxyJobId(result.recordingAssetId)
    || !normalizeCaptureProxyJobId(result.uploadSessionId)
  ) {
    throw new Error("Capture proxy source binding is invalid.");
  }
  return result;
}

function parseTarget(value: unknown): CaptureProxyTargetBinding {
  const row = record(value);
  const result: CaptureProxyTargetBinding = {
    bucketName: normalizedText(row.bucketName),
    objectName: normalizedText(row.objectName),
    contentType: "video/mp4",
    profile: "collaboration-1080p-h264-aac-v1",
  };
  if (
    !SAFE_BUCKET.test(result.bucketName)
    || !SAFE_PROXY_OBJECT.test(result.objectName)
    || row.contentType !== result.contentType
    || row.profile !== result.profile
  ) {
    throw new Error("Capture proxy target binding is invalid.");
  }
  return result;
}

function parseTechnicalEvidence(
  value: unknown,
): CaptureProxyTechnicalEvidence {
  const row = record(value);
  const result: CaptureProxyTechnicalEvidence = {
    durationSeconds: finitePositive(row.durationSeconds),
    width: positiveSafeInteger(row.width),
    height: positiveSafeInteger(row.height),
    fps: finitePositive(row.fps),
    hasAudio: row.hasAudio === true,
    videoCodec: "h264",
    audioCodec: row.audioCodec === null ? null : "aac",
    pixelFormat: "yuv420p",
    fastStart: true,
  };
  if (
    row.videoCodec !== result.videoCodec
    || (row.audioCodec !== null && row.audioCodec !== "aac")
    || row.pixelFormat !== result.pixelFormat
    || row.fastStart !== true
  ) {
    throw new Error("Capture proxy technical evidence is invalid.");
  }
  return result;
}

function parseLease(value: unknown): CaptureProxyLease {
  const row = record(value);
  const result = {
    id: normalizedText(row.id),
    executionId: normalizedText(row.executionId),
    claimedAt: normalizedText(row.claimedAt),
    expiresAt: normalizedText(row.expiresAt),
    attempt: positiveSafeInteger(row.attempt),
  };
  if (
    !normalizeCaptureProxyJobId(result.id)
    || !result.executionId
    || !isIsoDate(result.claimedAt)
    || !isIsoDate(result.expiresAt)
    || Date.parse(result.expiresAt) <= Date.parse(result.claimedAt)
  ) {
    throw new Error("Capture proxy lease is invalid.");
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
    throw new Error("Capture proxy failure is invalid.");
  }
  return result;
}

function sameSource(
  left: CaptureProxySourceBinding,
  right: CaptureProxySourceBinding,
) {
  return (
    left.bucketName === right.bucketName
    && left.objectName === right.objectName
    && left.generation === right.generation
    && left.sizeBytes === right.sizeBytes
    && left.sha256 === right.sha256
    && left.contentType === right.contentType
    && left.rawAssetId === right.rawAssetId
    && left.sourceId === right.sourceId
    && left.recordingAssetId === right.recordingAssetId
    && left.uploadSessionId === right.uploadSessionId
  );
}

function sameTarget(
  left: CaptureProxyTargetBinding,
  right: CaptureProxyTargetBinding,
) {
  return left.bucketName === right.bucketName
    && left.objectName === right.objectName
    && left.contentType === right.contentType
    && left.profile === right.profile;
}

function assertActiveLease(
  manifest: CaptureProxyManifest,
  leaseId: string,
) {
  if (
    manifest.status !== "processing"
    || !manifest.lease
    || manifest.lease.id !== leaseId
  ) {
    throw new Error("Capture proxy lease is no longer active.");
  }
}

function requiredJobId(value: string) {
  const normalized = normalizeCaptureProxyJobId(value);
  if (!normalized) throw new Error("Capture proxy job ID is invalid.");
  return normalized;
}

function safePathPart(value: string) {
  const normalized = value.trim();
  if (!SAFE_PATH_PART.test(normalized)) {
    throw new Error("Capture proxy path segment is invalid.");
  }
  return normalized;
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
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
  return normalized.length > 0
    && Number.isFinite(Date.parse(normalized));
}

function positiveSafeInteger(value: unknown) {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error("Expected a positive safe integer.");
  }
  return parsed;
}

function finitePositive(value: unknown) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error("Expected a positive finite number.");
  }
  return parsed;
}

export type EpisodeCollaborationProxyProvider = "local" | "gcs";

export type EpisodeCollaborationProxySource = {
  provider: EpisodeCollaborationProxyProvider;
  locator: string;
  generation: string;
  sizeBytes: number;
  sha256: string;
  contentType: string;
  rawAssetId: string;
  sourceId: string;
};

export type EpisodeCollaborationProxyTarget = {
  provider: EpisodeCollaborationProxyProvider;
  locator: string;
  contentType: "video/mp4";
  profile: typeof COLLABORATION_PROXY_PROFILE;
};

export type EpisodeCollaborationProxyJob = {
  kind: typeof EPISODE_COLLABORATION_PROXY_JOB_KIND;
  version: 1;
  jobId: string;
  projectId: string;
  projectSlug: string;
  episodeProductionId: string;
  episodeSlug: string;
  actorUserId: string | null;
  actorEmail: string;
  queuedAt: string;
  source: EpisodeCollaborationProxySource;
  target: EpisodeCollaborationProxyTarget;
};

export type EpisodeCollaborationProxyResult = {
  kind: typeof EPISODE_COLLABORATION_PROXY_RESULT_KIND;
  version: 1;
  jobId: string;
  completedAt: string;
  source: EpisodeCollaborationProxySource;
  output: {
    provider: EpisodeCollaborationProxyProvider;
    locator: string;
    generation: string;
    sizeBytes: number;
    sha256: string;
    crc32c: string | null;
    contentType: "video/mp4";
    profile: typeof COLLABORATION_PROXY_PROFILE;
    metadata: CaptureProxyTechnicalEvidence;
  };
  worker: {
    executionId: string;
    buildId: string;
    imageDigest: string | null;
    attempt: number;
  };
  originalRemainsSourceTruth: true;
};

export type EpisodeCollaborationProxyCloudStatus =
  | "queued"
  | "processing"
  | "completed"
  | "failed-terminal";

export type EpisodeCollaborationProxyCloudManifest = {
  kind: typeof EPISODE_COLLABORATION_PROXY_CLOUD_MANIFEST_KIND;
  version: 1;
  job: EpisodeCollaborationProxyJob;
  status: EpisodeCollaborationProxyCloudStatus;
  queuedAt: string;
  updatedAt: string;
  lease: CaptureProxyLease | null;
  resultObjectName: string | null;
  failure: {
    code: string;
    message: string;
    failedAt: string;
  } | null;
};

export type EpisodeCollaborationProxyCloudQueueReceipt = {
  kind: typeof EPISODE_COLLABORATION_PROXY_CLOUD_QUEUE_KIND;
  version: 1;
  jobId: string;
  manifestObjectName: string;
  manifestGeneration: string;
  enqueuedAt: string;
};

export function buildEpisodeCollaborationProxyCloudManifestObjectName(jobId: string) {
  return `${EPISODE_COLLABORATION_PROXY_CLOUD_MANIFEST_PREFIX}/${requiredJobId(jobId)}.json`;
}

export function buildEpisodeCollaborationProxyCloudQueueObjectName(jobId: string) {
  return `${EPISODE_COLLABORATION_PROXY_CLOUD_QUEUE_PREFIX}/${requiredJobId(jobId)}.json`;
}

export function buildEpisodeCollaborationProxyCloudResultObjectName(jobId: string) {
  return `${EPISODE_COLLABORATION_PROXY_CLOUD_RESULT_PREFIX}/${requiredJobId(jobId)}.json`;
}

export function buildEpisodeCollaborationProxyCloudDeadLetterObjectName(jobId: string) {
  return `${EPISODE_COLLABORATION_PROXY_CLOUD_DEAD_LETTER_PREFIX}/${requiredJobId(jobId)}.json`;
}

export function newEpisodeCollaborationProxyCloudManifest(
  jobValue: EpisodeCollaborationProxyJob | unknown,
): EpisodeCollaborationProxyCloudManifest {
  const job = parseEpisodeCollaborationProxyJob(jobValue);
  if (job.source.provider !== "gcs" || job.target.provider !== "gcs") {
    throw new Error("Episode collaboration cloud manifest requires a GCS job.");
  }
  return parseEpisodeCollaborationProxyCloudManifest({
    kind: EPISODE_COLLABORATION_PROXY_CLOUD_MANIFEST_KIND,
    version: 1,
    job,
    status: "queued",
    queuedAt: job.queuedAt,
    updatedAt: job.queuedAt,
    lease: null,
    resultObjectName: null,
    failure: null,
  }, job.jobId);
}

export function parseEpisodeCollaborationProxyCloudQueueReceipt(
  value: unknown,
): EpisodeCollaborationProxyCloudQueueReceipt {
  const row = record(value);
  const jobId = normalizedText(row.jobId);
  const receipt: EpisodeCollaborationProxyCloudQueueReceipt = {
    kind: row.kind as EpisodeCollaborationProxyCloudQueueReceipt["kind"],
    version: Number(row.version) as 1,
    jobId,
    manifestObjectName: normalizedText(row.manifestObjectName),
    manifestGeneration: normalizedText(row.manifestGeneration),
    enqueuedAt: normalizedText(row.enqueuedAt),
  };
  if (
    receipt.kind !== EPISODE_COLLABORATION_PROXY_CLOUD_QUEUE_KIND
    || receipt.version !== 1
    || !normalizeCaptureProxyJobId(receipt.jobId)
    || receipt.manifestObjectName !== buildEpisodeCollaborationProxyCloudManifestObjectName(jobId)
    || !GENERATION.test(receipt.manifestGeneration)
    || !isIsoDate(receipt.enqueuedAt)
  ) {
    throw new Error("Episode collaboration proxy cloud queue receipt is invalid.");
  }
  return receipt;
}

export function parseEpisodeCollaborationProxyCloudManifest(
  value: unknown,
  expectedJobId?: string,
): EpisodeCollaborationProxyCloudManifest {
  const row = record(value);
  const job = parseEpisodeCollaborationProxyJob(row.job, expectedJobId);
  const status = normalizedText(row.status) as EpisodeCollaborationProxyCloudStatus;
  const lease = row.lease == null ? null : parseLease(row.lease);
  const resultObjectName = row.resultObjectName == null
    ? null
    : normalizedText(row.resultObjectName);
  const failure = row.failure == null ? null : parseFailure(row.failure);
  const manifest: EpisodeCollaborationProxyCloudManifest = {
    kind: row.kind as EpisodeCollaborationProxyCloudManifest["kind"],
    version: Number(row.version) as 1,
    job,
    status,
    queuedAt: normalizedText(row.queuedAt),
    updatedAt: normalizedText(row.updatedAt),
    lease,
    resultObjectName,
    failure,
  };
  if (
    manifest.kind !== EPISODE_COLLABORATION_PROXY_CLOUD_MANIFEST_KIND
    || manifest.version !== 1
    || job.source.provider !== "gcs"
    || job.target.provider !== "gcs"
    || !validGenerationBoundGcsLocator(job.source.locator, job.source.generation)
    || !isIsoDate(manifest.queuedAt)
    || !isIsoDate(manifest.updatedAt)
    || manifest.queuedAt !== job.queuedAt
    || !["queued", "processing", "completed", "failed-terminal"].includes(status)
    || (status === "processing" && !lease)
    || (status !== "processing" && lease)
    || (
      status === "completed"
      && resultObjectName !== buildEpisodeCollaborationProxyCloudResultObjectName(job.jobId)
    )
    || (status !== "completed" && resultObjectName)
    || (status === "failed-terminal" && !failure)
    || (status !== "failed-terminal" && failure)
  ) {
    throw new Error("Episode collaboration proxy cloud manifest is invalid.");
  }
  return manifest;
}

export function claimEpisodeCollaborationProxyCloudManifest(input: {
  manifest: EpisodeCollaborationProxyCloudManifest;
  leaseId: string;
  executionId: string;
  now: Date;
  leaseDurationMs: number;
}) {
  const { manifest, now } = input;
  if (manifest.status === "completed" || manifest.status === "failed-terminal") return null;
  if (
    manifest.status === "processing"
    && manifest.lease
    && Date.parse(manifest.lease.expiresAt) > now.getTime()
  ) return null;
  if (
    !normalizeCaptureProxyJobId(input.leaseId)
    || !requiredText(input.executionId)
    || !Number.isSafeInteger(input.leaseDurationMs)
    || input.leaseDurationMs < 60_000
  ) {
    throw new Error("Episode collaboration proxy cloud lease binding is invalid.");
  }
  return parseEpisodeCollaborationProxyCloudManifest({
    ...manifest,
    status: "processing",
    updatedAt: now.toISOString(),
    lease: {
      id: input.leaseId,
      executionId: normalizedText(input.executionId),
      claimedAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + input.leaseDurationMs).toISOString(),
      attempt: (manifest.lease?.attempt ?? 0) + 1,
    },
    resultObjectName: null,
    failure: null,
  }, manifest.job.jobId);
}

export function releaseEpisodeCollaborationProxyCloudLease(input: {
  manifest: EpisodeCollaborationProxyCloudManifest;
  leaseId: string;
  now: Date;
}) {
  assertEpisodeCloudLease(input.manifest, input.leaseId);
  return parseEpisodeCollaborationProxyCloudManifest({
    ...input.manifest,
    status: "queued",
    updatedAt: input.now.toISOString(),
    lease: null,
  }, input.manifest.job.jobId);
}

export function completeEpisodeCollaborationProxyCloudManifest(input: {
  manifest: EpisodeCollaborationProxyCloudManifest;
  leaseId: string;
  result: EpisodeCollaborationProxyResult;
  now: Date;
}) {
  assertEpisodeCloudLease(input.manifest, input.leaseId);
  parseEpisodeCollaborationProxyResult(input.result, input.manifest.job);
  return parseEpisodeCollaborationProxyCloudManifest({
    ...input.manifest,
    status: "completed",
    updatedAt: input.now.toISOString(),
    lease: null,
    resultObjectName: buildEpisodeCollaborationProxyCloudResultObjectName(
      input.manifest.job.jobId,
    ),
    failure: null,
  }, input.manifest.job.jobId);
}

export function failEpisodeCollaborationProxyCloudManifest(input: {
  manifest: EpisodeCollaborationProxyCloudManifest;
  leaseId: string;
  code: string;
  message: string;
  now: Date;
}) {
  assertEpisodeCloudLease(input.manifest, input.leaseId);
  if (!requiredText(input.code) || !requiredText(input.message)) {
    throw new Error("Episode collaboration proxy cloud failure evidence is incomplete.");
  }
  return parseEpisodeCollaborationProxyCloudManifest({
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
  }, input.manifest.job.jobId);
}

function assertEpisodeCloudLease(
  manifest: EpisodeCollaborationProxyCloudManifest,
  leaseId: string,
) {
  if (
    manifest.status !== "processing"
    || !manifest.lease
    || manifest.lease.id !== leaseId
  ) {
    throw new Error("Episode collaboration proxy cloud lease is no longer active.");
  }
}

export function buildEpisodeCollaborationProxyTargetLocator(input: {
  projectSlug: string;
  episodeSlug: string;
  rawAssetId: string;
  sourceSha256: string;
}) {
  const sourceSha256 = normalizedText(input.sourceSha256);
  if (!SHA256.test(sourceSha256)) {
    throw new Error("Episode collaboration proxy source SHA-256 is invalid.");
  }
  return [
    "media-vault",
    "proxy",
    "episode-collaboration",
    safePathPart(input.projectSlug),
    safePathPart(input.episodeSlug),
    safePathPart(input.rawAssetId),
    `${COLLABORATION_PROXY_PROFILE}-${sourceSha256.slice(0, 20)}.mp4`,
  ].join("/");
}

export function newEpisodeCollaborationProxyJob(
  input: Omit<EpisodeCollaborationProxyJob, "kind" | "version">,
): EpisodeCollaborationProxyJob {
  return parseEpisodeCollaborationProxyJob({
    kind: EPISODE_COLLABORATION_PROXY_JOB_KIND,
    version: 1,
    ...input,
  });
}

export function parseEpisodeCollaborationProxyJob(
  value: unknown,
  expectedJobId?: string,
): EpisodeCollaborationProxyJob {
  const row = record(value);
  const source = parseEpisodeCollaborationProxySource(row.source);
  const target = parseEpisodeCollaborationProxyTarget(row.target);
  const job: EpisodeCollaborationProxyJob = {
    kind: row.kind as EpisodeCollaborationProxyJob["kind"],
    version: Number(row.version) as 1,
    jobId: normalizedText(row.jobId),
    projectId: normalizedText(row.projectId),
    projectSlug: normalizedText(row.projectSlug),
    episodeProductionId: normalizedText(row.episodeProductionId),
    episodeSlug: normalizedText(row.episodeSlug),
    actorUserId: normalizedText(row.actorUserId) || null,
    actorEmail: normalizedText(row.actorEmail),
    queuedAt: normalizedText(row.queuedAt),
    source,
    target,
  };
  if (
    job.kind !== EPISODE_COLLABORATION_PROXY_JOB_KIND
    || job.version !== 1
    || !normalizeCaptureProxyJobId(job.jobId)
    || (expectedJobId && job.jobId !== expectedJobId)
    || !SAFE_ID.test(job.projectId)
    || !SAFE_PATH_PART.test(job.projectSlug)
    || !SAFE_ID.test(job.episodeProductionId)
    || !SAFE_PATH_PART.test(job.episodeSlug)
    || (job.actorUserId !== null && !SAFE_ID.test(job.actorUserId))
    || !isEmail(job.actorEmail)
    || !isIsoDate(job.queuedAt)
    || source.provider !== target.provider
  ) {
    throw new Error("Episode collaboration proxy job is invalid.");
  }
  return job;
}

export function newEpisodeCollaborationProxyResult(
  input: Omit<EpisodeCollaborationProxyResult, "kind" | "version" | "originalRemainsSourceTruth">,
): EpisodeCollaborationProxyResult {
  return parseEpisodeCollaborationProxyResult({
    kind: EPISODE_COLLABORATION_PROXY_RESULT_KIND,
    version: 1,
    ...input,
    originalRemainsSourceTruth: true,
  });
}

export function parseEpisodeCollaborationProxyResult(
  value: unknown,
  expectedJob?: EpisodeCollaborationProxyJob,
): EpisodeCollaborationProxyResult {
  const row = record(value);
  const source = parseEpisodeCollaborationProxySource(row.source);
  const outputRow = record(row.output);
  const workerRow = record(row.worker);
  const output = {
    provider: normalizedText(outputRow.provider) as EpisodeCollaborationProxyProvider,
    locator: normalizedText(outputRow.locator),
    generation: normalizedText(outputRow.generation),
    sizeBytes: positiveSafeInteger(outputRow.sizeBytes),
    sha256: normalizedText(outputRow.sha256),
    crc32c: normalizedText(outputRow.crc32c) || null,
    contentType: normalizedText(outputRow.contentType) as "video/mp4",
    profile: normalizedText(outputRow.profile) as typeof COLLABORATION_PROXY_PROFILE,
    metadata: parseTechnicalEvidence(outputRow.metadata),
  };
  const result: EpisodeCollaborationProxyResult = {
    kind: row.kind as EpisodeCollaborationProxyResult["kind"],
    version: Number(row.version) as 1,
    jobId: normalizedText(row.jobId),
    completedAt: normalizedText(row.completedAt),
    source,
    output,
    worker: {
      executionId: normalizedText(workerRow.executionId),
      buildId: normalizedText(workerRow.buildId),
      imageDigest: normalizedText(workerRow.imageDigest) || null,
      attempt: positiveSafeInteger(workerRow.attempt),
    },
    originalRemainsSourceTruth: row.originalRemainsSourceTruth as true,
  };
  if (
    result.kind !== EPISODE_COLLABORATION_PROXY_RESULT_KIND
    || result.version !== 1
    || !normalizeCaptureProxyJobId(result.jobId)
    || !isIsoDate(result.completedAt)
    || !result.worker.executionId
    || !result.worker.buildId
    || result.originalRemainsSourceTruth !== true
    || output.provider !== source.provider
    || !validProviderLocator(output.provider, output.locator, true)
    || !output.generation
    || !SHA256.test(output.sha256)
    || (output.provider === "gcs" && !output.crc32c)
    || output.contentType !== "video/mp4"
    || output.profile !== COLLABORATION_PROXY_PROFILE
    || (expectedJob && (
      result.jobId !== expectedJob.jobId
      || !sameEpisodeCollaborationProxySource(source, expectedJob.source)
      || output.provider !== expectedJob.target.provider
      || !outputLocatorMatchesTarget(output.provider, output.locator, expectedJob.target.locator)
    ))
  ) {
    throw new Error("Episode collaboration proxy result is invalid.");
  }
  return result;
}

function parseEpisodeCollaborationProxySource(
  value: unknown,
): EpisodeCollaborationProxySource {
  const row = record(value);
  const source = {
    provider: normalizedText(row.provider) as EpisodeCollaborationProxyProvider,
    locator: normalizedText(row.locator),
    generation: normalizedText(row.generation),
    sizeBytes: positiveSafeInteger(row.sizeBytes),
    sha256: normalizedText(row.sha256),
    contentType: normalizedText(row.contentType),
    rawAssetId: normalizedText(row.rawAssetId),
    sourceId: normalizedText(row.sourceId),
  };
  if (
    !validProvider(source.provider)
    || !validProviderLocator(source.provider, source.locator, false)
    || !source.generation
    || !SHA256.test(source.sha256)
    || !source.contentType.startsWith("video/")
    || !SAFE_ID.test(source.rawAssetId)
    || !SAFE_ID.test(source.sourceId)
  ) {
    throw new Error("Episode collaboration proxy source is invalid.");
  }
  return source;
}

function parseEpisodeCollaborationProxyTarget(
  value: unknown,
): EpisodeCollaborationProxyTarget {
  const row = record(value);
  const target = {
    provider: normalizedText(row.provider) as EpisodeCollaborationProxyProvider,
    locator: normalizedText(row.locator),
    contentType: normalizedText(row.contentType) as "video/mp4",
    profile: normalizedText(row.profile) as typeof COLLABORATION_PROXY_PROFILE,
  };
  if (
    !validProvider(target.provider)
    || !validProxyTargetLocator(target.locator)
    || target.contentType !== "video/mp4"
    || target.profile !== COLLABORATION_PROXY_PROFILE
  ) {
    throw new Error("Episode collaboration proxy target is invalid.");
  }
  return target;
}

function sameEpisodeCollaborationProxySource(
  left: EpisodeCollaborationProxySource,
  right: EpisodeCollaborationProxySource,
) {
  return left.provider === right.provider
    && left.locator === right.locator
    && left.generation === right.generation
    && left.sizeBytes === right.sizeBytes
    && left.sha256 === right.sha256
    && left.contentType === right.contentType
    && left.rawAssetId === right.rawAssetId
    && left.sourceId === right.sourceId;
}

function validProvider(value: string): value is EpisodeCollaborationProxyProvider {
  return value === "local" || value === "gcs";
}

function validProviderLocator(
  provider: EpisodeCollaborationProxyProvider,
  locator: string,
  output: boolean,
) {
  if (!locator || locator.length > 4_096 || locator.includes("\0")) return false;
  if (provider === "gcs") return /^gcs:\/\/[a-z0-9][a-z0-9._-]+\/.+/.test(locator);
  return locator.startsWith("/") && (output ? locator.endsWith(".mp4") : true);
}

function validGenerationBoundGcsLocator(locator: string, generation: string) {
  const match = /^gcs:\/\/([a-z0-9][a-z0-9._-]{1,221}[a-z0-9])\/(.+)\?generation=([1-9][0-9]*)$/.exec(locator);
  return Boolean(
    match
    && match[3] === generation
    && match[2].startsWith("media-vault/")
    && !match[2].split("/").some((segment) => !segment || segment === "." || segment === ".."),
  );
}

function validProxyTargetLocator(locator: string) {
  return locator.length <= 1_024
    && locator.startsWith("media-vault/proxy/episode-collaboration/")
    && locator.endsWith(".mp4")
    && !locator.split("/").some((segment) => !segment || segment === "." || segment === "..");
}

function outputLocatorMatchesTarget(
  provider: EpisodeCollaborationProxyProvider,
  outputLocator: string,
  targetLocator: string,
) {
  if (provider === "gcs") return outputLocator.includes(`/${targetLocator}`);
  return outputLocator.endsWith(`/${targetLocator}`);
}
