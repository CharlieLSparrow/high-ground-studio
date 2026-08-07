export const SPATIAL_RENDER_CONTRACT_VERSION = 1 as const;
export const SPATIAL_RENDER_JOB_KIND = "quipsly-spatial-render-job-v1" as const;
export const SPATIAL_RENDER_RESULT_KIND = "quipsly-spatial-render-result-v1" as const;
export const SPATIAL_STITCH_PROFILE = "insta360-flowstate-equirectangular-master-v1" as const;

export const SPATIAL_RENDER_PROFILES = {
  "spatial-proof-720p24": {
    id: "spatial-proof-720p24",
    label: "Spatial proof",
    width: 1280,
    height: 720,
    fps: 24,
    videoCodec: "h264",
    variantKind: "spatial-reframe-proof",
    approvedOutput: false,
  },
  "spatial-flat-4k24": {
    id: "spatial-flat-4k24",
    label: "4K spatial edit source",
    width: 3840,
    height: 2160,
    fps: 24,
    videoCodec: "h265",
    variantKind: "spatial-reframe-edit-source",
    approvedOutput: false,
  },
} as const;

export type SpatialRenderProfileId = keyof typeof SPATIAL_RENDER_PROFILES;
export type SpatialSourceMemberRole = "primary-original" | "secondary-original";
export type SpatialInterpolation = "hold" | "linear" | "ease";

export type SpatialRenderSourceMember = {
  sourceRevisionId: string;
  role: SpatialSourceMemberRole;
  fileName: string;
  provider: "local";
  locator: string;
  generation: string;
  sha256: string;
  sizeBytes: number;
  contentType: string;
  requiredForRender: true;
};

export type SpatialReframeKeyframe = {
  sourceSeconds: number;
  panDegrees: number;
  tiltDegrees: number;
  rollDegrees: number;
  fieldOfViewDegrees: number;
  interpolation: SpatialInterpolation;
};

export type SpatialRenderJob = {
  kind: typeof SPATIAL_RENDER_JOB_KIND;
  version: typeof SPATIAL_RENDER_CONTRACT_VERSION;
  jobId: string;
  projectId: string;
  episodeProductionId: string;
  timelinePlacementId: string;
  timelineFingerprintSha256: string;
  requestedByUserId: string;
  requestedByEmail: string;
  clientRequestId: string;
  queuedAt: string;
  sourcePackage: {
    sourceSetId: string;
    sourceSetIdentitySha256: string;
    sourceClockRevisionId: string;
    sourceContentSha256: string;
    members: SpatialRenderSourceMember[];
  };
  selection: {
    sourceRangeId: string;
    selectorSha256: string;
    startSeconds: number;
    endSeconds: number;
  };
  recipe: {
    schema: "quipsly-360-reframe-v1";
    projection: "equirectangular";
    aspectRatio: "16:9" | "9:16" | "1:1";
    stabilization: "flowstate" | "none";
    horizonLock: boolean;
    keyframes: SpatialReframeKeyframe[];
  };
  stitch: {
    profile: typeof SPATIAL_STITCH_PROFILE;
    adapter: "insta360-mediasdk";
    minimumMajorVersion: 3;
    scope: "complete-source";
    stitchType: "ai-flow";
    outputProjection: "equirectangular";
    width: 5760;
    height: 2880;
    videoCodec: "h265";
    target: SpatialLocalTarget;
  };
  reframe: {
    adapter: "ffmpeg-v360";
    profile: SpatialRenderProfileId;
    commandResolution: "output-frame";
    target: SpatialLocalTarget;
  };
  manifestSha256: string;
  boundaries: SpatialRenderBoundaries;
};

export type SpatialLocalTarget = {
  provider: "local";
  locator: string;
  contentType: "video/mp4";
};

export type SpatialRenderBoundaries = {
  exactPackageRequired: true;
  sourceMediaRemainsImmutable: true;
  browseProxyNeverAcceptedAsRenderSource: true;
  officialStitchStageRequiredForRawInsv: true;
  reframeIntentRemainsReversible: true;
  resultRequiresCompleteDecode: true;
  resultIsNotPublished: true;
};

