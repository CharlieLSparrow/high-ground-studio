import {
  parseExecutorLocalArtifactAuthority,
  sameExecutorLocalArtifactAuthority,
  type ExecutorLocalArtifactAuthority,
} from "./artifact-portability.js";
import {
  parseEpisodeProgramRenderJob,
  type EpisodeProgramRenderJob,
} from "./episode-program-render.js";

export const EPISODE_MASTER_CONFORM_CONTRACT_VERSION = 1 as const;
export const EPISODE_MASTER_CONFORM_JOB_KIND =
  "quipsly-episode-master-conform-job-v1" as const;
export const EPISODE_MASTER_CONFORM_RESULT_KIND =
  "quipsly-episode-master-conform-result-v1" as const;
export const EPISODE_MASTER_4K_H264_PROFILE =
  "episode-master-3840x2160-24fps-h264-v1" as const;

export type EpisodeMasterApprovalBinding = {
  receiptId: string;
  reviewJobId: string;
  approvedByEmail: string;
  approvedAt: string;
  branchId: string;
  branchRevision: number;
  timelineFingerprintSha256: string;
  sourceProjectionFingerprintSha256: string;
  editStateFingerprintSha256: string;
  reviewManifestSha256: string;
  reviewedOutputSha256: string;
  reviewedOutputGeneration: string;
  reviewedOutputSizeBytes: number;
};

export type EpisodeMasterConformJob = {
  kind: typeof EPISODE_MASTER_CONFORM_JOB_KIND;
  version: typeof EPISODE_MASTER_CONFORM_CONTRACT_VERSION;
  jobId: string;
  projectId: string;
  episodeProductionId: string;
  requestedByEmail: string;
  clientRequestId: string;
  queuedAt: string;
  manifestSha256: string;
  renderProfile: typeof EPISODE_MASTER_4K_H264_PROFILE;
  approval: EpisodeMasterApprovalBinding;
  approvedProgram: EpisodeProgramRenderJob;
  executionTarget: ExecutorLocalArtifactAuthority;
  target: ExecutorLocalArtifactAuthority & {
    provider: "local";
    locator: string;
    contentType: "video/mp4";
    container: "mp4";
    videoCodec: "h264";
    audioCodec: "aac";
    width: 3840;
    height: 2160;
    fps: 24;
    sampleRateHz: 48_000;
    videoCrf: 17;
    videoPreset: "medium";
    audioBitrate: "320k";
    variantKind: "episode-master-candidate";
  };
  boundaries: {
    sourceMediaRemainsImmutable: true;
    approvedProgramIntentRemainsImmutable: true;
    reviewCandidateIsNotMasterInput: true;
    outputIsUnapprovedMasterCandidate: true;
    outputIsNotPublicationMedia: true;
    masterRequiresSeparateReview: true;
    serverMustVerifyResultBeforePlayback: true;
    localArtifactsRequireExactExecutor: true;
  };
};

export type EpisodeMasterConformResult = {
  kind: typeof EPISODE_MASTER_CONFORM_RESULT_KIND;
  version: typeof EPISODE_MASTER_CONFORM_CONTRACT_VERSION;
  jobId: string;
  completedAt: string;
  manifestSha256: string;
  approvalReceiptId: string;
  output: ExecutorLocalArtifactAuthority & {
    provider: "local";
    locator: string;
    generation: string;
    sha256: string;
    sizeBytes: number;
    contentType: "video/mp4";
    durationSeconds: number;
    width: 3840;
    height: 2160;
    fps: number;
    videoCodec: string;
    audioCodec: string | null;
    completeDecode: true;
    fastStart: true;
    variantKind: "episode-master-candidate";
  };
  worker: ExecutorLocalArtifactAuthority & {
    executionId: string;
    buildId: string;
    imageDigest: string | null;
    attempt: number;
    ffmpegVersion: string;
    renderedChunkCount: number;
  };
  boundaries: EpisodeMasterConformJob["boundaries"];
};

const SAFE_ID = /^[A-Za-z0-9:_-]{4,220}$/;
const SHA256 = /^[0-9a-f]{64}$/;

