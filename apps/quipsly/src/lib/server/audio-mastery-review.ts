import "server-only";

import { createHash } from "node:crypto";
import { stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { Prisma } from "@prisma/client";
import {
  audioMasteryReviewCoverage,
  parseAudioMasteryJob,
  parseAudioMasteryPlaybackReviewEvidence,
  parseAudioMasteryResult,
} from "@high-ground/quipsly-media-processing";

import { inspectImmutableStudioMediaSource } from "@/lib/server/episode-collaboration-proxy";
import { acquirePrismaAdvisoryTransactionLock } from "@/lib/server/prisma-advisory-lock";
import { resolveAllowedLocalStudioMediaPath } from "@/lib/server/studio-media-location-security";

type Actor = { id: string; email: string };
type Coordinates = { prisma: any; projectSlug: string; assetId: string; sourceId: string; jobId: string };

export class AudioMasteryReviewError extends Error {
  constructor(message: string, readonly status: number, readonly code: string) {
    super(message);
  }
}

function text(value: unknown, maximum = Number.POSITIVE_INFINITY) {
  return typeof value === "string" ? value.trim().slice(0, maximum) : "";
}

function json(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function sha256(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function object(value: unknown): Record<string, any> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, any> : {};
}

function publicReceipt(receipt: any) {
  return {
    id: receipt.id as string,
    jobId: receipt.masteryJobId as string,
    decision: receipt.decision === "APPROVED" ? "approved" as const : "rejected" as const,
    note: receipt.note as string | null,
    reviewedAt: receipt.occurredAt?.toISOString?.() ?? receipt.occurredAt,
    actorEmail: receipt.actorEmail as string,
  };
}

export async function readAudioMasterReviewSummary(input: { prisma: any; jobId: string | null }) {
  if (!input.jobId) return { latest: null, approvalCount: 0, rejectionCount: 0 };
  const [latest, approvals, rejections] = await Promise.all([
    input.prisma.studioAudioMasterReviewReceipt.findFirst({ where: { masteryJobId: input.jobId }, orderBy: [{ occurredAt: "desc" }, { id: "desc" }] }),
    input.prisma.studioAudioMasterReviewReceipt.count({ where: { masteryJobId: input.jobId, decision: "APPROVED" } }),
    input.prisma.studioAudioMasterReviewReceipt.count({ where: { masteryJobId: input.jobId, decision: "REJECTED" } }),
  ]);
  return { latest: latest ? publicReceipt(latest) : null, approvalCount: approvals, rejectionCount: rejections };
}

export async function loadAudioMasteryReviewContext(input: Coordinates) {
  const project = await input.prisma.studioProject.findFirst({ where: { slug: input.projectSlug }, select: { id: true } });
  if (!project) throw new AudioMasteryReviewError("Nest not found for mastering review.", 404, "AUDIO_MASTER_REVIEW_PROJECT_NOT_FOUND");
  const [asset, source, row] = await Promise.all([
    input.prisma.studioMediaAsset.findUnique({
      where: { id: input.assetId },
      include: { assetAttachments: { where: { projectId: project.id }, select: { metadataJson: true } } },
    }),
    input.prisma.studioVideoSource.findUnique({ where: { id: input.sourceId }, select: { id: true, url: true, providerSourceId: true } }),
    input.prisma.studioAssetProcessingJob.findFirst({
      where: { id: input.jobId, projectId: project.id, assetId: input.assetId, type: "audio-mastery", status: "completed" },
    }),
  ]);
  const attachmentNamesSource = asset?.assetAttachments.some((attachment: any) => object(attachment.metadataJson).sourceId === input.sourceId);
  if (!asset || asset.isProxy || asset.assetAttachments.length === 0 || !source?.providerSourceId || source.url !== `/api/ingest/media/${source.id}` || (asset.url !== source.url && !attachmentNamesSource)) {
    throw new AudioMasteryReviewError("The mastering review source is not the exact original attached to this Nest.", 409, "AUDIO_MASTER_REVIEW_SOURCE_MISMATCH");
  }
  if (!row) throw new AudioMasteryReviewError("The completed mastery job is unavailable or stale.", 409, "AUDIO_MASTER_REVIEW_JOB_NOT_FOUND");
  const job = parseAudioMasteryJob(row.inputJson, row.id);
  const result = parseAudioMasteryResult(object(row.resultJson).receipt, job);
  const registration = object(object(row.resultJson).registration);
  if (!result.derivative || !result.derivative.verification.passes || typeof registration.playbackUrl !== "string") {
    throw new AudioMasteryReviewError("Only a verified, playable mastering preview can receive a listening decision.", 409, "AUDIO_MASTER_PREVIEW_NOT_VERIFIED");
  }
  const sourceEvidence = await inspectImmutableStudioMediaSource(source.providerSourceId, asset.mimeType);
  if (sourceEvidence.sha256 !== job.source.sha256 || sourceEvidence.generation !== job.source.generation || sourceEvidence.sizeBytes !== job.source.sizeBytes) {
    throw new AudioMasteryReviewError("The immutable source changed after mastering. Review is held.", 409, "AUDIO_MASTER_SOURCE_DRIFT");
  }
  const root = path.resolve(process.env.QUIPSLY_LOCAL_MEDIA_UPLOAD_ROOT || path.join(tmpdir(), "quipsly-media-ingest"));
  const previewPath = await resolveAllowedLocalStudioMediaPath(path.resolve(root, result.derivative.locator));
  if (!previewPath) throw new AudioMasteryReviewError("The mastering preview escaped the authorized media root.", 409, "AUDIO_MASTER_PREVIEW_HELD");
  const [previewStat, previewEvidence] = await Promise.all([stat(previewPath), inspectImmutableStudioMediaSource(previewPath, "audio/wav")]);
  if (!previewStat.isFile() || previewEvidence.sha256 !== result.derivative.sha256 || previewEvidence.sizeBytes !== result.derivative.sizeBytes) {
    throw new AudioMasteryReviewError("The mastering preview no longer matches its verified receipt.", 409, "AUDIO_MASTER_PREVIEW_DRIFT");
  }
  return { project, asset, source, row, job, result, registration };
}

export async function appendAudioMasterReview(input: Coordinates & {
  actor: Actor;
  clientRequestId: string;
  decision: "approved" | "rejected";
  playbackEvidence: unknown;
  note?: string | null;
}) {
  const clientRequestId = text(input.clientRequestId, 160);
  const note = text(input.note, 2_000) || null;
  if (!clientRequestId) throw new AudioMasteryReviewError("A stable client request id is required.", 400, "INVALID_AUDIO_MASTER_REVIEW_REQUEST");
  const context = await loadAudioMasteryReviewContext(input);
  let evidence;
  try {
    evidence = parseAudioMasteryPlaybackReviewEvidence(
      input.playbackEvidence,
      context.result.sourceMeasurement.durationSeconds,
      context.result.derivative!.verificationMeasurement.durationSeconds,
    );
  } catch (error) {
    throw new AudioMasteryReviewError(
      error instanceof Error ? error.message : "Audio mastery playback evidence is invalid.",
      400,
      "INVALID_AUDIO_MASTER_REVIEW_EVIDENCE",
    );
  }
  const coverage = audioMasteryReviewCoverage(context.result.sourceMeasurement, context.result.derivative!.verificationMeasurement, evidence);
  if (input.decision === "approved" && !coverage.approvalReady) {
    throw new AudioMasteryReviewError("Approval requires source and preview playback around every recommended moment in matched and delivery monitor modes.", 409, "AUDIO_MASTER_REVIEW_INCOMPLETE");
  }
  if (input.decision === "rejected" && (evidence.masteredListenedSecondBins.length === 0 || !note)) {
    throw new AudioMasteryReviewError("Rejecting a preview requires heard preview evidence and a review note.", 409, "AUDIO_MASTER_REJECTION_EVIDENCE_REQUIRED");
  }
  const request = {
    schema: "quipsly-audio-master-review-request-v1",
    projectId: context.project.id,
    assetId: context.asset.id,
    masteryJobId: context.job.jobId,
    actorUserId: input.actor.id,
    actorEmail: input.actor.email.toLowerCase(),
    clientRequestId,
    decision: input.decision,
    profileId: context.job.profileId,
    sourceSha256: context.job.source.sha256,
    sourceGeneration: context.job.source.generation,
    previewSha256: context.result.derivative!.sha256,
    evidence,
    coverage,
    note,
  };
  const requestSha256 = sha256(request);
  const existing = await input.prisma.studioAudioMasterReviewReceipt.findUnique({
    where: { projectId_actorEmail_clientRequestId: { projectId: context.project.id, actorEmail: request.actorEmail, clientRequestId } },
  });
  if (existing) {
    if (existing.requestSha256 !== requestSha256) throw new AudioMasteryReviewError("That request id is already bound to a different mastering decision.", 409, "AUDIO_MASTER_REVIEW_IDEMPOTENCY_CONFLICT");
    return { ok: true, idempotentReplay: true, receipt: publicReceipt(existing), review: await readAudioMasterReviewSummary({ prisma: input.prisma, jobId: context.job.jobId }) };
  }
  const now = new Date();
  const receipt = await input.prisma.$transaction(async (tx: any) => {
    await acquirePrismaAdvisoryTransactionLock(tx, `audio-master-review:${context.job.jobId}:${request.actorEmail}`);
    const replay = await tx.studioAudioMasterReviewReceipt.findUnique({
      where: { projectId_actorEmail_clientRequestId: { projectId: context.project.id, actorEmail: request.actorEmail, clientRequestId } },
    });
    if (replay) {
      if (replay.requestSha256 !== requestSha256) throw new AudioMasteryReviewError("That request id won a race with different evidence.", 409, "AUDIO_MASTER_REVIEW_IDEMPOTENCY_CONFLICT");
      return replay;
    }
    return tx.studioAudioMasterReviewReceipt.create({ data: {
      projectId: context.project.id,
      assetId: context.asset.id,
      masteryJobId: context.job.jobId,
      actorUserId: input.actor.id,
      actorEmail: request.actorEmail,
      clientRequestId,
      decision: input.decision === "approved" ? "APPROVED" : "REJECTED",
      profileId: context.job.profileId,
      sourceSha256: context.job.source.sha256,
      sourceGeneration: context.job.source.generation,
      previewSha256: context.result.derivative!.sha256,
      requestSha256,
      evidenceJson: json({
        ...evidence,
        coverage,
        originalRemainsSourceTruth: true,
        previewRemainsUnpromoted: true,
        clientTrackedPlaybackIsNotProofOfAudibility: true,
      }),
      note,
      occurredAt: now,
    } });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  return { ok: true, idempotentReplay: false, receipt: publicReceipt(receipt), review: await readAudioMasterReviewSummary({ prisma: input.prisma, jobId: context.job.jobId }) };
}
