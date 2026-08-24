import "server-only";

import { createHash, randomUUID } from "node:crypto";
import { stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { Prisma, type Prisma as PrismaTypes } from "@prisma/client";
import {
  AUDIO_DELIVERY_REVIEW_EVIDENCE_SCHEMA,
  audioDeliveryReviewCoverage,
  buildAudioDeliveryTargetLocator,
  newAudioDeliveryJob,
  parseAudioDeliveryJob,
  parseAudioDeliveryPlaybackReviewEvidence,
  parseAudioDeliveryResult,
  type AudioDeliveryPlaybackReviewEvidence,
  type AudioDeliveryProfileId,
} from "@high-ground/quipsly-media-processing";

import { inspectImmutableStudioMediaSource } from "@/lib/server/episode-collaboration-proxy";
import { AudioMasteryReviewError, loadAudioMasteryReviewContext } from "@/lib/server/audio-mastery-review";
import { readAudioMasterPromotionSummary } from "@/lib/server/audio-mastery-promotion";
import { acquirePrismaAdvisoryTransactionLock } from "@/lib/server/prisma-advisory-lock";
import { resolveAllowedLocalStudioMediaPath } from "@/lib/server/studio-media-location-security";

const JOB_TYPE = "audio-delivery";

type Coordinates = { prisma: any; projectSlug: string; assetId: string; sourceId: string; masteryJobId: string };
type Actor = { id: string; email: string };

export type PublicAudioDeliveryReviewSummary = {
  latest: null | { id: string; jobId: string; clientRequestId: string; decision: "approved" | "rejected"; note: string | null; reviewedAt: string; actorEmail: string };
  approvalCount: number;
  rejectionCount: number;
};

export type PublicAudioDeliveryStatus = {
  jobId: string | null;
  status: "not-queued" | "queued" | "processing" | "output-ready" | "completed" | "failed";
  masteryJobId: string | null;
  promotionReceiptId: string | null;
  profileId: AudioDeliveryProfileId | null;
  output: null | {
    playbackUrl: string | null;
    sha256: string;
    sizeBytes: number;
    durationSeconds: number;
    codec: "aac";
    codecProfile: "LC";
    sampleRateHz: 48_000;
    channels: 2;
    bitrateBps: number;
    integratedLufs: number;
    truePeakDbtp: number;
    fastStart: true;
    completeDecode: true;
  };
  review: PublicAudioDeliveryReviewSummary;
  promotionStillActive: boolean;
  error: string | null;
  updatedAt: string | null;
  boundaries: {
    originalRemainsSourceTruth: true;
    outputIsUnapprovedDeliveryArtifact: true;
    proofListenRequiredBeforeOutputPacket: true;
    uploadNotStarted: true;
    publicationNotStarted: true;
  };
};

export class AudioDeliveryError extends Error {
  constructor(message: string, readonly status: number, readonly code: string) { super(message); }
}

export async function queueAudioDelivery(input: Coordinates & { actorEmail: string; profileId?: AudioDeliveryProfileId }) {
  const context = await loadPromotedCandidate(input);
  const profileId = input.profileId || "apple-podcasts-aac-stereo-v1";
  const existing = await input.prisma.studioAssetProcessingJob.findFirst({
    where: { projectId: context.project.id, assetId: context.asset.id, type: JOB_TYPE },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
  });
  if (existing) {
    try {
      const job = parseAudioDeliveryJob(existing.inputJson, existing.id);
      if (job.source.promotionReceiptId === context.promotion.id && job.profileId === profileId && existing.status !== "failed") {
        const current = await withDynamicState(input.prisma, existing, true);
        if (current.status !== "failed") return current;
      }
    } catch { /* stale/malformed delivery jobs cannot own the new request */ }
  }
  const jobId = `audio_delivery_${randomUUID().replaceAll("-", "")}`;
  const job = newAudioDeliveryJob({
    jobId,
    projectId: context.project.id,
    requestedByEmail: input.actorEmail,
    queuedAt: new Date().toISOString(),
    source: {
      assetId: context.asset.id,
      provider: "local",
      locator: context.previewPath,
      generation: context.derivative.generation,
      sha256: context.derivative.sha256,
      sizeBytes: context.derivative.sizeBytes,
      contentType: context.derivative.contentType,
      durationSeconds: context.derivative.verificationMeasurement.durationSeconds,
      masteryJobId: context.job.jobId,
      masterReviewReceiptId: context.promotion.reviewReceiptId,
      promotionReceiptId: context.promotion.id,
    },
    masteryProfileId: context.job.profileId,
    profileId,
    target: {
      provider: "local",
      locator: buildAudioDeliveryTargetLocator({ assetId: context.asset.id, candidateSha256: context.derivative.sha256, profileId }),
      contentType: "audio/mp4", codec: "aac", codecProfile: "LC", sampleRateHz: 48_000,
      channels: 2, bitrateBps: 128_000, fastStartRequired: true, variantKind: "audio-delivery-artifact",
    },
  });
  const saved = await input.prisma.studioAssetProcessingJob.create({ data: {
    id: jobId, projectId: context.project.id, assetId: context.asset.id, type: JOB_TYPE,
    status: "queued", requestedByEmail: input.actorEmail, inputJson: json(job),
  } });
  return withDynamicState(input.prisma, saved, true);
}

export async function readAudioDeliveryStatus(input: { prisma: any; projectSlug: string; assetId: string }) {
  const project = await input.prisma.studioProject.findFirst({ where: { slug: input.projectSlug }, select: { id: true } });
  if (!project) return emptyAudioDeliveryStatus();
  const attachment = await input.prisma.studioAssetAttachment.findUnique({ where: { projectId_assetId: { projectId: project.id, assetId: input.assetId } }, select: { id: true } });
  if (!attachment) return emptyAudioDeliveryStatus();
  const job = await input.prisma.studioAssetProcessingJob.findFirst({ where: { projectId: project.id, assetId: input.assetId, type: JOB_TYPE }, orderBy: [{ createdAt: "desc" }, { id: "desc" }] });
  if (!job) return emptyAudioDeliveryStatus();
  let promotionId: string | null = null;
  try { promotionId = parseAudioDeliveryJob(job.inputJson, job.id).source.promotionReceiptId; } catch { /* public status exposes integrity failure */ }
  const promotion = await readAudioMasterPromotionSummary({ prisma: input.prisma, projectId: project.id, assetId: input.assetId });
  return withDynamicState(input.prisma, job, Boolean(promotionId && promotion.activePromotion?.id === promotionId));
}

export async function reconcileAudioDelivery(input: Coordinates) {
  const context = await loadPromotedCandidate(input);
  const row = await input.prisma.studioAssetProcessingJob.findFirst({ where: { projectId: context.project.id, assetId: context.asset.id, type: JOB_TYPE }, orderBy: [{ createdAt: "desc" }, { id: "desc" }] });
  if (!row || row.status !== "output-ready") return row ? withDynamicState(input.prisma, row, true) : emptyAudioDeliveryStatus();
  const job = parseAudioDeliveryJob(row.inputJson, row.id);
  if (job.source.promotionReceiptId !== context.promotion.id || job.source.sha256 !== context.derivative.sha256) throw new AudioDeliveryError("The active promoted master changed before delivery registration.", 409, "AUDIO_DELIVERY_PROMOTION_DRIFT");
  const result = parseAudioDeliveryResult(object(row.resultJson).receipt, job);
  const candidateEvidence = await inspectImmutableStudioMediaSource(context.previewPath, "audio/wav");
  if (candidateEvidence.sha256 !== job.source.sha256 || candidateEvidence.sizeBytes !== job.source.sizeBytes) throw new AudioDeliveryError("The promoted master changed before delivery registration.", 409, "AUDIO_DELIVERY_CANDIDATE_DRIFT");
  const root = path.resolve(process.env.QUIPSLY_LOCAL_MEDIA_UPLOAD_ROOT || path.join(tmpdir(), "quipsly-media-ingest"));
  const outputPath = await resolveAllowedLocalStudioMediaPath(path.resolve(root, result.output.locator));
  if (!outputPath) throw new AudioDeliveryError("The delivery artifact escaped the authorized media root.", 409, "AUDIO_DELIVERY_OUTPUT_HELD");
  const [outputStat, outputEvidence] = await Promise.all([stat(outputPath), inspectImmutableStudioMediaSource(outputPath, "audio/mp4")]);
  if (!outputStat.isFile() || outputEvidence.sha256 !== result.output.sha256 || outputEvidence.sizeBytes !== result.output.sizeBytes) throw new AudioDeliveryError("The delivery artifact no longer matches its worker receipt.", 409, "AUDIO_DELIVERY_OUTPUT_DRIFT");
  let derivedSource = await input.prisma.studioVideoSource.findFirst({ where: { providerSourceId: outputPath } });
  if (!derivedSource) derivedSource = await input.prisma.studioVideoSource.create({ data: { provider: "local-audio-delivery-worker", providerSourceId: outputPath, url: "/api/ingest/media/pending", title: `${context.asset.filename} AAC delivery artifact` } });
  const playbackUrl = `/api/ingest/media/${derivedSource.id}`;
  if (derivedSource.url !== playbackUrl) await input.prisma.studioVideoSource.update({ where: { id: derivedSource.id }, data: { url: playbackUrl } });
  await input.prisma.studioAssetVariant.upsert({
    where: { assetId_kind_url: { assetId: context.asset.id, kind: "audio-delivery-artifact", url: playbackUrl } },
    create: { assetId: context.asset.id, kind: "audio-delivery-artifact", url: playbackUrl, mimeType: "audio/mp4", duration: result.output.durationSeconds, sizeBytes: BigInt(result.output.sizeBytes), metadataJson: json(registrationMetadata(result, derivedSource.id, outputPath)) },
    update: { duration: result.output.durationSeconds, sizeBytes: BigInt(result.output.sizeBytes), metadataJson: json(registrationMetadata(result, derivedSource.id, outputPath)) },
  });
  const updated = await input.prisma.studioAssetProcessingJob.update({ where: { id: row.id }, data: { status: "completed", completedAt: new Date(result.completedAt), resultJson: json({ state: "completed", receipt: result, registration: { playbackUrl, sourceId: derivedSource.id, providerSourceId: outputPath } }) } });
  return withDynamicState(input.prisma, updated, true);
}

export async function appendAudioDeliveryReview(input: {
  prisma: any; projectSlug: string; assetId: string; deliveryJobId: string; actor: Actor;
  clientRequestId: string; decision: "approved" | "rejected"; playbackEvidence: unknown; note?: string | null;
}) {
  const clientRequestId = text(input.clientRequestId, 160);
  const note = text(input.note, 2_000) || null;
  if (!clientRequestId) throw new AudioDeliveryError("A stable client request id is required.", 400, "INVALID_AUDIO_DELIVERY_REVIEW_REQUEST");
  const context = await loadDeliveryReviewContext(input);
  let evidence: AudioDeliveryPlaybackReviewEvidence;
  try { evidence = parseAudioDeliveryPlaybackReviewEvidence(input.playbackEvidence, context.result.output.durationSeconds); }
  catch (error) { throw new AudioDeliveryError(error instanceof Error ? error.message : "Delivery playback evidence is invalid.", 400, "INVALID_AUDIO_DELIVERY_REVIEW_EVIDENCE"); }
  const coverage = audioDeliveryReviewCoverage(evidence, context.result.output.durationSeconds);
  if (input.decision === "approved" && !coverage.approvalReady) throw new AudioDeliveryError("Approval requires playback around the beginning, midpoint, and ending of the encoded artifact.", 409, "AUDIO_DELIVERY_REVIEW_INCOMPLETE");
  if (input.decision === "rejected" && (evidence.listenedSecondBins.length === 0 || !note)) throw new AudioDeliveryError("Rejecting an encoded artifact requires heard playback evidence and a note.", 409, "AUDIO_DELIVERY_REJECTION_EVIDENCE_REQUIRED");
  const actorEmail = input.actor.email.toLowerCase();
  const request = { schema: "quipsly-audio-delivery-review-request-v1", projectId: context.projectId, assetId: input.assetId, deliveryJobId: context.job.jobId, promotionReceiptId: context.job.source.promotionReceiptId, actorUserId: input.actor.id, actorEmail, clientRequestId, decision: input.decision, deliveryProfileId: context.job.profileId, candidateSha256: context.job.source.sha256, deliverySha256: context.result.output.sha256, evidence, coverage, note };
  const requestSha256 = digest(request);
  const existing = await input.prisma.studioAudioDeliveryReviewReceipt.findUnique({ where: { projectId_actorEmail_clientRequestId: { projectId: context.projectId, actorEmail, clientRequestId } } });
  if (existing) {
    if (existing.requestSha256 !== requestSha256) throw new AudioDeliveryError("That request id is already bound to a different delivery decision.", 409, "AUDIO_DELIVERY_REVIEW_IDEMPOTENCY_CONFLICT");
    return { ok: true, idempotentReplay: true, receipt: publicReview(existing), review: await readAudioDeliveryReviewSummary({ prisma: input.prisma, jobId: context.job.jobId }) };
  }
  const receipt = await input.prisma.$transaction(async (tx: any) => {
    await acquirePrismaAdvisoryTransactionLock(tx, `audio-delivery-review:${context.job.jobId}:${actorEmail}`);
    const replay = await tx.studioAudioDeliveryReviewReceipt.findUnique({ where: { projectId_actorEmail_clientRequestId: { projectId: context.projectId, actorEmail, clientRequestId } } });
    if (replay) { if (replay.requestSha256 !== requestSha256) throw new AudioDeliveryError("That request id won a race with different evidence.", 409, "AUDIO_DELIVERY_REVIEW_IDEMPOTENCY_CONFLICT"); return replay; }
    const [latestPromotion, latestMasterReview] = await Promise.all([
      tx.studioAudioMasterPromotionReceipt.findFirst({ where: { projectId: context.projectId, assetId: input.assetId }, orderBy: [{ occurredAt: "desc" }, { id: "desc" }] }),
      tx.studioAudioMasterReviewReceipt.findFirst({ where: { masteryJobId: context.job.source.masteryJobId }, orderBy: [{ occurredAt: "desc" }, { id: "desc" }] }),
    ]);
    if (!latestPromotion || latestPromotion.id !== context.job.source.promotionReceiptId || latestPromotion.operation !== "PROMOTE") throw new AudioDeliveryError("The mastering candidate was withdrawn or replaced before this delivery decision.", 409, "AUDIO_DELIVERY_PROMOTION_STALE");
    if (!latestMasterReview || latestMasterReview.id !== latestPromotion.reviewReceiptId || latestMasterReview.decision !== "APPROVED") throw new AudioDeliveryError("The mastering candidate approval changed before this delivery decision.", 409, "AUDIO_DELIVERY_PROMOTION_APPROVAL_STALE");
    return tx.studioAudioDeliveryReviewReceipt.create({ data: { projectId: context.projectId, assetId: input.assetId, deliveryJobId: context.job.jobId, promotionReceiptId: context.job.source.promotionReceiptId, actorUserId: input.actor.id, actorEmail, clientRequestId, decision: input.decision === "approved" ? "APPROVED" : "REJECTED", deliveryProfileId: context.job.profileId, candidateSha256: context.job.source.sha256, deliverySha256: context.result.output.sha256, requestSha256, evidenceJson: json({ ...evidence, coverage, clientTrackedPlaybackIsNotProofOfAudibility: true, outputPacketNotCreated: true, uploadNotStarted: true, publicationNotStarted: true }), note, occurredAt: new Date() } });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  return { ok: true, idempotentReplay: false, receipt: publicReview(receipt), review: await readAudioDeliveryReviewSummary({ prisma: input.prisma, jobId: context.job.jobId }) };
}

export async function readAudioDeliveryReviewSummary(input: { prisma: any; jobId: string | null }): Promise<PublicAudioDeliveryReviewSummary> {
  if (!input.jobId) return { latest: null, approvalCount: 0, rejectionCount: 0 };
  const [latest, approvals, rejections] = await Promise.all([
    input.prisma.studioAudioDeliveryReviewReceipt.findFirst({ where: { deliveryJobId: input.jobId }, orderBy: [{ occurredAt: "desc" }, { id: "desc" }] }),
    input.prisma.studioAudioDeliveryReviewReceipt.count({ where: { deliveryJobId: input.jobId, decision: "APPROVED" } }),
    input.prisma.studioAudioDeliveryReviewReceipt.count({ where: { deliveryJobId: input.jobId, decision: "REJECTED" } }),
  ]);
  return { latest: latest ? publicReview(latest) : null, approvalCount: approvals, rejectionCount: rejections };
}

export async function loadApprovedAudioDeliveryPacketEvidence(input: {
  prisma: any;
  projectSlug: string;
  assetId: string;
  deliveryJobId: string;
}) {
  const context = await loadDeliveryReviewContext(input);
  const [latestPromotion, latestMasterReview, latestReview] = await Promise.all([
    input.prisma.studioAudioMasterPromotionReceipt.findFirst({
      where: { projectId: context.projectId, assetId: input.assetId },
      orderBy: [{ occurredAt: "desc" }, { id: "desc" }],
    }),
    input.prisma.studioAudioMasterReviewReceipt.findFirst({
      where: { masteryJobId: context.job.source.masteryJobId },
      orderBy: [{ occurredAt: "desc" }, { id: "desc" }],
    }),
    input.prisma.studioAudioDeliveryReviewReceipt.findFirst({
      where: { deliveryJobId: context.job.jobId },
      orderBy: [{ occurredAt: "desc" }, { id: "desc" }],
    }),
  ]);
  if (!latestPromotion
      || latestPromotion.operation !== "PROMOTE"
      || latestPromotion.id !== context.job.source.promotionReceiptId) {
    throw new AudioDeliveryError(
      "The mastered audio selected for this encoded artifact is no longer active.",
      409,
      "PODCAST_PACKET_AUDIO_PROMOTION_STALE",
    );
  }
  if (!latestMasterReview
      || latestMasterReview.id !== latestPromotion.reviewReceiptId
      || latestMasterReview.decision !== "APPROVED") {
    throw new AudioDeliveryError(
      "The mastering approval behind this encoded artifact is no longer current.",
      409,
      "PODCAST_PACKET_AUDIO_PROMOTION_APPROVAL_STALE",
    );
  }
  if (!latestReview
      || latestReview.decision !== "APPROVED"
      || latestReview.promotionReceiptId !== latestPromotion.id
      || latestReview.deliverySha256 !== context.result.output.sha256
      || latestReview.candidateSha256 !== context.job.source.sha256) {
    throw new AudioDeliveryError(
      "The exact encoded audio bytes do not have a current proof-listen approval.",
      409,
      "PODCAST_PACKET_PROOF_LISTEN_REQUIRED",
    );
  }
  const playbackEvidence = parseAudioDeliveryPlaybackReviewEvidence(
    latestReview.evidenceJson,
    context.result.output.durationSeconds,
  );
  const coverage = audioDeliveryReviewCoverage(
    playbackEvidence,
    context.result.output.durationSeconds,
  );
  if (!coverage.approvalReady) {
    throw new AudioDeliveryError(
      "The encoded audio approval no longer carries complete beginning, midpoint, and ending playback evidence.",
      409,
      "PODCAST_PACKET_PROOF_LISTEN_EVIDENCE_INCOMPLETE",
    );
  }
  return {
    authorityKind: "asset-master" as const,
    projectId: context.projectId,
    assetId: input.assetId,
    deliveryJobId: context.job.jobId,
    masteryJobId: context.job.source.masteryJobId,
    mixJobId: null,
    promotionReceiptId: latestPromotion.id,
    masterReviewReceiptId: context.job.source.masterReviewReceiptId,
    mixReviewReceiptId: null,
    deliveryReviewReceiptId: latestReview.id,
    profileId: context.job.profileId,
    programFingerprintSha256: null,
    candidateSha256: context.job.source.sha256,
    deliverySha256: context.result.output.sha256,
    playbackUrl: text(context.registration.playbackUrl),
    sizeBytes: context.result.output.sizeBytes,
    durationSeconds: context.result.output.durationSeconds,
    contentType: context.result.output.contentType,
    codec: context.result.output.codec,
    codecProfile: context.result.output.codecProfile,
    sampleRateHz: context.result.output.sampleRateHz,
    channels: context.result.output.channels,
    bitrateBps: context.result.output.bitrateBps,
    fastStart: context.result.output.fastStart,
    completeDecode: context.result.output.completeDecode,
    integratedLufs: context.result.output.verificationMeasurement.integratedLufs,
    truePeakDbtp: context.result.output.verificationMeasurement.truePeakDbtp,
    proofListen: {
      receiptId: latestReview.id,
      actorEmail: latestReview.actorEmail,
      occurredAt: latestReview.occurredAt.toISOString(),
      coverage,
    },
  } as const;
}

async function loadPromotedCandidate(input: Coordinates) {
  let context: Awaited<ReturnType<typeof loadAudioMasteryReviewContext>>;
  try { context = await loadAudioMasteryReviewContext({ ...input, jobId: input.masteryJobId }); }
  catch (error) { if (error instanceof AudioMasteryReviewError) throw new AudioDeliveryError(error.message, error.status, error.code); throw error; }
  const [promotion, latestMasterReview] = await Promise.all([
    input.prisma.studioAudioMasterPromotionReceipt.findFirst({ where: { projectId: context.project.id, assetId: context.asset.id }, orderBy: [{ occurredAt: "desc" }, { id: "desc" }] }),
    input.prisma.studioAudioMasterReviewReceipt.findFirst({ where: { masteryJobId: context.job.jobId }, orderBy: [{ occurredAt: "desc" }, { id: "desc" }] }),
  ]);
  const derivative = context.result.derivative!;
  if (!promotion || promotion.operation !== "PROMOTE" || promotion.masteryJobId !== context.job.jobId || promotion.reviewReceiptId == null || promotion.previewSha256 !== derivative.sha256) throw new AudioDeliveryError("Delivery encoding requires the current exact promoted mastering candidate.", 409, "AUDIO_DELIVERY_ACTIVE_PROMOTION_REQUIRED");
  if (!latestMasterReview || latestMasterReview.id !== promotion.reviewReceiptId || latestMasterReview.decision !== "APPROVED" || latestMasterReview.previewSha256 !== derivative.sha256) throw new AudioDeliveryError("The promoted candidate is held because its approval is no longer the latest listening decision.", 409, "AUDIO_DELIVERY_PROMOTION_APPROVAL_STALE");
  const root = path.resolve(process.env.QUIPSLY_LOCAL_MEDIA_UPLOAD_ROOT || path.join(tmpdir(), "quipsly-media-ingest"));
  const previewPath = await resolveAllowedLocalStudioMediaPath(path.resolve(root, derivative.locator));
  if (!previewPath) throw new AudioDeliveryError("The promoted candidate has no authorized byte location.", 409, "AUDIO_DELIVERY_CANDIDATE_UNAVAILABLE");
  const evidence = await inspectImmutableStudioMediaSource(previewPath, "audio/wav");
  if (evidence.sha256 !== derivative.sha256 || evidence.sizeBytes !== derivative.sizeBytes) throw new AudioDeliveryError("The promoted candidate no longer matches its verified bytes.", 409, "AUDIO_DELIVERY_CANDIDATE_DRIFT");
  return { ...context, promotion, derivative, previewPath };
}

async function loadDeliveryReviewContext(input: { prisma: any; projectSlug: string; assetId: string; deliveryJobId: string }) {
  const project = await input.prisma.studioProject.findFirst({ where: { slug: input.projectSlug }, select: { id: true } });
  if (!project) throw new AudioDeliveryError("Nest not found for delivery review.", 404, "AUDIO_DELIVERY_PROJECT_NOT_FOUND");
  const row = await input.prisma.studioAssetProcessingJob.findFirst({ where: { id: input.deliveryJobId, projectId: project.id, assetId: input.assetId, type: JOB_TYPE, status: "completed" } });
  if (!row) throw new AudioDeliveryError("The completed delivery job is unavailable.", 409, "AUDIO_DELIVERY_JOB_NOT_FOUND");
  const job = parseAudioDeliveryJob(row.inputJson, row.id);
  const result = parseAudioDeliveryResult(object(row.resultJson).receipt, job);
  const registration = object(object(row.resultJson).registration);
  const outputPath = text(registration.providerSourceId);
  if (!text(registration.playbackUrl) || !outputPath) throw new AudioDeliveryError("The encoded artifact is not playable.", 409, "AUDIO_DELIVERY_PLAYBACK_UNAVAILABLE");
  const [fileStat, evidence] = await Promise.all([stat(outputPath), inspectImmutableStudioMediaSource(outputPath, "audio/mp4")]);
  if (!fileStat.isFile() || evidence.sha256 !== result.output.sha256 || evidence.sizeBytes !== result.output.sizeBytes) throw new AudioDeliveryError("The encoded artifact changed after registration.", 409, "AUDIO_DELIVERY_OUTPUT_DRIFT");
  return { projectId: project.id, row, job, result, registration };
}

async function withDynamicState(prisma: any, job: any, promotionStillActive: boolean) {
  const status = toPublicStatus(job);
  return { ...status, promotionStillActive, review: await readAudioDeliveryReviewSummary({ prisma, jobId: status.jobId }) };
}

function toPublicStatus(job: any): PublicAudioDeliveryStatus {
  let contract: ReturnType<typeof parseAudioDeliveryJob> | null = null;
  let result: ReturnType<typeof parseAudioDeliveryResult> | null = null;
  try { contract = parseAudioDeliveryJob(job.inputJson, job.id); } catch { /* integrity surfaced below */ }
  const envelope = object(job.resultJson);
  try { if (envelope.receipt && contract) result = parseAudioDeliveryResult(envelope.receipt, contract); } catch { /* integrity surfaced below */ }
  const registration = object(envelope.registration);
  const declared = ["queued", "processing", "output-ready", "completed", "failed"].includes(job.status) ? job.status as PublicAudioDeliveryStatus["status"] : "failed";
  const registrationMissing = declared === "completed" && !text(registration.playbackUrl);
  const invalid = !contract || ((declared === "output-ready" || declared === "completed") && !result) || registrationMissing;
  return {
    jobId: String(job.id), status: invalid ? "failed" : declared,
    masteryJobId: contract?.source.masteryJobId ?? null,
    promotionReceiptId: contract?.source.promotionReceiptId ?? null,
    profileId: contract?.profileId ?? null,
    output: result ? { playbackUrl: text(registration.playbackUrl) || null, sha256: result.output.sha256, sizeBytes: result.output.sizeBytes, durationSeconds: result.output.durationSeconds, codec: "aac", codecProfile: "LC", sampleRateHz: 48_000, channels: 2, bitrateBps: result.output.bitrateBps, integratedLufs: result.output.verificationMeasurement.integratedLufs, truePeakDbtp: result.output.verificationMeasurement.truePeakDbtp, fastStart: true, completeDecode: true } : null,
    review: { latest: null, approvalCount: 0, rejectionCount: 0 }, promotionStillActive: false,
    error: invalid ? "Audio delivery evidence failed integrity validation." : typeof job.error === "string" ? job.error : null,
    updatedAt: job.updatedAt?.toISOString?.() ?? null,
    boundaries: boundaries(),
  };
}

export function emptyAudioDeliveryStatus(): PublicAudioDeliveryStatus { return { jobId: null, status: "not-queued", masteryJobId: null, promotionReceiptId: null, profileId: null, output: null, review: { latest: null, approvalCount: 0, rejectionCount: 0 }, promotionStillActive: false, error: null, updatedAt: null, boundaries: boundaries() }; }
function boundaries() { return { originalRemainsSourceTruth: true as const, outputIsUnapprovedDeliveryArtifact: true as const, proofListenRequiredBeforeOutputPacket: true as const, uploadNotStarted: true as const, publicationNotStarted: true as const }; }
function registrationMetadata(result: ReturnType<typeof parseAudioDeliveryResult>, sourceId: string, outputPath: string) { return { schema: "quipsly-audio-delivery-registration-v1", sourceId, providerSourceId: outputPath, source: result.source, profile: result.profile, output: result.output, worker: result.worker, ...boundaries() }; }
function publicReview(receipt: any) { return { id: String(receipt.id), jobId: String(receipt.deliveryJobId), clientRequestId: String(receipt.clientRequestId), decision: receipt.decision === "APPROVED" ? "approved" as const : "rejected" as const, note: text(receipt.note) || null, reviewedAt: receipt.occurredAt?.toISOString?.() ?? String(receipt.occurredAt), actorEmail: String(receipt.actorEmail) }; }
function digest(value: unknown) { return createHash("sha256").update(JSON.stringify(value)).digest("hex"); }
function text(value: unknown, maximum = Number.POSITIVE_INFINITY) { return typeof value === "string" ? value.trim().slice(0, maximum) : ""; }
function object(value: unknown): Record<string, any> { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, any> : {}; }
function json(value: unknown): PrismaTypes.InputJsonValue { return JSON.parse(JSON.stringify(value)) as PrismaTypes.InputJsonValue; }
