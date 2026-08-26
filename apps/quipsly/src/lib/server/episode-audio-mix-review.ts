import "server-only";

import { createHash } from "node:crypto";

import { Prisma } from "@prisma/client";
import {
  episodeAudioMixReviewCoverage,
  parseEpisodeAudioMixReviewPlaybackEvidence,
} from "@high-ground/quipsly-media-processing";

import { EpisodeAudioMixError, loadEpisodeAudioMixReviewContext } from "@/lib/server/episode-audio-mix";
import { acquirePrismaAdvisoryTransactionLock } from "@/lib/server/prisma-advisory-lock";

type Coordinates = { prisma: any; projectSlug: string; episodeProductionId: string; jobId: string };
type Actor = { email: string };

export class EpisodeAudioMixReviewError extends Error {
  constructor(message: string, readonly status: number, readonly code: string) { super(message); }
}

export type PublicEpisodeAudioMixReviewSummary = {
  latest: null | { id: string; jobId: string; decision: "approved" | "rejected"; note: string | null; actorEmail: string; reviewedAt: string };
  approvalCount: number;
  rejectionCount: number;
};

export type PublicEpisodeAudioMixPromotionSummary = {
  active: boolean;
  latest: null | { id: string; jobId: string; reviewReceiptId: string | null; operation: "promote" | "withdraw"; reason: string | null; actorEmail: string; occurredAt: string; candidatePlaybackUrl: string | null };
  activePromotion: PublicEpisodeAudioMixPromotionSummary["latest"];
  promoteCount: number;
  withdrawalCount: number;
  candidatePlaybackUrl: string | null;
  boundaries: { sourceTracksRemainImmutable: true; episodeProgramUnchanged: true; deliveryEncodingNotCreated: true; publicationNotStarted: true; withdrawalPreservesHistory: true };
};

export async function readEpisodeAudioMixDecisionSummary(input: { prisma: any; episodeProductionId: string; jobId: string | null }) {
  if (!input.jobId) return { review: emptyReview(), promotion: emptyPromotion() };
  const [latestReview, approvals, rejections, latestPromotion, promotes, withdrawals] = await Promise.all([
    input.prisma.studioEpisodeAudioMixReviewReceipt.findFirst({ where: { mixJobId: input.jobId }, orderBy: [{ occurredAt: "desc" }, { id: "desc" }] }),
    input.prisma.studioEpisodeAudioMixReviewReceipt.count({ where: { mixJobId: input.jobId, decision: "APPROVED" } }),
    input.prisma.studioEpisodeAudioMixReviewReceipt.count({ where: { mixJobId: input.jobId, decision: "REJECTED" } }),
    input.prisma.studioEpisodeAudioMixPromotionReceipt.findFirst({ where: { episodeProductionId: input.episodeProductionId }, orderBy: [{ occurredAt: "desc" }, { id: "desc" }] }),
    input.prisma.studioEpisodeAudioMixPromotionReceipt.count({ where: { episodeProductionId: input.episodeProductionId, operation: "PROMOTE" } }),
    input.prisma.studioEpisodeAudioMixPromotionReceipt.count({ where: { episodeProductionId: input.episodeProductionId, operation: "WITHDRAW" } }),
  ]);
  const publicPromotion = latestPromotion ? promotionReceipt(latestPromotion) : null;
  const active = publicPromotion?.operation === "promote";
  return {
    review: { latest: latestReview ? reviewReceipt(latestReview) : null, approvalCount: approvals, rejectionCount: rejections } satisfies PublicEpisodeAudioMixReviewSummary,
    promotion: { active, latest: publicPromotion, activePromotion: active ? publicPromotion : null, promoteCount: promotes, withdrawalCount: withdrawals, candidatePlaybackUrl: active ? publicPromotion?.candidatePlaybackUrl ?? null : null, boundaries: promotionBoundaries() } satisfies PublicEpisodeAudioMixPromotionSummary,
  };
}

