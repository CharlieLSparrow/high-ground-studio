export const EPISODE_RENDER_PROOF_CONTRACT_VERSION = 1 as const;
export const EPISODE_RENDER_PROOF_JOB_KIND = "quipsly-episode-render-proof-job-v1" as const;
export const EPISODE_RENDER_PROOF_RESULT_KIND = "quipsly-episode-render-proof-result-v1" as const;

export type EpisodeRenderProofSource = {
  laneId: string;
  mediaAssetId: string;
  sourceId: string;
  recordingAssetId: string | null;
  label: string;
  kind: "audio" | "video";
  role: "primary" | "secondary" | "clip" | "audio" | "reference";
  provider: "local";
  locator: string;
  generation: string;
  sha256: string;
  sizeBytes: number;
  contentType: string;
  sequenceOffsetSeconds: number;
  sourceStartSeconds: number;
  sourceDurationSeconds: number;
};

export type EpisodeRenderProofJob = {
  kind: typeof EPISODE_RENDER_PROOF_JOB_KIND;
  version: typeof EPISODE_RENDER_PROOF_CONTRACT_VERSION;
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
  proof: {
    sequenceStartSeconds: number;
    sequenceEndSeconds: number;
    decisionId: string | null;
    decisionKind: string;
    visualLaneIds: string[];
    clipLaneId: string | null;
    audioLaneIds: string[];
  };
  sources: EpisodeRenderProofSource[];
  target: {
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
    variantKind: "episode-edit-proof";
  };
  boundaries: {
    sourceMediaRemainsImmutable: true;
    editBranchRemainsCanonicalIntent: true;
    proofIsNotApprovedOutput: true;
    proofIsNotPublicationMedia: true;
    serverMustVerifyResultBeforePlayback: true;
  };
};

export type EpisodeRenderProofResult = {
  kind: typeof EPISODE_RENDER_PROOF_RESULT_KIND;
  version: typeof EPISODE_RENDER_PROOF_CONTRACT_VERSION;
  jobId: string;
  completedAt: string;
  manifestSha256: string;
  output: {
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
    variantKind: "episode-edit-proof";
  };
  worker: {
    executionId: string;
    buildId: string;
    imageDigest: string | null;
    attempt: number;
    ffmpegVersion: string;
  };
  boundaries: EpisodeRenderProofJob["boundaries"];
};

const SAFE_ID = /^[A-Za-z0-9:_-]{4,220}$/;
const SHA256 = /^[0-9a-f]{64}$/;

export function buildEpisodeRenderProofTargetLocator(input: {
  episodeProductionId: string;
  branchId: string;
  branchRevision: number;
  jobId: string;
}) {
  return `media-vault/episode-render-proofs/${safeId(input.episodeProductionId, "episodeProductionId")}/${safeId(input.branchId, "branchId")}/revision-${nonnegativeInteger(input.branchRevision, "branchRevision")}/${safeId(input.jobId, "jobId")}.mp4`;
}

export function newEpisodeRenderProofJob(
  input: Omit<EpisodeRenderProofJob, "kind" | "version" | "boundaries">,
): EpisodeRenderProofJob {
  return parseEpisodeRenderProofJob({
    ...input,
    kind: EPISODE_RENDER_PROOF_JOB_KIND,
    version: EPISODE_RENDER_PROOF_CONTRACT_VERSION,
    boundaries: boundaries(),
  });
}

