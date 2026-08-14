import {
  parseExecutorLocalArtifactAuthority,
  sameExecutorLocalArtifactAuthority,
  type ExecutorLocalArtifactAuthority,
} from "./artifact-portability.js";

export const EPISODE_MASTER_PROMOTION_CONTRACT_VERSION = 1 as const;
export const EPISODE_MASTER_PROMOTION_JOB_KIND =
  "quipsly-episode-master-promotion-job-v1" as const;
export const EPISODE_MASTER_PROMOTION_RESULT_KIND =
  "quipsly-episode-master-promotion-result-v1" as const;

const SHA256_REGEX = /^[0-9a-f]{64}$/;
const GCS_GENERATION_REGEX = /^[1-9][0-9]*$/;
const SAFE_ID_REGEX = /^[A-Za-z0-9_-]{8,128}$/;
const SAFE_BUCKET_REGEX = /^[a-z0-9][a-z0-9._-]{1,221}[a-z0-9]$/;

export type EpisodeMasterReviewBinding = {
  receiptId: string;
  masterJobId: string;
  approvedByEmail: string;
  approvedAt: string;
  masterSha256: string;
  masterSizeBytes: number;
  masterGeneration: string;
  masterLocator: string;
};

export type EpisodeMasterPromotionTarget = {
  provider: "gcs";
  bucketName: string;
  objectName: string;
  contentType: "video/mp4";
};

export type EpisodeMasterPromotionJob = {
  kind: typeof EPISODE_MASTER_PROMOTION_JOB_KIND;
  version: typeof EPISODE_MASTER_PROMOTION_CONTRACT_VERSION;
  jobId: string;
  projectId: string;
  episodeProductionId: string;
  requestedByEmail: string;
  clientRequestId: string;
  queuedAt: string;
  reviewApproval: EpisodeMasterReviewBinding;
  executionTarget: ExecutorLocalArtifactAuthority;
  sourceLocalMaster: ExecutorLocalArtifactAuthority & {
    locator: string;
    sha256: string;
    sizeBytes: number;
  };
  target: EpisodeMasterPromotionTarget;
  boundaries: {
    requiresExplicitMasterApproval: true;
    localSourceMustMatchExactReviewHash: true;
    promotionIsPortableObjectCopy: true;
    originalSourceMediaRemainsImmutable: true;
    serverMustVerifyGcsUploadBeforeCustodyUpdate: true;
  };
};

export type EpisodeMasterPromotionResult = {
  kind: typeof EPISODE_MASTER_PROMOTION_RESULT_KIND;
  version: typeof EPISODE_MASTER_PROMOTION_CONTRACT_VERSION;
  jobId: string;
  completedAt: string;
  masterReviewReceiptId: string;
  output: {
    provider: "gcs";
    bucketName: string;
    objectName: string;
    generation: string;
    sha256: string;
    sizeBytes: number;
    contentType: "video/mp4";
    custodyState: "portable-gcs";
  };
  worker: {
    executionId: string;
    buildId: string;
    imageDigest: string | null;
  };
  boundaries: {
    portableMasterIsVerifiedGcsObject: true;
    localMasterRemainsAvailable: true;
  };
};

export function buildEpisodeMasterPromotionGcsObjectName(input: {
  projectSlug: string;
  episodeSlug: string;
  jobId: string;
}) {
  const p = sanitizeSegment(input.projectSlug);
  const e = sanitizeSegment(input.episodeSlug);
  const j = sanitizeSegment(input.jobId);
  return `media-vault/masters/${p}/${e}/master-promoted-${j}.mp4`;
}

