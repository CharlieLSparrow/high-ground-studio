import {
  parseExecutorLocalArtifactAuthority,
  sameExecutorLocalArtifactAuthority,
  type ExecutorLocalArtifactAuthority,
} from "./artifact-portability.js";
import {
  parseEpisodeRenderProofSource,
  type EpisodeRenderProofSource,
} from "./episode-render-proof.js";

export const EPISODE_PROGRAM_RENDER_CONTRACT_VERSION = 1 as const;
export const EPISODE_PROGRAM_RENDER_JOB_KIND =
  "quipsly-episode-program-render-job-v1" as const;
export const EPISODE_PROGRAM_RENDER_RESULT_KIND =
  "quipsly-episode-program-render-result-v1" as const;
export const EPISODE_PROGRAM_REVIEW_PROFILE =
  "episode-program-review-1280x720-24fps-v1" as const;

export type EpisodeProgramRenderChunk = {
  id: string;
  outputStartSeconds: number;
  sequenceStartSeconds: number;
  sequenceEndSeconds: number;
  decisionId: string;
  decisionKind: string;
  visualLaneIds: string[];
  clipLaneId: string | null;
  audioLaneIds: string[];
};

export type EpisodeProgramRenderJob = {
  kind: typeof EPISODE_PROGRAM_RENDER_JOB_KIND;
  version: typeof EPISODE_PROGRAM_RENDER_CONTRACT_VERSION;
  jobId: string;
  projectId: string;
  episodeProductionId: string;
  branchId: string;
  branchRevision: number;
  requestedByEmail: string;
  clientRequestId: string;
  queuedAt: string;
  timelineFingerprintSha256: string;
  sourceProjectionFingerprintSha256: string;
  editStateFingerprintSha256: string;
  manifestSha256: string;
  renderProfile: typeof EPISODE_PROGRAM_REVIEW_PROFILE;
  executionTarget: ExecutorLocalArtifactAuthority;
  program: {
    sequenceDurationSeconds: number;
    outputDurationSeconds: number;
    skippedDurationSeconds: number;
    chunkCount: number;
  };
  sources: EpisodeRenderProofSource[];
  chunks: EpisodeProgramRenderChunk[];
  target: ExecutorLocalArtifactAuthority & {
    provider: "local";
    locator: string;
    contentType: "video/mp4";
    container: "mp4";
    videoCodec: "h264";
    audioCodec: "aac";
    width: 1280;
    height: 720;
    fps: 24;
    sampleRateHz: 48_000;
    variantKind: "episode-program-review";
  };
  boundaries: {
    sourceMediaRemainsImmutable: true;
    editBranchRemainsCanonicalIntent: true;
    outputIsReviewCandidate: true;
    outputIsNotApprovedMaster: true;
    outputIsNotPublicationMedia: true;
    approvalRequiresSeparateReceipt: true;
    serverMustVerifyResultBeforePlayback: true;
    localArtifactsRequireExactExecutor: true;
    editorIntentIsPortableWithoutRenderBytes: true;
  };
};

export type EpisodeProgramRenderResult = {
  kind: typeof EPISODE_PROGRAM_RENDER_RESULT_KIND;
  version: typeof EPISODE_PROGRAM_RENDER_CONTRACT_VERSION;
  jobId: string;
  completedAt: string;
  manifestSha256: string;
  output: ExecutorLocalArtifactAuthority & {
    provider: "local";
    locator: string;
    generation: string;
    sha256: string;
    sizeBytes: number;
    contentType: "video/mp4";
    durationSeconds: number;
    width: 1280;
    height: 720;
    fps: number;
    videoCodec: string;
    audioCodec: string | null;
    completeDecode: true;
    fastStart: true;
    variantKind: "episode-program-review";
  };
  worker: ExecutorLocalArtifactAuthority & {
    executionId: string;
    buildId: string;
    imageDigest: string | null;
    attempt: number;
    ffmpegVersion: string;
    renderedChunkCount: number;
  };
  boundaries: EpisodeProgramRenderJob["boundaries"];
};

