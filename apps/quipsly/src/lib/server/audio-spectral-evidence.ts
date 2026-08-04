import "server-only";

import { randomUUID } from "node:crypto";
import { stat } from "node:fs/promises";

import type { Prisma } from "@prisma/client";
import {
  newAudioSpectralEvidenceJob,
  parseAudioSpectralEvidenceJob,
  parseAudioSpectralEvidenceResult,
  type AudioSpectralLevelId,
} from "@high-ground/quipsly-media-processing";

import { inspectImmutableStudioMediaSource } from "@/lib/server/episode-collaboration-proxy";
import { resolveAllowedLocalStudioMediaPath } from "@/lib/server/studio-media-location-security";

const JOB_TYPE = "audio-spectral-evidence";

export type PublicAudioSpectralStatus = {
  jobId: string | null;
  status: "not-queued" | "queued" | "processing" | "output-ready" | "completed" | "failed";
  media: null | { sampleRate: number; channelCount: number; durationSeconds: number; minimumFrequencyHz: number; maximumFrequencyHz: number };
  pyramid: null | {
    tileWidth: 512;
    tileHeight: 192;
    frequencyScale: "logarithmic";
    frequencyOrientation: "high-to-low";
    dynamicRangeDb: 120;
    upperLimitDbfs: 0;
    levels: Array<{ id: AudioSpectralLevelId; tileSpanSeconds: number; tileCount: number }>;
  };
  error: string | null;
  updatedAt: string | null;
  boundaries: { originalRemainsSourceTruth: true; analysisDoesNotChangeMedia: true; visualEvidenceIsNotAnEqDecision: true; repairCandidatesRequirePlaybackReview: true };
};

export async function queueAudioSpectralEvidence(input: { prisma: any; projectSlug: string; assetId: string; sourceId: string; actorEmail: string }) {
  const context = await loadContext(input);
  const evidence = await inspectImmutableStudioMediaSource(context.source.providerSourceId, context.asset.mimeType);
  if (evidence.provider !== "local") throw new Error("Cloud spectral analysis is not qualified yet. This release accepts local Nest media only.");
  const existing = await input.prisma.studioAssetProcessingJob.findFirst({ where: { projectId: context.project.id, assetId: context.asset.id, type: JOB_TYPE }, orderBy: { createdAt: "desc" } });
  if (existing) {
    try {
      const current = parseAudioSpectralEvidenceJob(existing.inputJson, existing.id);
      if (current.source.sha256 === evidence.sha256 && current.source.generation === evidence.generation && current.source.sizeBytes === evidence.sizeBytes && existing.status !== "failed") return toPublicAudioSpectralStatus(existing);
    } catch { /* malformed or old rows cannot own this source-bound request */ }
  }
  const job = newAudioSpectralEvidenceJob({
    jobId: `audio_spectral_${randomUUID().replaceAll("-", "")}`,
    projectId: context.project.id,
    requestedByEmail: input.actorEmail,
    queuedAt: new Date().toISOString(),
    source: { assetId: context.asset.id, ...evidence },
  });
  const saved = await input.prisma.studioAssetProcessingJob.create({
    data: { id: job.jobId, projectId: context.project.id, assetId: context.asset.id, type: JOB_TYPE, status: "queued", requestedByEmail: input.actorEmail, inputJson: toPrismaJson(job) },
  });
  return toPublicAudioSpectralStatus(saved);
}

export async function readAudioSpectralStatus(input: { prisma: any; projectSlug: string; assetId: string }) {
  const project = await input.prisma.studioProject.findFirst({ where: { slug: input.projectSlug }, select: { id: true } });
  if (!project) return emptyStatus();
  const attachment = await input.prisma.studioAssetAttachment.findUnique({ where: { projectId_assetId: { projectId: project.id, assetId: input.assetId } }, select: { id: true } });
  if (!attachment) return emptyStatus();
  const job = await input.prisma.studioAssetProcessingJob.findFirst({ where: { projectId: project.id, assetId: input.assetId, type: JOB_TYPE }, orderBy: { createdAt: "desc" } });
  return job ? toPublicAudioSpectralStatus(job) : emptyStatus();
}

export async function reconcileAudioSpectralEvidence(input: { prisma: any; projectSlug: string; assetId: string; sourceId: string }) {
  const context = await loadContext(input);
  const row = await input.prisma.studioAssetProcessingJob.findFirst({ where: { projectId: context.project.id, assetId: context.asset.id, type: JOB_TYPE }, orderBy: { createdAt: "desc" } });
  if (!row || row.status !== "output-ready") return row ? toPublicAudioSpectralStatus(row) : emptyStatus();
  const job = parseAudioSpectralEvidenceJob(row.inputJson, row.id);
  const result = parseAudioSpectralEvidenceResult(jsonObject(row.resultJson).receipt, job);
  const current = await inspectImmutableStudioMediaSource(context.source.providerSourceId, context.asset.mimeType);
  if (current.sha256 !== job.source.sha256 || current.generation !== job.source.generation || current.sizeBytes !== job.source.sizeBytes) throw new Error("The immutable source changed before spectral evidence registration.");
  const packPath = await resolveAllowedLocalStudioMediaPath(result.pyramid.pack.locator);
  if (!packPath) throw new Error("Spectral tile pack escaped the authorized local media root.");
  const packStat = await stat(packPath);
  const packEvidence = await inspectImmutableStudioMediaSource(packPath, result.pyramid.pack.contentType);
  if (!packStat.isFile() || packEvidence.sha256 !== result.pyramid.pack.sha256 || packEvidence.sizeBytes !== result.pyramid.pack.sizeBytes) throw new Error("Spectral tile pack no longer matches its verified receipt.");
  const updated = await input.prisma.studioAssetProcessingJob.update({
    where: { id: row.id },
    data: { status: "completed", completedAt: new Date(result.completedAt), resultJson: toPrismaJson({ state: "completed", receipt: result, registration: { packVerified: true, originalRemainsSourceTruth: true, analysisDoesNotChangeMedia: true } }) },
  });
  return toPublicAudioSpectralStatus(updated);
}