export type SpatialRenderResult = {
  kind: typeof SPATIAL_RENDER_RESULT_KIND;
  version: typeof SPATIAL_RENDER_CONTRACT_VERSION;
  jobId: string;
  completedAt: string;
  manifestSha256: string;
  stitch: {
    profile: typeof SPATIAL_STITCH_PROFILE;
    adapter: "insta360-mediasdk" | "insta360-studio-reviewed-export";
    adapterVersion: string;
    sourceSetIdentitySha256: string;
    output: SpatialVerifiedOutput & { width: 5760; height: 2880; projection: "equirectangular" };
  };
  reframe: {
    adapter: "ffmpeg-v360";
    ffmpegVersion: string;
    recipeSha256: string;
    output: SpatialVerifiedOutput & {
      width: number;
      height: number;
      fps: number;
      videoCodec: string;
      variantKind: "spatial-reframe-proof" | "spatial-reframe-edit-source";
    };
  };
  worker: { executionId: string; buildId: string; imageDigest: string | null; attempt: number };
  boundaries: SpatialRenderBoundaries;
};

export type SpatialVerifiedOutput = SpatialLocalTarget & {
  generation: string;
  sha256: string;
  sizeBytes: number;
  durationSeconds: number;
  completeDecode: true;
};

export type SpatialExecutorProbe = {
  platform: "darwin" | "linux" | "win32" | "other";
  architecture: string;
  insta360Studio: { available: boolean; version: string | null };
  mediaSdk: {
    available: boolean;
    version: string | null;
    licenseConfigured: boolean;
    modelsConfigured: boolean;
  };
  ffmpeg: { available: boolean; version: string | null; v360Available: boolean; runtimeViewCommands: boolean };
};

export type SpatialExecutorReadiness = {
  status: "ready" | "manual-stitch-handoff" | "blocked";
  automaticStitchReady: boolean;
  automaticReframeReady: boolean;
  manualStudioHandoffReady: boolean;
  blockers: Array<{
    code: "mediasdk-platform-unsupported" | "mediasdk-unavailable" | "mediasdk-license-missing" | "mediasdk-models-missing" | "ffmpeg-unavailable" | "ffmpeg-v360-unavailable" | "ffmpeg-runtime-commands-unavailable";
    message: string;
  }>;
  nextAction: string;
  boundaries: {
    installedStudioIsNotAnAutomationApi: true;
    manualExportRequiresChecksumReview: true;
    lrvCannotSatisfyFinalRender: true;
  };
};

const SAFE_ID = /^[A-Za-z0-9:_-]{4,220}$/;
const SHA256 = /^[0-9a-f]{64}$/;

export function spatialRenderProfile(value: unknown) {
  if (value === "spatial-proof-720p24" || value === "spatial-flat-4k24") return SPATIAL_RENDER_PROFILES[value];
  throw new Error("Spatial render profile is invalid.");
}

