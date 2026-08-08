import "server-only";

import { createHash, randomUUID } from "node:crypto";

import { Prisma } from "@prisma/client";
import {
  EPISODE_MASTER_4K_H264_PROFILE,
  buildEpisodeMasterConformTargetLocator,
  episodeMasterConformManifestCanonicalJson,
  newEpisodeMasterConformJob,
  parseEpisodeMasterConformJob,
  parseEpisodeMasterConformResult,
  parseEpisodeProgramRenderJob,
  parseEpisodeProgramRenderResult,
  type EpisodeMasterConformJob,
} from "@high-ground/quipsly-media-processing";

import type { EpisodeMasterConformPlan } from "@/lib/editor/program-edit-contract";
import { acquirePrismaAdvisoryTransactionLock } from "@/lib/server/prisma-advisory-lock";
import { verifyLocalRenderResult } from "@/lib/server/episode-render-proof";
import { readLocalExecutorTarget } from "@/lib/server/local-executor-storage";
import {
  EpisodeProgramReviewError,
  loadEpisodeProgramReviewContext,
} from "@/lib/server/episode-program-review";

const MASTER_PROFILE = "episode-master-3840x2160-24fps-h264-v1" as const;
const JOB_TYPE = "episode-master-conform";
const JOB_SOURCE = "episode-editor.local-approved-master";
const ZERO_SHA256 = "0".repeat(64);

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
  const workerLookupSupported = Boolean(input.prisma.agentNode?.findUnique);
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
  const [approval, latestReview, executor, mediaAssets, worker] = await Promise.all([
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
    input.prisma.agentNode?.findUnique
      ? input.prisma.agentNode.findUnique({
          where: { id: context.job.executionTarget.custodianNodeId },
          select: { status: true, capabilities: true, lastHeartbeatAt: true },
        })
      : Promise.resolve(null),
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
  const workerCapabilities = record(worker?.capabilities);
  const workerHeartbeat = worker?.lastHeartbeatAt
    ? new Date(worker.lastHeartbeatAt).getTime()
    : 0;
  const masterWorkerReady = !workerLookupSupported || Boolean(
    worker?.status === "online"
    && Date.now() - workerHeartbeat <= 30_000
    && Array.isArray(workerCapabilities.jobTypes)
    && workerCapabilities.jobTypes.includes(JOB_TYPE)
    && Array.isArray(workerCapabilities.renderProfiles)
    && workerCapabilities.renderProfiles.includes(MASTER_PROFILE)
  );
  const safeAvailable = executor?.storage.status === "measured"
    ? Number(executor.storage.safeAvailableBytes)
    : null;
  const durableStorage = executor?.storage.workspaceMode === "durable";
  const storageReady = safeAvailable !== null && safeAvailable >= estimatedBytesHigh;
  const holds = [
    ...(!exactExecutor ? ["The exact source executor is no longer online with the approved storage scope."] : []),
    ...(!masterWorkerReady ? ["The exact Mac has not advertised the production master worker and 4K profile on a current heartbeat."] : []),
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

export async function queueEpisodeMasterConform(input: {
  prisma: any;
  projectSlug: string;
  episodeSlug: string;
  reviewJobId: string;
  approvalReceiptId: string;
  clientRequestId: string;
  actor: { email: string };
}) {
  const clientRequestId = safeRequestId(input.clientRequestId);
  const actorEmail = input.actor.email.trim().toLowerCase();
  if (!actorEmail) throw new EpisodeMasterConformError(
    "A verified account email is required to queue a master conform.",
    400,
    "EPISODE_MASTER_CONFORM_ACTOR_REQUIRED",
  );
  const readiness = await planEpisodeMasterConform(input);
  if (!readiness.executor.canQueue) throw new EpisodeMasterConformError(
    readiness.holds.join(" ") || "The 4K master is not ready to queue.",
  );
  const context = await loadEpisodeProgramReviewContext({
    prisma: input.prisma,
    projectSlug: input.projectSlug,
    episodeSlug: input.episodeSlug,
    jobId: input.reviewJobId,
  });
  const existing = await input.prisma.studioWorkflowJob.findFirst({
    where: {
      type: JOB_TYPE,
      source: JOB_SOURCE,
      requestedByEmail: actorEmail,
      inputJson: { path: ["clientRequestId"], equals: clientRequestId },
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
  });
  if (existing) {
    const job = parseEpisodeMasterConformJob(existing.inputJson, existing.id);
    if (
      job.projectId !== context.project.id
      || job.episodeProductionId !== context.episode.id
      || job.approval.receiptId !== input.approvalReceiptId
      || job.approval.reviewJobId !== input.reviewJobId
    ) throw new EpisodeMasterConformError(
      "That master request id is already bound to different approval evidence.",
      409,
      "EPISODE_MASTER_CONFORM_IDEMPOTENCY_CONFLICT",
    );
    return publicQueue(existing, job, true);
  }
  const approval = await input.prisma.studioEpisodeProgramReviewReceipt.findUnique({
    where: { id: input.approvalReceiptId },
  });
  if (!approval || approval.decision !== "APPROVED" || !approvalMatches(approval, context)) {
    throw new EpisodeMasterConformError(
      "The exact approval changed before the master manifest could be frozen.",
      409,
      "EPISODE_MASTER_CONFORM_APPROVAL_STALE",
    );
  }
  const manifest = buildMasterManifest({
    context,
    approval,
    clientRequestId,
    requestedByEmail: actorEmail,
  });
  const created = await input.prisma.$transaction(async (tx: any) => {
    await acquirePrismaAdvisoryTransactionLock(
      tx,
      `episode-master-conform:${context.job.jobId}`,
    );
    const [latest, branch, reviewJob] = await Promise.all([
      tx.studioEpisodeProgramReviewReceipt.findFirst({
        where: { renderJobId: context.job.jobId },
        orderBy: [{ occurredAt: "desc" }, { id: "desc" }],
      }),
      tx.studioEditBranch.findUnique({
        where: { id: context.job.branchId },
        select: { headRevision: true },
      }),
      tx.studioWorkflowJob.findUnique({
        where: { id: context.job.jobId },
        select: { status: true, inputJson: true, resultJson: true },
      }),
    ]);
    let lockedReviewMatches = false;
    if (reviewJob?.status === "completed") {
      const lockedProgram = parseEpisodeProgramRenderJob(reviewJob.inputJson, context.job.jobId);
      const lockedResult = parseEpisodeProgramRenderResult(record(reviewJob.resultJson).receipt, lockedProgram);
      lockedReviewMatches = lockedProgram.manifestSha256 === context.job.manifestSha256
        && lockedResult.output.sha256 === context.result.output.sha256
        && lockedResult.output.generation === context.result.output.generation
        && lockedResult.output.sizeBytes === context.result.output.sizeBytes;
    }
    if (
      latest?.id !== approval.id
      || latest.decision !== "APPROVED"
      || branch?.headRevision !== context.job.branchRevision
      || !lockedReviewMatches
    ) throw new EpisodeMasterConformError(
      "The edit, review bytes, or latest decision changed while the master request was queueing.",
      409,
      "EPISODE_MASTER_CONFORM_APPROVAL_STALE",
    );
    return tx.studioWorkflowJob.create({
      data: {
        id: manifest.jobId,
        projectId: context.project.id,
        productionRoomId: null,
        type: JOB_TYPE,
        status: "queued",
        source: JOB_SOURCE,
        priority: 70,
        inputJson: json(manifest),
        requestedByEmail: actorEmail,
      },
    });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  return publicQueue(created, manifest, false);
}

export async function registerEpisodeMasterConform(input: {
  prisma: any;
  projectSlug: string;
  episodeSlug: string;
  jobId: string;
  actor: { email: string };
}) {
  const row = await input.prisma.studioWorkflowJob.findUnique({ where: { id: input.jobId } });
  if (!row || row.type !== JOB_TYPE || row.source !== JOB_SOURCE) throw new EpisodeMasterConformError(
    "That master conform job does not exist.",
    404,
    "EPISODE_MASTER_CONFORM_NOT_FOUND",
  );
  const job = parseEpisodeMasterConformJob(row.inputJson, row.id);
  const episode = await input.prisma.studioEpisodeProduction.findFirst({
    where: { id: job.episodeProductionId, slug: input.episodeSlug, project: { slug: input.projectSlug } },
    select: { id: true, projectId: true },
  });
  if (!episode || episode.projectId !== job.projectId || row.projectId !== job.projectId) throw new EpisodeMasterConformError(
    "That master candidate is outside this Episode.",
    404,
    "EPISODE_MASTER_CONFORM_NOT_FOUND",
  );
  if (row.status === "completed") return registeredResult(row);
  if (row.status !== "output-ready") throw new EpisodeMasterConformError(
    row.status === "failed" ? row.error || "The master conform failed." : "The local Mac has not finished this master conform yet.",
    409,
    row.status === "failed" ? "EPISODE_MASTER_CONFORM_FAILED" : "EPISODE_MASTER_CONFORM_NOT_READY",
  );
  const result = parseEpisodeMasterConformResult(record(row.resultJson).receipt, job);
  const verifiedPath = await verifyLocalRenderResult(result.output.locator, result.output.sha256, result.output.sizeBytes);
  return input.prisma.$transaction(async (tx: any) => {
    const locked = await tx.studioWorkflowJob.findUnique({ where: { id: row.id } });
    if (!locked) throw new EpisodeMasterConformError("The master candidate disappeared before registration.");
    if (locked.status === "completed") return registeredResult(locked);
    if (locked.status !== "output-ready") throw new EpisodeMasterConformError("The master candidate changed before registration.");
    const [latestDecision, branch] = await Promise.all([
      tx.studioEpisodeProgramReviewReceipt.findFirst({
        where: { renderJobId: job.approval.reviewJobId },
        orderBy: [{ occurredAt: "desc" }, { id: "desc" }],
      }),
      tx.studioEditBranch.findUnique({
        where: { id: job.approval.branchId },
        select: { headRevision: true },
      }),
    ]);
    if (
      latestDecision?.id !== job.approval.receiptId
      || latestDecision.decision !== "APPROVED"
      || branch?.headRevision !== job.approval.branchRevision
    ) throw new EpisodeMasterConformError(
      "The edit or latest program decision changed while this master rendered. The bytes were retained, but cannot be registered as the current candidate.",
      409,
      "EPISODE_MASTER_CONFORM_APPROVAL_STALE",
    );
    let source = await tx.studioVideoSource.findFirst({ where: { providerSourceId: verifiedPath } });
    if (!source) source = await tx.studioVideoSource.create({
      data: { provider: "local-episode-master-conform-worker", providerSourceId: verifiedPath, url: "/api/ingest/media/pending", title: `${input.episodeSlug} 4K master candidate r${job.approval.branchRevision}` },
    });
    const playbackUrl = `/api/ingest/media/${source.id}`;
    if (source.url !== playbackUrl) source = await tx.studioVideoSource.update({ where: { id: source.id }, data: { url: playbackUrl } });
    let asset = await tx.studioMediaAsset.findFirst({ where: { url: playbackUrl, isProxy: false } });
    if (!asset) asset = await tx.studioMediaAsset.create({
      data: { filename: `${input.episodeSlug}-master-candidate-r${job.approval.branchRevision}.mp4`, url: playbackUrl, mimeType: "video/mp4", sizeBytes: BigInt(result.output.sizeBytes), isProxy: false, cloudProvider: "local", isGlobal: false, duration: result.output.durationSeconds, resolution: `${result.output.width}x${result.output.height}`, fps: result.output.fps },
    });
    const metadata = {
      schema: "quipsly-episode-master-conform-registration-v1",
      jobId: job.jobId,
      approval: job.approval,
      renderProfile: job.renderProfile,
      executionTarget: job.executionTarget,
      sourceId: source.id,
      playbackUrl,
      exactSources: job.approvedProgram.sources.map((item) => ({ laneId: item.laneId, mediaAssetId: item.mediaAssetId, sha256: item.sha256, generation: item.generation })),
      output: result.output,
      worker: result.worker,
      ...result.boundaries,
    };
    await tx.studioAssetAttachment.upsert({
      where: { projectId_assetId: { projectId: job.projectId, assetId: asset.id } },
      create: { projectId: job.projectId, assetId: asset.id, role: "episode-master-candidate", source: "episode-master-conform-registration", createdByEmail: input.actor.email.toLowerCase(), metadataJson: json(metadata) },
      update: { role: "episode-master-candidate", source: "episode-master-conform-registration", metadataJson: json(metadata) },
    });
    const completed = await tx.studioWorkflowJob.update({
      where: { id: row.id },
      data: { status: "completed", completedAt: new Date(result.completedAt), error: null, resultJson: json({ state: "completed", receipt: result, registration: { schema: "quipsly-episode-master-conform-registration-v1", verifiedAt: new Date().toISOString(), verifiedByEmail: input.actor.email.toLowerCase(), assetId: asset.id, sourceId: source.id, playbackUrl, outputIsUnapprovedMasterCandidate: true, outputIsNotPublicationMedia: true, masterRequiresSeparateReview: true, artifactPortability: job.executionTarget.portability, custodianNodeId: job.executionTarget.custodianNodeId, storageScopeId: job.executionTarget.storageScopeId } }) },
    });
    return registeredResult(completed);
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

function buildMasterManifest(input: {
  context: Awaited<ReturnType<typeof loadEpisodeProgramReviewContext>>;
  approval: any;
  clientRequestId: string;
  requestedByEmail: string;
}): EpisodeMasterConformJob {
  const jobId = `master_conform_${randomUUID().replaceAll("-", "")}`;
  const authority = input.context.job.executionTarget;
  const base = {
    jobId,
    projectId: input.context.project.id,
    episodeProductionId: input.context.episode.id,
    requestedByEmail: input.requestedByEmail,
    clientRequestId: input.clientRequestId,
    queuedAt: new Date().toISOString(),
    manifestSha256: ZERO_SHA256,
    renderProfile: EPISODE_MASTER_4K_H264_PROFILE,
    approval: {
      receiptId: input.approval.id,
      reviewJobId: input.context.job.jobId,
      approvedByEmail: input.approval.actorEmail,
      approvedAt: input.approval.occurredAt?.toISOString?.() ?? String(input.approval.occurredAt),
      branchId: input.context.job.branchId,
      branchRevision: input.context.job.branchRevision,
      timelineFingerprintSha256: input.context.job.timelineFingerprintSha256,
      sourceProjectionFingerprintSha256: input.context.job.sourceProjectionFingerprintSha256,
      editStateFingerprintSha256: input.context.job.editStateFingerprintSha256,
      reviewManifestSha256: input.context.job.manifestSha256,
      reviewedOutputSha256: input.context.result.output.sha256,
      reviewedOutputGeneration: input.context.result.output.generation,
      reviewedOutputSizeBytes: input.context.result.output.sizeBytes,
    },
    approvedProgram: input.context.job,
    executionTarget: authority,
    target: {
      provider: "local" as const,
      ...authority,
      locator: buildEpisodeMasterConformTargetLocator({
        episodeProductionId: input.context.episode.id,
        branchId: input.context.job.branchId,
        branchRevision: input.context.job.branchRevision,
        jobId,
      }),
      contentType: "video/mp4" as const,
      container: "mp4" as const,
      videoCodec: "h264" as const,
      audioCodec: "aac" as const,
      width: 3840 as const,
      height: 2160 as const,
      fps: 24 as const,
      sampleRateHz: 48_000 as const,
      videoCrf: 17 as const,
      videoPreset: "medium" as const,
      audioBitrate: "320k" as const,
      variantKind: "episode-master-candidate" as const,
    },
  };
  const placeholder = newEpisodeMasterConformJob(base);
  return newEpisodeMasterConformJob({
    ...base,
    manifestSha256: createHash("sha256")
      .update(episodeMasterConformManifestCanonicalJson(placeholder))
      .digest("hex"),
  });
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
function safeRequestId(value: string) { const result = value.trim(); if (!/^[A-Za-z0-9:_-]{8,220}$/.test(result)) throw new EpisodeMasterConformError("A stable master conform request id is required.", 400, "EPISODE_MASTER_CONFORM_REQUEST_INVALID"); return result; }
function json(value: unknown): Prisma.InputJsonValue { return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue; }
function publicQueue(row: any, job: EpisodeMasterConformJob, idempotentReplay: boolean) { return { idempotentReplay, job: { id: row.id, status: row.status, branchRevision: job.approval.branchRevision, manifestSha256: job.manifestSha256, outputDurationSeconds: job.approvedProgram.program.outputDurationSeconds, chunkCount: job.approvedProgram.chunks.length, executionTarget: { portability: job.executionTarget.portability, nodeId: job.executionTarget.custodianNodeId, storageScopeId: job.executionTarget.storageScopeId, localPathWithheld: true } } }; }
function record(value: unknown): Record<string, any> { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, any> : {}; }
function registeredResult(row: any) { const registration = record(record(row.resultJson).registration); return { ok: true, jobId: row.id, status: row.status, assetId: String(registration.assetId || ""), sourceId: String(registration.sourceId || ""), playbackUrl: String(registration.playbackUrl || ""), verifiedAt: String(registration.verifiedAt || "") }; }
