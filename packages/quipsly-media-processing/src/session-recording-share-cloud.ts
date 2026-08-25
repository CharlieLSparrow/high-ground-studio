import {
  parseSessionRecordingShareJob,
  parseSessionRecordingShareResult,
  type SessionRecordingShareJob,
  type SessionRecordingShareResult,
} from "./session-recording-share.js";

export const SESSION_RECORDING_SHARE_CLOUD_MANIFEST_KIND =
  "quipsly-session-recording-share-cloud-manifest-v1" as const;
export const SESSION_RECORDING_SHARE_CLOUD_QUEUE_KIND =
  "quipsly-session-recording-share-cloud-queue-v1" as const;
export const SESSION_RECORDING_SHARE_CLOUD_CONTROL_PREFIX =
  "media-vault/control/session-recording-share" as const;
export const SESSION_RECORDING_SHARE_CLOUD_MANIFEST_PREFIX =
  `${SESSION_RECORDING_SHARE_CLOUD_CONTROL_PREFIX}/manifests` as const;
export const SESSION_RECORDING_SHARE_CLOUD_QUEUE_PREFIX =
  `${SESSION_RECORDING_SHARE_CLOUD_CONTROL_PREFIX}/queue` as const;
export const SESSION_RECORDING_SHARE_CLOUD_RESULT_PREFIX =
  `${SESSION_RECORDING_SHARE_CLOUD_CONTROL_PREFIX}/results` as const;
export const SESSION_RECORDING_SHARE_CLOUD_DEAD_LETTER_PREFIX =
  `${SESSION_RECORDING_SHARE_CLOUD_CONTROL_PREFIX}/dead-letter` as const;
export const SESSION_RECORDING_SHARE_CLOUD_MAX_ATTEMPTS = 5;

type Status = "queued" | "processing" | "completed" | "failed-terminal";
type Lease = {
  id: string;
  executionId: string;
  claimedAt: string;
  expiresAt: string;
  attempt: number;
};

export type SessionRecordingShareCloudManifest = {
  kind: typeof SESSION_RECORDING_SHARE_CLOUD_MANIFEST_KIND;
  version: 1;
  job: SessionRecordingShareJob;
  status: Status;
  queuedAt: string;
  updatedAt: string;
  attemptCount: number;
  lease: Lease | null;
  resultObjectName: string | null;
  failure: { code: string; message: string; failedAt: string } | null;
};

export type SessionRecordingShareCloudQueueReceipt = {
  kind: typeof SESSION_RECORDING_SHARE_CLOUD_QUEUE_KIND;
  version: 1;
  jobId: string;
  manifestObjectName: string;
  manifestGeneration: string;
  enqueuedAt: string;
};

const GENERATION = /^[1-9][0-9]*$/;
const SAFE_ID = /^[A-Za-z0-9_-]{8,180}$/;

export function buildSessionRecordingShareCloudManifestObjectName(
  jobId: string,
) {
  return `${SESSION_RECORDING_SHARE_CLOUD_MANIFEST_PREFIX}/${requiredId(jobId)}.json`;
}
export function buildSessionRecordingShareCloudQueueObjectName(jobId: string) {
  return `${SESSION_RECORDING_SHARE_CLOUD_QUEUE_PREFIX}/${requiredId(jobId)}.json`;
}
export function buildSessionRecordingShareCloudResultObjectName(jobId: string) {
  return `${SESSION_RECORDING_SHARE_CLOUD_RESULT_PREFIX}/${requiredId(jobId)}.json`;
}
export function buildSessionRecordingShareCloudDeadLetterObjectName(
  jobId: string,
) {
  return `${SESSION_RECORDING_SHARE_CLOUD_DEAD_LETTER_PREFIX}/${requiredId(jobId)}.json`;
}

export function newSessionRecordingShareCloudManifest(jobValue: unknown) {
  const job = requireCloudJob(jobValue);
  const now = new Date().toISOString();
  return parseSessionRecordingShareCloudManifest(
    {
      kind: SESSION_RECORDING_SHARE_CLOUD_MANIFEST_KIND,
      version: 1,
      job,
      status: "queued",
      queuedAt: now,
      updatedAt: now,
      attemptCount: 0,
      lease: null,
      resultObjectName: null,
      failure: null,
    },
    job.jobId,
  );
}