export function evaluateSpatialExecutorReadiness(probe: SpatialExecutorProbe): SpatialExecutorReadiness {
  const blockers: SpatialExecutorReadiness["blockers"] = [];
  const supportedSdkPlatform = (probe.platform === "linux" || probe.platform === "win32") && probe.architecture === "x64";
  if (!supportedSdkPlatform) blockers.push({ code: "mediasdk-platform-unsupported", message: "The documented Desktop MediaSDK automatic runner requires Linux x64 or Windows x64." });
  if (!probe.mediaSdk.available) blockers.push({ code: "mediasdk-unavailable", message: "The approved Insta360 Desktop MediaSDK runtime is not installed." });
  if (!probe.mediaSdk.licenseConfigured) blockers.push({ code: "mediasdk-license-missing", message: "The Insta360 MediaSDK license is not configured." });
  if (!probe.mediaSdk.modelsConfigured) blockers.push({ code: "mediasdk-models-missing", message: "The Insta360 stitching model pack is not configured." });
  if (!probe.ffmpeg.available) blockers.push({ code: "ffmpeg-unavailable", message: "FFmpeg is not installed." });
  if (!probe.ffmpeg.v360Available) blockers.push({ code: "ffmpeg-v360-unavailable", message: "FFmpeg does not expose the v360 filter." });
  if (!probe.ffmpeg.runtimeViewCommands) blockers.push({ code: "ffmpeg-runtime-commands-unavailable", message: "FFmpeg v360 cannot accept runtime yaw, pitch, roll, and field-of-view commands." });
  const automaticStitchReady = supportedSdkPlatform && probe.mediaSdk.available && probe.mediaSdk.licenseConfigured && probe.mediaSdk.modelsConfigured;
  const automaticReframeReady = probe.ffmpeg.available && probe.ffmpeg.v360Available && probe.ffmpeg.runtimeViewCommands;
  const manualStudioHandoffReady = probe.insta360Studio.available && automaticReframeReady;
  return {
    status: automaticStitchReady && automaticReframeReady ? "ready" : manualStudioHandoffReady ? "manual-stitch-handoff" : "blocked",
    automaticStitchReady,
    automaticReframeReady,
    manualStudioHandoffReady,
    blockers,
    nextAction: automaticStitchReady && automaticReframeReady
      ? "Render from the frozen INSV package through the automatic two-stage executor."
      : manualStudioHandoffReady
        ? "Export one full-resolution stabilized 2:1 master from Insta360 Studio, verify its checksum in Quipsly, then let Quipsly apply the saved spatial keyframes."
        : "Install a supported stitch engine and an FFmpeg build with runtime-controllable v360 support.",
    boundaries: { installedStudioIsNotAnAutomationApi: true, manualExportRequiresChecksumReview: true, lrvCannotSatisfyFinalRender: true },
  };
}

export function newSpatialRenderJob(input: Omit<SpatialRenderJob, "kind" | "version" | "boundaries">): SpatialRenderJob {
  return parseSpatialRenderJob({
    ...input,
    kind: SPATIAL_RENDER_JOB_KIND,
    version: SPATIAL_RENDER_CONTRACT_VERSION,
    boundaries: spatialBoundaries(),
  });
}

