import "server-only";

import { randomUUID } from "node:crypto";
import type { Prisma } from "@prisma/client";
import {
  buildAudioAlignmentCloudManifestObjectName,
  buildAudioAlignmentCloudResultObjectName,
  newAudioAlignmentJob,
  parseAudioAlignmentCloudManifest,
  parseAudioAlignmentJob,
  parseAudioAlignmentResult,
  type AudioAlignmentEvidence,
  type AudioAlignmentJob,
} from "@high-ground/quipsly-media-processing";

import { canonicalEpisodeImportedMedia } from "@/lib/episode-production/imported-media";
import { inspectImmutableStudioMediaSource } from "@/lib/server/episode-collaboration-proxy";
import { getMediaBucket } from "@/lib/server/gcs";
import { ensureAudioSourceAlignmentCloudQueued } from "@/lib/server/audio-source-alignment-cloud";

const JOB_TYPE = "audio-alignment";

export type PublicAudioSourceAlignmentStatus = {
  jobId: string | null;
  status: "not-queued" | "queued" | "processing" | "output-ready" | "completed" | "blocked" | "failed";
  spineAssetId: string | null;
  targetAssetId: string | null;
  evidence: AudioAlignmentEvidence | null;
  error: string | null;
  updatedAt: string | null;
  boundaries: {
    exactSourceBytesBound: true;
    sourceBytesImmutable: true;
    placementApplied: false;
    placementRequiresSeparateReview: true;
  };
};

export async function queueAudioSourceAlignment(input: {
  prisma: any;
  projectSlug: string;
  episodeSlug: string;
  spineAssetId: string;
  spineSourceId: string;
  targetAssetId: string;
  targetSourceId: string;
  actorUserId: string | null;
  actorEmail: string;
  proposal: AudioAlignmentJob["proposal"];
}) {
  const context = await loadContext(input);
  const [spineEvidence, targetEvidence] = await Promise.all([
    inspectImmutableStudioMediaSource(context.spineSource.providerSourceId, context.spineAsset.mimeType),
    inspectImmutableStudioMediaSource(context.targetSource.providerSourceId, context.targetAsset.mimeType),
  ]);
  if (spineEvidence.provider !== targetEvidence.provider) {
    throw new Error("Alignment sources must currently use the same immutable storage provider.");
  }
  const existing = await input.prisma.studioAssetProcessingJob.findFirst({
    where: {
      projectId: context.project.id,
      assetId: context.targetAsset.id,
      type: JOB_TYPE,
    },
    orderBy: { createdAt: "desc" },
  });
  const jobId = `audio_alignment_${randomUUID().replaceAll("-", "")}`;
  const job = newAudioAlignmentJob({
    jobId,
    projectId: context.project.id,
    projectSlug: context.project.slug,
    episodeProductionId: context.production.id,
    episodeSlug: context.production.slug,
    requestedByUserId: input.actorUserId,
    requestedByEmail: input.actorEmail,
    queuedAt: new Date().toISOString(),
    spine: { assetId: context.spineAsset.id, ...spineEvidence },
    target: { assetId: context.targetAsset.id, ...targetEvidence },
    proposal: input.proposal,
  });
  let matchingExisting: AudioAlignmentJob | null = null;
  if (existing && existing.status !== "failed") {
    try {
      const current = parseAudioAlignmentJob(existing.inputJson, existing.id);
      if (sameRequest(current, job)) matchingExisting = current;
    } catch {
      // A malformed or differently bound job cannot own this request.
    }
  }
  if (existing && matchingExisting) {
    if (matchingExisting.spine.provider !== "gcs") return publicStatus(existing);
    const cloud = await ensureAudioSourceAlignmentCloudQueued({
      prisma: input.prisma,
      processingJob: existing,
    });
    const refreshed = await input.prisma.studioAssetProcessingJob.findUnique({
      where: { id: existing.id },
    });
    const status = publicStatus(refreshed ?? existing);
    return cloud.status === "configuration-required"
      ? {
          ...status,
          status: "blocked" as const,
          error: "Cloud exact-source alignment is retained, but the media processor execution control is not configured.",
        }
      : status;
  }
  const saved = await input.prisma.studioAssetProcessingJob.create({
    data: {
      id: job.jobId,
      projectId: context.project.id,
      assetId: context.targetAsset.id,
      type: JOB_TYPE,
      status: "queued",
      requestedByEmail: input.actorEmail,
      inputJson: json(job),
    },
  });
  if (job.spine.provider === "gcs") {
    const cloud = await ensureAudioSourceAlignmentCloudQueued({ prisma: input.prisma, processingJob: saved });
    const refreshed = await input.prisma.studioAssetProcessingJob.findUnique({ where: { id: saved.id } });
    const current = refreshed ? publicStatus(refreshed) : publicStatus(saved);
    return cloud.status === "configuration-required"
      ? { ...current, status: "blocked" as const, error: "Cloud exact-source alignment is retained, but the media processor execution control is not configured." }
      : current;
  }
  return publicStatus(saved);
}

