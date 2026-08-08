import "server-only";

import type { EpisodeMasterConformPlan } from "@/lib/editor/program-edit-contract";
import { readLocalExecutorTarget } from "@/lib/server/local-executor-storage";
import {
  EpisodeProgramReviewError,
  loadEpisodeProgramReviewContext,
} from "@/lib/server/episode-program-review";

const MASTER_PROFILE = "episode-master-3840x2160-24fps-h264-v1" as const;

export class EpisodeMasterConformError extends Error {
  constructor(
    message: string,
    readonly status = 409,
    readonly code = "EPISODE_MASTER_CONFORM_HELD",
  ) {
    super(message);
    this.name = "EpisodeMasterConformError";
  }
}

export async function planEpisodeMasterConform(input: {
  prisma: any;
  projectSlug: string;
  episodeSlug: string;
  reviewJobId: string;
  approvalReceiptId: string;
}): Promise<EpisodeMasterConformPlan> {
  let context;
  try {
    context = await loadEpisodeProgramReviewContext({
      prisma: input.prisma,
      projectSlug: input.projectSlug,
      episodeSlug: input.episodeSlug,
      jobId: input.reviewJobId,
    });
  } catch (error) {
    if (error instanceof EpisodeProgramReviewError) {
      throw new EpisodeMasterConformError(error.message, error.status, error.code);
    }
    throw error;
  }
  const [approval, latestReview, executor, mediaAssets] = await Promise.all([
    input.prisma.studioEpisodeProgramReviewReceipt.findUnique({
      where: { id: input.approvalReceiptId },
    }),
    input.prisma.studioEpisodeProgramReviewReceipt.findFirst({
      where: { renderJobId: context.job.jobId },
      orderBy: [{ occurredAt: "desc" }, { id: "desc" }],
    }),
    readLocalExecutorTarget(
      input.prisma,
      context.job.executionTarget.custodianNodeId,
    ),
    input.prisma.studioMediaAsset.findMany({
      where: { id: { in: context.job.sources.map((source) => source.mediaAssetId) } },
      select: { id: true, resolution: true, fps: true },
    }),
  ]);
  if (
    !approval
    || approval.id !== latestReview?.id
    || approval.renderJobId !== context.job.jobId
    || approval.projectId !== context.project.id
    || approval.episodeProductionId !== context.episode.id
    || approval.decision !== "APPROVED"
    || !approvalMatches(approval, context)
  ) {
    throw new EpisodeMasterConformError(
      "Master planning requires the latest exact approval for this rendered edit and output generation.",
      409,
      "EPISODE_MASTER_CONFORM_APPROVAL_STALE",
    );
  }
  const duration = context.job.program.outputDurationSeconds;
  const estimatedBytesLow = estimateBytes(duration, 35_000_000, 320_000);
  const estimatedBytesHigh = estimateBytes(duration, 80_000_000, 320_000);
  const assetById = new Map(mediaAssets.map((asset: any) => [String(asset.id), asset]));
  const video = context.job.sources
    .filter((source) => source.kind === "video")
    .map((source) => {
      const asset = assetById.get(source.mediaAssetId) as any;
      const dimensions = parseResolution(asset?.resolution);
      const fps = positive(asset?.fps);
      return {
        laneId: source.laneId,
        label: source.label,
        width: dimensions?.width ?? null,
        height: dimensions?.height ?? null,
        fps,
        relationshipToOutput: !dimensions
          ? "unknown" as const
          : dimensions.width >= 3840 && dimensions.height >= 2160
            ? "native-or-larger" as const
            : "upscaled" as const,
      };
    });
  const allVideoMetadataMeasured = video.length > 0
    && video.every((source) => source.width && source.height && source.fps);
  const exactExecutor = Boolean(
    executor
    && executor.nodeId === context.job.executionTarget.custodianNodeId
    && executor.storageScopeId === context.job.executionTarget.storageScopeId,
  );
  const safeAvailable = executor?.storage.status === "measured"
    ? Number(executor.storage.safeAvailableBytes)
    : null;
  const durableStorage = executor?.storage.workspaceMode === "durable";
  const storageReady = safeAvailable !== null && safeAvailable >= estimatedBytesHigh;
  const holds = [
    ...(!exactExecutor ? ["The exact source executor is no longer online with the approved storage scope."] : []),
    ...(!durableStorage ? ["A production master requires a durable media workspace, not temporary storage."] : []),
    ...(!storageReady ? [`Reserve at least ${formatBytes(estimatedBytesHigh)} of safe local space for the high-quality master.`] : []),
    ...(!allVideoMetadataMeasured ? ["Measure resolution and frame rate for every video source before queueing a 4K conform."] : []),
  ];
  return {
    schema: "quipsly-episode-master-conform-plan-v1",
    branchRevision: context.job.branchRevision,
    approvedReview: {
      receiptId: approval.id,
      reviewJobId: context.job.jobId,
      approvedByEmail: approval.actorEmail,
      approvedAt: approval.occurredAt?.toISOString?.() ?? String(approval.occurredAt),
      reviewedOutputSha256: context.result.output.sha256,
    },
    masterProfile: {
      id: MASTER_PROFILE,
      label: "4K 24 fps production master",
      width: 3840,
      height: 2160,
      fps: 24,
      videoCodec: "h264",
      audioCodec: "aac",
      audioSampleRateHz: 48_000,
      outputDurationSeconds: duration,
      estimatedBytesLow,
      estimatedBytesHigh,
    },
    sources: {
      requiredCount: context.job.sources.length,
      totalBytes: context.job.sources.reduce((sum, source) => sum + source.sizeBytes, 0),
      allExactOnExecutor: exactExecutor,
      allVideoMetadataMeasured,
      video,
    },
    executor: {
      id: "local-mac",
      label: executor?.hostName ?? "Approved source Mac",
      executorNodeId: context.job.executionTarget.custodianNodeId,
      artifactPortability: "executor-local",
      status: holds.length === 0 ? "ready" : "held",
      canQueue: holds.length === 0,
      detail: holds.length === 0
        ? "This Mac owns every approved original generation and has measured durable workspace capacity."
        : holds.join(" "),
      costKind: "none",
      costDetail: "Local conform; no cloud render or upload is started by this plan.",
      qualityDetail: "Re-renders approved edit decisions from exact originals; the 720p review is never used as master input.",
      storageSafeAvailableBytes: safeAvailable,
      estimatedBytesHigh,
    },
    holds,
    boundaries: {
      createsNoJob: true,
      originalSourcesWillBeUsed: true,
      reviewCandidateWillNotBeUpscaled: true,
      sourceMediaRemainsImmutable: true,
      approvalDoesNotAuthorizePublication: true,
      renderedMasterWillRequireSeparateReview: true,
      portableUploadNotStarted: true,
      publicationNotStarted: true,
    },
  };
}