export function parseSpatialRenderJob(value: unknown): SpatialRenderJob {
  const row = record(value);
  const sourcePackage = record(row.sourcePackage);
  const selection = record(row.selection);
  const recipe = record(row.recipe);
  const stitch = record(row.stitch);
  const reframe = record(row.reframe);
  const stitchTarget = parseTarget(stitch.target, "stitch.target");
  const reframeTarget = parseTarget(reframe.target, "reframe.target");
  const profile = spatialRenderProfile(reframe.profile);
  const startSeconds = nonnegative(selection.startSeconds, "selection.startSeconds");
  const endSeconds = positive(selection.endSeconds, "selection.endSeconds");
  if (endSeconds <= startSeconds) invalid("Spatial source selection must have positive duration.");
  const keyframes = array(recipe.keyframes).map((item, index) => parseKeyframe(item, index, startSeconds, endSeconds));
  if (!keyframes.length) invalid("Spatial render recipe requires at least one keyframe.");
  const members = array(sourcePackage.members).map(parseSourceMember);
  if (members.filter((member) => member.role === "primary-original").length !== 1 || members.some((member) => !member.fileName.toLowerCase().endsWith(".insv"))) {
    invalid("Spatial source package must contain exactly one primary INSV original and only exact INSV render members.");
  }
  const declaredBoundaries = record(row.boundaries);
  if (
    row.kind !== SPATIAL_RENDER_JOB_KIND || row.version !== SPATIAL_RENDER_CONTRACT_VERSION
    || recipe.schema !== "quipsly-360-reframe-v1" || recipe.projection !== "equirectangular"
    || !["16:9", "9:16", "1:1"].includes(String(recipe.aspectRatio))
    || !["flowstate", "none"].includes(String(recipe.stabilization)) || typeof recipe.horizonLock !== "boolean"
    || stitch.profile !== SPATIAL_STITCH_PROFILE || stitch.adapter !== "insta360-mediasdk" || stitch.minimumMajorVersion !== 3
    || stitch.scope !== "complete-source" || stitch.stitchType !== "ai-flow" || stitch.outputProjection !== "equirectangular"
    || stitch.width !== 5760 || stitch.height !== 2880 || stitch.videoCodec !== "h265"
    || reframe.adapter !== "ffmpeg-v360" || reframe.commandResolution !== "output-frame"
    || stitchTarget.locator === reframeTarget.locator
    || Object.entries(spatialBoundaries()).some(([key, expected]) => declaredBoundaries[key] !== expected)
  ) invalid("Spatial render job contract or execution boundary is invalid.");
  const parsed: SpatialRenderJob = {
    kind: SPATIAL_RENDER_JOB_KIND,
    version: SPATIAL_RENDER_CONTRACT_VERSION,
    jobId: safeId(row.jobId, "jobId"),
    projectId: safeId(row.projectId, "projectId"),
    episodeProductionId: safeId(row.episodeProductionId, "episodeProductionId"),
    timelinePlacementId: safeId(row.timelinePlacementId, "timelinePlacementId"),
    timelineFingerprintSha256: sha(row.timelineFingerprintSha256, "timelineFingerprintSha256"),
    requestedByUserId: safeId(row.requestedByUserId, "requestedByUserId"),
    requestedByEmail: text(row.requestedByEmail, "requestedByEmail").toLowerCase(),
    clientRequestId: safeId(row.clientRequestId, "clientRequestId"),
    queuedAt: iso(row.queuedAt, "queuedAt"),
    sourcePackage: {
      sourceSetId: safeId(sourcePackage.sourceSetId, "sourcePackage.sourceSetId"),
      sourceSetIdentitySha256: sha(sourcePackage.sourceSetIdentitySha256, "sourcePackage.sourceSetIdentitySha256"),
      sourceClockRevisionId: safeId(sourcePackage.sourceClockRevisionId, "sourcePackage.sourceClockRevisionId"),
      sourceContentSha256: sha(sourcePackage.sourceContentSha256, "sourcePackage.sourceContentSha256"),
      members,
    },
    selection: {
      sourceRangeId: safeId(selection.sourceRangeId, "selection.sourceRangeId"),
      selectorSha256: sha(selection.selectorSha256, "selection.selectorSha256"),
      startSeconds,
      endSeconds,
    },
    recipe: {
      schema: "quipsly-360-reframe-v1",
      projection: "equirectangular",
      aspectRatio: recipe.aspectRatio as SpatialRenderJob["recipe"]["aspectRatio"],
      stabilization: recipe.stabilization as SpatialRenderJob["recipe"]["stabilization"],
      horizonLock: recipe.horizonLock as boolean,
      keyframes,
    },
    stitch: { profile: SPATIAL_STITCH_PROFILE, adapter: "insta360-mediasdk", minimumMajorVersion: 3, scope: "complete-source", stitchType: "ai-flow", outputProjection: "equirectangular", width: 5760, height: 2880, videoCodec: "h265", target: stitchTarget },
    reframe: { adapter: "ffmpeg-v360", profile: profile.id, commandResolution: "output-frame", target: reframeTarget },
    manifestSha256: sha(row.manifestSha256, "manifestSha256"),
    boundaries: spatialBoundaries(),
  };
  return parsed;
}

export function spatialRenderManifestCanonicalJson(job: SpatialRenderJob) {
  return JSON.stringify(stable({ ...job, manifestSha256: undefined }));
}

export function spatialRecipeCanonicalJson(job: Pick<SpatialRenderJob, "selection" | "recipe" | "reframe">) {
  return JSON.stringify(stable({ selection: job.selection, recipe: job.recipe, profile: job.reframe.profile }));
}

function parseSourceMember(value: unknown): SpatialRenderSourceMember {
  const row = record(value);
  const fileName = text(row.fileName, "sourcePackage.members.fileName");
  const sourceSha256 = sha(row.sha256, "sourcePackage.members.sha256");
  if (row.provider !== "local" || row.requiredForRender !== true || !["primary-original", "secondary-original"].includes(String(row.role))) invalid("Spatial source member authority is invalid.");
  const generation = text(row.generation, "sourcePackage.members.generation");
  if (generation !== `sha256:${sourceSha256}`) invalid("Spatial source member generation must bind its exact SHA-256 digest.");
  return { sourceRevisionId: safeId(row.sourceRevisionId, "sourcePackage.members.sourceRevisionId"), role: row.role as SpatialSourceMemberRole, fileName, provider: "local", locator: text(row.locator, "sourcePackage.members.locator"), generation, sha256: sourceSha256, sizeBytes: positiveInteger(row.sizeBytes, "sourcePackage.members.sizeBytes"), contentType: text(row.contentType, "sourcePackage.members.contentType"), requiredForRender: true };
}

