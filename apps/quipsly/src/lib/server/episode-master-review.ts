import "server-only";

import { createHash } from "node:crypto";

import { Prisma } from "@prisma/client";
import {
  episodeProgramReviewCoverage,
  parseEpisodeMasterConformJob,
  parseEpisodeMasterConformResult,
  parseEpisodeProgramReviewPlaybackEvidence,
} from "@high-ground/quipsly-media-processing";

import { acquirePrismaAdvisoryTransactionLock } from "@/lib/server/prisma-advisory-lock";
import { readCurrentLocalExecutorIdentity } from "@/lib/server/local-executor-storage";
import { verifyLocalRenderResult } from "@/lib/server/episode-render-proof";

type Coordinates = { prisma: any; projectSlug: string; episodeSlug: string; jobId: string };

export class EpisodeMasterReviewError extends Error {
  constructor(message: string, readonly status = 409, readonly code = "EPISODE_MASTER_REVIEW_HELD") {
    super(message);
    this.name = "EpisodeMasterReviewError";
  }
}

export type PublicEpisodeMasterReviewSummary = {
  latest: null | { id: string; jobId: string; decision: "approved" | "rejected"; note: string | null; actorEmail: string; reviewedAt: string; watchedFraction: number };
  approvalCount: number;
  rejectionCount: number;
  boundaries: {
    outputRemainsMasterCandidate: true;
    sourceMediaRemainsImmutable: true;
    portableUploadNotStarted: true;
    publicationNotStarted: true;
  };
};

export async function readAuthorizedEpisodeMasterReviewSummary(input: Coordinates) {
  await loadEpisodeMasterReviewContext(input);
  return readEpisodeMasterReviewSummary({ prisma: input.prisma, jobId: input.jobId });
}

export async function readEpisodeMasterReviewSummary(input: { prisma: any; jobId: string | null }): Promise<PublicEpisodeMasterReviewSummary> {
  if (!input.jobId) return emptySummary();
  const [latest, approvalCount, rejectionCount] = await Promise.all([
    input.prisma.studioEpisodeMasterReviewReceipt.findFirst({ where: { renderJobId: input.jobId }, orderBy: [{ occurredAt: "desc" }, { id: "desc" }] }),
    input.prisma.studioEpisodeMasterReviewReceipt.count({ where: { renderJobId: input.jobId, decision: "APPROVED" } }),
    input.prisma.studioEpisodeMasterReviewReceipt.count({ where: { renderJobId: input.jobId, decision: "REJECTED" } }),
  ]);
  return { latest: latest ? publicReceipt(latest) : null, approvalCount, rejectionCount, boundaries: boundaries() };
}