export function parseEpisodeMasterPromotionJob(
  value: unknown,
): EpisodeMasterPromotionJob {
  const row = record(value);
  if (
    row.kind !== EPISODE_MASTER_PROMOTION_JOB_KIND ||
    row.version !== EPISODE_MASTER_PROMOTION_CONTRACT_VERSION
  ) {
    throw new Error("Episode master promotion job kind or version is invalid.");
  }
  const jobId = text(row.jobId);
  const projectId = text(row.projectId);
  const episodeProductionId = text(row.episodeProductionId);
  const requestedByEmail = text(row.requestedByEmail).toLowerCase();
  const clientRequestId = text(row.clientRequestId);
  const queuedAt = text(row.queuedAt);

  if (
    !SAFE_ID_REGEX.test(jobId) ||
    !projectId ||
    !episodeProductionId ||
    !isEmail(requestedByEmail) ||
    !clientRequestId ||
    !isIsoDate(queuedAt)
  ) {
    throw new Error("Episode master promotion job fields are invalid.");
  }

  const reviewApproval = parseReviewBinding(row.reviewApproval);
  const executionTarget = parseExecutorLocalArtifactAuthority(row.executionTarget);
  const sourceLocalMaster = parseSourceLocalMaster(row.sourceLocalMaster);
  const target = parsePromotionTarget(row.target);

  if (!sameExecutorLocalArtifactAuthority(sourceLocalMaster, executionTarget)) {
    throw new Error("Source master local authority does not match execution target.");
  }

  if (sourceLocalMaster.sha256 !== reviewApproval.masterSha256) {
    throw new Error("Source master SHA-256 does not match reviewed master SHA-256.");
  }

  const bounds = record(row.boundaries);
  if (
    bounds.requiresExplicitMasterApproval !== true ||
    bounds.localSourceMustMatchExactReviewHash !== true ||
    bounds.promotionIsPortableObjectCopy !== true ||
    bounds.originalSourceMediaRemainsImmutable !== true ||
    bounds.serverMustVerifyGcsUploadBeforeCustodyUpdate !== true
  ) {
    throw new Error("Episode master promotion boundaries are invalid.");
  }

  return {
    kind: EPISODE_MASTER_PROMOTION_JOB_KIND,
    version: EPISODE_MASTER_PROMOTION_CONTRACT_VERSION,
    jobId,
    projectId,
    episodeProductionId,
    requestedByEmail,
    clientRequestId,
    queuedAt,
    reviewApproval,
    executionTarget,
    sourceLocalMaster,
    target,
    boundaries: {
      requiresExplicitMasterApproval: true,
      localSourceMustMatchExactReviewHash: true,
      promotionIsPortableObjectCopy: true,
      originalSourceMediaRemainsImmutable: true,
      serverMustVerifyGcsUploadBeforeCustodyUpdate: true,
    },
  };
}

export function parseEpisodeMasterPromotionResult(
  value: unknown,
  expectedJob?: EpisodeMasterPromotionJob,
): EpisodeMasterPromotionResult {
  const row = record(value);
  if (
    row.kind !== EPISODE_MASTER_PROMOTION_RESULT_KIND ||
    row.version !== EPISODE_MASTER_PROMOTION_CONTRACT_VERSION
  ) {
    throw new Error("Episode master promotion result kind or version is invalid.");
  }

  const jobId = text(row.jobId);
  const completedAt = text(row.completedAt);
  const masterReviewReceiptId = text(row.masterReviewReceiptId);

  if (!SAFE_ID_REGEX.test(jobId) || !isIsoDate(completedAt) || !masterReviewReceiptId) {
    throw new Error("Episode master promotion result identity fields are invalid.");
  }

  if (expectedJob && jobId !== expectedJob.jobId) {
    throw new Error("Promotion result job ID does not match expected job ID.");
  }

  if (expectedJob && masterReviewReceiptId !== expectedJob.reviewApproval.receiptId) {
    throw new Error("Promotion result review receipt ID does not match expected review receipt ID.");
  }

  const outputRow = record(row.output);
  const provider = text(outputRow.provider);
  const bucketName = text(outputRow.bucketName);
  const objectName = text(outputRow.objectName);
  const generation = text(outputRow.generation);
  const sha256 = text(outputRow.sha256).toLowerCase();
  const sizeBytes = positiveInteger(outputRow.sizeBytes);
  const contentType = text(outputRow.contentType);
  const custodyState = text(outputRow.custodyState);

  if (
    provider !== "gcs" ||
    !SAFE_BUCKET_REGEX.test(bucketName) ||
    !objectName ||
    !GCS_GENERATION_REGEX.test(generation) ||
    !SHA256_REGEX.test(sha256) ||
    contentType !== "video/mp4" ||
    custodyState !== "portable-gcs"
  ) {
    throw new Error("Episode master promotion result output binding is invalid.");
  }

  if (expectedJob) {
    if (bucketName !== expectedJob.target.bucketName || objectName !== expectedJob.target.objectName) {
      throw new Error("Promotion result target locator does not match expected target.");
    }
    if (sha256 !== expectedJob.sourceLocalMaster.sha256) {
      throw new Error("Promoted GCS object SHA-256 does not match original local master SHA-256.");
    }
  }

  const workerRow = record(row.worker);
  const executionId = text(workerRow.executionId);
  const buildId = text(workerRow.buildId);
  const imageDigest = workerRow.imageDigest == null ? null : text(workerRow.imageDigest);

  if (!executionId || !buildId) {
    throw new Error("Episode master promotion worker fields are invalid.");
  }

  const bounds = record(row.boundaries);
  if (
    bounds.portableMasterIsVerifiedGcsObject !== true ||
    bounds.localMasterRemainsAvailable !== true
  ) {
    throw new Error("Episode master promotion result boundaries are invalid.");
  }

  return {
    kind: EPISODE_MASTER_PROMOTION_RESULT_KIND,
    version: EPISODE_MASTER_PROMOTION_CONTRACT_VERSION,
    jobId,
    completedAt,
    masterReviewReceiptId,
    output: {
      provider: "gcs",
      bucketName,
      objectName,
      generation,
      sha256,
      sizeBytes,
      contentType: "video/mp4",
      custodyState: "portable-gcs",
    },
    worker: {
      executionId,
      buildId,
      imageDigest,
    },
    boundaries: {
      portableMasterIsVerifiedGcsObject: true,
      localMasterRemainsAvailable: true,
    },
  };
}

