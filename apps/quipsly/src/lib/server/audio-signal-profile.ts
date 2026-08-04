import "server-only";

import { randomUUID } from "node:crypto";

import type { Prisma } from "@prisma/client";
import {
  newAudioSignalProfileJob,
  parseAudioSignalProfileJob,
  parseAudioSignalProfileResult,
  type AudioSignalProfile,
} from "@high-ground/quipsly-media-processing";

import { inspectImmutableStudioMediaSource } from "@/lib/server/episode-collaboration-proxy";

const JOB_TYPE = "audio-signal-profile";

export type PublicAudioSignalProfileStatus = {
  jobId: string | null;
  status: "not-queued" | "queued" | "processing" | "output-ready" | "completed" | "failed";
  media: null | {
    container: string;
    codec: string;
    sampleRate: number;
    channelCount: number;
    durationSeconds: number;
  };
  audioSignal: AudioSignalProfile | null;
  analyzer: null | {
    algorithm: "quipsly-audio-signal-window-v1";
    completeDecode: true;
    maximumWindows: 1_200;
  };
  error: string | null;
  updatedAt: string | null;
  boundaries: {
    originalRemainsSourceTruth: true;
    analysisDoesNotChangeMedia: true;
    observationsRequireHumanInterpretation: true;
  };
};

export async function queueAudioSignalProfile(input: {
  prisma: any;
  projectSlug: string;
  assetId: string;
  sourceId: string;
  actorEmail: string;
}) {
  const context = await loadContext(input);
  const evidence = await inspectImmutableStudioMediaSource(context.source.providerSourceId, context.asset.mimeType);
  if (evidence.provider !== "local") throw new Error("Cloud signal profiling is not qualified yet. This release accepts local Nest media only.");
  const existing = await input.prisma.studioAssetProcessingJob.findFirst({
    where: { projectId: context.project.id, assetId: context.asset.id, type: JOB_TYPE },
    orderBy: { createdAt: "desc" },
  });
  if (existing) {
    try {
      const current = parseAudioSignalProfileJob(existing.inputJson, existing.id);
      if (current.source.sha256 === evidence.sha256 && current.source.generation === evidence.generation && current.source.sizeBytes === evidence.sizeBytes && existing.status !== "failed") {
        return toPublicAudioSignalProfileStatus(existing);
      }
    } catch {
      // Legacy or malformed rows do not own a new source-bound analysis request.
    }
  }
  const job = newAudioSignalProfileJob({
    jobId: `audio_signal_${randomUUID().replaceAll("-", "")}`,
    projectId: context.project.id,
    requestedByEmail: input.actorEmail,
    queuedAt: new Date().toISOString(),
    source: { assetId: context.asset.id, ...evidence },
  });
  const saved = await input.prisma.studioAssetProcessingJob.create({
    data: {
      id: job.jobId,
      projectId: context.project.id,
      assetId: context.asset.id,
      type: JOB_TYPE,
      status: "queued",
      requestedByEmail: input.actorEmail,
      inputJson: toPrismaJson(job),
    },
  });
  return toPublicAudioSignalProfileStatus(saved);
}

export async function readAudioSignalProfileStatus(input: { prisma: any; projectSlug: string; assetId: string }) {
  const project = await input.prisma.studioProject.findFirst({ where: { slug: input.projectSlug }, select: { id: true } });
  if (!project) return emptyStatus();
  const attachment = await input.prisma.studioAssetAttachment.findUnique({
    where: { projectId_assetId: { projectId: project.id, assetId: input.assetId } },
    select: { id: true },
  });
  if (!attachment) return emptyStatus();
  const job = await input.prisma.studioAssetProcessingJob.findFirst({
    where: { projectId: project.id, assetId: input.assetId, type: JOB_TYPE },
    orderBy: { createdAt: "desc" },
  });
  return job ? toPublicAudioSignalProfileStatus(job) : emptyStatus();
}

