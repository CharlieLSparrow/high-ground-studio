import "server-only";

import { randomUUID } from "node:crypto";
import { stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import type { Prisma } from "@prisma/client";
import {
  buildAudioTreatmentTargetLocator,
  newAudioTreatmentJob,
  parseAudioMasteryJob,
  parseAudioMasteryResult,
  parseAudioTreatmentJob,
  parseAudioTreatmentResult,
} from "@high-ground/quipsly-media-processing";

import { inspectImmutableStudioMediaSource } from "@/lib/server/episode-collaboration-proxy";
import { resolveAllowedLocalStudioMediaPath } from "@/lib/server/studio-media-location-security";

const JOB_TYPE = "audio-treatment";
const MASTERY_JOB_TYPE = "audio-mastery";

export type PublicAudioTreatmentStatus = {
  jobId: string | null;
  status: "not-queued" | "queued" | "processing" | "output-ready" | "completed" | "failed";
  profileId: "dc-rumble-correction-v1" | null;
  sourceMeasurement: null | ReturnType<typeof publicMeasurement>;
  proposal: null | {
    trigger: { kind: "dc-offset"; maximumAbsoluteDcOffset: number; thresholdAmplitude: 0.01; affectedChannels: number[] };
    treatment: { frequencyHz: number; poles: number; widthType: string; width: number };
  };
  verification: null | {
    maximumAbsoluteDcBefore: number;
    maximumAbsoluteDcAfter: number;
    relativeReduction: number;
    durationDeltaSeconds: number;
    completeOutputDecode: true;
    passes: true;
  };
  derivative: null | { playbackUrl: string | null; durationSeconds: number; measured: ReturnType<typeof publicMeasurement> };
  error: string | null;
  updatedAt: string | null;
  boundaries: {
    originalRemainsSourceTruth: true;
    outputIsUnpromotedExperiment: true;
    outputIsNotAMasteredDeliveryFile: true;
    explicitApprovalStillRequired: true;
  };
};

export async function queueAudioTreatment(input: {
  prisma: any;
  projectSlug: string;
  assetId: string;
  sourceId: string;
  actorEmail: string;
}) {
  const context = await loadContext(input);
  const evidence = await inspectImmutableStudioMediaSource(context.source.providerSourceId, context.asset.mimeType);
  if (evidence.provider !== "local") throw new Error("Cloud audio treatment is not qualified yet. This release accepts local Nest media only.");

  const masteryRow = await input.prisma.studioAssetProcessingJob.findFirst({
    where: { projectId: context.project.id, assetId: context.asset.id, type: MASTERY_JOB_TYPE, status: { in: ["output-ready", "completed"] } },
    orderBy: { createdAt: "desc" },
  });
  if (!masteryRow) throw new Error("Run complete audio diagnosis before proposing treatment.");
  const masteryJob = parseAudioMasteryJob(masteryRow.inputJson, masteryRow.id);
  const masteryEnvelope = jsonObject(masteryRow.resultJson);
  const masteryResult = parseAudioMasteryResult(masteryEnvelope.receipt, masteryJob);
  const diagnosis = masteryResult.signalDiagnosis;
  if (!diagnosis || !diagnosis.channels.some((channel) => Math.abs(channel.dcOffset) >= 0.01)) {
    throw new Error("This source has no measured DC-offset evidence requiring the qualified treatment.");
  }
  if (masteryJob.source.sha256 !== evidence.sha256 || masteryJob.source.generation !== evidence.generation || masteryJob.source.sizeBytes !== evidence.sizeBytes) {
    throw new Error("The diagnosed source no longer matches the immutable media bytes.");
  }

  const existing = await input.prisma.studioAssetProcessingJob.findFirst({
    where: { projectId: context.project.id, assetId: context.asset.id, type: JOB_TYPE },
    orderBy: { createdAt: "desc" },
  });
  if (existing) {
    try {
      const current = parseAudioTreatmentJob(existing.inputJson, existing.id);
      if (current.source.sha256 === evidence.sha256 && current.triggerDiagnosisId === diagnosis.diagnosisId && existing.status !== "failed") {
        return toPublicAudioTreatmentStatus(existing);
      }
    } catch {
      // Malformed or legacy rows do not own this source-bound request.
    }
  }

  const jobId = `audio_treatment_${randomUUID().replaceAll("-", "")}`;
  const job = newAudioTreatmentJob({
    jobId,
    projectId: context.project.id,
    requestedByEmail: input.actorEmail,
    queuedAt: new Date().toISOString(),
    source: { assetId: context.asset.id, ...evidence },
    triggerDiagnosisId: diagnosis.diagnosisId,
    profileId: "dc-rumble-correction-v1",
    target: {
      provider: "local",
      locator: buildAudioTreatmentTargetLocator({ assetId: context.asset.id, sourceSha256: evidence.sha256, profileId: "dc-rumble-correction-v1" }),
      contentType: "audio/wav",
      codec: "pcm_s24le",
      sampleRateHz: 48_000,
      variantKind: "audio-treatment-preview",
    },
  });
  const saved = await input.prisma.studioAssetProcessingJob.create({
    data: { id: job.jobId, projectId: context.project.id, assetId: context.asset.id, type: JOB_TYPE, status: "queued", requestedByEmail: input.actorEmail, inputJson: toPrismaJson(job) },
  });
  return toPublicAudioTreatmentStatus(saved);
}

export async function readAudioTreatmentStatus(input: { prisma: any; projectSlug: string; assetId: string }) {
  const project = await input.prisma.studioProject.findFirst({ where: { slug: input.projectSlug }, select: { id: true } });
  if (!project) return emptyStatus();
  const attachment = await input.prisma.studioAssetAttachment.findUnique({ where: { projectId_assetId: { projectId: project.id, assetId: input.assetId } }, select: { id: true } });
  if (!attachment) return emptyStatus();
  const job = await input.prisma.studioAssetProcessingJob.findFirst({ where: { projectId: project.id, assetId: input.assetId, type: JOB_TYPE }, orderBy: { createdAt: "desc" } });
  return job ? toPublicAudioTreatmentStatus(job) : emptyStatus();
}

export async function reconcileAudioTreatment(input: { prisma: any; projectSlug: string; assetId: string; sourceId: string }) {
  const context = await loadContext(input);
  const row = await input.prisma.studioAssetProcessingJob.findFirst({ where: { projectId: context.project.id, assetId: context.asset.id, type: JOB_TYPE }, orderBy: { createdAt: "desc" } });
  if (!row || row.status !== "output-ready") return row ? toPublicAudioTreatmentStatus(row) : emptyStatus();
  const job = parseAudioTreatmentJob(row.inputJson, row.id);
  const result = parseAudioTreatmentResult(jsonObject(row.resultJson).receipt, job);
  const current = await inspectImmutableStudioMediaSource(context.source.providerSourceId, context.asset.mimeType);
  if (current.sha256 !== job.source.sha256 || current.generation !== job.source.generation || current.sizeBytes !== job.source.sizeBytes) {
    throw new Error("The immutable source changed before audio treatment registration.");
  }

  const root = path.resolve(process.env.QUIPSLY_LOCAL_MEDIA_UPLOAD_ROOT || path.join(tmpdir(), "quipsly-media-ingest"));
  const candidate = path.resolve(root, result.derivative.locator);
  const outputPath = await resolveAllowedLocalStudioMediaPath(candidate);
  if (!outputPath) throw new Error("Audio treatment output escaped the authorized local media root.");
  const outputStat = await stat(outputPath);
  const outputEvidence = await inspectImmutableStudioMediaSource(outputPath, "audio/wav");
  if (!outputStat.isFile() || outputEvidence.sha256 !== result.derivative.sha256 || outputEvidence.sizeBytes !== result.derivative.sizeBytes) {
    throw new Error("Audio treatment output no longer matches its verified receipt.");
  }

  let derivedSource = await input.prisma.studioVideoSource.findFirst({ where: { providerSourceId: outputPath } });
  if (!derivedSource) {
    derivedSource = await input.prisma.studioVideoSource.create({
      data: { provider: "local-audio-treatment-worker", providerSourceId: outputPath, url: "/api/ingest/media/pending", title: `${context.asset.filename} treatment experiment` },
    });
  }
  const playbackUrl = `/api/ingest/media/${derivedSource.id}`;
  if (derivedSource.url !== playbackUrl) await input.prisma.studioVideoSource.update({ where: { id: derivedSource.id }, data: { url: playbackUrl } });
  await input.prisma.studioAssetVariant.upsert({
    where: { assetId_kind_url: { assetId: context.asset.id, kind: "audio-treatment-preview", url: playbackUrl } },
    create: { assetId: context.asset.id, kind: "audio-treatment-preview", url: playbackUrl, mimeType: "audio/wav", duration: result.derivative.diagnosis.durationSeconds, sizeBytes: BigInt(result.derivative.sizeBytes), metadataJson: toPrismaJson(registrationMetadata(result, derivedSource.id, outputPath)) },
    update: { duration: result.derivative.diagnosis.durationSeconds, sizeBytes: BigInt(result.derivative.sizeBytes), metadataJson: toPrismaJson(registrationMetadata(result, derivedSource.id, outputPath)) },
  });
  const updated = await input.prisma.studioAssetProcessingJob.update({
    where: { id: row.id },
    data: { status: "completed", completedAt: new Date(result.completedAt), resultJson: toPrismaJson({ state: "completed", receipt: result, registration: { playbackUrl, originalRemainsSourceTruth: true, outputIsUnpromotedExperiment: true } }) },
  });
  return toPublicAudioTreatmentStatus(updated);
}

export function toPublicAudioTreatmentStatus(job: any): PublicAudioTreatmentStatus {
  let contract: ReturnType<typeof parseAudioTreatmentJob> | null = null;
  let result: ReturnType<typeof parseAudioTreatmentResult> | null = null;
  try { contract = parseAudioTreatmentJob(job.inputJson, job.id); } catch { /* visible integrity failure below */ }
  try { const envelope = jsonObject(job.resultJson); if (envelope.receipt && contract) result = parseAudioTreatmentResult(envelope.receipt, contract); } catch { /* visible integrity failure below */ }
  const registration = jsonObject(jsonObject(job.resultJson).registration);
  const declaredStatus = ["queued", "processing", "output-ready", "completed", "failed"].includes(job.status) ? job.status as PublicAudioTreatmentStatus["status"] : "failed";
  const integrityFailure = !contract || ((declaredStatus === "output-ready" || declaredStatus === "completed") && !result);
  const treatment = result?.proposal.graph.find((node) => node.id === "dc-rumble-filter");
  const before = result?.verification.maximumAbsoluteDcBefore ?? 0;
  const after = result?.verification.maximumAbsoluteDcAfter ?? 0;
  return {
    jobId: String(job.id),
    status: integrityFailure ? "failed" : declaredStatus,
    profileId: contract?.profileId ?? null,
    sourceMeasurement: result ? publicMeasurement(result.sourceMeasurement) : null,
    proposal: result ? { trigger: result.proposal.trigger, treatment: { frequencyHz: Number(treatment?.parameters.frequencyHz), poles: Number(treatment?.parameters.poles), widthType: String(treatment?.parameters.widthType), width: Number(treatment?.parameters.width) } } : null,
    verification: result ? { maximumAbsoluteDcBefore: before, maximumAbsoluteDcAfter: after, relativeReduction: before > 0 ? 1 - after / before : 0, durationDeltaSeconds: result.verification.durationDeltaSeconds, completeOutputDecode: true, passes: true } : null,
    derivative: result ? { playbackUrl: typeof registration.playbackUrl === "string" ? registration.playbackUrl : null, durationSeconds: result.derivative.diagnosis.durationSeconds, measured: publicMeasurement(result.derivative.measurement) } : null,
    error: integrityFailure ? "Audio treatment evidence failed integrity validation." : typeof job.error === "string" ? job.error : null,
    updatedAt: job.updatedAt?.toISOString?.() ?? null,
    boundaries: { originalRemainsSourceTruth: true, outputIsUnpromotedExperiment: true, outputIsNotAMasteredDeliveryFile: true, explicitApprovalStillRequired: true },
  };
}

async function loadContext(input: { prisma: any; projectSlug: string; assetId: string; sourceId: string }) {
  const project = await input.prisma.studioProject.findFirst({ where: { slug: input.projectSlug }, select: { id: true, slug: true } });
  if (!project) throw new Error("Nest not found for audio treatment.");
  const [asset, source] = await Promise.all([
    input.prisma.studioMediaAsset.findUnique({ where: { id: input.assetId }, include: { assetAttachments: { where: { projectId: project.id }, select: { id: true, metadataJson: true } } } }),
    input.prisma.studioVideoSource.findUnique({ where: { id: input.sourceId }, select: { id: true, url: true, providerSourceId: true } }),
  ]);
  const attachmentNamesSource = asset?.assetAttachments.some((attachment: any) => jsonObject(attachment.metadataJson).sourceId === input.sourceId);
  if (!asset || asset.isProxy || asset.assetAttachments.length === 0 || !source?.providerSourceId || source.url !== `/api/ingest/media/${source.id}` || (asset.url !== source.url && !attachmentNamesSource) || (!String(asset.mimeType || "").startsWith("audio/") && !String(asset.mimeType || "").startsWith("video/"))) {
    throw new Error("Audio treatment requires the exact original media source attached to this Nest.");
  }
  return { project, asset, source: source as { id: string; url: string; providerSourceId: string } };
}

function registrationMetadata(result: ReturnType<typeof parseAudioTreatmentResult>, sourceId: string, outputPath: string) {
  return { schema: "quipsly-audio-treatment-registration-v1", sourceId, providerSourceId: outputPath, sourceMeasurement: result.sourceMeasurement, sourceDiagnosis: result.sourceDiagnosis, proposal: result.proposal, verification: result.verification, derivative: result.derivative, worker: result.worker, originalRemainsSourceTruth: true, outputIsUnpromotedExperiment: true, outputIsNotAMasteredDeliveryFile: true, explicitApprovalStillRequired: true };
}

function emptyStatus(): PublicAudioTreatmentStatus {
  return { jobId: null, status: "not-queued", profileId: null, sourceMeasurement: null, proposal: null, verification: null, derivative: null, error: null, updatedAt: null, boundaries: { originalRemainsSourceTruth: true, outputIsUnpromotedExperiment: true, outputIsNotAMasteredDeliveryFile: true, explicitApprovalStillRequired: true } };
}

function publicMeasurement(value: ReturnType<typeof parseAudioTreatmentResult>["sourceMeasurement"]) {
  return { measuredAt: value.measuredAt, durationSeconds: value.durationSeconds, integratedLufs: value.integratedLufs, truePeakDbtp: value.truePeakDbtp, loudnessRangeLu: value.loudnessRangeLu, thresholdLufs: value.thresholdLufs, seriesResolutionMs: value.seriesResolutionMs, series: value.series };
}

function jsonObject(value: unknown): Record<string, any> { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, any> : {}; }
function toPrismaJson(value: unknown): Prisma.InputJsonValue { return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue; }