function approvalMatches(approval: any, context: Awaited<ReturnType<typeof loadEpisodeProgramReviewContext>>) {
  return approval.branchId === context.job.branchId
    && approval.branchRevision === context.job.branchRevision
    && approval.timelineFingerprintSha256 === context.job.timelineFingerprintSha256
    && approval.sourceProjectionFingerprintSha256 === context.job.sourceProjectionFingerprintSha256
    && approval.editStateFingerprintSha256 === context.job.editStateFingerprintSha256
    && approval.manifestSha256 === context.job.manifestSha256
    && approval.outputSha256 === context.result.output.sha256
    && approval.outputGeneration === context.result.output.generation
    && Number(approval.outputSizeBytes) === context.result.output.sizeBytes;
}
function estimateBytes(durationSeconds: number, videoBitsPerSecond: number, audioBitsPerSecond: number) { return Math.ceil(durationSeconds * (videoBitsPerSecond + audioBitsPerSecond) / 8 * 1.03); }
function positive(value: unknown) { const number = Number(value); return Number.isFinite(number) && number > 0 ? number : null; }
function parseResolution(value: unknown) { if (typeof value !== "string") return null; const match = /^(\d{2,6})\s*[x×]\s*(\d{2,6})$/i.exec(value.trim()); if (!match) return null; const width = Number(match[1]); const height = Number(match[2]); return width > 0 && height > 0 ? { width, height } : null; }
function formatBytes(bytes: number) { const units = ["B", "KB", "MB", "GB", "TB"]; let value = bytes; let index = 0; while (value >= 1024 && index < units.length - 1) { value /= 1024; index += 1; } return `${value.toFixed(index >= 3 ? 1 : 0)} ${units[index]}`; }