export function parseEpisodeRenderProofJob(
  value: unknown,
  expectedJobId?: string,
): EpisodeRenderProofJob {
  const row = record(value);
  const proof = record(row.proof);
  const target = record(row.target);
  const declaredBoundaries = record(row.boundaries);
  const jobId = safeId(row.jobId, "jobId");
  const episodeProductionId = safeId(row.episodeProductionId, "episodeProductionId");
  const branchId = safeId(row.branchId, "branchId");
  const branchRevision = nonnegativeInteger(row.branchRevision, "branchRevision");
  const sequenceStartSeconds = nonnegative(rowValue(proof.sequenceStartSeconds), "proof.sequenceStartSeconds");
  const sequenceEndSeconds = positive(rowValue(proof.sequenceEndSeconds), "proof.sequenceEndSeconds");
  if (
    row.kind !== EPISODE_RENDER_PROOF_JOB_KIND
    || row.version !== EPISODE_RENDER_PROOF_CONTRACT_VERSION
    || (expectedJobId && expectedJobId !== jobId)
    || sequenceEndSeconds <= sequenceStartSeconds
    || sequenceEndSeconds - sequenceStartSeconds > 12.001
    || target.provider !== "local"
    || target.locator !== buildEpisodeRenderProofTargetLocator({ episodeProductionId, branchId, branchRevision, jobId })
    || target.contentType !== "video/mp4"
    || target.container !== "mp4"
    || target.videoCodec !== "h264"
    || target.audioCodec !== "aac"
    || target.width !== 1280
    || target.height !== 720
    || target.fps !== 24
    || target.sampleRateHz !== 48_000
    || target.variantKind !== "episode-edit-proof"
    || declaredBoundaries.sourceMediaRemainsImmutable !== true
    || declaredBoundaries.editBranchRemainsCanonicalIntent !== true
    || declaredBoundaries.proofIsNotApprovedOutput !== true
    || declaredBoundaries.proofIsNotPublicationMedia !== true
    || declaredBoundaries.serverMustVerifyResultBeforePlayback !== true
  ) invalid("Episode render proof job contract or target authority is invalid.");
  const sources = array(row.sources).map(parseSource);
  const laneIds = new Set(sources.map((source) => source.laneId));
  if (!sources.length || laneIds.size !== sources.length) invalid("Episode render proof sources must be non-empty and lane-unique.");
  const visualLaneIds = ids(proof.visualLaneIds, "proof.visualLaneIds");
  const audioLaneIds = ids(proof.audioLaneIds, "proof.audioLaneIds");
  const clipLaneId = proof.clipLaneId === null ? null : safeId(proof.clipLaneId, "proof.clipLaneId");
  if (
    [...visualLaneIds, ...audioLaneIds, ...(clipLaneId ? [clipLaneId] : [])].some((id) => !laneIds.has(id))
    || visualLaneIds.some((id) => sources.find((source) => source.laneId === id)?.kind !== "video")
    || audioLaneIds.length === 0
  ) invalid("Episode render proof lane selection does not match its exact sources.");
  return {
    kind: EPISODE_RENDER_PROOF_JOB_KIND,
    version: EPISODE_RENDER_PROOF_CONTRACT_VERSION,
    jobId,
    projectId: safeId(row.projectId, "projectId"),
    episodeProductionId,
    branchId,
    branchRevision,
    requestedByEmail: requiredText(row.requestedByEmail, "requestedByEmail").toLowerCase(),
    clientRequestId: safeId(row.clientRequestId, "clientRequestId"),
    queuedAt: iso(row.queuedAt, "queuedAt"),
    timelineFingerprintSha256: sha(row.timelineFingerprintSha256, "timelineFingerprintSha256"),
    sourceProjectionFingerprintSha256: sha(row.sourceProjectionFingerprintSha256, "sourceProjectionFingerprintSha256"),
    editStateFingerprintSha256: sha(row.editStateFingerprintSha256, "editStateFingerprintSha256"),
    manifestSha256: sha(row.manifestSha256, "manifestSha256"),
    proof: {
      sequenceStartSeconds,
      sequenceEndSeconds,
      decisionId: proof.decisionId === null ? null : safeId(proof.decisionId, "proof.decisionId"),
      decisionKind: requiredText(proof.decisionKind, "proof.decisionKind"),
      visualLaneIds,
      clipLaneId,
      audioLaneIds,
    },
    sources,
    target: {
      provider: "local",
      locator: String(target.locator),
      contentType: "video/mp4",
      container: "mp4",
      videoCodec: "h264",
      audioCodec: "aac",
      width: 1280,
      height: 720,
      fps: 24,
      sampleRateHz: 48_000,
      variantKind: "episode-edit-proof",
    },
    boundaries: boundaries(),
  };
}