function parseReviewBinding(value: unknown): EpisodeMasterReviewBinding {
  const row = record(value);
  const receiptId = text(row.receiptId);
  const masterJobId = text(row.masterJobId);
  const approvedByEmail = text(row.approvedByEmail).toLowerCase();
  const approvedAt = text(row.approvedAt);
  const masterSha256 = text(row.masterSha256).toLowerCase();
  const masterSizeBytes = positiveInteger(row.masterSizeBytes);
  const masterGeneration = text(row.masterGeneration);
  const masterLocator = text(row.masterLocator);

  if (
    !receiptId ||
    !SAFE_ID_REGEX.test(masterJobId) ||
    !isEmail(approvedByEmail) ||
    !isIsoDate(approvedAt) ||
    !SHA256_REGEX.test(masterSha256) ||
    !masterGeneration ||
    !masterLocator
  ) {
    throw new Error("Episode master review binding is invalid.");
  }

  return {
    receiptId,
    masterJobId,
    approvedByEmail,
    approvedAt,
    masterSha256,
    masterSizeBytes,
    masterGeneration,
    masterLocator,
  };
}

function parseSourceLocalMaster(
  value: unknown,
): ExecutorLocalArtifactAuthority & { locator: string; sha256: string; sizeBytes: number } {
  const authority = parseExecutorLocalArtifactAuthority(value);
  const row = record(value);
  const locator = text(row.locator);
  const sha256 = text(row.sha256).toLowerCase();
  const sizeBytes = positiveInteger(row.sizeBytes);

  if (!locator || !SHA256_REGEX.test(sha256)) {
    throw new Error("Source local master binding is invalid.");
  }

  return {
    ...authority,
    locator,
    sha256,
    sizeBytes,
  };
}

function parsePromotionTarget(value: unknown): EpisodeMasterPromotionTarget {
  const row = record(value);
  const provider = text(row.provider);
  const bucketName = text(row.bucketName);
  const objectName = text(row.objectName);
  const contentType = text(row.contentType);

  if (
    provider !== "gcs" ||
    !SAFE_BUCKET_REGEX.test(bucketName) ||
    !objectName ||
    contentType !== "video/mp4"
  ) {
    throw new Error("Episode master promotion target binding is invalid.");
  }

  return {
    provider: "gcs",
    bucketName,
    objectName,
    contentType: "video/mp4",
  };
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function positiveInteger(value: unknown) {
  const num = Number(value);
  if (!Number.isSafeInteger(num) || num <= 0) {
    throw new Error("Expected a positive safe integer.");
  }
  return num;
}

function isEmail(value: string) {
  return value.length <= 320 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function isIsoDate(value: string) {
  return value.length > 0 && Number.isFinite(Date.parse(value));
}

function sanitizeSegment(value: string) {
  const clean = value.replace(/[^A-Za-z0-9._-]/g, "-").replace(/-+/g, "-");
  return clean || "default";
}