const SAFE_ID = /^[A-Za-z0-9:_-]{4,220}$/;
const SHA256 = /^[0-9a-f]{64}$/;

export function buildEpisodeProgramRenderTargetLocator(input: {
  episodeProductionId: string;
  branchId: string;
  branchRevision: number;
  jobId: string;
}) {
  return `media-vault/episode-program-renders/${safeId(input.episodeProductionId, "episodeProductionId")}/${safeId(input.branchId, "branchId")}/revision-${nonnegativeInteger(input.branchRevision, "branchRevision")}/${safeId(input.jobId, "jobId")}.mp4`;
}

export function newEpisodeProgramRenderJob(
  input: Omit<EpisodeProgramRenderJob, "kind" | "version" | "boundaries">,
): EpisodeProgramRenderJob {
  return parseEpisodeProgramRenderJob({
    ...input,
    kind: EPISODE_PROGRAM_RENDER_JOB_KIND,
    version: EPISODE_PROGRAM_RENDER_CONTRACT_VERSION,
    boundaries: boundaries(),
  });
}

export function parseEpisodeProgramRenderJob(
  value: unknown,
  expectedJobId?: string,
): EpisodeProgramRenderJob {
  const row = record(value);
  const program = record(row.program);
  const target = record(row.target);
  const declaredBoundaries = record(row.boundaries);
  const executionTarget = parseExecutorLocalArtifactAuthority(
    row.executionTarget,
    "executionTarget",
  );
  const targetAuthority = parseExecutorLocalArtifactAuthority(target, "target");
  const jobId = safeId(row.jobId, "jobId");
  if (expectedJobId && jobId !== expectedJobId) invalid("Program render job identity changed.");
  const sources = array(row.sources).map(parseEpisodeRenderProofSource);
  if (!sources.length || new Set(sources.map((source) => source.laneId)).size !== sources.length) {
    invalid("Program render sources must be non-empty and lane-unique.");
  }
  if (sources.some((source) => !sameExecutorLocalArtifactAuthority(executionTarget, source))) {
    invalid("Program render sources must belong to the selected executor.");
  }
  const sourceByLane = new Map(sources.map((source) => [source.laneId, source]));
  const chunks = array(row.chunks).map((item, index) => parseChunk(item, index));
  if (!chunks.length) invalid("Program render requires at least one visible chunk.");
  let outputCursor = 0;
  let previousSequenceEnd = -1;
  for (const chunk of chunks) {
    if (Math.abs(chunk.outputStartSeconds - outputCursor) > 0.001) {
      invalid("Program render chunks must be contiguous on the output clock.");
    }
    if (chunk.sequenceStartSeconds < previousSequenceEnd - 0.001) {
      invalid("Program render chunks must remain ordered on the Episode clock.");
    }
    const duration = chunk.sequenceEndSeconds - chunk.sequenceStartSeconds;
    if (duration > 30.001) invalid("Program render chunks may not exceed thirty seconds.");
    const laneIds = unique([
      ...chunk.visualLaneIds,
      ...chunk.audioLaneIds,
      ...(chunk.clipLaneId ? [chunk.clipLaneId] : []),
    ]);
    if (!chunk.audioLaneIds.length || laneIds.some((laneId) => !sourceByLane.has(laneId))) {
      invalid("A program render chunk references unavailable exact sources.");
    }
    for (const laneId of laneIds) {
      const source = sourceByLane.get(laneId)!;
      if (
        chunk.sequenceStartSeconds < source.sequenceOffsetSeconds - 0.001
        || chunk.sequenceEndSeconds
          > source.sequenceOffsetSeconds + source.sourceDurationSeconds + 0.001
      ) {
        invalid("A program render source does not cover its complete chunk.");
      }
    }
    outputCursor += duration;
    previousSequenceEnd = chunk.sequenceEndSeconds;
  }
  const sequenceDurationSeconds = positive(
    rowValue(program.sequenceDurationSeconds),
    "program.sequenceDurationSeconds",
  );
  const outputDurationSeconds = positive(
    rowValue(program.outputDurationSeconds),
    "program.outputDurationSeconds",
  );
  const skippedDurationSeconds = nonnegative(
    rowValue(program.skippedDurationSeconds),
    "program.skippedDurationSeconds",
  );
  if (
    Math.abs(outputCursor - outputDurationSeconds) > 0.001
    || Math.abs(
      sequenceDurationSeconds - outputDurationSeconds - skippedDurationSeconds,
    ) > 0.001
    || nonnegativeInteger(program.chunkCount, "program.chunkCount") !== chunks.length
  ) invalid("Program render duration accounting is inconsistent.");
  if (
    row.kind !== EPISODE_PROGRAM_RENDER_JOB_KIND
    || row.version !== EPISODE_PROGRAM_RENDER_CONTRACT_VERSION
    || row.renderProfile !== EPISODE_PROGRAM_REVIEW_PROFILE
    || target.provider !== "local"
    || target.contentType !== "video/mp4"
    || target.container !== "mp4"
    || target.videoCodec !== "h264"
    || target.audioCodec !== "aac"
    || target.width !== 1280
    || target.height !== 720
    || target.fps !== 24
    || target.sampleRateHz !== 48_000
    || target.variantKind !== "episode-program-review"
    || !sameExecutorLocalArtifactAuthority(executionTarget, targetAuthority)
    || declaredBoundaries.sourceMediaRemainsImmutable !== true
    || declaredBoundaries.editBranchRemainsCanonicalIntent !== true
    || declaredBoundaries.outputIsReviewCandidate !== true
    || declaredBoundaries.outputIsNotApprovedMaster !== true
    || declaredBoundaries.outputIsNotPublicationMedia !== true
    || declaredBoundaries.approvalRequiresSeparateReceipt !== true
    || declaredBoundaries.serverMustVerifyResultBeforePlayback !== true
    || declaredBoundaries.localArtifactsRequireExactExecutor !== true
    || declaredBoundaries.editorIntentIsPortableWithoutRenderBytes !== true
  ) invalid("Program render contract or executor authority is invalid.");
  return {
    kind: EPISODE_PROGRAM_RENDER_JOB_KIND,
    version: EPISODE_PROGRAM_RENDER_CONTRACT_VERSION,
    jobId,
    projectId: safeId(row.projectId, "projectId"),
    episodeProductionId: safeId(row.episodeProductionId, "episodeProductionId"),
    branchId: safeId(row.branchId, "branchId"),
    branchRevision: nonnegativeInteger(row.branchRevision, "branchRevision"),
    requestedByEmail: requiredText(row.requestedByEmail, "requestedByEmail").toLowerCase(),
    clientRequestId: safeId(row.clientRequestId, "clientRequestId"),
    queuedAt: iso(row.queuedAt, "queuedAt"),
    timelineFingerprintSha256: sha(row.timelineFingerprintSha256, "timelineFingerprintSha256"),
    sourceProjectionFingerprintSha256: sha(row.sourceProjectionFingerprintSha256, "sourceProjectionFingerprintSha256"),
    editStateFingerprintSha256: sha(row.editStateFingerprintSha256, "editStateFingerprintSha256"),
    manifestSha256: sha(row.manifestSha256, "manifestSha256"),
    renderProfile: EPISODE_PROGRAM_REVIEW_PROFILE,
    executionTarget,
    program: {
      sequenceDurationSeconds,
      outputDurationSeconds,
      skippedDurationSeconds,
      chunkCount: chunks.length,
    },
    sources,
    chunks,
    target: {
      provider: "local",
      ...targetAuthority,
      locator: requiredText(target.locator, "target.locator"),
      contentType: "video/mp4",
      container: "mp4",
      videoCodec: "h264",
      audioCodec: "aac",
      width: 1280,
      height: 720,
      fps: 24,
      sampleRateHz: 48_000,
      variantKind: "episode-program-review",
    },
    boundaries: boundaries(),
  };
}