export function episodeRenderProofManifestCanonicalJson(job: EpisodeRenderProofJob | unknown) {
  const parsed = parseEpisodeRenderProofJob(job);
  return JSON.stringify(stable({ ...parsed, manifestSha256: null }));
}

export function parseEpisodeRenderProofResult(
  value: unknown,
  expectedJob: EpisodeRenderProofJob | unknown,
): EpisodeRenderProofResult {
  const job = parseEpisodeRenderProofJob(expectedJob);
  const row = record(value);
  const output = record(row.output);
  const worker = record(row.worker);
  const resultBoundaries = record(row.boundaries);
  const outputSha256 = sha(output.sha256, "output.sha256");
  const durationSeconds = positive(rowValue(output.durationSeconds), "output.durationSeconds");
  const expectedDuration = job.proof.sequenceEndSeconds - job.proof.sequenceStartSeconds;
  if (
    row.kind !== EPISODE_RENDER_PROOF_RESULT_KIND
    || row.version !== EPISODE_RENDER_PROOF_CONTRACT_VERSION
    || row.jobId !== job.jobId
    || row.manifestSha256 !== job.manifestSha256
    || output.provider !== "local"
    || output.locator !== job.target.locator
    || output.generation !== `sha256:${outputSha256}`
    || output.contentType !== job.target.contentType
    || output.width !== job.target.width
    || output.height !== job.target.height
    || output.completeDecode !== true
    || output.fastStart !== true
    || output.variantKind !== job.target.variantKind
    || Math.abs(durationSeconds - expectedDuration) > 0.2
    || resultBoundaries.sourceMediaRemainsImmutable !== true
    || resultBoundaries.editBranchRemainsCanonicalIntent !== true
    || resultBoundaries.proofIsNotApprovedOutput !== true
    || resultBoundaries.proofIsNotPublicationMedia !== true
    || resultBoundaries.serverMustVerifyResultBeforePlayback !== true
  ) invalid("Episode render proof result no longer matches its exact edit manifest.");
  return {
    kind: EPISODE_RENDER_PROOF_RESULT_KIND,
    version: EPISODE_RENDER_PROOF_CONTRACT_VERSION,
    jobId: job.jobId,
    completedAt: iso(row.completedAt, "completedAt"),
    manifestSha256: String(row.manifestSha256),
    output: {
      provider: "local",
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
      variantKind: "episode-edit-proof",
    },
    worker: {
      executionId: safeId(worker.executionId, "worker.executionId"),
      buildId: requiredText(worker.buildId, "worker.buildId"),
      imageDigest: worker.imageDigest === null ? null : requiredText(worker.imageDigest, "worker.imageDigest"),
      attempt: positiveInteger(worker.attempt, "worker.attempt"),
      ffmpegVersion: requiredText(worker.ffmpegVersion, "worker.ffmpegVersion"),
    },
    boundaries: boundaries(),
  };
}

export function newEpisodeRenderProofResult(
  input: Omit<EpisodeRenderProofResult, "kind" | "version" | "boundaries">,
  expectedJob: EpisodeRenderProofJob | unknown,
) {
  return parseEpisodeRenderProofResult({
    ...input,
    kind: EPISODE_RENDER_PROOF_RESULT_KIND,
    version: EPISODE_RENDER_PROOF_CONTRACT_VERSION,
    boundaries: boundaries(),
  }, expectedJob);
}