export async function appendEpisodeAudioMixReview(input: Coordinates & { actor: Actor; clientRequestId: string; decision: "approved" | "rejected"; playbackEvidence: unknown; note?: string | null }) {
  const clientRequestId = text(input.clientRequestId, 160);
  const note = text(input.note, 2_000) || null;
  if (!clientRequestId) throw new EpisodeAudioMixReviewError("A stable client request id is required.", 400, "INVALID_EPISODE_MIX_REVIEW_REQUEST");
  const context = await reviewContext(input);
  let evidence;
  try { evidence = parseEpisodeAudioMixReviewPlaybackEvidence(input.playbackEvidence, context.result.derivative.durationSeconds); }
  catch (error) { throw new EpisodeAudioMixReviewError(message(error), 400, "INVALID_EPISODE_MIX_REVIEW_EVIDENCE"); }
  const coverage = episodeAudioMixReviewCoverage(context.proposal, evidence);
  if (input.decision === "approved" && !coverage.approvalReady) throw new EpisodeAudioMixReviewError("Approval requires matched baseline and proposal playback at every required program moment plus a same-clock A/B switch.", 409, "EPISODE_MIX_REVIEW_INCOMPLETE");
  if (input.decision === "rejected" && (evidence.proposalListenedSecondBins.length === 0 || !note || note.length < 3)) throw new EpisodeAudioMixReviewError("Rejecting a proposal requires heard proposal evidence and a short note.", 409, "EPISODE_MIX_REJECTION_EVIDENCE_REQUIRED");
  const identity = exactIdentity(context);
  const actorEmail = input.actor.email.toLowerCase();
  const request = { schema: "quipsly-episode-audio-mix-review-request-v1", projectId: context.project.id, episodeProductionId: context.episode.id, mixJobId: context.row.id, actorEmail, clientRequestId, decision: input.decision, ...identity, evidence, coverage, note };
  const requestSha256 = sha256(request);
  const existing = await input.prisma.studioEpisodeAudioMixReviewReceipt.findUnique({ where: { projectId_actorEmail_clientRequestId: { projectId: context.project.id, actorEmail, clientRequestId } } });
  if (existing) return replayReview(existing, requestSha256, input.prisma, context.episode.id, context.row.id);
  const now = new Date();
  const receipt = await input.prisma.$transaction(async (tx: any) => {
    await acquirePrismaAdvisoryTransactionLock(tx, `episode-audio-mix-review:${context.row.id}:${actorEmail}`);
    const replay = await tx.studioEpisodeAudioMixReviewReceipt.findUnique({ where: { projectId_actorEmail_clientRequestId: { projectId: context.project.id, actorEmail, clientRequestId } } });
    if (replay) { if (replay.requestSha256 !== requestSha256) conflict("That request id won a race with different listening evidence.", "EPISODE_MIX_REVIEW_IDEMPOTENCY_CONFLICT"); return replay; }
    return tx.studioEpisodeAudioMixReviewReceipt.create({ data: { projectId: context.project.id, episodeProductionId: context.episode.id, mixJobId: context.row.id, actorEmail, clientRequestId, decision: input.decision === "approved" ? "APPROVED" : "REJECTED", ...identity, requestSha256, evidenceJson: json({ ...evidence, coverage, clientTrackedPlaybackIsNotProofOfAudibility: true, baselineAndProposalRemainImmutable: true, previewRemainsUnpromoted: true }), note, occurredAt: now } });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  return { ok: true, idempotentReplay: false, receipt: reviewReceipt(receipt), ...await readEpisodeAudioMixDecisionSummary({ prisma: input.prisma, episodeProductionId: context.episode.id, jobId: context.row.id }) };
}

export async function appendEpisodeAudioMixPromotion(input: Coordinates & { actor: Actor; clientRequestId: string; operation: "promote" | "withdraw"; reviewReceiptId?: string | null; reason?: string | null }) {
  const clientRequestId = text(input.clientRequestId, 160);
  const reviewReceiptId = input.operation === "promote" ? text(input.reviewReceiptId, 180) || null : null;
  const reason = text(input.reason, 2_000) || null;
  if (!clientRequestId) throw new EpisodeAudioMixReviewError("A stable client request id is required.", 400, "INVALID_EPISODE_MIX_PROMOTION_REQUEST");
  const context = await reviewContext(input);
  const actorEmail = input.actor.email.toLowerCase();
  const identity = exactIdentity(context);
  const candidatePlaybackUrl = text(context.registration.playbackUrl, 2_000);
  const request = { schema: "quipsly-episode-audio-mix-promotion-request-v1", projectId: context.project.id, episodeProductionId: context.episode.id, mixJobId: context.row.id, reviewReceiptId, actorEmail, clientRequestId, operation: input.operation, ...identity, candidatePlaybackUrl, reason };
  const requestSha256 = sha256(request);
  const existing = await input.prisma.studioEpisodeAudioMixPromotionReceipt.findUnique({ where: { projectId_actorEmail_clientRequestId: { projectId: context.project.id, actorEmail, clientRequestId } } });
  if (existing) return replayPromotion(existing, requestSha256, input.prisma, context.episode.id, context.row.id);
  const now = new Date();
  const receipt = await input.prisma.$transaction(async (tx: any) => {
    await acquirePrismaAdvisoryTransactionLock(tx, `episode-audio-mix-promotion:${context.episode.id}`);
    const replay = await tx.studioEpisodeAudioMixPromotionReceipt.findUnique({ where: { projectId_actorEmail_clientRequestId: { projectId: context.project.id, actorEmail, clientRequestId } } });
    if (replay) { if (replay.requestSha256 !== requestSha256) conflict("That request id won a race with a different promotion action.", "EPISODE_MIX_PROMOTION_IDEMPOTENCY_CONFLICT"); return replay; }
    const latestJob = await tx.studioAssetProcessingJob.findFirst({ where: { projectId: context.project.id, type: "episode-audio-mix", AND: [{ inputJson: { path: ["episodeProductionId"], equals: context.episode.id } }] }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], select: { id: true } });
      if (!latestJob || latestJob.id !== context.row.id) conflict("A newer Episode mix exists. Refresh before using this result.", "EPISODE_MIX_PROMOTION_JOB_STALE");
    const latestPromotion = await tx.studioEpisodeAudioMixPromotionReceipt.findFirst({ where: { episodeProductionId: context.episode.id }, orderBy: [{ occurredAt: "desc" }, { id: "desc" }] });
    let boundReviewId: string | null = null;
    if (input.operation === "promote") {
      if (reviewReceiptId) {
        const latestReview = await tx.studioEpisodeAudioMixReviewReceipt.findFirst({ where: { mixJobId: context.row.id }, orderBy: [{ occurredAt: "desc" }, { id: "desc" }] });
        if (!latestReview || latestReview.id !== reviewReceiptId || latestReview.decision !== "APPROVED" || !sameIdentity(latestReview, identity)) conflict("That optional listening note belongs to a different audio result.", "EPISODE_MIX_PROMOTION_REVIEW_STALE");
        boundReviewId = latestReview.id;
      }
      if (latestPromotion?.operation === "PROMOTE") conflict("An Episode mix is already promoted. Withdraw it before promoting another.", "EPISODE_MIX_ALREADY_PROMOTED");
    } else {
      if (!latestPromotion || latestPromotion.operation !== "PROMOTE" || latestPromotion.mixJobId !== context.row.id) conflict("This proposal is not the active promoted Episode mix.", "EPISODE_MIX_NOT_PROMOTED");
      boundReviewId = latestPromotion.reviewReceiptId;
    }
    return tx.studioEpisodeAudioMixPromotionReceipt.create({ data: { projectId: context.project.id, episodeProductionId: context.episode.id, mixJobId: context.row.id, reviewReceiptId: boundReviewId, actorEmail, clientRequestId, operation: input.operation === "promote" ? "PROMOTE" : "WITHDRAW", ...identity, requestSha256, evidenceJson: json({ candidatePlaybackUrl, reversibleUserSelection: true, optionalListeningReceiptId: boundReviewId, sourceTracksRemainImmutable: true, episodeProgramUnchanged: true, deliveryEncodingNotCreated: true, publicationNotStarted: true, withdrawalPreservesHistory: true }), reason, occurredAt: now } });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  return { ok: true, idempotentReplay: false, receipt: promotionReceipt(receipt), ...await readEpisodeAudioMixDecisionSummary({ prisma: input.prisma, episodeProductionId: context.episode.id, jobId: context.row.id }) };
}

async function reviewContext(input: Coordinates) { try { return await loadEpisodeAudioMixReviewContext(input); } catch (error) { if (error instanceof EpisodeAudioMixError) throw new EpisodeAudioMixReviewError(error.message, error.status, error.code); throw error; } }
function exactIdentity(context: Awaited<ReturnType<typeof loadEpisodeAudioMixReviewContext>>) { return { programFingerprintSha256: context.proposal.programFingerprintSha256, proposalSha256: sha256(context.proposal), baselineSha256: context.result.baselineDerivative!.sha256, previewSha256: context.result.derivative.sha256 }; }
function sameIdentity(row: any, identity: ReturnType<typeof exactIdentity>) { return row.programFingerprintSha256 === identity.programFingerprintSha256 && row.proposalSha256 === identity.proposalSha256 && row.baselineSha256 === identity.baselineSha256 && row.previewSha256 === identity.previewSha256; }
async function replayReview(existing: any, requestSha256: string, prisma: any, episodeProductionId: string, jobId: string) { if (existing.requestSha256 !== requestSha256) conflict("That request id is already bound to a different listening decision.", "EPISODE_MIX_REVIEW_IDEMPOTENCY_CONFLICT"); return { ok: true, idempotentReplay: true, receipt: reviewReceipt(existing), ...await readEpisodeAudioMixDecisionSummary({ prisma, episodeProductionId, jobId }) }; }
async function replayPromotion(existing: any, requestSha256: string, prisma: any, episodeProductionId: string, jobId: string) { if (existing.requestSha256 !== requestSha256) conflict("That request id is already bound to a different promotion action.", "EPISODE_MIX_PROMOTION_IDEMPOTENCY_CONFLICT"); return { ok: true, idempotentReplay: true, receipt: promotionReceipt(existing), ...await readEpisodeAudioMixDecisionSummary({ prisma, episodeProductionId, jobId }) }; }
function reviewReceipt(row: any) { return { id: String(row.id), jobId: String(row.mixJobId), decision: row.decision === "APPROVED" ? "approved" as const : "rejected" as const, note: text(row.note, 2_000) || null, actorEmail: String(row.actorEmail), reviewedAt: row.occurredAt?.toISOString?.() ?? String(row.occurredAt) }; }
function promotionReceipt(row: any) { const evidence = object(row.evidenceJson); return { id: String(row.id), jobId: String(row.mixJobId), reviewReceiptId: text(row.reviewReceiptId, 180) || null, operation: row.operation === "PROMOTE" ? "promote" as const : "withdraw" as const, reason: text(row.reason, 2_000) || null, actorEmail: String(row.actorEmail), occurredAt: row.occurredAt?.toISOString?.() ?? String(row.occurredAt), candidatePlaybackUrl: text(evidence.candidatePlaybackUrl, 2_000) || null }; }
function emptyReview(): PublicEpisodeAudioMixReviewSummary { return { latest: null, approvalCount: 0, rejectionCount: 0 }; }
function emptyPromotion(): PublicEpisodeAudioMixPromotionSummary { return { active: false, latest: null, activePromotion: null, promoteCount: 0, withdrawalCount: 0, candidatePlaybackUrl: null, boundaries: promotionBoundaries() }; }
function promotionBoundaries(): PublicEpisodeAudioMixPromotionSummary["boundaries"] { return { sourceTracksRemainImmutable: true, episodeProgramUnchanged: true, deliveryEncodingNotCreated: true, publicationNotStarted: true, withdrawalPreservesHistory: true }; }
function conflict(message: string, code: string): never { throw new EpisodeAudioMixReviewError(message, 409, code); }
function text(value: unknown, maximum = Number.POSITIVE_INFINITY) { return typeof value === "string" ? value.trim().slice(0, maximum) : ""; }
function object(value: unknown): Record<string, any> { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, any> : {}; }
function json(value: unknown): Prisma.InputJsonValue { return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue; }
function stableJson(value: unknown): string { if (value === null || value === undefined) return "null"; if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`; if (typeof value === "object") { const row = value as Record<string, unknown>; return `{${Object.keys(row).sort().map((key) => `${JSON.stringify(key)}:${stableJson(row[key])}`).join(",")}}`; } return JSON.stringify(value); }
function sha256(value: unknown) { return createHash("sha256").update(stableJson(value)).digest("hex"); }
function message(error: unknown) { return error instanceof Error && error.message.trim() ? error.message : String(error); }
