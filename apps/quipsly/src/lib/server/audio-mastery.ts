import "server-only";

import { randomUUID } from "node:crypto";
import { stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import type { Prisma } from "@prisma/client";
import {
  buildAudioMasteryTargetLocator,
  newAudioMasteryJob,
  parseAudioMasteryJob,
  parseAudioMasteryResult,
  type AudioMasteryProfileId,
} from "@high-ground/quipsly-media-processing";

import { inspectImmutableStudioMediaSource } from "@/lib/server/episode-collaboration-proxy";
import { resolveAllowedLocalStudioMediaPath } from "@/lib/server/studio-media-location-security";

const JOB_TYPE = "audio-mastery";

export type PublicAudioMasteryStatus = {
  jobId: string | null;
  status: "not-queued" | "queued" | "processing" | "output-ready" | "completed" | "failed";
  profileId: AudioMasteryProfileId | null;
  sourceMeasurement: null | {
    measuredAt: string;
    durationSeconds: number;
    integratedLufs: number;
    truePeakDbtp: number;
    loudnessRangeLu: number;
    thresholdLufs: number;
    seriesResolutionMs: number;
    series: Array<{ timeMs: number; momentaryLufs: number | null; shortTermLufs: number | null; integratedLufs: number | null; truePeakDbtp: number | null }>;
  };
  signalDiagnosis: null | ReturnType<typeof publicSignalDiagnosis>;
  proposal: null | {
    action: "no-change" | "render-loudness-master";
    assessment: ReturnType<typeof publicAssessment>;
    profile: { id: AudioMasteryProfileId; label: string; integratedLufs: number; maximumTruePeakDbtp: number; renderTruePeakDbtp: number };
  };
  derivative: null | {
    playbackUrl: string | null;
    verification: ReturnType<typeof publicAssessment>;
    measured: ReturnType<typeof publicMeasurement>;
  };
  error: string | null;
  updatedAt: string | null;
  boundaries: {
    originalRemainsSourceTruth: true;
    outputIsUnpromotedPreview: true;
    explicitApprovalStillRequired: true;
  };
};

export async function queueAudioMastery(input: {
  prisma: any;
  projectSlug: string;
  assetId: string;
  sourceId: string;
  profileId: AudioMasteryProfileId;
  actorEmail: string;
}) {
  const context = await loadContext(input);
  const evidence = await inspectImmutableStudioMediaSource(context.source.providerSourceId, context.asset.mimeType);
  if (evidence.provider !== "local") {
    throw new Error("Cloud audio mastery is not qualified yet. This release accepts local Nest media only.");
  }
  const existing = await input.prisma.studioAssetProcessingJob.findFirst({
    where: { projectId: context.project.id, assetId: context.asset.id, type: JOB_TYPE },
    orderBy: { createdAt: "desc" },
  });
  if (existing) {
    try {
      const current = parseAudioMasteryJob(existing.inputJson, existing.id);
      if (current.source.sha256 === evidence.sha256 && current.profileId === input.profileId && existing.status !== "failed") {
        const existingStatus = toPublicAudioMasteryStatus(existing);
        if (existingStatus.status !== "failed" && !(existingStatus.status === "completed" && existingStatus.signalDiagnosis === null)) {
          return existingStatus;
        }
      }
    } catch {
      // A legacy or malformed row does not own the new source-bound request.
    }
  }
  const jobId = `audio_mastery_${randomUUID().replaceAll("-", "")}`;
  const job = newAudioMasteryJob({
    jobId,
    projectId: context.project.id,
    requestedByEmail: input.actorEmail,
    queuedAt: new Date().toISOString(),
    source: {
      assetId: context.asset.id,
      ...evidence,
    },
    profileId: input.profileId,
    target: {
      provider: "local",
      locator: buildAudioMasteryTargetLocator({
        assetId: context.asset.id,
        sourceSha256: evidence.sha256,
        profileId: input.profileId,
      }),
      contentType: "audio/wav",
      codec: "pcm_s24le",
      sampleRateHz: 48_000,
      variantKind: "audio-master-preview",
    },
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
  return toPublicAudioMasteryStatus(saved);
}

export async function readAudioMasteryStatus(input: { prisma: any; projectSlug: string; assetId: string }) {
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
  return job ? toPublicAudioMasteryStatus(job) : emptyStatus();
}

export async function reconcileAudioMastery(input: {
  prisma: any;
  projectSlug: string;
  assetId: string;
  sourceId: string;
}) {
  const context = await loadContext(input);
  const row = await input.prisma.studioAssetProcessingJob.findFirst({
    where: { projectId: context.project.id, assetId: context.asset.id, type: JOB_TYPE },
    orderBy: { createdAt: "desc" },
  });
  if (!row || row.status !== "output-ready") return row ? toPublicAudioMasteryStatus(row) : emptyStatus();
  const job = parseAudioMasteryJob(row.inputJson, row.id);
  const envelope = jsonObject(row.resultJson);
  const result = parseAudioMasteryResult(envelope.receipt, job);
  const current = await inspectImmutableStudioMediaSource(context.source.providerSourceId, context.asset.mimeType);
  if (current.sha256 !== job.source.sha256 || current.generation !== job.source.generation || current.sizeBytes !== job.source.sizeBytes) {
    throw new Error("The immutable source changed before audio mastery registration.");
  }
  let playbackUrl: string | null = null;
  if (result.derivative) {
    const root = path.resolve(process.env.QUIPSLY_LOCAL_MEDIA_UPLOAD_ROOT || path.join(tmpdir(), "quipsly-media-ingest"));
    const candidate = path.resolve(root, result.derivative.locator);
    const outputPath = await resolveAllowedLocalStudioMediaPath(candidate);
    if (!outputPath) throw new Error("Audio mastery output escaped the authorized local media root.");
    const outputStat = await stat(outputPath);
    const outputEvidence = await inspectImmutableStudioMediaSource(outputPath, "audio/wav");
    if (!outputStat.isFile() || outputEvidence.sha256 !== result.derivative.sha256 || outputEvidence.sizeBytes !== result.derivative.sizeBytes) {
      throw new Error("Audio mastery output no longer matches its verified receipt.");
    }
    let derivedSource = await input.prisma.studioVideoSource.findFirst({ where: { providerSourceId: outputPath } });
    if (!derivedSource) {
      derivedSource = await input.prisma.studioVideoSource.create({
        data: { provider: "local-audio-mastery-worker", providerSourceId: outputPath, url: "/api/ingest/media/pending", title: `${context.asset.filename} mastered preview` },
      });
    }
    playbackUrl = `/api/ingest/media/${derivedSource.id}`;
    if (derivedSource.url !== playbackUrl) {
      await input.prisma.studioVideoSource.update({ where: { id: derivedSource.id }, data: { url: playbackUrl } });
    }
    await input.prisma.studioAssetVariant.upsert({
      where: { assetId_kind_url: { assetId: context.asset.id, kind: "audio-master-preview", url: playbackUrl } },
      create: {
        assetId: context.asset.id,
        kind: "audio-master-preview",
        url: playbackUrl,
        mimeType: "audio/wav",
        duration: result.derivative.verificationMeasurement.durationSeconds,
        sizeBytes: BigInt(result.derivative.sizeBytes),
        metadataJson: toPrismaJson(registrationMetadata(result, derivedSource.id, outputPath)),
      },
      update: {
        duration: result.derivative.verificationMeasurement.durationSeconds,
        sizeBytes: BigInt(result.derivative.sizeBytes),
        metadataJson: toPrismaJson(registrationMetadata(result, derivedSource.id, outputPath)),
      },
    });
  }
  const updated = await input.prisma.studioAssetProcessingJob.update({
    where: { id: row.id },
    data: {
      status: "completed",
      completedAt: new Date(result.completedAt),
      resultJson: toPrismaJson({ state: "completed", receipt: result, registration: { playbackUrl, originalRemainsSourceTruth: true, outputIsUnpromotedPreview: true } }),
    },
  });
  return toPublicAudioMasteryStatus(updated);
}

async function loadContext(input: { prisma: any; projectSlug: string; assetId: string; sourceId: string }) {
  const project = await input.prisma.studioProject.findFirst({ where: { slug: input.projectSlug }, select: { id: true, slug: true } });
  if (!project) throw new Error("Nest not found for audio mastery.");
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
  ) {
    throw new Error("Audio mastery requires the exact original media source attached to this Nest.");
  }
  return { project, asset, source: source as { id: string; url: string; providerSourceId: string } };
}

export function toPublicAudioMasteryStatus(job: any): PublicAudioMasteryStatus {
  let contract: ReturnType<typeof parseAudioMasteryJob> | null = null;
  let result: ReturnType<typeof parseAudioMasteryResult> | null = null;
  try { contract = parseAudioMasteryJob(job.inputJson, job.id); } catch { /* malformed rows remain visible as failed state */ }
  try {
    const envelope = jsonObject(job.resultJson);
    if (envelope.receipt && contract) result = parseAudioMasteryResult(envelope.receipt, contract);
  } catch { /* incomplete worker state has no public receipt */ }
  const registration = jsonObject(jsonObject(job.resultJson).registration);
  const declaredStatus = ["queued", "processing", "output-ready", "completed", "failed"].includes(job.status)
    ? job.status as PublicAudioMasteryStatus["status"]
    : "failed";
  const integrityFailure = !contract || ((declaredStatus === "output-ready" || declaredStatus === "completed") && !result);
  return {
    jobId: String(job.id),
    status: integrityFailure ? "failed" : declaredStatus,
    profileId: contract?.profileId ?? null,
    sourceMeasurement: result ? publicMeasurement(result.sourceMeasurement) : null,
    signalDiagnosis: result?.signalDiagnosis ? publicSignalDiagnosis(result.signalDiagnosis) : null,
    proposal: result ? {
      action: result.proposal.action,
      assessment: publicAssessment(result.proposal.assessment),
      profile: {
        id: result.proposal.profile.id,
        label: result.proposal.profile.label,
        integratedLufs: result.proposal.profile.integratedLufs,
        maximumTruePeakDbtp: result.proposal.profile.maximumTruePeakDbtp,
        renderTruePeakDbtp: result.proposal.profile.renderTruePeakDbtp,
      },
    } : null,
    derivative: result?.derivative ? {
      playbackUrl: typeof registration.playbackUrl === "string" ? registration.playbackUrl : null,
      verification: publicAssessment(result.derivative.verification),
      measured: publicMeasurement(result.derivative.verificationMeasurement),
    } : null,
    error: integrityFailure
      ? "Audio mastery evidence failed integrity validation."
      : typeof job.error === "string" ? job.error : null,
    updatedAt: job.updatedAt?.toISOString?.() ?? null,
    boundaries: { originalRemainsSourceTruth: true, outputIsUnpromotedPreview: true, explicitApprovalStillRequired: true },
  };
}

function publicMeasurement(value: ReturnType<typeof parseAudioMasteryResult>["sourceMeasurement"]) {
  return {
    measuredAt: value.measuredAt,
    durationSeconds: value.durationSeconds,
    integratedLufs: value.integratedLufs,
    truePeakDbtp: value.truePeakDbtp,
    loudnessRangeLu: value.loudnessRangeLu,
    thresholdLufs: value.thresholdLufs,
    seriesResolutionMs: value.seriesResolutionMs,
    series: value.series,
  };
}

export function publicSignalDiagnosis(value: NonNullable<ReturnType<typeof parseAudioMasteryResult>["signalDiagnosis"]>) {
  return {
    diagnosisId: value.diagnosisId,
    analyzedAt: value.analyzedAt,
    durationSeconds: value.durationSeconds,
    sampleRateHz: value.sampleRateHz,
    channelCount: value.channelCount,
    overall: value.overall,
    channels: value.channels,
    nearSilenceSpans: value.nearSilenceSpans,
    observations: value.observations,
    thresholds: value.thresholds,
    analyzer: value.analyzer,
  };
}

function publicAssessment(value: { profileId: AudioMasteryProfileId; integratedStatus: "within-target" | "too-quiet" | "too-loud"; truePeakStatus: "within-ceiling" | "over-ceiling"; integratedDeltaLu: number; passes: boolean }) {
  return { ...value };
}

function registrationMetadata(result: ReturnType<typeof parseAudioMasteryResult>, sourceId: string, outputPath: string) {
  return {
    schema: "quipsly-audio-mastery-registration-v1",
    sourceId,
    providerSourceId: outputPath,
    sourceMeasurement: result.sourceMeasurement,
    signalDiagnosis: result.signalDiagnosis,
    proposal: result.proposal,
    derivative: result.derivative,
    worker: result.worker,
    originalRemainsSourceTruth: true,
    outputIsUnpromotedPreview: true,
    explicitApprovalStillRequired: true,
  };
}

function emptyStatus(): PublicAudioMasteryStatus {
  return {
    jobId: null,
    status: "not-queued",
    profileId: null,
    sourceMeasurement: null,
    signalDiagnosis: null,
    proposal: null,
    derivative: null,
    error: null,
    updatedAt: null,
    boundaries: { originalRemainsSourceTruth: true, outputIsUnpromotedPreview: true, explicitApprovalStillRequired: true },
  };
}

function jsonObject(value: unknown): Record<string, any> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, any> : {};
}

function toPrismaJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}