function parseKeyframe(value: unknown, index: number, startSeconds: number, endSeconds: number): SpatialReframeKeyframe {
  const row = record(value);
  const sourceSeconds = finite(row.sourceSeconds, `recipe.keyframes[${index}].sourceSeconds`);
  const panDegrees = bounded(row.panDegrees, -180, 180, `recipe.keyframes[${index}].panDegrees`);
  const tiltDegrees = bounded(row.tiltDegrees, -180, 180, `recipe.keyframes[${index}].tiltDegrees`);
  const rollDegrees = bounded(row.rollDegrees, -180, 180, `recipe.keyframes[${index}].rollDegrees`);
  const fieldOfViewDegrees = bounded(row.fieldOfViewDegrees, 1, 179, `recipe.keyframes[${index}].fieldOfViewDegrees`);
  if (sourceSeconds < startSeconds || sourceSeconds > endSeconds || !["hold", "linear", "ease"].includes(String(row.interpolation))) invalid("Spatial keyframe is outside its source selection or uses an invalid interpolation.");
  return { sourceSeconds, panDegrees, tiltDegrees, rollDegrees, fieldOfViewDegrees, interpolation: row.interpolation as SpatialInterpolation };
}

function parseTarget(value: unknown, name: string): SpatialLocalTarget {
  const row = record(value);
  const locator = text(row.locator, `${name}.locator`);
  if (row.provider !== "local" || row.contentType !== "video/mp4" || !locator.endsWith(".mp4")) invalid(`${name} is invalid.`);
  return { provider: "local", locator, contentType: "video/mp4" };
}

function spatialBoundaries(): SpatialRenderBoundaries { return { exactPackageRequired: true, sourceMediaRemainsImmutable: true, browseProxyNeverAcceptedAsRenderSource: true, officialStitchStageRequiredForRawInsv: true, reframeIntentRemainsReversible: true, resultRequiresCompleteDecode: true, resultIsNotPublished: true }; }
function stable(value: unknown): unknown { if (Array.isArray(value)) return value.map(stable); if (!value || typeof value !== "object") return value; return Object.fromEntries(Object.entries(value as Record<string, unknown>).filter(([, item]) => item !== undefined).sort(([left], [right]) => left.localeCompare(right)).map(([key, item]) => [key, stable(item)])); }
function record(value: unknown): Record<string, unknown> { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
function array(value: unknown): unknown[] { return Array.isArray(value) ? value : invalid("Expected an array."); }
function text(value: unknown, name: string): string { if (typeof value !== "string" || !value.trim()) invalid(`${name} is required.`); return value.trim(); }
function safeId(value: unknown, name: string): string { const result = text(value, name); return SAFE_ID.test(result) ? result : invalid(`${name} is invalid.`); }
function sha(value: unknown, name: string): string { const result = text(value, name).toLowerCase(); return SHA256.test(result) ? result : invalid(`${name} is invalid.`); }
function iso(value: unknown, name: string): string { const result = text(value, name); return Number.isFinite(Date.parse(result)) ? new Date(result).toISOString() : invalid(`${name} is invalid.`); }
function finite(value: unknown, name: string): number { const result = Number(value); return Number.isFinite(result) ? result : invalid(`${name} is invalid.`); }
function nonnegative(value: unknown, name: string): number { const result = finite(value, name); return result >= 0 ? result : invalid(`${name} is invalid.`); }
function positive(value: unknown, name: string): number { const result = finite(value, name); return result > 0 ? result : invalid(`${name} is invalid.`); }
function bounded(value: unknown, minimum: number, maximum: number, name: string): number { const result = finite(value, name); return result >= minimum && result <= maximum ? result : invalid(`${name} is invalid.`); }
function positiveInteger(value: unknown, name: string): number { const result = Number(value); return Number.isSafeInteger(result) && result > 0 ? result : invalid(`${name} is invalid.`); }
function invalid(message: string): never { throw new Error(message); }
