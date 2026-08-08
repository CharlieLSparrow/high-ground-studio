import "server-only";

import { createHash, randomUUID } from "node:crypto";

import { Prisma } from "@prisma/client";
import {
  EPISODE_PROGRAM_REVIEW_PROFILE,
  buildEpisodeProgramRenderTargetLocator,
  episodeProgramRenderManifestCanonicalJson,
  newEpisodeProgramRenderJob,
  parseEpisodeProgramRenderJob,
  parseEpisodeProgramRenderResult,
  type EpisodeProgramRenderChunk,
  type EpisodeProgramRenderJob,
} from "@high-ground/quipsly-media-processing";

import type {
  EpisodeProgramRenderPlan,
  ProgramEditSource,
  ProgramEditState,
} from "@/lib/editor/program-edit-contract";
import {
  ensureEpisodeEditBranch,
  projectCanonicalEpisodeEditState,
  type EditActor,
} from "@/lib/server/episode-edit-store";
import {
  ExactEpisodeRenderSourceError,
  resolveExactEpisodeRenderSources,
} from "@/lib/server/episode-render-exact-sources";
import {
  readLocalExecutorTarget,
  readLocalExecutorTargets,
  type LocalExecutorTarget,
} from "@/lib/server/local-executor-storage";
import { verifyLocalRenderResult } from "@/lib/server/episode-render-proof";

const JOB_TYPE = "episode-program-render";
const JOB_SOURCE = "episode-editor.local-program-review";
const ZERO_SHA256 = "0".repeat(64);

export class EpisodeProgramRenderError extends Error {
  constructor(
    message: string,
    readonly status = 409,
    readonly code = "EPISODE_PROGRAM_RENDER_HELD",
  ) {
    super(message);
    this.name = "EpisodeProgramRenderError";
  }
}

export type EpisodeProgramRenderQueueResult = {
  idempotentReplay: boolean;
  job: {
    id: string;
    status: string;
    branchRevision: number;
    manifestSha256: string;
    outputDurationSeconds: number;
    chunkCount: number;
    executionTarget: {
      portability: "executor-local";
      nodeId: string;
      storageScopeId: string;
      localPathWithheld: true;
    };
  };
};

export async function planEpisodeProgramRender(input: {
  prisma: any;
  projectSlug: string;
  episodeSlug: string;
  expectedRevision: number;
  executorNodeId?: string | null;
  actor: EditActor & { email: string };
}): Promise<EpisodeProgramRenderPlan> {
  const { episode, branch } = await ensureEpisodeEditBranch(
    input.projectSlug,
    input.episodeSlug,
    input.actor,
  );
  const current = await input.prisma.studioEditBranch.findUnique({
    where: { id: branch.id },
  });
  if (!current || current.headRevision !== input.expectedRevision) {
    throw new EpisodeProgramRenderError(
      "The shared edit changed while full-program readiness was being checked. Refresh the Episode and try again.",
      409,
      "EPISODE_PROGRAM_RENDER_STALE_EDIT",
    );
  }
  const state = projectState(episode, current.stateJson);
  const executorTarget = await programRenderExecutor(
    input.prisma,
    input.executorNodeId,
  );
  let manifest: EpisodeProgramRenderJob | null = null;
  let holdReason: string | null = null;
  try {
    if (!executorTarget) {
      throw new EpisodeProgramRenderError(
        "No compatible local Mac is online for a full-program review.",
      );
    }
    manifest = await buildManifest({
      prisma: input.prisma,
      episode,
      branch: current,
      state,
      clientRequestId: `program_plan_${randomUUID().replaceAll("-", "")}`,
      requestedByEmail: input.actor.email,
      executorTarget,
    });
  } catch (error) {
    if (
      !(error instanceof EpisodeProgramRenderError)
      || error.code === "EPISODE_PROGRAM_RENDER_STALE_EDIT"
    ) throw error;
    holdReason = error.message;
  }
  return publicPlan({
    state,
    branchRevision: current.headRevision,
    manifest,
    executorTarget,
    holdReason,
  });
}