export async function appendEpisodeMasterReview(input: Coordinates & {
  actor: { userId?: string | null; email: string };
  clientRequestId: string;
  decision: "approved" | "rejected";
  playbackEvidence: unknown;
  note?: string | null;
}) {
  const context = await loadEpisodeMasterReviewContext(input);
  const clientRequestId = safeRequestId(input.clientRequestId);
  const note = text(input.note, 2_000) || null;
  let evidence;
  try {
    evidence = parseEpisodeProgramReviewPlaybackEvidence(input.playbackEvidence, context.result.output.durationSeconds);
  } catch (error) {
    throw new EpisodeMasterReviewError(message(error), 400, "EPISODE_MASTER_REVIEW_EVIDENCE_INVALID");
  }
  const coverage = episodeProgramReviewCoverage(evidence, context.result.output.durationSeconds);
  if (input.decision === "approved" && !coverage.approvalReady) throw new EpisodeMasterReviewError(
    "Master approval requires an audible completed playthrough covering at least 90%, including the beginning, middle, and end.",
    409,
    "EPISODE_MASTER_REVIEW_INCOMPLETE",
  );
  if (input.decision === "rejected" && (coverage.watchedBinCount === 0 || !note || note.length < 3)) throw new EpisodeMasterReviewError(
    "Requesting master changes requires watched playback evidence and a short note.",
    409,
    "EPISODE_MASTER_REJECTION_EVIDENCE_REQUIRED",
  );
  const actorEmail = input.actor.email.trim().toLowerCase();
  if (!actorEmail) throw new EpisodeMasterReviewError("A verified account email is required.", 400, "EPISODE_MASTER_REVIEW_ACTOR_REQUIRED");
  const identity = exactIdentity(context);
  const request = { schema: "quipsly-episode-master-review-request-v1", projectId: context.project.id, episodeProductionId: context.episode.id, renderJobId: context.job.jobId, actorUserId: text(input.actor.userId, 180) || null, actorEmail, clientRequestId, decision: input.decision, ...identity, evidence, coverage, note };
  const requestSha256 = sha256(request);
  const existing = await input.prisma.studioEpisodeMasterReviewReceipt.findUnique({
    where: { projectId_actorEmail_clientRequestId: { projectId: context.project.id, actorEmail, clientRequestId } },
  });
  if (existing) {
    if (existing.requestSha256 !== requestSha256) conflict("That request id is already bound to different master evidence.", "EPISODE_MASTER_REVIEW_IDEMPOTENCY_CONFLICT");
    return { ok: true, idempotentReplay: true, receipt: publicReceipt(existing), review: await readEpisodeMasterReviewSummary({ prisma: input.prisma, jobId: context.job.jobId }) };
  }
  const receipt = await input.prisma.$transaction(async (tx: any) => {
    await acquirePrismaAdvisoryTransactionLock(tx, `episode-master-review:${context.job.jobId}:${actorEmail}`);
    const replay = await tx.studioEpisodeMasterReviewReceipt.findUnique({ where: { projectId_actorEmail_clientRequestId: { projectId: context.project.id, actorEmail, clientRequestId } } });
    if (replay) {
      if (replay.requestSha256 !== requestSha256) conflict("That request id won a race with different master evidence.", "EPISODE_MASTER_REVIEW_IDEMPOTENCY_CONFLICT");
      return replay;
    }
    const [currentBranch, currentJob, latestProgramDecision] = await Promise.all([
      tx.studioEditBranch.findUnique({ where: { id: context.job.approval.branchId }, select: { headRevision: true } }),
      tx.studioWorkflowJob.findUnique({ where: { id: context.job.jobId }, select: { status: true, inputJson: true, resultJson: true } }),
      tx.studioEpisodeProgramReviewReceipt.findFirst({ where: { renderJobId: context.job.approval.reviewJobId }, orderBy: [{ occurredAt: "desc" }, { id: "desc" }] }),
    ]);
    if (currentBranch?.headRevision !== context.job.approval.branchRevision || latestProgramDecision?.id !== context.job.approval.receiptId || latestProgramDecision.decision !== "APPROVED") conflict("The edit or program approval changed after this master rendered.", "EPISODE_MASTER_REVIEW_APPROVAL_STALE");
    if (!currentJob || currentJob.status !== "completed") conflict("The registered master candidate changed before review was saved.", "EPISODE_MASTER_REVIEW_CANDIDATE_STALE");
    const lockedJob = parseEpisodeMasterConformJob(currentJob.inputJson, context.job.jobId);
    const lockedResult = parseEpisodeMasterConformResult(object(currentJob.resultJson).receipt, lockedJob);
    if (!sameIdentity(identity, exactIdentity({ ...context, job: lockedJob, result: lockedResult }))) conflict("The exact master bytes or approval evidence changed before review was saved.", "EPISODE_MASTER_REVIEW_CANDIDATE_STALE");
    return tx.studioEpisodeMasterReviewReceipt.create({
      data: {
        projectId: context.project.id,
        episodeProductionId: context.episode.id,
        renderJobId: context.job.jobId,
        programApprovalReceiptId: context.job.approval.receiptId,
        actorUserId: text(input.actor.userId, 180) || null,
        actorEmail,
        clientRequestId,
        decision: input.decision === "approved" ? "APPROVED" : "REJECTED",
        ...identity,
        outputSizeBytes: BigInt(identity.outputSizeBytes),
        requestSha256,
        evidenceJson: json({ ...evidence, coverage, clientTrackedPlaybackIsNotProofOfAttentionOrAudibility: true, approvalPermitsOnlyLaterPromotionPlanning: true, approvalDoesNotUploadOrPublish: true, sourceMediaRemainsImmutable: true }),
        note,
        occurredAt: new Date(),
      },
    });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  return { ok: true, idempotentReplay: false, receipt: publicReceipt(receipt), review: await readEpisodeMasterReviewSummary({ prisma: input.prisma, jobId: context.job.jobId }) };
}

export async function loadEpisodeMasterReviewContext(input: Coordinates) {
  const project = await input.prisma.studioProject.findFirst({ where: { slug: input.projectSlug }, select: { id: true } });
  if (!project) held("Nest not found for master review.", 404, "EPISODE_MASTER_REVIEW_PROJECT_NOT_FOUND");
  const [episode, row] = await Promise.all([
    input.prisma.studioEpisodeProduction.findFirst({ where: { slug: input.episodeSlug, projectId: project.id }, select: { id: true, projectId: true } }),
    input.prisma.studioWorkflowJob.findFirst({ where: { id: input.jobId, projectId: project.id, type: "episode-master-conform", source: "episode-editor.local-approved-master", status: "completed" } }),
  ]);
  if (!episode || !row) held("The completed 4K master candidate is unavailable in this Episode.", 404, "EPISODE_MASTER_REVIEW_CANDIDATE_NOT_FOUND");
  const job = parseEpisodeMasterConformJob(row.inputJson, row.id);
  const result = parseEpisodeMasterConformResult(object(row.resultJson).receipt, job);
  const registration = object(object(row.resultJson).registration);
  if (job.projectId !== project.id || job.episodeProductionId !== episode.id || registration.schema !== "quipsly-episode-master-conform-registration-v1" || registration.outputIsUnapprovedMasterCandidate !== true || text(registration.playbackUrl, 2_000) === "") held("The master candidate has no complete protected-playback registration.", 409, "EPISODE_MASTER_REVIEW_REGISTRATION_INVALID");
  const [branch, latestProgramDecision, executor, source] = await Promise.all([
    input.prisma.studioEditBranch.findUnique({ where: { id: job.approval.branchId }, select: { headRevision: true } }),
    input.prisma.studioEpisodeProgramReviewReceipt.findFirst({ where: { renderJobId: job.approval.reviewJobId }, orderBy: [{ occurredAt: "desc" }, { id: "desc" }] }),
    readCurrentLocalExecutorIdentity(),
    input.prisma.studioVideoSource.findUnique({ where: { id: text(registration.sourceId, 180) }, select: { id: true, url: true, providerSourceId: true } }),
  ]);
  if (branch?.headRevision !== job.approval.branchRevision || latestProgramDecision?.id !== job.approval.receiptId || latestProgramDecision.decision !== "APPROVED") held("The edit or program approval changed after this master rendered.", 409, "EPISODE_MASTER_REVIEW_APPROVAL_STALE");
  if (!executor || executor.nodeId !== job.executionTarget.custodianNodeId || executor.storageScopeId !== job.executionTarget.storageScopeId) held("Open this master on the exact Mac and media workspace that own its bytes.", 409, "EPISODE_MASTER_REVIEW_EXECUTOR_MISMATCH");
  if (!source || source.url !== registration.playbackUrl || source.providerSourceId !== await verifyLocalRenderResult(result.output.locator, result.output.sha256, result.output.sizeBytes)) held("The protected master source no longer matches its verified output receipt.", 409, "EPISODE_MASTER_REVIEW_OUTPUT_DRIFT");
  return { project, episode, row, job, result, registration, source };
}

function exactIdentity(context: { job: ReturnType<typeof parseEpisodeMasterConformJob>; result: ReturnType<typeof parseEpisodeMasterConformResult> }) {
  return { branchId: context.job.approval.branchId, branchRevision: context.job.approval.branchRevision, timelineFingerprintSha256: context.job.approval.timelineFingerprintSha256, sourceProjectionFingerprintSha256: context.job.approval.sourceProjectionFingerprintSha256, editStateFingerprintSha256: context.job.approval.editStateFingerprintSha256, approvedProgramManifestSha256: context.job.approval.reviewManifestSha256, masterManifestSha256: context.job.manifestSha256, outputSha256: context.result.output.sha256, outputGeneration: context.result.output.generation, outputSizeBytes: context.result.output.sizeBytes };
}
function sameIdentity(left: ReturnType<typeof exactIdentity>, right: ReturnType<typeof exactIdentity>) { return Object.keys(left).every((key) => left[key as keyof typeof left] === right[key as keyof typeof right]); }
function publicReceipt(row: any) { const evidence = object(row.evidenceJson); const coverage = object(evidence.coverage); return { id: String(row.id), jobId: String(row.renderJobId), decision: row.decision === "APPROVED" ? "approved" as const : "rejected" as const, note: text(row.note, 2_000) || null, actorEmail: String(row.actorEmail), reviewedAt: row.occurredAt?.toISOString?.() ?? String(row.occurredAt), watchedFraction: Number(coverage.watchedFraction) || 0 }; }
function emptySummary(): PublicEpisodeMasterReviewSummary { return { latest: null, approvalCount: 0, rejectionCount: 0, boundaries: boundaries() }; }
function boundaries(): PublicEpisodeMasterReviewSummary["boundaries"] { return { outputRemainsMasterCandidate: true, sourceMediaRemainsImmutable: true, portableUploadNotStarted: true, publicationNotStarted: true }; }
function safeRequestId(value: string) { const result = value.trim(); if (!/^[A-Za-z0-9:_-]{8,220}$/.test(result)) held("A stable master review request id is required.", 400, "EPISODE_MASTER_REVIEW_REQUEST_INVALID"); return result; }
function text(value: unknown, maximum = Number.POSITIVE_INFINITY) { return typeof value === "string" ? value.trim().slice(0, maximum) : ""; }
function object(value: unknown): Record<string, any> { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, any> : {}; }
function json(value: unknown): Prisma.InputJsonValue { return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue; }
function stable(value: unknown): unknown { if (Array.isArray(value)) return value.map(stable); if (!value || typeof value !== "object") return value; return Object.fromEntries(Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, stable(item)])); }
function sha256(value: unknown) { return createHash("sha256").update(JSON.stringify(stable(value))).digest("hex"); }
function message(error: unknown) { return error instanceof Error && error.message.trim() ? error.message : String(error); }
function conflict(message: string, code: string): never { throw new EpisodeMasterReviewError(message, 409, code); }
function held(message: string, status: number, code: string): never { throw new EpisodeMasterReviewError(message, status, code); }
