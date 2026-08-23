import "server-only";

import { randomUUID } from "node:crypto";
import { stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import type { Prisma } from "@prisma/client";
import {
  buildAudioMasteryTargetLocator,
  buildAudioMasteryCloudManifestObjectName,
  buildAudioMasteryCloudResultObjectName,
  newAudioMasteryJob,
  parseAudioMasteryCloudManifest,
  parseAudioMasteryJob,
  parseAudioMasteryResult,
  type AudioMasteryProfileId,
} from "@high-ground/quipsly-media-processing";

import { inspectImmutableStudioMediaSource } from "@/lib/server/episode-collaboration-proxy";
import { ensureAudioMasteryCloudQueued } from "@/lib/server/audio-mastery-cloud";
import { getMediaBucket } from "@/lib/server/gcs";
import { resolveAllowedLocalStudioMediaPath } from "@/lib/server/studio-media-location-security";
import { readAudioMasterReviewSummary } from "@/lib/server/audio-mastery-review";
import {
  emptyAudioMasterPromotionSummary,
  readAudioMasterPromotionSummary,
  type PublicAudioMasterPromotionSummary,
} from "@/lib/server/audio-mastery-promotion";
import {
  emptyAudioDeliveryStatus,
  readAudioDeliveryStatus,
  type PublicAudioDeliveryStatus,
} from "@/lib/server/audio-delivery";

const JOB_TYPE = "audio-mastery";

export type PublicAudioMasteryStatus = {
  jobId: string | null;
  status: "not-queued" | "queued" | "processing" | "output-ready" | "completed" | "blocked" | "failed";
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
  review: {
    latest: null | { id: string; jobId: string; decision: "approved" | "rejected"; note: string | null; reviewedAt: string; actorEmail: string };
    approvalCount: number;
    rejectionCount: number;
  };
  promotion: PublicAudioMasterPromotionSummary;
  delivery: PublicAudioDeliveryStatus;
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
  retryFailed?: boolean;
}) {
  const context = await loadContext(input);
  const evidence = await inspectImmutableStudioMediaSource(context.source.providerSourceId, context.asset.mimeType);
  const existing = await input.prisma.studioAssetProcessingJob.findFirst({
    where: { projectId: context.project.id, assetId: context.asset.id, type: JOB_TYPE },
    orderBy: { createdAt: "desc" },
  });
  let matchingExisting: ReturnType<typeof parseAudioMasteryJob> | null = null;
  if (existing) {
    try {
      const current = parseAudioMasteryJob(existing.inputJson, existing.id);
      if (current.source.sha256 === evidence.sha256 && current.profileId === input.profileId) {
        matchingExisting = current;
      }
    } catch {
      // A legacy or malformed row does not own the new source-bound request.
    }
  }
  if (existing && matchingExisting) {
    const existingStatus = toPublicAudioMasteryStatus(existing);
    const retainFailedAutomaticAttempt = existingStatus.status === "failed" && input.retryFailed === false;
    const reusableEvidence = existingStatus.status !== "failed"
      && !(existingStatus.status === "completed" && existingStatus.signalDiagnosis === null);
    if (retainFailedAutomaticAttempt || reusableEvidence && matchingExisting.source.provider !== "gcs") {
      return existingStatus;
    }
    if (!reusableEvidence) matchingExisting = null;
  }
  if (existing && matchingExisting) {
    const cloud = await ensureAudioMasteryCloudQueued({ prisma: input.prisma, processingJob: existing });
    const refreshed = await input.prisma.studioAssetProcessingJob.findUnique({ where: { id: existing.id } });
    const status = toPublicAudioMasteryStatus(refreshed ?? existing);
    return cloud.status === "configuration-required"
      ? { ...status, status: "blocked" as const, error: "Cloud audio mastery is retained, but the media processor execution control is not configured." }
      : status;
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
      provider: evidence.provider,
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
  if (evidence.provider === "gcs") {
    const cloud = await ensureAudioMasteryCloudQueued({ prisma: input.prisma, processingJob: saved });
    const refreshed = await input.prisma.studioAssetProcessingJob.findUnique({ where: { id: saved.id } });
    const status = toPublicAudioMasteryStatus(refreshed ?? saved);
    return cloud.status === "configuration-required"
      ? { ...status, status: "blocked" as const, error: "Cloud audio mastery is retained, but the media processor execution control is not configured." }
      : status;
  }
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
  if (!job) return emptyStatus();
  return {
    ...toPublicAudioMasteryStatus(job),
    review: await readAudioMasterReviewSummary({ prisma: input.prisma, jobId: job.id }),
    promotion: await readAudioMasterPromotionSummary({
      prisma: input.prisma,
      projectId: project.id,
      assetId: input.assetId,
    }),
    delivery: await readAudioDeliveryStatus({
      prisma: input.prisma,
      projectSlug: input.projectSlug,
      assetId: input.assetId,
    }),
  };
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
  if (!row) return emptyStatus();
  const job = parseAudioMasteryJob(row.inputJson, row.id);
  if (job.source.provider === "gcs") return reconcileCloudAudioMastery(input.prisma, row, job, context);
  if (row.status !== "output-ready") return toPublicAudioMasteryStatus(row);
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

async function reconcileCloudAudioMastery(
  prisma: any,
  row: any,
  job: ReturnType<typeof parseAudioMasteryJob>,
  context: Awaited<ReturnType<typeof loadContext>>,
) {
  const cloud = await ensureAudioMasteryCloudQueued({ prisma, processingJob: row });
  const refreshed = await prisma.studioAssetProcessingJob.findUnique({ where: { id: row.id } });
  const currentRow = refreshed ?? row;
  if (cloud.status === "configuration-required") {
    return { ...toPublicAudioMasteryStatus(currentRow), status: "blocked" as const, error: "Cloud audio mastery is retained, but the media processor execution control is not configured." };
  }
  if (cloud.status === "failed") return toPublicAudioMasteryStatus(currentRow);
  const bucket = getMediaBucket(cloud.bucketName);
  const storedManifest = await loadGcsJsonIfPresent(bucket, buildAudioMasteryCloudManifestObjectName(job.jobId));
  if (!storedManifest) return toPublicAudioMasteryStatus(currentRow);
  const manifest = parseAudioMasteryCloudManifest(storedManifest.value, job.jobId);
  if (manifest.status === "failed-terminal") {
    const failed = await prisma.studioAssetProcessingJob.update({
      where: { id: job.jobId },
      data: {
        status: "failed",
        error: `${manifest.failure?.code || "audio-mastery-worker-failed"}: ${manifest.failure?.message || "Cloud audio mastery failed terminal."}`.slice(0, 4_000),
        completedAt: new Date(manifest.failure?.failedAt || manifest.updatedAt),
      },
    });
    return toPublicAudioMasteryStatus(failed);
  }
  if (manifest.status !== "completed") return toPublicAudioMasteryStatus(currentRow);
  const storedResult = await loadGcsJsonIfPresent(bucket, buildAudioMasteryCloudResultObjectName(job.jobId));
  if (!storedResult) return toPublicAudioMasteryStatus(currentRow);
  const result = parseAudioMasteryResult(storedResult.value, job);
  const currentSource = await inspectImmutableStudioMediaSource(context.source.providerSourceId, context.asset.mimeType);
  if (
    currentSource.provider !== "gcs"
    || currentSource.locator !== job.source.locator
    || currentSource.sha256 !== job.source.sha256
    || currentSource.generation !== job.source.generation
    || currentSource.sizeBytes !== job.source.sizeBytes
  ) throw new Error("The immutable cloud source changed before audio mastery registration.");

  let playbackUrl: string | null = null;
  let providerSourceId: string | null = null;
  if (result.derivative) {
    const outputLocation = exactGcsLocation(result.derivative.locator, result.derivative.generation);
    if (outputLocation.bucketName !== cloud.bucketName || outputLocation.objectName !== job.target.locator) throw new Error("Cloud audio mastery output escaped its deterministic target binding.");
    const outputEvidence = await inspectImmutableStudioMediaSource(result.derivative.locator, "audio/wav");
    const [metadata] = await bucket.file(outputLocation.objectName, { generation: outputLocation.generation }).getMetadata();
    const custom = Object.fromEntries(Object.entries(metadata.metadata ?? {}).map(([key, value]) => [key, String(value)]));
    if (
      outputEvidence.provider !== "gcs"
      || outputEvidence.locator !== result.derivative.locator
      || outputEvidence.generation !== result.derivative.generation
      || outputEvidence.sha256 !== result.derivative.sha256
      || outputEvidence.sizeBytes !== result.derivative.sizeBytes
      || custom.quipslyKind !== "audio-mastery-preview-v1"
      || custom.quipslyMasteryJobId !== job.jobId
      || custom.quipslySourceGeneration !== job.source.generation
      || custom.quipslySourceSha256 !== job.source.sha256
      || custom.quipslyOutputSha256 !== result.derivative.sha256
      || custom.quipslyOutputSizeBytes !== String(result.derivative.sizeBytes)
      || custom.quipslyOriginalRemainsSourceTruth !== "true"
      || custom.quipslyPromotionRequiresExplicitApproval !== "true"
    ) throw new Error("Cloud audio mastery output no longer matches its worker and object receipts.");
    providerSourceId = result.derivative.locator;
    let derivedSource = await prisma.studioVideoSource.findFirst({ where: { providerSourceId } });
    if (!derivedSource) {
      derivedSource = await prisma.studioVideoSource.create({
        data: { provider: "audio-mastery-worker", providerSourceId, url: "/api/ingest/media/pending", title: `${context.asset.filename} mastered preview` },
      });
    }
    playbackUrl = `/api/ingest/media/${derivedSource.id}`;
    if (derivedSource.url !== playbackUrl) await prisma.studioVideoSource.update({ where: { id: derivedSource.id }, data: { url: playbackUrl } });
    await prisma.studioAssetVariant.upsert({
      where: { assetId_kind_url: { assetId: context.asset.id, kind: "audio-master-preview", url: playbackUrl } },
      create: {
        assetId: context.asset.id,
        kind: "audio-master-preview",
        url: playbackUrl,
        mimeType: "audio/wav",
        duration: result.derivative.verificationMeasurement.durationSeconds,
        sizeBytes: BigInt(result.derivative.sizeBytes),
        metadataJson: toPrismaJson(registrationMetadata(result, derivedSource.id, providerSourceId)),
      },
      update: {
        duration: result.derivative.verificationMeasurement.durationSeconds,
        sizeBytes: BigInt(result.derivative.sizeBytes),
        metadataJson: toPrismaJson(registrationMetadata(result, derivedSource.id, providerSourceId)),
      },
    });
  }
  const completed = await prisma.studioAssetProcessingJob.update({
    where: { id: job.jobId },
    data: {
      status: "completed",
      error: null,
      completedAt: new Date(result.completedAt),
      resultJson: toPrismaJson({
        state: "completed",
        receipt: result,
        registration: {
          playbackUrl,
          providerSourceId,
          originalRemainsSourceTruth: true,
          outputIsUnpromotedPreview: true,
          cloudManifestObjectName: cloud.manifestObjectName,
          cloudManifestGeneration: storedManifest.generation,
          cloudResultObjectName: cloud.resultObjectName,
          cloudResultGeneration: storedResult.generation,
        },
      }),
    },
  });
  return toPublicAudioMasteryStatus(completed);
}

async function loadGcsJsonIfPresent(bucket: any, objectName: string) {
  try {
    const [metadata] = await bucket.file(objectName).getMetadata();
    const generation = String(metadata.generation ?? "");
    if (!/^[1-9][0-9]*$/.test(generation)) throw new Error("Audio mastery cloud object lacks an immutable generation.");
    const [raw] = await bucket.file(objectName, { generation }).download({ validation: "crc32c" });
    return { value: JSON.parse(raw.toString("utf8")) as unknown, generation };
  } catch (error) {
    if (Number((error as { code?: unknown }).code) === 404) return null;
    throw error;
  }
}

function exactGcsLocation(locator: string, generation: string) {
  const match = /^gcs:\/\/([a-z0-9][a-z0-9._-]{1,221}[a-z0-9])\/(media-vault\/.+)\?generation=([1-9][0-9]*)$/.exec(locator);
  if (!match || match[3] !== generation || match[2].split("/").some((part) => !part || part === "." || part === "..")) throw new Error("Audio mastery output is not generation-bound to the media vault.");
  return { bucketName: match[1], objectName: match[2], generation: match[3] };
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
  const declaredStatus = ["queued", "processing", "output-ready", "completed", "blocked", "failed"].includes(job.status)
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
    review: { latest: null, approvalCount: 0, rejectionCount: 0 },
    promotion: emptyAudioMasterPromotionSummary(),
    delivery: emptyAudioDeliveryStatus(),
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
    review: { latest: null, approvalCount: 0, rejectionCount: 0 },
    promotion: emptyAudioMasterPromotionSummary(),
    delivery: emptyAudioDeliveryStatus(),
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