export async function reconcileAudioSignalProfile(input: { prisma: any; projectSlug: string; assetId: string; sourceId: string }) {
  const context = await loadContext(input);
  const row = await input.prisma.studioAssetProcessingJob.findFirst({
    where: { projectId: context.project.id, assetId: context.asset.id, type: JOB_TYPE },
    orderBy: { createdAt: "desc" },
  });
  if (!row || row.status !== "output-ready") return row ? toPublicAudioSignalProfileStatus(row) : emptyStatus();
  const job = parseAudioSignalProfileJob(row.inputJson, row.id);
  const result = parseAudioSignalProfileResult(jsonObject(row.resultJson).receipt, job);
  const current = await inspectImmutableStudioMediaSource(context.source.providerSourceId, context.asset.mimeType);
  if (current.sha256 !== job.source.sha256 || current.generation !== job.source.generation || current.sizeBytes !== job.source.sizeBytes) {
    throw new Error("The immutable source changed before signal-profile registration.");
  }
  const updated = await input.prisma.studioAssetProcessingJob.update({
    where: { id: row.id },
    data: {
      status: "completed",
      completedAt: new Date(result.completedAt),
      resultJson: toPrismaJson({
        state: "completed",
        receipt: result,
        registration: { originalRemainsSourceTruth: true, analysisDoesNotChangeMedia: true },
      }),
    },
  });
  return toPublicAudioSignalProfileStatus(updated);
}

async function loadContext(input: { prisma: any; projectSlug: string; assetId: string; sourceId: string }) {
  const project = await input.prisma.studioProject.findFirst({ where: { slug: input.projectSlug }, select: { id: true, slug: true } });
  if (!project) throw new Error("Nest not found for signal profiling.");
  const [asset, source] = await Promise.all([
    input.prisma.studioMediaAsset.findUnique({
      where: { id: input.assetId },
      include: { assetAttachments: { where: { projectId: project.id }, select: { id: true, metadataJson: true } } },
    }),
    input.prisma.studioVideoSource.findUnique({ where: { id: input.sourceId }, select: { id: true, url: true, providerSourceId: true } }),
  ]);
  const attachmentNamesSource = asset?.assetAttachments.some((attachment: any) => jsonObject(attachment.metadataJson).sourceId === input.sourceId);
  if (
    !asset || asset.isProxy || asset.assetAttachments.length === 0 || !source?.providerSourceId
    || source.url !== `/api/ingest/media/${source.id}`
    || (asset.url !== source.url && !attachmentNamesSource)
    || (!String(asset.mimeType || "").startsWith("audio/") && !String(asset.mimeType || "").startsWith("video/"))
  ) throw new Error("Signal profiling requires the exact original media source attached to this Nest.");
  return { project, asset, source: source as { id: string; url: string; providerSourceId: string } };
}

export function toPublicAudioSignalProfileStatus(job: any): PublicAudioSignalProfileStatus {
  let contract: ReturnType<typeof parseAudioSignalProfileJob> | null = null;
  let result: ReturnType<typeof parseAudioSignalProfileResult> | null = null;
  try { contract = parseAudioSignalProfileJob(job.inputJson, job.id); } catch { /* malformed rows fail closed */ }
  try { if (contract) result = parseAudioSignalProfileResult(jsonObject(job.resultJson).receipt, contract); } catch { /* incomplete receipt stays private */ }
  const declaredStatus = ["queued", "processing", "output-ready", "completed", "failed"].includes(job.status)
    ? job.status as PublicAudioSignalProfileStatus["status"]
    : "failed";
  const integrityFailure = !contract || ((declaredStatus === "output-ready" || declaredStatus === "completed") && !result);
  return {
    jobId: String(job.id),
    status: integrityFailure ? "failed" : declaredStatus,
    media: result ? result.media : null,
    audioSignal: result ? result.audioSignal : null,
    analyzer: result ? { algorithm: result.analyzer.algorithm, completeDecode: true, maximumWindows: 1_200 } : null,
    error: integrityFailure ? "Audio signal evidence failed integrity validation." : typeof job.error === "string" ? job.error : null,
    updatedAt: job.updatedAt?.toISOString?.() ?? null,
    boundaries: { originalRemainsSourceTruth: true, analysisDoesNotChangeMedia: true, observationsRequireHumanInterpretation: true },
  };
}

function emptyStatus(): PublicAudioSignalProfileStatus {
  return {
    jobId: null,
    status: "not-queued",
    media: null,
    audioSignal: null,
    analyzer: null,
    error: null,
    updatedAt: null,
    boundaries: { originalRemainsSourceTruth: true, analysisDoesNotChangeMedia: true, observationsRequireHumanInterpretation: true },
  };
}

function jsonObject(value: unknown): Record<string, any> { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, any> : {}; }
function toPrismaJson(value: unknown): Prisma.InputJsonValue { return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue; }