export async function resolveAudioSpectralTile(input: { prisma: any; projectSlug: string; assetId: string; jobId: string; levelId: string; tileIndex: number }) {
  const project = await input.prisma.studioProject.findFirst({ where: { slug: input.projectSlug }, select: { id: true } });
  if (!project) return null;
  const row = await input.prisma.studioAssetProcessingJob.findFirst({ where: { id: input.jobId, projectId: project.id, assetId: input.assetId, type: JOB_TYPE, status: "completed" } });
  if (!row) return null;
  const job = parseAudioSpectralEvidenceJob(row.inputJson, row.id);
  const result = parseAudioSpectralEvidenceResult(jsonObject(row.resultJson).receipt, job);
  const level = result.pyramid.levels.find((candidate) => candidate.id === input.levelId);
  if (!level || !Number.isSafeInteger(input.tileIndex) || input.tileIndex < 0 || input.tileIndex >= level.tileCount) return null;
  const packPath = await resolveAllowedLocalStudioMediaPath(result.pyramid.pack.locator);
  if (!packPath) throw new Error("Spectral tile pack is outside the configured private media roots.");
  const startSeconds = input.tileIndex * level.tileSpanSeconds;
  return {
    path: packPath,
    offset: level.byteOffset + input.tileIndex * result.pyramid.tileByteLength,
    byteLength: result.pyramid.tileByteLength,
    startSeconds,
    durationSeconds: Math.min(level.tileSpanSeconds, result.media.durationSeconds - startSeconds),
    sha256: result.pyramid.pack.sha256,
  };
}

async function loadContext(input: { prisma: any; projectSlug: string; assetId: string; sourceId: string }) {
  const project = await input.prisma.studioProject.findFirst({ where: { slug: input.projectSlug }, select: { id: true, slug: true } });
  if (!project) throw new Error("Nest not found for spectral evidence.");
  const [asset, source] = await Promise.all([
    input.prisma.studioMediaAsset.findUnique({ where: { id: input.assetId }, include: { assetAttachments: { where: { projectId: project.id }, select: { id: true, metadataJson: true } } } }),
    input.prisma.studioVideoSource.findUnique({ where: { id: input.sourceId }, select: { id: true, url: true, providerSourceId: true } }),
  ]);
  const attachmentNamesSource = asset?.assetAttachments.some((attachment: any) => jsonObject(attachment.metadataJson).sourceId === input.sourceId);
  if (!asset || asset.isProxy || asset.assetAttachments.length === 0 || !source?.providerSourceId || source.url !== `/api/ingest/media/${source.id}` || (asset.url !== source.url && !attachmentNamesSource) || (!String(asset.mimeType || "").startsWith("audio/") && !String(asset.mimeType || "").startsWith("video/"))) {
    throw new Error("Spectral analysis requires the exact original media source attached to this Nest.");
  }
  return { project, asset, source: source as { id: string; url: string; providerSourceId: string } };
}

export function toPublicAudioSpectralStatus(job: any): PublicAudioSpectralStatus {
  let contract: ReturnType<typeof parseAudioSpectralEvidenceJob> | null = null;
  let result: ReturnType<typeof parseAudioSpectralEvidenceResult> | null = null;
  try { contract = parseAudioSpectralEvidenceJob(job.inputJson, job.id); } catch { /* fail closed */ }
  try { if (contract) result = parseAudioSpectralEvidenceResult(jsonObject(job.resultJson).receipt, contract); } catch { /* fail closed */ }
  const declaredStatus = ["queued", "processing", "output-ready", "completed", "failed"].includes(job.status) ? job.status as PublicAudioSpectralStatus["status"] : "failed";
  const integrityFailure = !contract || ((declaredStatus === "output-ready" || declaredStatus === "completed") && !result);
  return {
    jobId: String(job.id),
    status: integrityFailure ? "failed" : declaredStatus,
    media: result ? result.media : null,
    pyramid: result ? {
      tileWidth: result.pyramid.tileWidth,
      tileHeight: result.pyramid.tileHeight,
      frequencyScale: result.pyramid.frequencyScale,
      frequencyOrientation: result.pyramid.frequencyOrientation,
      dynamicRangeDb: result.pyramid.dynamicRangeDb,
      upperLimitDbfs: result.pyramid.upperLimitDbfs,
      levels: result.pyramid.levels.map(({ id, tileSpanSeconds, tileCount }) => ({ id, tileSpanSeconds, tileCount })),
    } : null,
    error: integrityFailure ? "Audio spectral evidence failed integrity validation." : typeof job.error === "string" ? job.error : null,
    updatedAt: job.updatedAt?.toISOString?.() ?? null,
    boundaries: { originalRemainsSourceTruth: true, analysisDoesNotChangeMedia: true, visualEvidenceIsNotAnEqDecision: true, repairCandidatesRequirePlaybackReview: true },
  };
}

function emptyStatus(): PublicAudioSpectralStatus { return { jobId: null, status: "not-queued", media: null, pyramid: null, error: null, updatedAt: null, boundaries: { originalRemainsSourceTruth: true, analysisDoesNotChangeMedia: true, visualEvidenceIsNotAnEqDecision: true, repairCandidatesRequirePlaybackReview: true } }; }
function jsonObject(value: unknown): Record<string, any> { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, any> : {}; }
function toPrismaJson(value: unknown): Prisma.InputJsonValue { return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue; }
