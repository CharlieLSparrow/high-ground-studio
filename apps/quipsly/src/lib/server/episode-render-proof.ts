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
  episodeRenderProofManifestCanonicalJson,
  newEpisodeRenderProofJob,
  parseEpisodeRenderProofJob,
  parseEpisodeRenderProofResult,
  type EpisodeRenderProofJob,
  type EpisodeRenderProofSource,
} from "@high-ground/quipsly-media-processing";

import { decisionAt, type ProgramEditState } from "@/lib/editor/program-edit-contract";
import {
  ensureEpisodeEditBranch,
  projectCanonicalEpisodeEditState,
  type EditActor,
} from "@/lib/server/episode-edit-store";
import { resolveAllowedLocalStudioMediaPath } from "@/lib/server/studio-media-location-security";

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
    sequenceStartSeconds: number;
    sequenceEndSeconds: number;
  };
};

export async function queueEpisodeRenderProof(input: {
  prisma: any;
  projectSlug: string;
  episodeSlug: string;
  sequenceStartSeconds: number;
  expectedRevision: number;
  clientRequestId: string;
  actor: EditActor & { email: string };
}): Promise<EpisodeRenderProofQueueResult> {
  const clientRequestId = safeRequestId(input.clientRequestId);
  const sequenceStartSeconds = nonnegative(input.sequenceStartSeconds, "Choose a valid Episode time for the proof.");
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
  const verifiedOutputPath = await verifyLocalResult(result.output.locator, result.output.sha256, result.output.sizeBytes);

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
          filename: `${input.episodeSlug}-edit-proof-r${job.branchRevision}.mp4`,
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
        role: "episode-edit-proof",
        source: "episode-render-proof-registration",
        createdByEmail: input.actor.email.toLowerCase(),
        metadataJson: json(registrationMetadata(job, result, source.id, playbackUrl)),
      },
      update: {
        role: "episode-edit-proof",
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
            schema: "quipsly-episode-render-proof-registration-v1",
            verifiedAt: new Date().toISOString(),
            verifiedByEmail: input.actor.email.toLowerCase(),
            assetId: asset.id,
            sourceId: source.id,
            playbackUrl,
            proofIsNotApprovedOutput: true,
            proofIsNotPublicationMedia: true,
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
}): Promise<EpisodeRenderProofJob> {
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
  const end = Math.min(input.state.durationSeconds, start + 10, nextDecision?.startTime ?? Number.POSITIVE_INFINITY);
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
  const mediaAssetIds = unique(requiredSources.map((source) => source.mediaAssetId).filter(Boolean) as string[]);
  const sourceIds = unique(requiredSources.map((source) => source.sourceId).filter(Boolean) as string[]);
  if (requiredSources.some((source) => !source.mediaAssetId || !source.sourceId)) {
    throw new EpisodeRenderProofError("At least one selected lane lacks durable media or source identity. Refresh Capture materialization before rendering.");
  }
  const sources = await input.prisma.studioVideoSource.findMany({
    where: { id: { in: sourceIds } },
    select: { id: true, providerSourceId: true, url: true },
  });
  const sourcesById = new Map(sources.map((source: any) => [source.id, source]));
  const playbackUrls = unique(sources.map((source: any) => source.url).filter(Boolean));
  const assets = await input.prisma.studioMediaAsset.findMany({
    where: { OR: [{ id: { in: mediaAssetIds } }, { url: { in: playbackUrls } }] },
    orderBy: [{ id: "asc" }],
    select: { id: true, filename: true, mimeType: true, sizeBytes: true, duration: true, url: true },
  });
  const assetsById = new Map(assets.map((asset: any) => [asset.id, asset]));
  const exactSources: EpisodeRenderProofSource[] = [];
  for (const source of requiredSources) {
    const durableSource = sourcesById.get(source.sourceId!) as any;
    const sha256 = source.sourceSha256?.toLowerCase() ?? "";
    const locator = durableSource?.providerSourceId
      ? await resolveAllowedLocalStudioMediaPath(durableSource.providerSourceId)
      : null;
    const file = locator ? await stat(locator).catch(() => null) : null;
    const preferredAsset = assetsById.get(source.mediaAssetId!) as any;
    const asset = measuredAsset(preferredAsset, file?.size)
      ? preferredAsset
      : assets.find((candidate: any) => candidate.url === durableSource?.url && measuredAsset(candidate, file?.size));
    const sizeBytes = Number(asset?.sizeBytes ?? 0);
    if (!asset || !durableSource || !locator || !file?.isFile() || !/^[0-9a-f]{64}$/.test(sha256) || !Number.isSafeInteger(sizeBytes) || sizeBytes <= 0) {
      throw new EpisodeRenderProofError(`${source.label} is playable in the browser but is not available as an exact local worker source on this Mac.`);
    }
    exactSources.push({
      laneId: source.id,
      mediaAssetId: asset.id,
      sourceId: source.sourceId!,
      recordingAssetId: source.recordingAssetId ?? null,
      label: source.label,
      kind: source.kind === "audio" ? "audio" : "video",
      role: source.role,
      provider: "local",
      locator,
      generation: `sha256:${sha256}`,
      sha256,
      sizeBytes,
      contentType: source.contentType || asset.mimeType || (source.kind === "audio" ? "audio/wav" : "video/mp4"),
      sequenceOffsetSeconds: source.offsetSeconds,
      sourceStartSeconds: source.sourceStartSeconds ?? 0,
      sourceDurationSeconds: source.durationSeconds,
    });
  }

  const jobId = `render_proof_${randomUUID().replaceAll("-", "")}`;
  const target = {
    provider: "local" as const,
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
    variantKind: "episode-edit-proof" as const,
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

async function verifyLocalResult(locator: string, expectedSha256: string, expectedSizeBytes: number) {
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
    schema: "quipsly-episode-render-proof-registration-v1",
    jobId: job.jobId,
    episodeProductionId: job.episodeProductionId,
    branchId: job.branchId,
    branchRevision: job.branchRevision,
    manifestSha256: job.manifestSha256,
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
      sequenceStartSeconds: job.proof.sequenceStartSeconds,
      sequenceEndSeconds: job.proof.sequenceEndSeconds,
    },
  };
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
function measuredAsset(asset: any, fileSize: number | undefined) {
  const assetSize = Number(asset?.sizeBytes ?? 0);
  return Boolean(asset)
    && Number.isSafeInteger(assetSize)
    && assetSize > 0
    && Number.isSafeInteger(fileSize)
    && assetSize === fileSize;
}
function nonnegative(value: unknown, message: string) { const parsed = Number(value); if (!Number.isFinite(parsed) || parsed < 0) throw new EpisodeRenderProofError(message, 400, "EPISODE_RENDER_PROOF_TIME_INVALID"); return parsed; }
function safeRequestId(value: string) { const result = value.trim(); if (!/^[A-Za-z0-9:_-]{8,220}$/.test(result)) throw new EpisodeRenderProofError("A stable proof request id is required.", 400, "EPISODE_RENDER_PROOF_REQUEST_INVALID"); return result; }
function json(value: unknown): Prisma.InputJsonValue { return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue; }