export async function readAudioSourceAlignmentStatus(input: {
  prisma: any;
  projectSlug: string;
  episodeSlug: string;
  targetAssetId: string;
}) {
  const project = await input.prisma.studioProject.findFirst({ where: { slug: input.projectSlug }, select: { id: true } });
  if (!project) return emptyStatus();
  const production = await input.prisma.studioEpisodeProduction.findUnique({
    where: { projectId_slug: { projectId: project.id, slug: input.episodeSlug } },
    select: { id: true },
  });
  if (!production) return emptyStatus();
  const row = await input.prisma.studioAssetProcessingJob.findFirst({
    where: { projectId: project.id, assetId: input.targetAssetId, type: JOB_TYPE },
    orderBy: { createdAt: "desc" },
  });
  return row ? publicStatus(row) : emptyStatus();
}

export async function reconcileAudioSourceAlignment(input: {
  prisma: any;
  projectSlug: string;
  episodeSlug: string;
  spineAssetId: string;
  spineSourceId: string;
  targetAssetId: string;
  targetSourceId: string;
}) {
  const context = await loadContext(input);
  const row = await input.prisma.studioAssetProcessingJob.findFirst({
    where: { projectId: context.project.id, assetId: context.targetAsset.id, type: JOB_TYPE },
    orderBy: { createdAt: "desc" },
  });
  if (!row) return emptyStatus();
  const job = parseAudioAlignmentJob(row.inputJson, row.id);
  if (job.spine.provider === "gcs" || job.target.provider === "gcs") {
    return reconcileCloud(input.prisma, row, job, context);
  }
  if (row.status !== "output-ready") return publicStatus(row);
  const result = parseAudioAlignmentResult(object(row.resultJson).receipt, job);
  const [currentSpine, currentTarget] = await Promise.all([
    inspectImmutableStudioMediaSource(context.spineSource.providerSourceId, context.spineAsset.mimeType),
    inspectImmutableStudioMediaSource(context.targetSource.providerSourceId, context.targetAsset.mimeType),
  ]);
  if (!sameSource(job.spine, { assetId: context.spineAsset.id, ...currentSpine }) || !sameSource(job.target, { assetId: context.targetAsset.id, ...currentTarget })) {
    throw new Error("An immutable alignment source changed before evidence registration.");
  }
  const updated = await input.prisma.studioAssetProcessingJob.update({
    where: { id: row.id },
    data: {
      status: "completed",
      completedAt: new Date(result.completedAt),
      resultJson: json({
        state: "completed",
        receipt: result,
        registration: {
          exactSourceBytesBound: true,
          sourceBytesImmutable: true,
          placementApplied: false,
          placementRequiresSeparateReview: true,
        },
      }),
    },
  });
  return publicStatus(updated);
}

