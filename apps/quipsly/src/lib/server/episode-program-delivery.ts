import "server-only";

import { createHash, randomUUID } from "node:crypto";
import { stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { Prisma, type Prisma as PrismaTypes } from "@prisma/client";
import {
  audioDeliveryReviewCoverage,
  buildEpisodeProgramDeliveryTargetLocator,
  newEpisodeProgramDeliveryJob,
  parseAudioDeliveryPlaybackReviewEvidence,
  parseEpisodeProgramDeliveryJob,
  parseEpisodeProgramDeliveryResult,
  type AudioDeliveryPlaybackReviewEvidence,
  type AudioDeliveryProfileId,
} from "@high-ground/quipsly-media-processing";

import { inspectImmutableStudioMediaSource } from "@/lib/server/episode-collaboration-proxy";
import { loadEpisodeAudioMixReviewContext } from "@/lib/server/episode-audio-mix";
import { acquirePrismaAdvisoryTransactionLock } from "@/lib/server/prisma-advisory-lock";
import { resolveAllowedLocalStudioMediaPath } from "@/lib/server/studio-media-location-security";

const JOB_TYPE = "episode-program-delivery";

type Coordinates = {
  prisma: any;
  projectSlug: string;
  episodeProductionId: string;
};
type Actor = { email: string };

export type PublicEpisodeProgramDeliveryStatus = {
  jobId: string | null;
  status: "not-queued" | "queued" | "processing" | "output-ready" | "completed" | "failed";
  mixJobId: string | null;
  promotionReceiptId: string | null;
  programAssetId: string | null;
  programFingerprintSha256: string | null;
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
  review: {
    latest: null | { id: string; jobId: string; decision: "approved" | "rejected"; note: string | null; reviewedAt: string; actorEmail: string };
    approvalCount: number;
    rejectionCount: number;
  };
  promotionStillActive: boolean;
  error: string | null;
  updatedAt: string | null;
  boundaries: {
    sourceTracksRemainImmutable: true;
    promotedProgramRemainsCandidateTruth: true;
    outputIsUnapprovedDeliveryArtifact: true;
    proofListenRequiredBeforeOutputPacket: true;
    uploadNotStarted: true;
    publicationNotStarted: true;
  };
};

export class EpisodeProgramDeliveryError extends Error {
  constructor(message: string, readonly status: number, readonly code: string) { super(message); }
}

export async function queueEpisodeProgramDelivery(input: Coordinates & {
  mixJobId: string;
  actorEmail: string;
  profileId?: AudioDeliveryProfileId;
}) {
  const context = await loadPromotedProgram(input);
  const profileId = input.profileId || "apple-podcasts-aac-stereo-v1";
  const existing = await input.prisma.studioAssetProcessingJob.findFirst({
    where: { projectId: context.project.id, assetId: context.result.derivative.assetId, type: JOB_TYPE },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
  });
  if (existing && existing.status !== "failed") {
    try {
      const job = parseEpisodeProgramDeliveryJob(existing.inputJson, existing.id);
      if (job.source.promotionReceiptId === context.promotion.id && job.profileId === profileId) {
        return withDynamicState(input.prisma, existing, true);
      }
    } catch { /* malformed or stale jobs do not own this exact request */ }
  }
  const jobId = `episode_program_delivery_${randomUUID().replaceAll("-", "")}`;
  const derivative = context.result.derivative;
  const job = newEpisodeProgramDeliveryJob({
    jobId,
    projectId: context.project.id,
    requestedByEmail: input.actorEmail.toLowerCase(),
    queuedAt: new Date().toISOString(),
    source: {
      assetId: derivative.assetId,
      provider: "local",
      locator: context.programPath,
      generation: derivative.generation,
      sha256: derivative.sha256,
      sizeBytes: derivative.sizeBytes,
      contentType: derivative.contentType,
      durationSeconds: derivative.durationSeconds,
      episodeProductionId: context.episode.id,
      mixJobId: context.row.id,
      mixReviewReceiptId: context.promotion.reviewReceiptId,
      promotionReceiptId: context.promotion.id,
      programFingerprintSha256: context.promotion.programFingerprintSha256,
      proposalSha256: context.promotion.proposalSha256,
      baselineSha256: context.promotion.baselineSha256,
    },
    masteryProfileId: derivative.measurement.profileId,
    profileId,
    target: {
      provider: "local",
      locator: buildEpisodeProgramDeliveryTargetLocator({
        episodeProductionId: context.episode.id,
        candidateSha256: derivative.sha256,
        profileId,
      }),
      contentType: "audio/mp4",
      codec: "aac",
      codecProfile: "LC",
      sampleRateHz: 48_000,
      channels: 2,
      bitrateBps: 128_000,
      fastStartRequired: true,
      variantKind: "episode-program-delivery-artifact",
    },
  });
  const saved = await input.prisma.studioAssetProcessingJob.create({ data: {
    id: jobId,
    projectId: context.project.id,
    assetId: derivative.assetId,
    type: JOB_TYPE,
    status: "queued",
    requestedByEmail: input.actorEmail.toLowerCase(),
    inputJson: json(job),
  } });
  return withDynamicState(input.prisma, saved, true);
}

export async function readEpisodeProgramDeliveryStatus(input: Coordinates) {
  const context = await loadEpisodeIdentity(input);
  if (!context) return emptyEpisodeProgramDeliveryStatus();
  const row = await input.prisma.studioAssetProcessingJob.findFirst({
    where: {
      projectId: context.project.id,
      type: JOB_TYPE,
      AND: [{ inputJson: { path: ["source", "episodeProductionId"], equals: context.episode.id } }],
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
  });
  if (!row) return emptyEpisodeProgramDeliveryStatus();
  let promotionId: string | null = null;
  try { promotionId = parseEpisodeProgramDeliveryJob(row.inputJson, row.id).source.promotionReceiptId; } catch { /* surfaced as held status */ }
  const latestPromotion = await input.prisma.studioEpisodeAudioMixPromotionReceipt.findFirst({
    where: { episodeProductionId: context.episode.id },
    orderBy: [{ occurredAt: "desc" }, { id: "desc" }],
    select: { id: true, operation: true },
  });
  return withDynamicState(input.prisma, row, Boolean(promotionId && promotionId === latestPromotion?.id && latestPromotion.operation === "PROMOTE"));
}

export async function reconcileEpisodeProgramDelivery(input: Coordinates) {
  const identity = await loadEpisodeIdentity(input);
  if (!identity) return emptyEpisodeProgramDeliveryStatus();
  const row = await input.prisma.studioAssetProcessingJob.findFirst({
    where: {
      projectId: identity.project.id,
      type: JOB_TYPE,
      AND: [{ inputJson: { path: ["source", "episodeProductionId"], equals: identity.episode.id } }],
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
  });
  if (!row || row.status !== "output-ready") return row ? readEpisodeProgramDeliveryStatus(input) : emptyEpisodeProgramDeliveryStatus();
  const job = parseEpisodeProgramDeliveryJob(row.inputJson, row.id);
  const context = await loadPromotedProgram({ ...input, mixJobId: job.source.mixJobId });
  if (context.promotion.id !== job.source.promotionReceiptId || context.result.derivative.sha256 !== job.source.sha256) {
    throw new EpisodeProgramDeliveryError("The promoted Episode program changed before delivery registration.", 409, "EPISODE_PROGRAM_DELIVERY_PROMOTION_DRIFT");
  }
  const result = parseEpisodeProgramDeliveryResult(record(row.resultJson).receipt, job);
  await assertExactFile(context.programPath, job.source.sha256, job.source.sizeBytes, "The promoted Episode program changed before delivery registration.");
  const root = path.resolve(process.env.QUIPSLY_LOCAL_MEDIA_UPLOAD_ROOT || path.join(tmpdir(), "quipsly-media-ingest"));
  const outputPath = await resolveAllowedLocalStudioMediaPath(path.resolve(root, result.output.locator));
  if (!outputPath) throw new EpisodeProgramDeliveryError("The encoded Episode program escaped the authorized media root.", 409, "EPISODE_PROGRAM_DELIVERY_OUTPUT_HELD");
  await assertExactFile(outputPath, result.output.sha256, result.output.sizeBytes, "The encoded Episode program no longer matches its worker receipt.", "audio/mp4");
  let derivedSource = await input.prisma.studioVideoSource.findFirst({ where: { providerSourceId: outputPath } });
  if (!derivedSource) derivedSource = await input.prisma.studioVideoSource.create({ data: {
    provider: "local-episode-program-delivery-worker",
    providerSourceId: outputPath,
    url: "/api/ingest/media/pending",
    title: `${identity.episode.title} AAC Episode program`,
  } });
  const playbackUrl = `/api/ingest/media/${derivedSource.id}`;
  if (derivedSource.url !== playbackUrl) await input.prisma.studioVideoSource.update({ where: { id: derivedSource.id }, data: { url: playbackUrl } });
  await input.prisma.studioAssetVariant.upsert({
    where: { assetId_kind_url: { assetId: job.source.assetId, kind: "episode-program-delivery-artifact", url: playbackUrl } },
    create: { assetId: job.source.assetId, kind: "episode-program-delivery-artifact", url: playbackUrl, mimeType: "audio/mp4", duration: result.output.durationSeconds, sizeBytes: BigInt(result.output.sizeBytes), metadataJson: json(registrationMetadata(result, derivedSource.id, outputPath)) },
    update: { duration: result.output.durationSeconds, sizeBytes: BigInt(result.output.sizeBytes), metadataJson: json(registrationMetadata(result, derivedSource.id, outputPath)) },
  });
  const updated = await input.prisma.studioAssetProcessingJob.update({ where: { id: row.id }, data: {
    status: "completed",
    completedAt: new Date(result.completedAt),
    error: null,
    resultJson: json({ state: "completed", receipt: result, registration: { playbackUrl, sourceId: derivedSource.id, providerSourceId: outputPath } }),
  } });
  return withDynamicState(input.prisma, updated, true);
}

export async function appendEpisodeProgramDeliveryReview(input: Coordinates & {
  deliveryJobId: string;
  actor: Actor;
  clientRequestId: string;
  decision: "approved" | "rejected";
  playbackEvidence: unknown;
  note?: string | null;
}) {
  const clientRequestId = text(input.clientRequestId, 160);
  const note = text(input.note, 2_000) || null;
  if (!clientRequestId) throw new EpisodeProgramDeliveryError("A stable client request id is required.", 400, "INVALID_EPISODE_PROGRAM_DELIVERY_REVIEW_REQUEST");
  const context = await loadDeliveryReviewContext(input);
  let evidence: AudioDeliveryPlaybackReviewEvidence;
  try { evidence = parseAudioDeliveryPlaybackReviewEvidence(input.playbackEvidence, context.result.output.durationSeconds); }
  catch (error) { throw new EpisodeProgramDeliveryError(message(error), 400, "INVALID_EPISODE_PROGRAM_DELIVERY_REVIEW_EVIDENCE"); }
  const coverage = audioDeliveryReviewCoverage(evidence, context.result.output.durationSeconds);
  if (input.decision === "approved" && !coverage.approvalReady) throw new EpisodeProgramDeliveryError("Approval requires playback around the beginning, midpoint, and ending of the encoded Episode program.", 409, "EPISODE_PROGRAM_DELIVERY_REVIEW_INCOMPLETE");
  if (input.decision === "rejected" && (evidence.listenedSecondBins.length === 0 || !note)) throw new EpisodeProgramDeliveryError("Rejecting encoded Episode bytes requires heard playback evidence and a note.", 409, "EPISODE_PROGRAM_DELIVERY_REJECTION_EVIDENCE_REQUIRED");
  const actorEmail = input.actor.email.toLowerCase();
  const request = {
    schema: "quipsly-episode-program-delivery-review-request-v1",
    projectId: context.project.id,
    episodeProductionId: context.episode.id,
    programAssetId: context.job.source.assetId,
    deliveryJobId: context.job.jobId,
    promotionReceiptId: context.job.source.promotionReceiptId,
    actorEmail,
    clientRequestId,
    decision: input.decision,
    deliveryProfileId: context.job.profileId,
    programFingerprintSha256: context.job.source.programFingerprintSha256,
    candidateSha256: context.job.source.sha256,
    deliverySha256: context.result.output.sha256,
    evidence,
    coverage,
    note,
  };
  const requestSha256 = digest(request);
  const unique = { projectId_actorEmail_clientRequestId: { projectId: context.project.id, actorEmail, clientRequestId } };
  const existing = await input.prisma.studioEpisodeProgramDeliveryReviewReceipt.findUnique({ where: unique });
  if (existing) return replayReview(existing, requestSha256, input.prisma, context.job.jobId);
  const receipt = await input.prisma.$transaction(async (tx: any) => {
    await acquirePrismaAdvisoryTransactionLock(tx, `episode-program-delivery-review:${context.job.jobId}:${actorEmail}`);
    const replay = await tx.studioEpisodeProgramDeliveryReviewReceipt.findUnique({ where: unique });
    if (replay) {
      if (replay.requestSha256 !== requestSha256) conflict("That request id won a race with different encoded-program evidence.", "EPISODE_PROGRAM_DELIVERY_REVIEW_IDEMPOTENCY_CONFLICT");
      return replay;
    }
    await assertPromotionCurrent(tx, context.episode.id, context.job.source.promotionReceiptId);
    return tx.studioEpisodeProgramDeliveryReviewReceipt.create({ data: {
      projectId: context.project.id,
      episodeProductionId: context.episode.id,
      programAssetId: context.job.source.assetId,
      deliveryJobId: context.job.jobId,
      promotionReceiptId: context.job.source.promotionReceiptId,
      actorEmail,
      clientRequestId,
      decision: input.decision === "approved" ? "APPROVED" : "REJECTED",
      deliveryProfileId: context.job.profileId,
      programFingerprintSha256: context.job.source.programFingerprintSha256,
      candidateSha256: context.job.source.sha256,
      deliverySha256: context.result.output.sha256,
      requestSha256,
      evidenceJson: json({ ...evidence, coverage, clientTrackedPlaybackIsNotProofOfAudibility: true, outputPacketNotCreated: true, uploadNotStarted: true, publicationNotStarted: true }),
      note,
      occurredAt: new Date(),
    } });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  return { ok: true, idempotentReplay: false, receipt: publicReview(receipt), review: await readEpisodeProgramDeliveryReviewSummary({ prisma: input.prisma, jobId: context.job.jobId }) };
}

export async function readEpisodeProgramDeliveryReviewSummary(input: { prisma: any; jobId: string | null }) {
  if (!input.jobId) return emptyReview();
  const [latest, approvals, rejections] = await Promise.all([
    input.prisma.studioEpisodeProgramDeliveryReviewReceipt.findFirst({ where: { deliveryJobId: input.jobId }, orderBy: [{ occurredAt: "desc" }, { id: "desc" }] }),
    input.prisma.studioEpisodeProgramDeliveryReviewReceipt.count({ where: { deliveryJobId: input.jobId, decision: "APPROVED" } }),
    input.prisma.studioEpisodeProgramDeliveryReviewReceipt.count({ where: { deliveryJobId: input.jobId, decision: "REJECTED" } }),
  ]);
  return { latest: latest ? publicReview(latest) : null, approvalCount: approvals, rejectionCount: rejections };
}

export async function loadApprovedEpisodeProgramDeliveryPacketEvidence(input: Coordinates & { assetId: string; deliveryJobId: string }) {
  const context = await loadDeliveryReviewContext(input);
  if (context.job.source.assetId !== input.assetId) conflict("The encoded Episode program asset does not match the requested packet source.", "PODCAST_PACKET_PROGRAM_ASSET_MISMATCH");
  const latestReview = await input.prisma.studioEpisodeProgramDeliveryReviewReceipt.findFirst({ where: { deliveryJobId: context.job.jobId }, orderBy: [{ occurredAt: "desc" }, { id: "desc" }] });
  await assertPromotionCurrent(input.prisma, context.episode.id, context.job.source.promotionReceiptId);
  if (!latestReview || latestReview.decision !== "APPROVED" || latestReview.promotionReceiptId !== context.job.source.promotionReceiptId || latestReview.deliverySha256 !== context.result.output.sha256 || latestReview.candidateSha256 !== context.job.source.sha256 || latestReview.programFingerprintSha256 !== context.job.source.programFingerprintSha256) {
    conflict("The exact encoded Episode-program bytes do not have a current proof-listen approval.", "PODCAST_PACKET_PROOF_LISTEN_REQUIRED");
  }
  const playbackEvidence = parseAudioDeliveryPlaybackReviewEvidence(latestReview.evidenceJson, context.result.output.durationSeconds);
  const coverage = audioDeliveryReviewCoverage(playbackEvidence, context.result.output.durationSeconds);
  if (!coverage.approvalReady) conflict("The encoded Episode-program approval no longer carries complete beginning, midpoint, and ending evidence.", "PODCAST_PACKET_PROOF_LISTEN_EVIDENCE_INCOMPLETE");
  return {
    authorityKind: "episode-program" as const,
    projectId: context.project.id,
    episodeProductionId: context.episode.id,
    assetId: context.job.source.assetId,
    deliveryJobId: context.job.jobId,
    masteryJobId: null,
    mixJobId: context.job.source.mixJobId,
    masterReviewReceiptId: null,
    mixReviewReceiptId: context.job.source.mixReviewReceiptId,
    promotionReceiptId: context.job.source.promotionReceiptId,
    deliveryReviewReceiptId: latestReview.id,
    profileId: context.job.profileId,
    programFingerprintSha256: context.job.source.programFingerprintSha256,
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
    proofListen: { receiptId: latestReview.id, actorEmail: latestReview.actorEmail, occurredAt: latestReview.occurredAt.toISOString(), coverage },
  };
}

async function loadEpisodeIdentity(input: Coordinates) {
  const project = await input.prisma.studioProject.findFirst({ where: { slug: input.projectSlug }, select: { id: true, slug: true } });
  if (!project) return null;
  const episode = await input.prisma.studioEpisodeProduction.findFirst({ where: { id: input.episodeProductionId, projectId: project.id }, select: { id: true, title: true } });
  return episode ? { project, episode } : null;
}

async function loadPromotedProgram(input: Coordinates & { mixJobId: string }) {
  const context = await loadEpisodeAudioMixReviewContext({ ...input, jobId: input.mixJobId });
  const [promotion, review, attachment] = await Promise.all([
    input.prisma.studioEpisodeAudioMixPromotionReceipt.findFirst({ where: { episodeProductionId: context.episode.id }, orderBy: [{ occurredAt: "desc" }, { id: "desc" }] }),
    input.prisma.studioEpisodeAudioMixReviewReceipt.findFirst({ where: { mixJobId: context.row.id }, orderBy: [{ occurredAt: "desc" }, { id: "desc" }] }),
    input.prisma.studioAssetAttachment.findUnique({ where: { projectId_assetId: { projectId: context.project.id, assetId: context.result.derivative.assetId } } }),
  ]);
  const proposalSha256 = digest(context.proposal);
  if (!promotion || promotion.operation !== "PROMOTE" || promotion.mixJobId !== context.row.id || !promotion.reviewReceiptId || promotion.reviewReceiptId !== review?.id || review.decision !== "APPROVED" || promotion.programFingerprintSha256 !== context.proposal.programFingerprintSha256 || promotion.proposalSha256 !== proposalSha256 || promotion.baselineSha256 !== context.result.baselineDerivative?.sha256 || promotion.previewSha256 !== context.result.derivative.sha256 || !attachment) {
    throw new EpisodeProgramDeliveryError("Delivery encoding requires the current exact promoted multitrack Episode program.", 409, "EPISODE_PROGRAM_DELIVERY_ACTIVE_PROMOTION_REQUIRED");
  }
  const root = path.resolve(process.env.QUIPSLY_LOCAL_MEDIA_UPLOAD_ROOT || path.join(tmpdir(), "quipsly-media-ingest"));
  const registeredPath = text(record(record(context.row.resultJson).registration).outputPath);
  const programPath = await resolveAllowedLocalStudioMediaPath(registeredPath || path.resolve(root, context.result.derivative.locator));
  if (!programPath) throw new EpisodeProgramDeliveryError("The promoted Episode program has no authorized byte location.", 409, "EPISODE_PROGRAM_DELIVERY_CANDIDATE_UNAVAILABLE");
  await assertExactFile(programPath, context.result.derivative.sha256, context.result.derivative.sizeBytes, "The promoted Episode program no longer matches its immutable worker receipt.");
  return { ...context, promotion, programPath };
}

async function loadDeliveryReviewContext(input: Coordinates & { deliveryJobId: string }) {
  const identity = await loadEpisodeIdentity(input);
  if (!identity) throw new EpisodeProgramDeliveryError("Nest or Episode not found for program delivery review.", 404, "EPISODE_PROGRAM_DELIVERY_EPISODE_NOT_FOUND");
  const row = await input.prisma.studioAssetProcessingJob.findFirst({ where: { id: input.deliveryJobId, projectId: identity.project.id, type: JOB_TYPE, status: "completed", AND: [{ inputJson: { path: ["source", "episodeProductionId"], equals: identity.episode.id } }] } });
  if (!row) throw new EpisodeProgramDeliveryError("The completed Episode-program delivery job is unavailable.", 409, "EPISODE_PROGRAM_DELIVERY_JOB_NOT_FOUND");
  const job = parseEpisodeProgramDeliveryJob(row.inputJson, row.id);
  const result = parseEpisodeProgramDeliveryResult(record(row.resultJson).receipt, job);
  const registration = record(record(row.resultJson).registration);
  const outputPath = text(registration.providerSourceId);
  if (!text(registration.playbackUrl) || !outputPath) throw new EpisodeProgramDeliveryError("The encoded Episode program is not playable.", 409, "EPISODE_PROGRAM_DELIVERY_PLAYBACK_UNAVAILABLE");
  await assertExactFile(outputPath, result.output.sha256, result.output.sizeBytes, "The encoded Episode program changed after registration.", "audio/mp4");
  return { project: identity.project, episode: identity.episode, row, job, result, registration };
}

async function withDynamicState(prisma: any, row: any, promotionStillActive: boolean) {
  const status = toPublicStatus(row);
  return { ...status, promotionStillActive, review: await readEpisodeProgramDeliveryReviewSummary({ prisma, jobId: status.jobId }) };
}

function toPublicStatus(row: any): PublicEpisodeProgramDeliveryStatus {
  let job: ReturnType<typeof parseEpisodeProgramDeliveryJob> | null = null;
  let result: ReturnType<typeof parseEpisodeProgramDeliveryResult> | null = null;
  try { job = parseEpisodeProgramDeliveryJob(row.inputJson, row.id); } catch { /* integrity failure is public */ }
  const envelope = record(row.resultJson);
  try { if (job && envelope.receipt) result = parseEpisodeProgramDeliveryResult(envelope.receipt, job); } catch { /* integrity failure is public */ }
  const registration = record(envelope.registration);
  const declared = ["queued", "processing", "output-ready", "completed", "failed"].includes(row.status) ? row.status as PublicEpisodeProgramDeliveryStatus["status"] : "failed";
  const invalid = !job || ((declared === "output-ready" || declared === "completed") && !result) || (declared === "completed" && !text(registration.playbackUrl));
  return {
    jobId: String(row.id),
    status: invalid ? "failed" : declared,
    mixJobId: job?.source.mixJobId ?? null,
    promotionReceiptId: job?.source.promotionReceiptId ?? null,
    programAssetId: job?.source.assetId ?? null,
    programFingerprintSha256: job?.source.programFingerprintSha256 ?? null,
    profileId: job?.profileId ?? null,
    output: result ? {
      playbackUrl: text(registration.playbackUrl) || null,
      sha256: result.output.sha256,
      sizeBytes: result.output.sizeBytes,
      durationSeconds: result.output.durationSeconds,
      codec: "aac",
      codecProfile: "LC",
      sampleRateHz: 48_000,
      channels: 2,
      bitrateBps: result.output.bitrateBps,
      integratedLufs: result.output.verificationMeasurement.integratedLufs,
      truePeakDbtp: result.output.verificationMeasurement.truePeakDbtp,
      fastStart: true,
      completeDecode: true,
    } : null,
    review: emptyReview(),
    promotionStillActive: false,
    error: invalid ? "Episode program delivery evidence failed integrity validation." : typeof row.error === "string" ? row.error : null,
    updatedAt: row.updatedAt?.toISOString?.() ?? null,
    boundaries: boundaries(),
  };
}

export function emptyEpisodeProgramDeliveryStatus(): PublicEpisodeProgramDeliveryStatus {
  return { jobId: null, status: "not-queued", mixJobId: null, promotionReceiptId: null, programAssetId: null, programFingerprintSha256: null, profileId: null, output: null, review: emptyReview(), promotionStillActive: false, error: null, updatedAt: null, boundaries: boundaries() };
}

async function assertPromotionCurrent(prisma: any, episodeProductionId: string, promotionReceiptId: string) {
  const latest = await prisma.studioEpisodeAudioMixPromotionReceipt.findFirst({ where: { episodeProductionId }, orderBy: [{ occurredAt: "desc" }, { id: "desc" }] });
  if (!latest || latest.id !== promotionReceiptId || latest.operation !== "PROMOTE") conflict("The promoted Episode program was withdrawn or replaced.", "EPISODE_PROGRAM_DELIVERY_PROMOTION_STALE");
}

async function assertExactFile(filePath: string, sha256: string, sizeBytes: number, errorMessage: string, contentType = "audio/wav") {
  const [file, evidence] = await Promise.all([stat(filePath).catch(() => null), inspectImmutableStudioMediaSource(filePath, contentType)]);
  if (!file?.isFile() || evidence.sha256 !== sha256 || evidence.sizeBytes !== sizeBytes) conflict(errorMessage, "EPISODE_PROGRAM_DELIVERY_BYTE_DRIFT");
}

function replayReview(existing: any, requestSha256: string, prisma: any, jobId: string) {
  if (existing.requestSha256 !== requestSha256) conflict("That request id is already bound to a different encoded-program decision.", "EPISODE_PROGRAM_DELIVERY_REVIEW_IDEMPOTENCY_CONFLICT");
  return readEpisodeProgramDeliveryReviewSummary({ prisma, jobId }).then((review) => ({ ok: true, idempotentReplay: true, receipt: publicReview(existing), review }));
}

function registrationMetadata(result: ReturnType<typeof parseEpisodeProgramDeliveryResult>, sourceId: string, outputPath: string) {
  return { schema: "quipsly-episode-program-delivery-registration-v1", sourceId, providerSourceId: outputPath, source: result.source, profile: result.profile, output: result.output, worker: result.worker, ...boundaries() };
}
function publicReview(row: any) { return { id: String(row.id), jobId: String(row.deliveryJobId), decision: row.decision === "APPROVED" ? "approved" as const : "rejected" as const, note: text(row.note) || null, reviewedAt: row.occurredAt?.toISOString?.() ?? String(row.occurredAt), actorEmail: String(row.actorEmail) }; }
function emptyReview() { return { latest: null, approvalCount: 0, rejectionCount: 0 }; }
function boundaries() { return { sourceTracksRemainImmutable: true as const, promotedProgramRemainsCandidateTruth: true as const, outputIsUnapprovedDeliveryArtifact: true as const, proofListenRequiredBeforeOutputPacket: true as const, uploadNotStarted: true as const, publicationNotStarted: true as const }; }
function conflict(messageText: string, code: string): never { throw new EpisodeProgramDeliveryError(messageText, 409, code); }
function text(value: unknown, maximum = Number.POSITIVE_INFINITY) { return typeof value === "string" ? value.trim().slice(0, maximum) : ""; }
function record(value: unknown): Record<string, any> { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, any> : {}; }
function json(value: unknown): PrismaTypes.InputJsonValue { return JSON.parse(JSON.stringify(value)) as PrismaTypes.InputJsonValue; }
function stableJson(value: unknown): string { if (value === null || value === undefined) return "null"; if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`; if (typeof value === "object") { const row = value as Record<string, unknown>; return `{${Object.keys(row).sort().map((key) => `${JSON.stringify(key)}:${stableJson(row[key])}`).join(",")}}`; } return JSON.stringify(value); }
function digest(value: unknown) { return createHash("sha256").update(stableJson(value)).digest("hex"); }
function message(error: unknown) { return error instanceof Error && error.message.trim() ? error.message : "Episode program delivery evidence is invalid."; }