export function episodeProgramRenderManifestCanonicalJson(
  job: EpisodeProgramRenderJob | unknown,
) {
  const parsed = parseEpisodeProgramRenderJob(job);
  return JSON.stringify(stable({ ...parsed, manifestSha256: null }));
}

export function parseEpisodeProgramRenderResult(
  value: unknown,
  expectedJob: EpisodeProgramRenderJob | unknown,
): EpisodeProgramRenderResult {
  const job = parseEpisodeProgramRenderJob(expectedJob);
  const row = record(value);
  const output = record(row.output);
  const worker = record(row.worker);
  const outputAuthority = parseExecutorLocalArtifactAuthority(output, "output");
  const workerAuthority = parseExecutorLocalArtifactAuthority(worker, "worker");
  const declaredBoundaries = record(row.boundaries);
  const outputSha256 = sha(output.sha256, "output.sha256");
  const durationSeconds = positive(rowValue(output.durationSeconds), "output.durationSeconds");
  if (
    row.kind !== EPISODE_PROGRAM_RENDER_RESULT_KIND
    || row.version !== EPISODE_PROGRAM_RENDER_CONTRACT_VERSION
    || row.jobId !== job.jobId
    || row.manifestSha256 !== job.manifestSha256
    || output.provider !== "local"
    || output.locator !== job.target.locator
    || output.generation !== `sha256:${outputSha256}`
    || output.contentType !== "video/mp4"
    || output.width !== 1280
    || output.height !== 720
    || output.completeDecode !== true
    || output.fastStart !== true
    || output.variantKind !== "episode-program-review"
    || !sameExecutorLocalArtifactAuthority(job.executionTarget, outputAuthority)
    || !sameExecutorLocalArtifactAuthority(job.executionTarget, workerAuthority)
    || Math.abs(durationSeconds - job.program.outputDurationSeconds) > 0.25
    || nonnegativeInteger(worker.renderedChunkCount, "worker.renderedChunkCount") !== job.chunks.length
    || declaredBoundaries.sourceMediaRemainsImmutable !== true
    || declaredBoundaries.outputIsNotApprovedMaster !== true
    || declaredBoundaries.outputIsNotPublicationMedia !== true
    || declaredBoundaries.approvalRequiresSeparateReceipt !== true
  ) invalid("Program render result no longer matches its exact conform manifest.");
  return {
    kind: EPISODE_PROGRAM_RENDER_RESULT_KIND,
    version: EPISODE_PROGRAM_RENDER_CONTRACT_VERSION,
    jobId: job.jobId,
    completedAt: iso(row.completedAt, "completedAt"),
    manifestSha256: String(row.manifestSha256),
    output: {
      provider: "local",
      ...outputAuthority,
      locator: String(output.locator),
      generation: String(output.generation),
      sha256: outputSha256,
      sizeBytes: positiveInteger(output.sizeBytes, "output.sizeBytes"),
      contentType: "video/mp4",
      durationSeconds,
      width: 1280,
      height: 720,
      fps: positive(rowValue(output.fps), "output.fps"),
      videoCodec: requiredText(output.videoCodec, "output.videoCodec"),
      audioCodec: output.audioCodec === null ? null : requiredText(output.audioCodec, "output.audioCodec"),
      completeDecode: true,
      fastStart: true,
      variantKind: "episode-program-review",
    },
    worker: {
      ...workerAuthority,
      executionId: safeId(worker.executionId, "worker.executionId"),
      buildId: requiredText(worker.buildId, "worker.buildId"),
      imageDigest: worker.imageDigest === null ? null : requiredText(worker.imageDigest, "worker.imageDigest"),
      attempt: positiveInteger(worker.attempt, "worker.attempt"),
      ffmpegVersion: requiredText(worker.ffmpegVersion, "worker.ffmpegVersion"),
      renderedChunkCount: job.chunks.length,
    },
    boundaries: boundaries(),
  };
}