async function reconcileCloud(prisma: any, row: any, job: AudioAlignmentJob, context: Awaited<ReturnType<typeof loadContext>>) {
  const cloud = await ensureAudioSourceAlignmentCloudQueued({ prisma, processingJob: row });
  const refreshed = await prisma.studioAssetProcessingJob.findUnique({ where: { id: row.id } });
  const current = refreshed ?? row;
  if (cloud.status === "configuration-required") return { ...publicStatus(current), status: "blocked" as const, error: "Cloud exact-source alignment is retained, but media processor execution control is not configured." };
  if (cloud.status === "failed") return publicStatus(current);
  const bucket = getMediaBucket(cloud.bucketName);
  const storedManifest = await loadGcsJson(bucket, buildAudioAlignmentCloudManifestObjectName(job.jobId));
  if (!storedManifest) return publicStatus(current);
  const manifest = parseAudioAlignmentCloudManifest(storedManifest.value, job.jobId);
  if (manifest.status === "failed-terminal") {
    const failed = await prisma.studioAssetProcessingJob.update({
      where: { id: job.jobId },
      data: { status: "failed", error: `${manifest.failure?.code}: ${manifest.failure?.message}`.slice(0, 4_000), completedAt: new Date(manifest.failure?.failedAt || manifest.updatedAt) },
    });
    return publicStatus(failed);
  }
  if (manifest.status !== "completed") return publicStatus(current);
  const storedResult = await loadGcsJson(bucket, buildAudioAlignmentCloudResultObjectName(job.jobId));
  if (!storedResult) return publicStatus(current);
  const result = parseAudioAlignmentResult(storedResult.value, job);
  const [currentSpine, currentTarget] = await Promise.all([
    inspectImmutableStudioMediaSource(context.spineSource.providerSourceId, context.spineAsset.mimeType),
    inspectImmutableStudioMediaSource(context.targetSource.providerSourceId, context.targetAsset.mimeType),
  ]);
  if (!sameSource(job.spine, { assetId: context.spineAsset.id, ...currentSpine }) || !sameSource(job.target, { assetId: context.targetAsset.id, ...currentTarget })) throw new Error("A cloud alignment source changed before evidence registration.");
  const completed = await prisma.studioAssetProcessingJob.update({
    where: { id: job.jobId },
    data: {
      status: "completed",
      completedAt: new Date(result.completedAt),
      error: null,
      resultJson: json({
        state: "completed",
        receipt: result,
        registration: {
          exactSourceBytesBound: true,
          sourceBytesImmutable: true,
          placementApplied: false,
          placementRequiresSeparateReview: true,
          cloudManifestObjectName: cloud.manifestObjectName,
          cloudManifestGeneration: storedManifest.generation,
          cloudResultObjectName: cloud.resultObjectName,
          cloudResultGeneration: storedResult.generation,
        },
      }),
    },
  });
  return publicStatus(completed);
}

async function loadGcsJson(bucket: any, objectName: string) {
  try {
    const [metadata] = await bucket.file(objectName).getMetadata();
    const generation = String(metadata.generation ?? "");
    if (!/^[1-9][0-9]*$/.test(generation)) throw new Error("Alignment cloud object lacks an immutable generation.");
    const [raw] = await bucket.file(objectName, { generation }).download({ validation: "crc32c" });
    return { value: JSON.parse(raw.toString("utf8")) as unknown, generation };
  } catch (error) {
    if (Number((error as { code?: unknown }).code) === 404) return null;
    throw error;
  }
}

