import "server-only";

import { createHash, randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { open, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";

import { Prisma } from "@prisma/client";
import {
  buildEpisodeRenderProofTargetLocator,
  episodeRenderProfile,
  episodeRenderProofManifestCanonicalJson,
  newEpisodeRenderProofJob,
  parseEpisodeRenderProofJob,
  parseEpisodeRenderProofResult,
  type EpisodeRenderProfileId,
  type EpisodeRenderProofJob,
  type EpisodeRenderProofSource,
} from "@high-ground/quipsly-media-processing";

import { decisionAt, type EpisodeRenderPlan, type ProgramEditState } from "@/lib/editor/program-edit-contract";
import {
  ensureEpisodeEditBranch,
  projectCanonicalEpisodeEditState,
  type EditActor,
} from "@/lib/server/episode-edit-store";
import { resolveAllowedLocalStudioMediaPath } from "@/lib/server/studio-media-location-security";
import {
  readLocalExecutorTarget,
  readLocalExecutorTargets,
  type LocalExecutorTarget,
} from "@/lib/server/local-executor-storage";
import {
  ExactEpisodeRenderSourceError,
  resolveExactEpisodeRenderSources,
} from "@/lib/server/episode-render-exact-sources";

const execFileAsync = promisify(execFile);
const JOB_TYPE = "episode-render-proof";
const JOB_SOURCE = "episode-editor.local-proof";
const ZERO_SHA256 = "0".repeat(64);

export class EpisodeRenderProofError extends Error {
  constructor(message: string, readonly status = 409, readonly code = "EPISODE_RENDER_PROOF_HELD") {
    super(message);
    this.name = "EpisodeRenderProofError";
  }
}

export type EpisodeRenderProofQueueResult = {
  idempotentReplay: boolean;
  job: {
    id: string;
    status: string;
    branchRevision: number;
    manifestSha256: string;
    renderProfile: EpisodeRenderProfileId;
    sequenceStartSeconds: number;
    sequenceEndSeconds: number;
    executionTarget: {
      portability: "executor-local";
      nodeId: string;
      storageScopeId: string;
      localPathWithheld: true;
    };
  };
};

export async function planEpisodeRenderProof(input: {
  prisma: any;
  projectSlug: string;
  episodeSlug: string;
  sequenceStartSeconds: number;
  expectedRevision: number;
  renderProfile: EpisodeRenderProfileId;
  executorNodeId?: string | null;
  actor: EditActor & { email: string };
}): Promise<EpisodeRenderPlan> {
  const profile = episodeRenderProfile(input.renderProfile);
  const sequenceStartSeconds = nonnegative(input.sequenceStartSeconds, "Choose a valid Episode time to review.");
  const { episode, branch } = await ensureEpisodeEditBranch(input.projectSlug, input.episodeSlug, input.actor);
  const current = await input.prisma.studioEditBranch.findUnique({ where: { id: branch.id } });
  if (!current || current.headRevision !== input.expectedRevision) {
    throw new EpisodeRenderProofError(
      "The shared edit changed while render options were being checked. Refresh the Episode and try again.",
      409,
      "EPISODE_RENDER_PROOF_STALE_EDIT",
    );
  }
  const state = projectState(episode, current.stateJson);
  let manifest: EpisodeRenderProofJob | null = null;
  let holdReason: string | null = null;
  const executorTarget = await episodeRenderExecutor(
    input.prisma,
    profile.capability,
    input.executorNodeId,
  );
  try {
    if (!executorTarget) {
      throw new EpisodeRenderProofError(
        "No compatible local media executor is online for this proof profile.",
      );
    }
    manifest = await buildManifest({
      prisma: input.prisma,
      episode,
      branch: current,
      state,
      sequenceStartSeconds,
      clientRequestId: `render_plan_${randomUUID().replaceAll("-", "")}`,
      requestedByEmail: input.actor.email,
      renderProfile: profile.id,
      executorTarget,
    });
  } catch (error) {
    if (!(error instanceof EpisodeRenderProofError) || error.code === "EPISODE_RENDER_PROOF_STALE_EDIT") throw error;
    holdReason = error.message;
  }
  return renderPlan({
    state,
    branchRevision: current.headRevision,
    requestedStartSeconds: sequenceStartSeconds,
    profileId: profile.id,
    manifest,
    executorTarget,
    workerOnline: Boolean(executorTarget),
    holdReason,
  });
}

export async function queueEpisodeRenderProof(input: {
  prisma: any;
  projectSlug: string;
  episodeSlug: string;
  sequenceStartSeconds: number;
  expectedRevision: number;
  clientRequestId: string;
  renderProfile?: EpisodeRenderProfileId;
  executorNodeId?: string | null;
  actor: EditActor & { email: string };
}): Promise<EpisodeRenderProofQueueResult> {
  const profile = episodeRenderProfile(input.renderProfile ?? "proof-10s");
  const clientRequestId = safeRequestId(input.clientRequestId);
  const sequenceStartSeconds = nonnegative(input.sequenceStartSeconds, "Choose a valid Episode time for the proof.");
  const executorTarget = await episodeRenderExecutor(
    input.prisma,
    profile.capability,
    input.executorNodeId,
  );
  if (!executorTarget) {
    throw new EpisodeRenderProofError(
      "No compatible local media executor is online for this proof profile.",
      409,
      "EPISODE_RENDER_PROOF_EXECUTOR_UNAVAILABLE",
    );
  }
  const { episode, branch } = await ensureEpisodeEditBranch(input.projectSlug, input.episodeSlug, input.actor);
  const current = await input.prisma.studioEditBranch.findUnique({ where: { id: branch.id } });
  if (!current || current.headRevision !== input.expectedRevision) {
    throw new EpisodeRenderProofError(
      "The shared edit changed before this proof could be frozen. Refresh the Episode and try again.",
      409,
      "EPISODE_RENDER_PROOF_STALE_EDIT",
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
    const existingJob = parseEpisodeRenderProofJob(existing.inputJson, existing.id);
    if (
      existingJob.projectId !== episode.projectId
      || existingJob.episodeProductionId !== episode.id
      || existingJob.branchId !== current.id
      || existingJob.branchRevision !== input.expectedRevision
      || existingJob.renderProfile !== profile.id
      || existingJob.executionTarget.custodianNodeId !== executorTarget.nodeId
      || existingJob.executionTarget.storageScopeId !== executorTarget.storageScopeId
      || Math.abs(existingJob.proof.sequenceStartSeconds - sequenceStartSeconds) > 0.001
    ) {
      throw new EpisodeRenderProofError(
        "That proof request id is already bound to different edit evidence.",
        409,
        "EPISODE_RENDER_PROOF_IDEMPOTENCY_CONFLICT",
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
    sequenceStartSeconds,
    clientRequestId,
    requestedByEmail: input.actor.email,
    renderProfile: profile.id,
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
      priority: 50,
      inputJson: json(manifest),
      requestedByEmail: input.actor.email.toLowerCase(),
    },
  });
  return publicQueue(created, manifest, false);
}

export async function registerEpisodeRenderProof(input: {
  prisma: any;
  projectSlug: string;
  episodeSlug: string;
  jobId: string;
  actor: EditActor & { email: string };
}) {
  const row = await input.prisma.studioWorkflowJob.findUnique({ where: { id: input.jobId } });
  if (!row || row.type !== JOB_TYPE || row.source !== JOB_SOURCE) {
    throw new EpisodeRenderProofError("That Episode proof job does not exist.", 404, "EPISODE_RENDER_PROOF_NOT_FOUND");
  }
  const job = parseEpisodeRenderProofJob(row.inputJson, row.id);
  const executorTarget = await readLocalExecutorTarget(
    input.prisma,
    job.executionTarget.custodianNodeId,
  );
  if (
    !executorTarget ||
    executorTarget.storageScopeId !== job.executionTarget.storageScopeId
  ) {
    throw new EpisodeRenderProofError(
      "The Mac that owns this proof output is not online with the same storage scope.",
      409,
      "EPISODE_RENDER_PROOF_EXECUTOR_UNAVAILABLE",
    );
  }
  const episode = await input.prisma.studioEpisodeProduction.findFirst({
    where: { id: job.episodeProductionId, slug: input.episodeSlug, project: { slug: input.projectSlug } },
    select: { id: true, projectId: true },
  });
  if (!episode || episode.projectId !== job.projectId || row.projectId !== job.projectId) {
    throw new EpisodeRenderProofError("That render proof is outside this Episode.", 404, "EPISODE_RENDER_PROOF_NOT_FOUND");
  }
  if (row.status === "completed") return registeredResult(row);
  if (row.status !== "output-ready") {
    throw new EpisodeRenderProofError(
      row.status === "failed" ? row.error || "The local proof render failed." : "The local worker has not finished this proof yet.",
      409,
      row.status === "failed" ? "EPISODE_RENDER_PROOF_FAILED" : "EPISODE_RENDER_PROOF_NOT_READY",
    );
  }
  const envelope = record(row.resultJson);
  const result = parseEpisodeRenderProofResult(envelope.receipt, job);
  const verifiedOutputPath = await verifyLocalRenderResult(result.output.locator, result.output.sha256, result.output.sizeBytes);
  const isSectionReview = job.renderProfile === "section-review-30s";
  const attachmentRole = isSectionReview ? "episode-review-draft" : "episode-edit-proof";

  return input.prisma.$transaction(async (tx: any) => {
    const locked = await tx.studioWorkflowJob.findUnique({ where: { id: row.id } });
    if (!locked) throw new EpisodeRenderProofError("The proof job disappeared before registration.");
    if (locked.status === "completed") return registeredResult(locked);
    if (locked.status !== "output-ready") throw new EpisodeRenderProofError("The proof job changed before registration.");

    let source = await tx.studioVideoSource.findFirst({ where: { providerSourceId: verifiedOutputPath } });
    if (!source) {
      source = await tx.studioVideoSource.create({
        data: {
          provider: "local-episode-render-proof-worker",
          providerSourceId: verifiedOutputPath,
          url: "/api/ingest/media/pending",
          title: `${input.episodeSlug} edit proof r${job.branchRevision}`,
        },
      });
    }
    const playbackUrl = `/api/ingest/media/${source.id}`;
    if (source.url !== playbackUrl) {
      source = await tx.studioVideoSource.update({ where: { id: source.id }, data: { url: playbackUrl } });
    }
    let asset = await tx.studioMediaAsset.findFirst({
      where: { url: playbackUrl, isProxy: true },
    });
    if (!asset) {
      asset = await tx.studioMediaAsset.create({
        data: {
          filename: `${input.episodeSlug}-${isSectionReview ? "section-review" : "edit-proof"}-r${job.branchRevision}.mp4`,
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
    await tx.studioAssetAttachment.upsert({
      where: { projectId_assetId: { projectId: job.projectId, assetId: asset.id } },
      create: {
        projectId: job.projectId,
        assetId: asset.id,
        role: attachmentRole,
        source: "episode-render-proof-registration",
        createdByEmail: input.actor.email.toLowerCase(),
        metadataJson: json(registrationMetadata(job, result, source.id, playbackUrl)),
      },
      update: {
        role: attachmentRole,
        source: "episode-render-proof-registration",
        metadataJson: json(registrationMetadata(job, result, source.id, playbackUrl)),
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
            schema: "quipsly-episode-render-proof-registration-v2",
            verifiedAt: new Date().toISOString(),
            verifiedByEmail: input.actor.email.toLowerCase(),
            assetId: asset.id,
            sourceId: source.id,
            playbackUrl,
            proofIsNotApprovedOutput: true,
            proofIsNotPublicationMedia: true,
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

async function buildManifest(input: {
  prisma: any;
  episode: any;
  branch: any;
  state: ProgramEditState;
  sequenceStartSeconds: number;
  clientRequestId: string;
  requestedByEmail: string;
  renderProfile: EpisodeRenderProfileId;
  executorTarget: LocalExecutorTarget;
}): Promise<EpisodeRenderProofJob> {
  const renderProfile = episodeRenderProfile(input.renderProfile);
  if (!input.state.sourceProjectionFingerprint || !/^[0-9a-f]{64}$/.test(input.state.sourceProjectionFingerprint)) {
    throw new EpisodeRenderProofError("The canonical Episode source projection is not fingerprinted yet.");
  }
  const start = Math.min(input.sequenceStartSeconds, Math.max(0, input.state.durationSeconds - 0.05));
  const decision = decisionAt(input.state.programDecisions, start);
  if (decision?.kind === "skip") throw new EpisodeRenderProofError("This position is skipped in the shared edit. Choose a visible section to render.");
  const videoSources = input.state.sources.filter((source) => source.kind === "video" || (source.kind === undefined && source.role !== "audio"));
  if (!decision && videoSources.length) {
    throw new EpisodeRenderProofError("Choose Charlie, Homer, Both, or a clip layout at this point before freezing a visual proof.");
  }
  const nextDecision = input.state.programDecisions.find((item) => item.startTime > start + 0.001);
  const end = Math.min(
    input.state.durationSeconds,
    start + renderProfile.maxDurationSeconds,
    nextDecision?.startTime ?? Number.POSITIVE_INFINITY,
  );
  if (end - start < 0.35) throw new EpisodeRenderProofError("There is less than a third of a second before the next edit decision. Move the playhead into a longer section.");

  const visualLaneIds = unique(decision?.sourceLaneIDs ?? []);
  const clipLaneId = decision?.clipLaneID ?? null;
  if (clipLaneId && !visualLaneIds.includes(clipLaneId)) visualLaneIds.push(clipLaneId);
  const inRange = (source: ProgramEditState["sources"][number]) => (
    start >= source.offsetSeconds
    && end <= source.offsetSeconds + source.durationSeconds + 0.001
  );
  const explicitAudio = unique(decision?.audioSourceLaneIDs ?? []);
  const defaultAudio = input.state.sources.filter((source) => source.role === "audio" && inRange(source)).map((source) => source.id);
  const audioLaneIds = explicitAudio.length ? explicitAudio : defaultAudio.length ? defaultAudio : visualLaneIds.slice();
  if (!audioLaneIds.length) {
    throw new EpisodeRenderProofError("No synchronized audio source covers this proof window.");
  }
  const requiredLaneIds = unique([...visualLaneIds, ...audioLaneIds]);
  const requiredSources = requiredLaneIds.map((laneId) => {
    const source = input.state.sources.find((item) => item.id === laneId);
    if (!source) throw new EpisodeRenderProofError(`The shared edit references missing lane ${laneId}.`);
    if (!inRange(source)) throw new EpisodeRenderProofError(`${source.label} does not cover the complete proof window.`);
    return source;
  });
  let exactSources: EpisodeRenderProofSource[];
  try {
    exactSources = await resolveExactEpisodeRenderSources({
      prisma: input.prisma,
      requiredSources,
      executorTarget: input.executorTarget,
    });
  } catch (error) {
    if (error instanceof ExactEpisodeRenderSourceError) {
      throw new EpisodeRenderProofError(error.message);
    }
    throw error;
  }

  const jobId = `render_proof_${randomUUID().replaceAll("-", "")}`;
  const target = {
    provider: "local" as const,
    portability: "executor-local" as const,
    custodianNodeId: input.executorTarget.nodeId,
    storageScopeId: input.executorTarget.storageScopeId,
    locator: buildEpisodeRenderProofTargetLocator({
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
    variantKind: renderProfile.variantKind,
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
    renderProfile: renderProfile.id,
    executionTarget: {
      portability: "executor-local" as const,
      custodianNodeId: input.executorTarget.nodeId,
      storageScopeId: input.executorTarget.storageScopeId,
    },
    proof: {
      sequenceStartSeconds: start,
      sequenceEndSeconds: end,
      decisionId: decision?.id ?? null,
      decisionKind: decision?.kind ?? "audio-source-through",
      visualLaneIds,
      clipLaneId,
      audioLaneIds,
    },
    sources: exactSources,
    target,
  };
  const placeholder = newEpisodeRenderProofJob(base);
  return newEpisodeRenderProofJob({
    ...base,
    manifestSha256: createHash("sha256")
      .update(episodeRenderProofManifestCanonicalJson(placeholder))
      .digest("hex"),
  });
}

export async function verifyLocalRenderResult(locator: string, expectedSha256: string, expectedSizeBytes: number) {
  const workerRoot = path.resolve(process.env.QUIPSLY_LOCAL_MEDIA_UPLOAD_ROOT || path.join(tmpdir(), "quipsly-media-ingest"));
  const candidate = path.resolve(workerRoot, locator);
  const resolved = await resolveAllowedLocalStudioMediaPath(candidate);
  if (!resolved) throw new EpisodeRenderProofError("The proof output escaped the authorized local media vault.");
  const details = await stat(resolved);
  if (!details.isFile() || details.size !== expectedSizeBytes) throw new EpisodeRenderProofError("The proof output size no longer matches the worker receipt.");
  const hash = createHash("sha256");
  const handle = await open(resolved, "r");
  try {
    const buffer = Buffer.alloc(1024 * 1024);
    let offset = 0;
    while (true) {
      const { bytesRead } = await handle.read(buffer, 0, buffer.length, offset);
      if (!bytesRead) break;
      hash.update(buffer.subarray(0, bytesRead));
      offset += bytesRead;
    }
  } finally {
    await handle.close();
  }
  if (hash.digest("hex") !== expectedSha256) throw new EpisodeRenderProofError("The proof output bytes no longer match the worker receipt.");
  await execFileAsync("ffmpeg", ["-v", "error", "-i", resolved, "-f", "null", "-"], { timeout: 60_000, maxBuffer: 1024 * 1024 });
  return resolved;
}

function registrationMetadata(job: EpisodeRenderProofJob, result: ReturnType<typeof parseEpisodeRenderProofResult>, sourceId: string, playbackUrl: string) {
  return {
    schema: "quipsly-episode-render-proof-registration-v2",
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
    proof: job.proof,
    exactSources: job.sources.map((source) => ({ laneId: source.laneId, mediaAssetId: source.mediaAssetId, sourceId: source.sourceId, sha256: source.sha256, generation: source.generation })),
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

function publicQueue(row: any, job: EpisodeRenderProofJob, idempotentReplay: boolean): EpisodeRenderProofQueueResult {
  return {
    idempotentReplay,
    job: {
      id: row.id,
      status: row.status,
      branchRevision: job.branchRevision,
      manifestSha256: job.manifestSha256,
      renderProfile: job.renderProfile,
      sequenceStartSeconds: job.proof.sequenceStartSeconds,
      sequenceEndSeconds: job.proof.sequenceEndSeconds,
      executionTarget: {
        portability: job.executionTarget.portability,
        nodeId: job.executionTarget.custodianNodeId,
        storageScopeId: job.executionTarget.storageScopeId,
        localPathWithheld: true,
      },
    },
  };
}

function renderPlan(input: {
  state: ProgramEditState;
  branchRevision: number;
  requestedStartSeconds: number;
  profileId: EpisodeRenderProfileId;
  manifest: EpisodeRenderProofJob | null;
  executorTarget: LocalExecutorTarget | null;
  workerOnline: boolean;
  holdReason: string | null;
}): EpisodeRenderPlan {
  const profile = episodeRenderProfile(input.profileId);
  const start = input.manifest?.proof.sequenceStartSeconds
    ?? Math.min(input.requestedStartSeconds, Math.max(0, input.state.durationSeconds - 0.05));
  const end = input.manifest?.proof.sequenceEndSeconds
    ?? Math.min(input.state.durationSeconds, start + profile.maxDurationSeconds);
  const sourcesInRange = input.state.sources.filter((source) => (
    start >= source.offsetSeconds
    && end <= source.offsetSeconds + source.durationSeconds + 0.001
    && Boolean(source.playbackUrl)
  ));
  const exactSources = input.manifest?.sources ?? [];
  const localStatus = input.holdReason
    ? "held" as const
    : input.workerOnline
      ? "ready" as const
      : "offline" as const;
  const localDetail = input.holdReason
    ?? (input.workerOnline
      ? `This Mac can freeze ${exactSources.length} exact source${exactSources.length === 1 ? "" : "s"} into this review without cloud compute.`
      : "The exact-source render is valid, but no compatible local worker heartbeat is currently visible.");
  return {
    schema: "quipsly-episode-render-plan-v1",
    branchRevision: input.branchRevision,
    renderProfile: profile.id,
    profileLabel: profile.label,
    profileDescription: profile.description,
    sequenceStartSeconds: start,
    sequenceEndSeconds: end,
    durationSeconds: Math.max(0, end - start),
    output: { width: 1280, height: 720, fps: 24, videoCodec: "h264", audioCodec: "aac" },
    sources: {
      requiredCount: exactSources.length || sourcesInRange.length,
      browserPlayableCount: sourcesInRange.length,
      exactLocalCount: exactSources.length,
      totalBytes: exactSources.reduce((total, source) => total + source.sizeBytes, 0),
      labels: exactSources.length ? exactSources.map((source) => source.label) : sourcesInRange.map((source) => source.label),
    },
    executors: [
      {
        id: "browser",
        label: "Browser preview",
        executorNodeId: null,
        artifactPortability: "portable",
        status: "ready",
        canQueue: false,
        detail: "Keep editing immediately with protected playback sources. No new media file is created.",
        costKind: "none",
        costDetail: "No render compute or upload started",
        qualityDetail: "Responsive editorial preview; protected proxies may be used",
      },
      {
        id: "local-mac",
        label: input.executorTarget?.hostName || "Local Mac",
        executorNodeId: input.executorTarget?.nodeId ?? null,
        artifactPortability: "executor-local",
        status: localStatus,
        canQueue: localStatus === "ready" && Boolean(input.manifest),
        detail: localDetail,
        costKind: "none",
        costDetail: "No incremental cloud compute or transfer",
        qualityDetail: "Exact local source bytes; 1280×720 H.264/AAC at 24 fps",
      },
      {
        id: "cloud",
        label: "Quipsly Cloud",
        executorNodeId: null,
        artifactPortability: "portable",
        status: "not-configured",
        canQueue: false,
        detail: "Cloud rendering is intentionally unavailable until exact-source upload, generation locking, result verification, and spend disclosure are wired end to end.",
        costKind: "metered",
        costDetail: "No upload started and no cloud render charge incurred",
        qualityDetail: "Planned: exact frozen originals with verified result receipt",
      },
    ],
    boundaries: {
      createsNoJob: true,
      sourceMediaRemainsImmutable: true,
      cloudUploadNotStarted: true,
      publicationNotStarted: true,
    },
  };
}

async function episodeRenderExecutor(
  prisma: any,
  capability: string,
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
      && capabilities.renderProfiles.includes(capability)
    ) return target;
  }
  return null;
}

function fingerprint(value: unknown) {
  return createHash("sha256").update(stableJson(value)).digest("hex");
}
function stableJson(value: unknown) { return JSON.stringify(stable(value)); }
function stable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stable);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, item]) => [key, stable(item)]));
}
function record(value: unknown): Record<string, any> { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, any> : {}; }
function text(value: unknown) { return typeof value === "string" && value.trim() ? value.trim() : null; }
function unique(values: string[]) { return [...new Set(values)]; }
function nonnegative(value: unknown, message: string) { const parsed = Number(value); if (!Number.isFinite(parsed) || parsed < 0) throw new EpisodeRenderProofError(message, 400, "EPISODE_RENDER_PROOF_TIME_INVALID"); return parsed; }
function safeRequestId(value: string) { const result = value.trim(); if (!/^[A-Za-z0-9:_-]{8,220}$/.test(result)) throw new EpisodeRenderProofError("A stable proof request id is required.", 400, "EPISODE_RENDER_PROOF_REQUEST_INVALID"); return result; }
function json(value: unknown): Prisma.InputJsonValue { return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue; }