function parseSource(value: unknown): EpisodeRenderProofSource {
  const row = record(value);
  const kind = row.kind === "audio" || row.kind === "video" ? row.kind : invalid("sources.kind");
  const role = row.role === "primary" || row.role === "secondary" || row.role === "clip" || row.role === "audio" || row.role === "reference"
    ? row.role
    : invalid("sources.role");
  const sourceSha256 = sha(row.sha256, "sources.sha256");
  if (row.provider !== "local" || row.generation !== `sha256:${sourceSha256}`) invalid("Episode render proof currently requires exact local sources.");
  return {
    laneId: safeId(row.laneId, "sources.laneId"),
    mediaAssetId: safeId(row.mediaAssetId, "sources.mediaAssetId"),
    sourceId: safeId(row.sourceId, "sources.sourceId"),
    recordingAssetId: row.recordingAssetId === null ? null : safeId(row.recordingAssetId, "sources.recordingAssetId"),
    label: requiredText(row.label, "sources.label"),
    kind,
    role,
    provider: "local",
    locator: requiredText(row.locator, "sources.locator"),
    generation: String(row.generation),
    sha256: sourceSha256,
    sizeBytes: positiveInteger(row.sizeBytes, "sources.sizeBytes"),
    contentType: requiredText(row.contentType, "sources.contentType"),
    sequenceOffsetSeconds: nonnegative(rowValue(row.sequenceOffsetSeconds), "sources.sequenceOffsetSeconds"),
    sourceStartSeconds: nonnegative(rowValue(row.sourceStartSeconds), "sources.sourceStartSeconds"),
    sourceDurationSeconds: positive(rowValue(row.sourceDurationSeconds), "sources.sourceDurationSeconds"),
  };
}

function boundaries(): EpisodeRenderProofJob["boundaries"] {
  return {
    sourceMediaRemainsImmutable: true,
    editBranchRemainsCanonicalIntent: true,
    proofIsNotApprovedOutput: true,
    proofIsNotPublicationMedia: true,
    serverMustVerifyResultBeforePlayback: true,
  };
}

function stable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stable);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, item]) => [key, stable(item)]));
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
function array(value: unknown) { return Array.isArray(value) ? value : invalid("Expected an array."); }
function rowValue(value: unknown) { return typeof value === "number" ? value : Number(value); }
function ids(value: unknown, name: string) {
  const result = array(value).map((item) => safeId(item, name));
  if (new Set(result).size !== result.length) invalid(`${name} contains duplicates.`);
  return result;
}
function safeId(value: unknown, name: string) {
  const result = requiredText(value, name);
  if (!SAFE_ID.test(result)) invalid(`${name} is invalid.`);
  return result;
}
function requiredText(value: unknown, name: string) {
  if (typeof value !== "string" || !value.trim()) invalid(`${name} is required.`);
  return value.trim();
}
function sha(value: unknown, name: string) {
  const result = requiredText(value, name).toLowerCase();
  if (!SHA256.test(result)) invalid(`${name} is invalid.`);
  return result;
}
function iso(value: unknown, name: string) {
  const result = requiredText(value, name);
  if (!Number.isFinite(Date.parse(result))) invalid(`${name} is invalid.`);
  return new Date(result).toISOString();
}
function nonnegative(value: number, name: string) {
  if (!Number.isFinite(value) || value < 0) invalid(`${name} is invalid.`);
  return value;
}
function positive(value: number, name: string) {
  if (!Number.isFinite(value) || value <= 0) invalid(`${name} is invalid.`);
  return value;
}
function nonnegativeInteger(value: unknown, name: string) {
  const result = rowValue(value);
  if (!Number.isSafeInteger(result) || result < 0) invalid(`${name} is invalid.`);
  return result;
}
function positiveInteger(value: unknown, name: string) {
  const result = rowValue(value);
  if (!Number.isSafeInteger(result) || result <= 0) invalid(`${name} is invalid.`);
  return result;
}
function invalid(message: string): never { throw new Error(message); }