export function buildEpisodeMasterConformTargetLocator(input: {
  episodeProductionId: string;
  branchId: string;
  branchRevision: number;
  jobId: string;
}) {
  return `media-vault/episode-master-candidates/${safeId(input.episodeProductionId, "episodeProductionId")}/${safeId(input.branchId, "branchId")}/revision-${integer(input.branchRevision, "branchRevision")}/${safeId(input.jobId, "jobId")}.mp4`;
}

export function newEpisodeMasterConformJob(
  input: Omit<EpisodeMasterConformJob, "kind" | "version" | "boundaries">,
): EpisodeMasterConformJob {
  return parseEpisodeMasterConformJob({
    ...input,
    kind: EPISODE_MASTER_CONFORM_JOB_KIND,
    version: EPISODE_MASTER_CONFORM_CONTRACT_VERSION,
    boundaries: boundaries(),
  });
}

export function parseEpisodeMasterConformJob(
  value: unknown,
  expectedJobId?: string,
): EpisodeMasterConformJob {
  const row = record(value);
  const approvalRow = record(row.approval);
  const target = record(row.target);
  const declared = record(row.boundaries);
  const approvedProgram = parseEpisodeProgramRenderJob(row.approvedProgram);
  const executionTarget = parseExecutorLocalArtifactAuthority(row.executionTarget, "executionTarget");
  const targetAuthority = parseExecutorLocalArtifactAuthority(target, "target");
  const jobId = safeId(row.jobId, "jobId");
  if (expectedJobId && expectedJobId !== jobId) invalid("Master conform job identity changed.");
  const approval = parseApproval(approvalRow);
  if (
    row.kind !== EPISODE_MASTER_CONFORM_JOB_KIND
    || row.version !== EPISODE_MASTER_CONFORM_CONTRACT_VERSION
    || row.renderProfile !== EPISODE_MASTER_4K_H264_PROFILE
    || approval.reviewJobId !== approvedProgram.jobId
    || approval.branchId !== approvedProgram.branchId
    || approval.branchRevision !== approvedProgram.branchRevision
    || approval.timelineFingerprintSha256 !== approvedProgram.timelineFingerprintSha256
    || approval.sourceProjectionFingerprintSha256 !== approvedProgram.sourceProjectionFingerprintSha256
    || approval.editStateFingerprintSha256 !== approvedProgram.editStateFingerprintSha256
    || approval.reviewManifestSha256 !== approvedProgram.manifestSha256
    || !sameExecutorLocalArtifactAuthority(executionTarget, approvedProgram.executionTarget)
    || !sameExecutorLocalArtifactAuthority(executionTarget, targetAuthority)
    || target.provider !== "local"
    || target.contentType !== "video/mp4"
    || target.container !== "mp4"
    || target.videoCodec !== "h264"
    || target.audioCodec !== "aac"
    || target.width !== 3840
    || target.height !== 2160
    || target.fps !== 24
    || target.sampleRateHz !== 48_000
    || target.videoCrf !== 17
    || target.videoPreset !== "medium"
    || target.audioBitrate !== "320k"
    || target.variantKind !== "episode-master-candidate"
    || declared.sourceMediaRemainsImmutable !== true
    || declared.approvedProgramIntentRemainsImmutable !== true
    || declared.reviewCandidateIsNotMasterInput !== true
    || declared.outputIsUnapprovedMasterCandidate !== true
    || declared.outputIsNotPublicationMedia !== true
    || declared.masterRequiresSeparateReview !== true
    || declared.serverMustVerifyResultBeforePlayback !== true
    || declared.localArtifactsRequireExactExecutor !== true
  ) invalid("Master conform contract, approval, or executor binding is invalid.");
  return {
    kind: EPISODE_MASTER_CONFORM_JOB_KIND,
    version: EPISODE_MASTER_CONFORM_CONTRACT_VERSION,
    jobId,
    projectId: safeId(row.projectId, "projectId"),
    episodeProductionId: safeId(row.episodeProductionId, "episodeProductionId"),
    requestedByEmail: email(row.requestedByEmail, "requestedByEmail"),
    clientRequestId: safeId(row.clientRequestId, "clientRequestId"),
    queuedAt: iso(row.queuedAt, "queuedAt"),
    manifestSha256: sha(row.manifestSha256, "manifestSha256"),
    renderProfile: EPISODE_MASTER_4K_H264_PROFILE,
    approval,
    approvedProgram,
    executionTarget,
    target: {
      provider: "local",
      ...targetAuthority,
      locator: required(target.locator, "target.locator"),
      contentType: "video/mp4",
      container: "mp4",
      videoCodec: "h264",
      audioCodec: "aac",
      width: 3840,
      height: 2160,
      fps: 24,
      sampleRateHz: 48_000,
      videoCrf: 17,
      videoPreset: "medium",
      audioBitrate: "320k",
      variantKind: "episode-master-candidate",
    },
    boundaries: boundaries(),
  };
}