export function newEpisodeProgramRenderResult(
  input: Omit<EpisodeProgramRenderResult, "kind" | "version" | "boundaries">,
  expectedJob: EpisodeProgramRenderJob | unknown,
) {
  return parseEpisodeProgramRenderResult({
    ...input,
    kind: EPISODE_PROGRAM_RENDER_RESULT_KIND,
    version: EPISODE_PROGRAM_RENDER_CONTRACT_VERSION,
    boundaries: boundaries(),
  }, expectedJob);
}

function parseChunk(value: unknown, index: number): EpisodeProgramRenderChunk {
  const row = record(value);
  const sequenceStartSeconds = nonnegative(rowValue(row.sequenceStartSeconds), `chunks[${index}].sequenceStartSeconds`);
  const sequenceEndSeconds = positive(rowValue(row.sequenceEndSeconds), `chunks[${index}].sequenceEndSeconds`);
  if (sequenceEndSeconds - sequenceStartSeconds < (1 / 24) - 0.001) {
    invalid("Program render chunks must contain at least one output frame.");
  }
  const visualLaneIds = ids(row.visualLaneIds, `chunks[${index}].visualLaneIds`);
  const audioLaneIds = ids(row.audioLaneIds, `chunks[${index}].audioLaneIds`);
  const clipLaneId = row.clipLaneId === null ? null : safeId(row.clipLaneId, `chunks[${index}].clipLaneId`);
  return {
    id: safeId(row.id, `chunks[${index}].id`),
    outputStartSeconds: nonnegative(rowValue(row.outputStartSeconds), `chunks[${index}].outputStartSeconds`),
    sequenceStartSeconds,
    sequenceEndSeconds,
    decisionId: safeId(row.decisionId, `chunks[${index}].decisionId`),
    decisionKind: requiredText(row.decisionKind, `chunks[${index}].decisionKind`),
    visualLaneIds,
    clipLaneId,
    audioLaneIds,
  };
}