async function loadContext(input: {
  prisma: any;
  projectSlug: string;
  episodeSlug: string;
  spineAssetId: string;
  spineSourceId: string;
  targetAssetId: string;
  targetSourceId: string;
}) {
  if (input.spineAssetId === input.targetAssetId || input.spineSourceId === input.targetSourceId) {
    throw new Error("Choose two different imported sources for alignment.");
  }
  const project = await input.prisma.studioProject.findFirst({ where: { slug: input.projectSlug }, select: { id: true, slug: true } });
  if (!project) throw new Error("Nest not found for audio alignment.");
  const [production, spineAsset, targetAsset, spineSource, targetSource] = await Promise.all([
    input.prisma.studioEpisodeProduction.findUnique({
      where: { projectId_slug: { projectId: project.id, slug: input.episodeSlug } },
      select: { id: true, slug: true, productionJson: true, timelineJson: true },
    }),
    attachedAsset(input.prisma, project.id, input.spineAssetId),
    attachedAsset(input.prisma, project.id, input.targetAssetId),
    input.prisma.studioVideoSource.findUnique({ where: { id: input.spineSourceId }, select: { id: true, url: true, providerSourceId: true } }),
    input.prisma.studioVideoSource.findUnique({ where: { id: input.targetSourceId }, select: { id: true, url: true, providerSourceId: true } }),
  ]);
  if (!production) throw new Error("Episode production not found for audio alignment.");
  const imported = canonicalEpisodeImportedMedia(production.productionJson, production.timelineJson).map(object);
  if (!contains(imported, input.spineAssetId, input.spineSourceId) || !contains(imported, input.targetAssetId, input.targetSourceId)) {
    throw new Error("Alignment requires two exact sources imported into this episode.");
  }
  if (!validAssetSource(spineAsset, spineSource, input.spineSourceId) || !validAssetSource(targetAsset, targetSource, input.targetSourceId)) {
    throw new Error("Alignment source identity no longer matches its attached immutable media.");
  }
  return { project, production, spineAsset, targetAsset, spineSource, targetSource };
}

async function attachedAsset(prisma: any, projectId: string, assetId: string) {
  return prisma.studioMediaAsset.findUnique({
    where: { id: assetId },
    include: { assetAttachments: { where: { projectId }, select: { metadataJson: true } } },
  });
}
function validAssetSource(asset: any, source: any, sourceId: string) {
  if (!asset || asset.isProxy || !source?.providerSourceId || source.url !== `/api/ingest/media/${sourceId}`) return false;
  return asset.url === source.url || asset.assetAttachments.some((attachment: any) => object(attachment.metadataJson).sourceId === sourceId);
}
function contains(rows: Record<string, unknown>[], assetId: string, sourceId: string) {
  return rows.some((row) => row.id === assetId && row.sourceId === sourceId);
}
function sameRequest(left: AudioAlignmentJob, right: AudioAlignmentJob) {
  return JSON.stringify({ spine: left.spine, target: left.target, proposal: left.proposal }) === JSON.stringify({ spine: right.spine, target: right.target, proposal: right.proposal });
}
function sameSource(left: AudioAlignmentJob["spine"], right: AudioAlignmentJob["spine"]) {
  return left.assetId === right.assetId
    && left.provider === right.provider
    && left.locator === right.locator
    && left.generation === right.generation
    && left.sha256 === right.sha256
    && left.sizeBytes === right.sizeBytes
    && left.contentType === right.contentType;
}
function publicStatus(row: any): PublicAudioSourceAlignmentStatus {
  let job: AudioAlignmentJob | null = null;
  let result: ReturnType<typeof parseAudioAlignmentResult> | null = null;
  try { job = parseAudioAlignmentJob(row.inputJson, row.id); } catch { /* fail closed */ }
  try { if (job) result = parseAudioAlignmentResult(object(row.resultJson).receipt, job); } catch { /* fail closed */ }
  const declared = ["queued", "processing", "output-ready", "completed", "failed"].includes(row.status) ? row.status : "failed";
  const integrityFailure = !job || ((declared === "output-ready" || declared === "completed") && !result);
  return {
    jobId: String(row.id),
    status: integrityFailure ? "failed" : declared,
    spineAssetId: job?.spine.assetId ?? null,
    targetAssetId: job?.target.assetId ?? null,
    evidence: result?.evidence ?? null,
    error: integrityFailure ? "Audio alignment evidence failed integrity validation." : typeof row.error === "string" ? row.error : null,
    updatedAt: row.updatedAt?.toISOString?.() ?? null,
    boundaries: boundaries(),
  };
}
function emptyStatus(): PublicAudioSourceAlignmentStatus {
  return { jobId: null, status: "not-queued", spineAssetId: null, targetAssetId: null, evidence: null, error: null, updatedAt: null, boundaries: boundaries() };
}
function boundaries() {
  return { exactSourceBytesBound: true as const, sourceBytesImmutable: true as const, placementApplied: false as const, placementRequiresSeparateReview: true as const };
}
function object(value: unknown): Record<string, any> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, any> : {};
}
function json(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}