export function episodeMasterConformManifestCanonicalJson(value: unknown) {
  const parsed = parseEpisodeMasterConformJob(value);
  return JSON.stringify(stable({ ...parsed, manifestSha256: null }));
}

export function newEpisodeMasterConformResult(
  input: Omit<EpisodeMasterConformResult, "kind" | "version" | "boundaries">,
  expectedJob: EpisodeMasterConformJob | unknown,
) {
  return parseEpisodeMasterConformResult({
    ...input,
    kind: EPISODE_MASTER_CONFORM_RESULT_KIND,
    version: EPISODE_MASTER_CONFORM_CONTRACT_VERSION,
    boundaries: boundaries(),
  }, expectedJob);
}

export function parseEpisodeMasterConformResult(
  value: unknown,
  expectedJob: EpisodeMasterConformJob | unknown,
): EpisodeMasterConformResult {
  const job = parseEpisodeMasterConformJob(expectedJob);
  const row = record(value);
  const output = record(row.output);
  const worker = record(row.worker);
  const declared = record(row.boundaries);
  const outputAuthority = parseExecutorLocalArtifactAuthority(output, "output");
  const workerAuthority = parseExecutorLocalArtifactAuthority(worker, "worker");
  const outputSha256 = sha(output.sha256, "output.sha256");
  const durationSeconds = positive(output.durationSeconds, "output.durationSeconds");
  if (
    row.kind !== EPISODE_MASTER_CONFORM_RESULT_KIND
    || row.version !== EPISODE_MASTER_CONFORM_CONTRACT_VERSION
    || row.jobId !== job.jobId
    || row.manifestSha256 !== job.manifestSha256
    || row.approvalReceiptId !== job.approval.receiptId
    || output.provider !== "local"
    || output.locator !== job.target.locator
    || output.generation !== `sha256:${outputSha256}`
    || output.contentType !== "video/mp4"
    || output.width !== 3840
    || output.height !== 2160
    || output.completeDecode !== true
    || output.fastStart !== true
    || output.variantKind !== "episode-master-candidate"
    || !sameExecutorLocalArtifactAuthority(job.executionTarget, outputAuthority)
    || !sameExecutorLocalArtifactAuthority(job.executionTarget, workerAuthority)
    || Math.abs(durationSeconds - job.approvedProgram.program.outputDurationSeconds) > 0.25
    || integer(worker.renderedChunkCount, "worker.renderedChunkCount") !== job.approvedProgram.chunks.length
    || declared.reviewCandidateIsNotMasterInput !== true
    || declared.outputIsUnapprovedMasterCandidate !== true
    || declared.outputIsNotPublicationMedia !== true
    || declared.masterRequiresSeparateReview !== true
  ) invalid("Master result no longer matches its exact approval-bound manifest.");
  return {
    kind: EPISODE_MASTER_CONFORM_RESULT_KIND,
    version: EPISODE_MASTER_CONFORM_CONTRACT_VERSION,
    jobId: job.jobId,
    completedAt: iso(row.completedAt, "completedAt"),
    manifestSha256: job.manifestSha256,
    approvalReceiptId: job.approval.receiptId,
    output: {
      provider: "local",
      ...outputAuthority,
      locator: String(output.locator),
      generation: String(output.generation),
      sha256: outputSha256,
      sizeBytes: positiveInteger(output.sizeBytes, "output.sizeBytes"),
      contentType: "video/mp4",
      durationSeconds,
      width: 3840,
      height: 2160,
      fps: positive(output.fps, "output.fps"),
      videoCodec: required(output.videoCodec, "output.videoCodec"),
      audioCodec: output.audioCodec === null ? null : required(output.audioCodec, "output.audioCodec"),
      completeDecode: true,
      fastStart: true,
      variantKind: "episode-master-candidate",
    },
    worker: {
      ...workerAuthority,
      executionId: safeId(worker.executionId, "worker.executionId"),
      buildId: required(worker.buildId, "worker.buildId"),
      imageDigest: worker.imageDigest === null ? null : required(worker.imageDigest, "worker.imageDigest"),
      attempt: positiveInteger(worker.attempt, "worker.attempt"),
      ffmpegVersion: required(worker.ffmpegVersion, "worker.ffmpegVersion"),
      renderedChunkCount: job.approvedProgram.chunks.length,
    },
    boundaries: boundaries(),
  };
}

