import "server-only";

import { randomUUID } from "node:crypto";
import type { Prisma } from "@prisma/client";
import {
  newAudioAlignmentJob,
  parseAudioAlignmentJob,
  parseAudioAlignmentResult,
  type AudioAlignmentEvidence,
  type AudioAlignmentJob,
} from "@high-ground/quipsly-media-processing";

import { canonicalEpisodeImportedMedia } from "@/lib/episode-production/imported-media";
import { inspectImmutableStudioMediaSource } from "@/lib/server/episode-collaboration-proxy";

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
  if (existing && existing.status !== "failed") {
    try {
      const current = parseAudioAlignmentJob(existing.inputJson, existing.id);
      if (sameRequest(current, job)) return publicStatus(existing);
    } catch {
      // A malformed or differently bound job cannot own this request.
    }
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
    return {
      ...publicStatus(saved),
      status: "blocked" as const,
      error: "The exact-source alignment request is retained, but the GCS two-source worker is not deployed yet. Local Nest can process this same immutable job now.",
    };
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
    return { ...publicStatus(row), status: "blocked" as const, error: "GCS two-source alignment processing is not deployed yet; the retained job has not changed either source." };
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