export async function queueEpisodeProgramRender(input: {
  prisma: any;
  projectSlug: string;
  episodeSlug: string;
  expectedRevision: number;
  clientRequestId: string;
  executorNodeId?: string | null;
  actor: EditActor & { email: string };
}): Promise<EpisodeProgramRenderQueueResult> {
  const clientRequestId = safeRequestId(input.clientRequestId);
  const executorTarget = await programRenderExecutor(
    input.prisma,
    input.executorNodeId,
  );
  if (!executorTarget) {
    throw new EpisodeProgramRenderError(
      "The selected Mac is no longer online for this full-program review.",
      409,
      "EPISODE_PROGRAM_RENDER_EXECUTOR_UNAVAILABLE",
    );
  }
  const { episode, branch } = await ensureEpisodeEditBranch(
    input.projectSlug,
    input.episodeSlug,
    input.actor,
  );
  const current = await input.prisma.studioEditBranch.findUnique({
    where: { id: branch.id },
  });
  if (!current || current.headRevision !== input.expectedRevision) {
    throw new EpisodeProgramRenderError(
      "The shared edit changed before this full-program review could be frozen.",
      409,
      "EPISODE_PROGRAM_RENDER_STALE_EDIT",
    );
  }
  const existing = await input.prisma.studioWorkflowJob.findFirst({
    where: {
      type: JOB_TYPE,
      source: JOB_SOURCE,
      requestedByEmail: input.actor.email.toLowerCase(),
      inputJson: { path: ["clientRequestId"], equals: clientRequestId },
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
  });
  if (existing) {
    const existingJob = parseEpisodeProgramRenderJob(existing.inputJson, existing.id);
    if (
      existingJob.projectId !== episode.projectId
      || existingJob.episodeProductionId !== episode.id
      || existingJob.branchId !== current.id
      || existingJob.branchRevision !== input.expectedRevision
      || existingJob.executionTarget.custodianNodeId !== executorTarget.nodeId
      || existingJob.executionTarget.storageScopeId !== executorTarget.storageScopeId
    ) {
      throw new EpisodeProgramRenderError(
        "That full-program request id is already bound to different edit evidence.",
        409,
        "EPISODE_PROGRAM_RENDER_IDEMPOTENCY_CONFLICT",
      );
    }
    return publicQueue(existing, existingJob, true);
  }
  const state = projectState(episode, current.stateJson);
  const manifest = await buildManifest({
    prisma: input.prisma,
    episode,
    branch: current,
    state,
    clientRequestId,
    requestedByEmail: input.actor.email,
    executorTarget,
  });
  const created = await input.prisma.studioWorkflowJob.create({
    data: {
      id: manifest.jobId,
      projectId: episode.projectId,
      productionRoomId: null,
      type: JOB_TYPE,
      status: "queued",
      source: JOB_SOURCE,
      priority: 60,
      inputJson: json(manifest),
      requestedByEmail: input.actor.email.toLowerCase(),
    },
  });
  return publicQueue(created, manifest, false);
}

export async function registerEpisodeProgramRender(input: {
  prisma: any;
  projectSlug: string;
  episodeSlug: string;
  jobId: string;
  actor: EditActor & { email: string };
}) {
  const row = await input.prisma.studioWorkflowJob.findUnique({
    where: { id: input.jobId },
  });
  if (!row || row.type !== JOB_TYPE || row.source !== JOB_SOURCE) {
    throw new EpisodeProgramRenderError(
      "That full-program review job does not exist.",
      404,
      "EPISODE_PROGRAM_RENDER_NOT_FOUND",
    );
  }
  const job = parseEpisodeProgramRenderJob(row.inputJson, row.id);
  const executorTarget = await readLocalExecutorTarget(
    input.prisma,
    job.executionTarget.custodianNodeId,
  );
  if (!executorTarget || executorTarget.storageScopeId !== job.executionTarget.storageScopeId) {
    throw new EpisodeProgramRenderError(
      "The Mac that owns this program review is not online with the same storage scope.",
      409,
      "EPISODE_PROGRAM_RENDER_EXECUTOR_UNAVAILABLE",
    );
  }
  const episode = await input.prisma.studioEpisodeProduction.findFirst({
    where: {
      id: job.episodeProductionId,
      slug: input.episodeSlug,
      project: { slug: input.projectSlug },
    },
    select: { id: true, projectId: true },
  });
  if (!episode || episode.projectId !== job.projectId || row.projectId !== job.projectId) {
    throw new EpisodeProgramRenderError(
      "That program review is outside this Episode.",
      404,
      "EPISODE_PROGRAM_RENDER_NOT_FOUND",
    );
  }
  if (row.status === "completed") return registeredResult(row);
  if (row.status !== "output-ready") {
    throw new EpisodeProgramRenderError(
      row.status === "failed"
        ? row.error || "The full-program render failed."
        : "The local worker has not finished this program review yet.",
      409,
      row.status === "failed"
        ? "EPISODE_PROGRAM_RENDER_FAILED"
        : "EPISODE_PROGRAM_RENDER_NOT_READY",
    );
  }
  const envelope = record(row.resultJson);
  const result = parseEpisodeProgramRenderResult(envelope.receipt, job);
  const verifiedOutputPath = await verifyLocalRenderResult(
    result.output.locator,
    result.output.sha256,
    result.output.sizeBytes,
  );

  return input.prisma.$transaction(async (tx: any) => {
    const locked = await tx.studioWorkflowJob.findUnique({ where: { id: row.id } });
    if (!locked) throw new EpisodeProgramRenderError("The program review disappeared before registration.");
    if (locked.status === "completed") return registeredResult(locked);
    if (locked.status !== "output-ready") throw new EpisodeProgramRenderError("The program review changed before registration.");

    let source = await tx.studioVideoSource.findFirst({
      where: { providerSourceId: verifiedOutputPath },
    });
    if (!source) {
      source = await tx.studioVideoSource.create({
        data: {
          provider: "local-episode-program-render-worker",
          providerSourceId: verifiedOutputPath,
          url: "/api/ingest/media/pending",
          title: `${input.episodeSlug} full program review r${job.branchRevision}`,
        },
      });
    }
    const playbackUrl = `/api/ingest/media/${source.id}`;
    if (source.url !== playbackUrl) {
      source = await tx.studioVideoSource.update({
        where: { id: source.id },
        data: { url: playbackUrl },
      });
    }
    let asset = await tx.studioMediaAsset.findFirst({
      where: { url: playbackUrl, isProxy: true },
    });
    if (!asset) {
      asset = await tx.studioMediaAsset.create({
        data: {
          filename: `${input.episodeSlug}-program-review-r${job.branchRevision}.mp4`,
          url: playbackUrl,
          mimeType: "video/mp4",
          sizeBytes: BigInt(result.output.sizeBytes),
          isProxy: true,
          cloudProvider: "local",
          isGlobal: false,
          duration: result.output.durationSeconds,
          resolution: `${result.output.width}x${result.output.height}`,
          fps: result.output.fps,
        },
      });
    }
    const metadata = registrationMetadata(job, result, source.id, playbackUrl);
    await tx.studioAssetAttachment.upsert({
      where: { projectId_assetId: { projectId: job.projectId, assetId: asset.id } },
      create: {
        projectId: job.projectId,
        assetId: asset.id,
        role: "episode-program-review",
        source: "episode-program-render-registration",
        createdByEmail: input.actor.email.toLowerCase(),
        metadataJson: json(metadata),
      },
      update: {
        role: "episode-program-review",
        source: "episode-program-render-registration",
        metadataJson: json(metadata),
      },
    });
    const completed = await tx.studioWorkflowJob.update({
      where: { id: row.id },
      data: {
        status: "completed",
        completedAt: new Date(result.completedAt),
        error: null,
        resultJson: json({
          state: "completed",
          receipt: result,
          registration: {
            schema: "quipsly-episode-program-render-registration-v1",
            verifiedAt: new Date().toISOString(),
            verifiedByEmail: input.actor.email.toLowerCase(),
            assetId: asset.id,
            sourceId: source.id,
            playbackUrl,
            outputIsReviewCandidate: true,
            outputIsNotApprovedMaster: true,
            outputIsNotPublicationMedia: true,
            approvalRequiresSeparateReceipt: true,
            artifactPortability: job.executionTarget.portability,
            custodianNodeId: job.executionTarget.custodianNodeId,
            storageScopeId: job.executionTarget.storageScopeId,
          },
        }),
      },
    });
    return registeredResult(completed);
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

async function buildManifest(input: {
  prisma: any;
  episode: any;
  branch: any;
  state: ProgramEditState;
  clientRequestId: string;
  requestedByEmail: string;
  executorTarget: LocalExecutorTarget;
}): Promise<EpisodeProgramRenderJob> {
  if (!input.state.sourceProjectionFingerprint || !/^[0-9a-f]{64}$/.test(input.state.sourceProjectionFingerprint)) {
    throw new EpisodeProgramRenderError(
      "The canonical Episode source projection is not fingerprinted yet.",
    );
  }
  const frozen = programChunks(input.state);
  let exactSources;
  try {
    exactSources = await resolveExactEpisodeRenderSources({
      prisma: input.prisma,
      requiredSources: frozen.requiredSources,
      executorTarget: input.executorTarget,
    });
  } catch (error) {
    if (error instanceof ExactEpisodeRenderSourceError) {
      throw new EpisodeProgramRenderError(error.message);
    }
    throw error;
  }
  const jobId = `program_render_${randomUUID().replaceAll("-", "")}`;
  const target = {
    provider: "local" as const,
    portability: "executor-local" as const,
    custodianNodeId: input.executorTarget.nodeId,
    storageScopeId: input.executorTarget.storageScopeId,
    locator: buildEpisodeProgramRenderTargetLocator({
      episodeProductionId: input.episode.id,
      branchId: input.branch.id,
      branchRevision: input.branch.headRevision,
      jobId,
    }),
    contentType: "video/mp4" as const,
    container: "mp4" as const,
    videoCodec: "h264" as const,
    audioCodec: "aac" as const,
    width: 1280 as const,
    height: 720 as const,
    fps: 24 as const,
    sampleRateHz: 48_000 as const,
    variantKind: "episode-program-review" as const,
  };
  const base = {
    jobId,
    projectId: input.episode.projectId,
    episodeProductionId: input.episode.id,
    branchId: input.branch.id,
    branchRevision: input.branch.headRevision,
    requestedByEmail: input.requestedByEmail.toLowerCase(),
    clientRequestId: input.clientRequestId,
    queuedAt: new Date().toISOString(),
    timelineFingerprintSha256: fingerprint(input.episode.timelineJson),
    sourceProjectionFingerprintSha256: input.state.sourceProjectionFingerprint,
    editStateFingerprintSha256: fingerprint(input.state),
    manifestSha256: ZERO_SHA256,
    renderProfile: EPISODE_PROGRAM_REVIEW_PROFILE,
    executionTarget: {
      portability: "executor-local" as const,
      custodianNodeId: input.executorTarget.nodeId,
      storageScopeId: input.executorTarget.storageScopeId,
    },
    program: frozen.program,
    sources: exactSources,
    chunks: frozen.chunks,
    target,
  };
  const placeholder = newEpisodeProgramRenderJob(base);
  return newEpisodeProgramRenderJob({
    ...base,
    manifestSha256: createHash("sha256")
      .update(episodeProgramRenderManifestCanonicalJson(placeholder))
      .digest("hex"),
  });
}

export function programChunks(state: ProgramEditState) {
  const duration = Number(state.durationSeconds);
  if (!Number.isFinite(duration) || duration <= 0) {
    throw new EpisodeProgramRenderError("This Episode has no positive program duration.");
  }
  const decisions = state.programDecisions
    .filter((decision) => decision.startTime < duration)
    .slice()
    .sort((left, right) => left.startTime - right.startTime);
  if (!decisions.length || decisions[0]!.startTime > 0.001) {
    throw new EpisodeProgramRenderError(
      "The shared edit does not cover the beginning of the Episode. Add a visible or skip decision at 00:00 before rendering the full program.",
    );
  }
  const requiredSourceIds = new Set<string>();
  const chunks: EpisodeProgramRenderChunk[] = [];
  let outputCursor = 0;
  let skippedDurationSeconds = 0;
  let visibleDecisionCount = 0;
  for (let index = 0; index < decisions.length; index += 1) {
    const decision = decisions[index]!;
    const start = Math.max(0, decision.startTime);
    const end = Math.min(duration, decisions[index + 1]?.startTime ?? duration);
    const spanDuration = end - start;
    if (spanDuration < (1 / 24) - 0.001) {
      throw new EpisodeProgramRenderError(
        `Decision ${decision.id} is shorter than one 24 fps output frame.`,
      );
    }
    if (decision.kind === "skip") {
      skippedDurationSeconds += spanDuration;
      continue;
    }
    visibleDecisionCount += 1;
    const visualLaneIds = unique(decision.sourceLaneIDs);
    const clipLaneId = decision.clipLaneID ?? null;
    if (clipLaneId && !visualLaneIds.includes(clipLaneId)) visualLaneIds.push(clipLaneId);
    const chunkCount = Math.ceil(spanDuration / 30);
    for (let chunkIndex = 0; chunkIndex < chunkCount; chunkIndex += 1) {
      const chunkStart = start + spanDuration * chunkIndex / chunkCount;
      const chunkEnd = start + spanDuration * (chunkIndex + 1) / chunkCount;
      const explicitAudio = unique(decision.audioSourceLaneIDs ?? []);
      const defaultAudio = state.sources
        .filter((source) => source.role === "audio" && covers(source, chunkStart, chunkEnd))
        .map((source) => source.id);
      const audioLaneIds = explicitAudio.length
        ? explicitAudio
        : defaultAudio.length
          ? defaultAudio
          : visualLaneIds.slice();
      if (!audioLaneIds.length) {
        throw new EpisodeProgramRenderError(
          `Decision ${decision.id} has no synchronized audio source.`,
        );
      }
      const chunkLaneIds = unique([
        ...visualLaneIds,
        ...audioLaneIds,
        ...(clipLaneId ? [clipLaneId] : []),
      ]);
      for (const laneId of chunkLaneIds) {
        const source = state.sources.find((candidate) => candidate.id === laneId);
        if (!source) {
          throw new EpisodeProgramRenderError(
            `The shared edit references missing lane ${laneId}.`,
          );
        }
        if (!covers(source, chunkStart, chunkEnd)) {
          throw new EpisodeProgramRenderError(
            `${source.label} does not cover the complete full-program chunk from ${chunkStart.toFixed(2)} to ${chunkEnd.toFixed(2)} seconds.`,
          );
        }
        requiredSourceIds.add(laneId);
      }
      chunks.push({
        id: `program_chunk_${String(chunks.length + 1).padStart(5, "0")}`,
        outputStartSeconds: round(outputCursor),
        sequenceStartSeconds: round(chunkStart),
        sequenceEndSeconds: round(chunkEnd),
        decisionId: decision.id,
        decisionKind: decision.kind,
        visualLaneIds,
        clipLaneId,
        audioLaneIds,
      });
      outputCursor += chunkEnd - chunkStart;
    }
  }
  if (!chunks.length) {
    throw new EpisodeProgramRenderError(
      "Every decision is skipped. A full-program review would contain no visible frames.",
    );
  }
  const requiredSources = [...requiredSourceIds].map((laneId) => (
    state.sources.find((source) => source.id === laneId)!
  ));
  return {
    chunks,
    requiredSources,
    visibleDecisionCount,
    program: {
      sequenceDurationSeconds: round(duration),
      outputDurationSeconds: round(outputCursor),
      skippedDurationSeconds: round(skippedDurationSeconds),
      chunkCount: chunks.length,
    },
  };
}

function publicPlan(input: {
  state: ProgramEditState;
  branchRevision: number;
  manifest: EpisodeProgramRenderJob | null;
  executorTarget: LocalExecutorTarget | null;
  holdReason: string | null;
}): EpisodeProgramRenderPlan {
  let frozen: ReturnType<typeof programChunks> | null = null;
  if (!input.manifest) {
    try { frozen = programChunks(input.state); } catch { frozen = null; }
  }
  const chunks = input.manifest?.chunks ?? frozen?.chunks ?? [];
  const exactSources = input.manifest?.sources ?? [];
  const ready = Boolean(input.manifest && input.executorTarget && !input.holdReason);
  const localDetail = input.holdReason
    ?? (ready
      ? `This Mac can render ${chunks.length} frozen chunk${chunks.length === 1 ? "" : "s"} from exact local sources and retain the candidate locally.`
      : "No compatible local full-program worker is currently available.");
  return {
    schema: "quipsly-episode-program-render-plan-v1",
    branchRevision: input.branchRevision,
    renderProfile: EPISODE_PROGRAM_REVIEW_PROFILE,
    profileLabel: "Full program review",
    profileDescription: "A complete Play Edit review assembled from generation-locked 30-second-or-shorter chunks. This is not an approved master.",
    program: {
      sequenceDurationSeconds: input.manifest?.program.sequenceDurationSeconds
        ?? input.state.durationSeconds,
      outputDurationSeconds: input.manifest?.program.outputDurationSeconds
        ?? frozen?.program.outputDurationSeconds
        ?? 0,
      skippedDurationSeconds: input.manifest?.program.skippedDurationSeconds
        ?? frozen?.program.skippedDurationSeconds
        ?? 0,
      chunkCount: chunks.length,
      visibleDecisionCount: new Set(chunks.map((chunk) => chunk.decisionId)).size,
    },
    output: {
      width: 1280,
      height: 720,
      fps: 24,
      videoCodec: "h264",
      audioCodec: "aac",
    },
    sources: {
      requiredCount: exactSources.length || frozen?.requiredSources.length || 0,
      exactLocalCount: exactSources.length,
      totalBytes: exactSources.reduce((total, source) => total + source.sizeBytes, 0),
      labels: exactSources.length
        ? exactSources.map((source) => source.label)
        : frozen?.requiredSources.map((source) => source.label) ?? [],
    },
    executor: {
      id: "local-mac",
      label: input.executorTarget?.hostName || "Local Mac",
      executorNodeId: input.executorTarget?.nodeId ?? null,
      artifactPortability: "executor-local",
      status: input.holdReason ? "held" : ready ? "ready" : "offline",
      canQueue: ready,
      detail: localDetail,
      costKind: "none",
      costDetail: "No incremental cloud compute or transfer",
      qualityDetail: "Exact local source bytes; full Play Edit at 1280×720 H.264/AAC, 24 fps",
    },
    boundaries: {
      createsNoJob: true,
      sourceMediaRemainsImmutable: true,
      outputIsNotApprovedMaster: true,
      publicationNotStarted: true,
    },
  };
}

async function programRenderExecutor(
  prisma: any,
  preferredNodeId?: string | null,
): Promise<LocalExecutorTarget | null> {
  if (!prisma.agentNode?.findMany || !prisma.agentNode?.findUnique) return null;
  const targets = await readLocalExecutorTargets(prisma);
  const candidates = preferredNodeId
    ? targets.filter((target) => target.nodeId === preferredNodeId)
    : targets;
  for (const target of candidates) {
    const worker = await prisma.agentNode.findUnique({
      where: { id: target.nodeId },
      select: { status: true, capabilities: true, lastHeartbeatAt: true },
    });
    if (!worker) continue;
    const capabilities = record(worker.capabilities);
    const heartbeat = worker.lastHeartbeatAt instanceof Date
      ? worker.lastHeartbeatAt.getTime()
      : new Date(worker.lastHeartbeatAt ?? 0).getTime();
    if (
      worker.status === "online"
      && Date.now() - heartbeat <= 30_000
      && capabilities.executorKind === "local-mac"
      && Array.isArray(capabilities.jobTypes)
      && capabilities.jobTypes.includes(JOB_TYPE)
      && Array.isArray(capabilities.renderProfiles)
      && capabilities.renderProfiles.includes(EPISODE_PROGRAM_REVIEW_PROFILE)
    ) return target;
  }
  return null;
}

function projectState(episode: any, branchState: unknown): ProgramEditState {
  const canonical = projectCanonicalEpisodeEditState(episode);
  const retained = record(branchState);
  return {
    ...canonical,
    programDecisions: Array.isArray(retained.programDecisions)
      ? retained.programDecisions as ProgramEditState["programDecisions"]
      : canonical.programDecisions,
  };
}

function registrationMetadata(
  job: EpisodeProgramRenderJob,
  result: ReturnType<typeof parseEpisodeProgramRenderResult>,
  sourceId: string,
  playbackUrl: string,
) {
  return {
    schema: "quipsly-episode-program-render-registration-v1",
    jobId: job.jobId,
    episodeProductionId: job.episodeProductionId,
    branchId: job.branchId,
    branchRevision: job.branchRevision,
    manifestSha256: job.manifestSha256,
    renderProfile: job.renderProfile,
    executionTarget: job.executionTarget,
    artifactPortability: job.executionTarget.portability,
    custodianNodeId: job.executionTarget.custodianNodeId,
    storageScopeId: job.executionTarget.storageScopeId,
    sourceId,
    playbackUrl,
    program: job.program,
    chunks: job.chunks.map((chunk) => ({
      id: chunk.id,
      outputStartSeconds: chunk.outputStartSeconds,
      sequenceStartSeconds: chunk.sequenceStartSeconds,
      sequenceEndSeconds: chunk.sequenceEndSeconds,
      decisionId: chunk.decisionId,
    })),
    exactSources: job.sources.map((source) => ({
      laneId: source.laneId,
      mediaAssetId: source.mediaAssetId,
      sourceId: source.sourceId,
      sha256: source.sha256,
      generation: source.generation,
    })),
    output: result.output,
    worker: result.worker,
    ...result.boundaries,
  };
}

function registeredResult(row: any) {
  const registration = record(record(row.resultJson).registration);
  return {
    ok: true,
    jobId: row.id,
    status: row.status,
    assetId: text(registration.assetId),
    sourceId: text(registration.sourceId),
    playbackUrl: text(registration.playbackUrl),
    verifiedAt: text(registration.verifiedAt),
  };
}

function publicQueue(
  row: any,
  job: EpisodeProgramRenderJob,
  idempotentReplay: boolean,
): EpisodeProgramRenderQueueResult {
  return {
    idempotentReplay,
    job: {
      id: row.id,
      status: row.status,
      branchRevision: job.branchRevision,
      manifestSha256: job.manifestSha256,
      outputDurationSeconds: job.program.outputDurationSeconds,
      chunkCount: job.chunks.length,
      executionTarget: {
        portability: job.executionTarget.portability,
        nodeId: job.executionTarget.custodianNodeId,
        storageScopeId: job.executionTarget.storageScopeId,
        localPathWithheld: true,
      },
    },
  };
}

function covers(source: ProgramEditSource, start: number, end: number) {
  return start >= source.offsetSeconds - 0.001
    && end <= source.offsetSeconds + source.durationSeconds + 0.001;
}
function round(value: number) { return Math.round(value * 1_000_000) / 1_000_000; }
function safeRequestId(value: string) { const result = value.trim(); if (!/^[A-Za-z0-9:_-]{8,220}$/.test(result)) throw new EpisodeProgramRenderError("A stable full-program request id is required.", 400, "EPISODE_PROGRAM_RENDER_REQUEST_INVALID"); return result; }
function unique(values: string[]) { return [...new Set(values)]; }
function text(value: unknown) { return typeof value === "string" && value.trim() ? value.trim() : null; }
function record(value: unknown): Record<string, any> { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, any> : {}; }
function fingerprint(value: unknown) { return createHash("sha256").update(JSON.stringify(stable(value))).digest("hex"); }
function stable(value: unknown): unknown { if (Array.isArray(value)) return value.map(stable); if (!value || typeof value !== "object") return value; return Object.fromEntries(Object.entries(value as Record<string, unknown>).sort(([left], [right]) => left.localeCompare(right)).map(([key, item]) => [key, stable(item)])); }
function json(value: unknown): Prisma.InputJsonValue { return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue; }