function parseApproval(row: Record<string, unknown>): EpisodeMasterApprovalBinding {
  return {
    receiptId: safeId(row.receiptId, "approval.receiptId"),
    reviewJobId: safeId(row.reviewJobId, "approval.reviewJobId"),
    approvedByEmail: email(row.approvedByEmail, "approval.approvedByEmail"),
    approvedAt: iso(row.approvedAt, "approval.approvedAt"),
    branchId: safeId(row.branchId, "approval.branchId"),
    branchRevision: integer(row.branchRevision, "approval.branchRevision"),
    timelineFingerprintSha256: sha(row.timelineFingerprintSha256, "approval.timelineFingerprintSha256"),
    sourceProjectionFingerprintSha256: sha(row.sourceProjectionFingerprintSha256, "approval.sourceProjectionFingerprintSha256"),
    editStateFingerprintSha256: sha(row.editStateFingerprintSha256, "approval.editStateFingerprintSha256"),
    reviewManifestSha256: sha(row.reviewManifestSha256, "approval.reviewManifestSha256"),
    reviewedOutputSha256: sha(row.reviewedOutputSha256, "approval.reviewedOutputSha256"),
    reviewedOutputGeneration: required(row.reviewedOutputGeneration, "approval.reviewedOutputGeneration"),
    reviewedOutputSizeBytes: positiveInteger(row.reviewedOutputSizeBytes, "approval.reviewedOutputSizeBytes"),
  };
}

function boundaries(): EpisodeMasterConformJob["boundaries"] {
  return {
    sourceMediaRemainsImmutable: true,
    approvedProgramIntentRemainsImmutable: true,
    reviewCandidateIsNotMasterInput: true,
    outputIsUnapprovedMasterCandidate: true,
    outputIsNotPublicationMedia: true,
    masterRequiresSeparateReview: true,
    serverMustVerifyResultBeforePlayback: true,
    localArtifactsRequireExactExecutor: true,
  };
}

function stable(value: unknown): unknown { if (Array.isArray(value)) return value.map(stable); if (!value || typeof value !== "object") return value; return Object.fromEntries(Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, stable(item)])); }
function record(value: unknown): Record<string, unknown> { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
function required(value: unknown, name: string) { if (typeof value !== "string" || !value.trim()) invalid(`${name} is required.`); return value.trim(); }
function safeId(value: unknown, name: string) { const result = required(value, name); if (!SAFE_ID.test(result)) invalid(`${name} is invalid.`); return result; }
function sha(value: unknown, name: string) { const result = required(value, name).toLowerCase(); if (!SHA256.test(result)) invalid(`${name} is invalid.`); return result; }
function iso(value: unknown, name: string) { const result = required(value, name); if (!Number.isFinite(Date.parse(result))) invalid(`${name} is invalid.`); return new Date(result).toISOString(); }
function email(value: unknown, name: string) { const result = required(value, name).toLowerCase(); if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(result)) invalid(`${name} is invalid.`); return result; }
function integer(value: unknown, name: string) { const result = Number(value); if (!Number.isSafeInteger(result) || result < 0) invalid(`${name} is invalid.`); return result; }
function positive(value: unknown, name: string) { const result = Number(value); if (!Number.isFinite(result) || result <= 0) invalid(`${name} is invalid.`); return result; }
function positiveInteger(value: unknown, name: string) { const result = Number(value); if (!Number.isSafeInteger(result) || result <= 0) invalid(`${name} is invalid.`); return result; }
function invalid(message: string): never { throw new Error(message); }