export function parseSessionRecordingShareCloudManifest(
  value: unknown,
  expectedJobId?: string,
) {
  const row = record(value);
  const job = requireCloudJob(row.job);
  const status = text(row.status) as Status;
  const lease = row.lease == null ? null : parseLease(row.lease);
  const attemptCount = row.attemptCount == null
    ? (lease?.attempt ?? 0)
    : Number(row.attemptCount);
  const resultObjectName =
    row.resultObjectName == null ? null : text(row.resultObjectName);
  const failure = row.failure == null ? null : parseFailure(row.failure);
  const parsed: SessionRecordingShareCloudManifest = {
    kind: row.kind as typeof SESSION_RECORDING_SHARE_CLOUD_MANIFEST_KIND,
    version: Number(row.version) as 1,
    job,
    status,
    queuedAt: text(row.queuedAt),
    updatedAt: text(row.updatedAt),
    attemptCount,
    lease,
    resultObjectName,
    failure,
  };
  if (
    parsed.kind !== SESSION_RECORDING_SHARE_CLOUD_MANIFEST_KIND ||
    parsed.version !== 1 ||
    (expectedJobId && job.jobId !== expectedJobId) ||
    !["queued", "processing", "completed", "failed-terminal"].includes(
      status,
    ) ||
    !iso(parsed.queuedAt) ||
    !iso(parsed.updatedAt) ||
    !Number.isSafeInteger(attemptCount) ||
    attemptCount < 0 ||
    (lease !== null && lease.attempt !== attemptCount) ||
    (status === "processing") !== Boolean(lease) ||
    (status === "completed") !== Boolean(resultObjectName) ||
    (status === "failed-terminal") !== Boolean(failure) ||
    (resultObjectName !== null &&
      resultObjectName !==
        buildSessionRecordingShareCloudResultObjectName(job.jobId))
  )
    throw new Error("Session recording share cloud manifest is invalid.");
  return parsed;
}

export function parseSessionRecordingShareCloudQueueReceipt(value: unknown) {
  const row = record(value);
  const jobId = text(row.jobId);
  const parsed: SessionRecordingShareCloudQueueReceipt = {
    kind: row.kind as typeof SESSION_RECORDING_SHARE_CLOUD_QUEUE_KIND,
    version: Number(row.version) as 1,
    jobId,
    manifestObjectName: text(row.manifestObjectName),
    manifestGeneration: text(row.manifestGeneration),
    enqueuedAt: text(row.enqueuedAt),
  };
  if (
    parsed.kind !== SESSION_RECORDING_SHARE_CLOUD_QUEUE_KIND ||
    parsed.version !== 1 ||
    !SAFE_ID.test(jobId) ||
    parsed.manifestObjectName !==
      buildSessionRecordingShareCloudManifestObjectName(jobId) ||
    !GENERATION.test(parsed.manifestGeneration) ||
    !iso(parsed.enqueuedAt)
  )
    throw new Error("Session recording share cloud queue receipt is invalid.");
  return parsed;
}

export function claimSessionRecordingShareCloudManifest(input: {
  manifest: SessionRecordingShareCloudManifest;
  leaseId: string;
  executionId: string;
  now: Date;
  leaseDurationMs: number;
}) {
  if (["completed", "failed-terminal"].includes(input.manifest.status))
    return null;
  if (
    input.manifest.status === "processing" &&
    input.manifest.lease &&
    Date.parse(input.manifest.lease.expiresAt) > input.now.getTime()
  )
    return null;
  const attempt = input.manifest.attemptCount + 1;
  return parseSessionRecordingShareCloudManifest(
    {
      ...input.manifest,
      status: "processing",
      updatedAt: input.now.toISOString(),
      attemptCount: attempt,
      lease: {
        id: input.leaseId,
        executionId: input.executionId,
        claimedAt: input.now.toISOString(),
        expiresAt: new Date(
          input.now.getTime() + input.leaseDurationMs,
        ).toISOString(),
        attempt,
      },
    },
    input.manifest.job.jobId,
  );
}

export function releaseSessionRecordingShareCloudLease(input: {
  manifest: SessionRecordingShareCloudManifest;
  leaseId: string;
  now: Date;
}) {
  requireLease(input.manifest, input.leaseId);
  return parseSessionRecordingShareCloudManifest(
    {
      ...input.manifest,
      status: "queued",
      lease: null,
      updatedAt: input.now.toISOString(),
    },
    input.manifest.job.jobId,
  );
}

export function completeSessionRecordingShareCloudManifest(input: {
  manifest: SessionRecordingShareCloudManifest;
  leaseId: string;
  result: SessionRecordingShareResult;
  now: Date;
}) {
  requireLease(input.manifest, input.leaseId);
  assertResultMatchesJob(input.result, input.manifest.job);
  return parseSessionRecordingShareCloudManifest(
    {
      ...input.manifest,
      status: "completed",
      lease: null,
      resultObjectName: buildSessionRecordingShareCloudResultObjectName(
        input.manifest.job.jobId,
      ),
      updatedAt: input.now.toISOString(),
    },
    input.manifest.job.jobId,
  );
}