function boundaries(): EpisodeProgramRenderJob["boundaries"] {
  return {
    sourceMediaRemainsImmutable: true,
    editBranchRemainsCanonicalIntent: true,
    outputIsReviewCandidate: true,
    outputIsNotApprovedMaster: true,
    outputIsNotPublicationMedia: true,
    approvalRequiresSeparateReceipt: true,
    serverMustVerifyResultBeforePlayback: true,
    localArtifactsRequireExactExecutor: true,
    editorIntentIsPortableWithoutRenderBytes: true,
  };
}

function stable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stable);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, item]) => [key, stable(item)]));
}

function record(value: unknown): Record<string, unknown> { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
function array(value: unknown) { return Array.isArray(value) ? value : invalid("Expected an array."); }
function rowValue(value: unknown) { return typeof value === "number" ? value : Number(value); }
function unique(values: string[]) { return [...new Set(values)]; }
function ids(value: unknown, name: string) { const result = array(value).map((item) => safeId(item, name)); if (new Set(result).size !== result.length) invalid(`${name} contains duplicates.`); return result; }
function safeId(value: unknown, name: string) { const result = requiredText(value, name); if (!SAFE_ID.test(result)) invalid(`${name} is invalid.`); return result; }
function requiredText(value: unknown, name: string) { if (typeof value !== "string" || !value.trim()) invalid(`${name} is required.`); return value.trim(); }
function sha(value: unknown, name: string) { const result = requiredText(value, name).toLowerCase(); if (!SHA256.test(result)) invalid(`${name} is invalid.`); return result; }
function iso(value: unknown, name: string) { const result = requiredText(value, name); if (!Number.isFinite(Date.parse(result))) invalid(`${name} is invalid.`); return new Date(result).toISOString(); }
function nonnegative(value: number, name: string) { if (!Number.isFinite(value) || value < 0) invalid(`${name} is invalid.`); return value; }
function positive(value: number, name: string) { if (!Number.isFinite(value) || value <= 0) invalid(`${name} is invalid.`); return value; }
function nonnegativeInteger(value: unknown, name: string) { const result = rowValue(value); if (!Number.isSafeInteger(result) || result < 0) invalid(`${name} is invalid.`); return result; }
function positiveInteger(value: unknown, name: string) { const result = rowValue(value); if (!Number.isSafeInteger(result) || result <= 0) invalid(`${name} is invalid.`); return result; }
function invalid(message: string): never { throw new Error(message); }