export function failSessionRecordingShareCloudManifest(input: {
  manifest: SessionRecordingShareCloudManifest;
  leaseId: string;
  code: string;
  message: string;
  now: Date;
}) {
  requireLease(input.manifest, input.leaseId);
  return parseSessionRecordingShareCloudManifest(
    {
      ...input.manifest,
      status: "failed-terminal",
      lease: null,
      resultObjectName: null,
      failure: {
        code: input.code.trim().slice(0, 120),
        message: input.message.trim().slice(0, 2_000),
        failedAt: input.now.toISOString(),
      },
      updatedAt: input.now.toISOString(),
    },
    input.manifest.job.jobId,
  );
}

export function assertSessionRecordingShareCloudResult(
  value: unknown,
  jobValue: unknown,
) {
  const job = requireCloudJob(jobValue);
  const result = parseSessionRecordingShareResult(value);
  assertResultMatchesJob(result, job);
  return result;
}

function requireCloudJob(value: unknown) {
  const job = parseSessionRecordingShareJob(value);
  const extension = job.target.mediaKind === "video" ? "mp4" : "m4a";
  const targetPattern = new RegExp(
    `^media-vault/derived/session-recording-share/${escape(job.roomId)}/${escape(job.jobId)}\\.${extension}$`,
  );
  if (
    job.target.provider !== "gcs" ||
    !targetPattern.test(job.target.objectName) ||
    job.target.locator !== job.target.objectName ||
    job.target.bucketName.length < 3 ||
    job.sources.some(
      (source) =>
        source.provider !== "gcs" ||
        source.bucketName !== job.target.bucketName ||
        !source.objectName.startsWith("media-vault/recordings/") ||
        source.locator !==
          `gcs://${source.bucketName}/${source.objectName}?generation=${source.generation}` ||
        !GENERATION.test(source.generation),
    )
  )
    throw new Error(
      "Session recording share cloud job is not generation-bound GCS work.",
    );
  return job;
}

function assertResultMatchesJob(
  resultValue: unknown,
  job: SessionRecordingShareJob,
) {
  const result = parseSessionRecordingShareResult(resultValue);
  if (
    result.jobId !== job.jobId ||
    result.roomId !== job.roomId ||
    result.outputId !== job.outputId ||
    result.outputRevision !== job.outputRevision ||
    result.sourceSetSha256 !== job.sourceSetSha256 ||
    JSON.stringify(result.edit) !== JSON.stringify(job.edit) ||
    JSON.stringify(result.sourceRecordingAssetIds) !==
      JSON.stringify(job.sources.map((source) => source.recordingAssetId)) ||
    result.output.provider !== "gcs" ||
    result.output.bucketName !== job.target.bucketName ||
    result.output.objectName !== job.target.objectName ||
    result.output.mediaKind !== job.target.mediaKind ||
    result.output.contentType !== job.target.contentType ||
    result.output.locator !==
      `gcs://${job.target.bucketName}/${job.target.objectName}?generation=${result.output.generation}`
  )
    throw new Error(
      "Session recording share cloud result drifted from its immutable job.",
    );
  return result;
}

function parseLease(value: unknown): Lease {
  const row = record(value);
  const lease = {
    id: text(row.id),
    executionId: text(row.executionId),
    claimedAt: text(row.claimedAt),
    expiresAt: text(row.expiresAt),
    attempt: Number(row.attempt),
  };
  if (
    !lease.id ||
    !lease.executionId ||
    !iso(lease.claimedAt) ||
    !iso(lease.expiresAt) ||
    !Number.isSafeInteger(lease.attempt) ||
    lease.attempt < 1
  )
    throw new Error("Session recording share cloud lease is invalid.");
  return lease;
}
function parseFailure(value: unknown) {
  const row = record(value);
  const failure = {
    code: text(row.code),
    message: text(row.message),
    failedAt: text(row.failedAt),
  };
  if (!failure.code || !failure.message || !iso(failure.failedAt))
    throw new Error("Session recording share cloud failure is invalid.");
  return failure;
}
function requireLease(
  manifest: SessionRecordingShareCloudManifest,
  leaseId: string,
) {
  if (manifest.status !== "processing" || manifest.lease?.id !== leaseId)
    throw new Error(
      "Session recording share cloud lease no longer owns the manifest.",
    );
}
function record(value: unknown): Record<string, any> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, any>)
    : {};
}
function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}
function iso(value: string) {
  return value.length > 0 && Number.isFinite(Date.parse(value));
}
function requiredId(value: string) {
  const id = value.trim();
  if (!SAFE_ID.test(id))
    throw new Error("Session recording share cloud job id is invalid.");
  return id;
}
function escape(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
