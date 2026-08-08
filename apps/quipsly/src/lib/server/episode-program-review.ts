import "server-only";

import { createHash } from "node:crypto";

import { Prisma } from "@prisma/client";
import {
  episodeProgramReviewCoverage,
  parseEpisodeProgramRenderJob,
  parseEpisodeProgramRenderResult,
  parseEpisodeProgramReviewPlaybackEvidence,
} from "@high-ground/quipsly-media-processing";

import { acquirePrismaAdvisoryTransactionLock } from "@/lib/server/prisma-advisory-lock";
import { readCurrentLocalExecutorIdentity } from "@/lib/server/local-executor-storage";
import { verifyLocalRenderResult } from "@/lib/server/episode-render-proof";

type Actor = { userId?: string | null; email: string };
type Coordinates = {
  prisma: any;
  projectSlug: string;
  episodeSlug: string;
  jobId: string;
};

export class EpisodeProgramReviewError extends Error {
  constructor(
    message: string,
    readonly status = 409,
    readonly code = "EPISODE_PROGRAM_REVIEW_HELD",
  ) {
    super(message);
    this.name = "EpisodeProgramReviewError";
  }
}

export type PublicEpisodeProgramReviewSummary = {
  latest: null | {
    id: string;
    jobId: string;
    decision: "approved" | "rejected";
    note: string | null;
    actorEmail: string;
    reviewedAt: string;
    watchedFraction: number;
  };
  approvalCount: number;
  rejectionCount: number;
  boundaries: {
    outputRemainsReviewCandidate: true;
    sourceMediaRemainsImmutable: true;
    masterNotCreated: true;
    portableUploadNotStarted: true;
    publicationNotStarted: true;
  };
};

export async function readEpisodeProgramReviewSummary(input: {
  prisma: any;
  jobId: string | null;
}): Promise<PublicEpisodeProgramReviewSummary> {
  if (!input.jobId) return emptySummary();
  const [latest, approvalCount, rejectionCount] = await Promise.all([
    input.prisma.studioEpisodeProgramReviewReceipt.findFirst({
      where: { renderJobId: input.jobId },
      orderBy: [{ occurredAt: "desc" }, { id: "desc" }],
    }),
    input.prisma.studioEpisodeProgramReviewReceipt.count({
      where: { renderJobId: input.jobId, decision: "APPROVED" },
    }),
    input.prisma.studioEpisodeProgramReviewReceipt.count({
      where: { renderJobId: input.jobId, decision: "REJECTED" },
    }),
  ]);
  return {
    latest: latest ? publicReceipt(latest) : null,
    approvalCount,
    rejectionCount,
    boundaries: boundaries(),
  };
}

export async function readAuthorizedEpisodeProgramReviewSummary(input: Coordinates) {
  const project = await input.prisma.studioProject.findFirst({
    where: { slug: input.projectSlug },
    select: { id: true },
  });
  if (!project) held("Nest not found for full-program review.", 404, "EPISODE_PROGRAM_REVIEW_PROJECT_NOT_FOUND");
  const [episode, row] = await Promise.all([
    input.prisma.studioEpisodeProduction.findFirst({
      where: { slug: input.episodeSlug, projectId: project.id },
      select: { id: true },
    }),
    input.prisma.studioWorkflowJob.findFirst({
      where: {
        id: input.jobId,
        projectId: project.id,
        type: "episode-program-render",
        source: "episode-editor.local-program-review",
      },
      select: { id: true, inputJson: true },
    }),
  ]);
  if (!episode || !row) held(
    "The full-program review is unavailable in this Episode.",
    404,
    "EPISODE_PROGRAM_REVIEW_CANDIDATE_NOT_FOUND",
  );
  const job = parseEpisodeProgramRenderJob(row.inputJson, row.id);
  if (job.projectId !== project.id || job.episodeProductionId !== episode.id) held(
    "The full-program review is outside this Episode.",
    404,
    "EPISODE_PROGRAM_REVIEW_CANDIDATE_NOT_FOUND",
  );
  return readEpisodeProgramReviewSummary({ prisma: input.prisma, jobId: row.id });
}

export async function appendEpisodeProgramReview(input: Coordinates & {
  actor: Actor;
  clientRequestId: string;
  decision: "approved" | "rejected";
  playbackEvidence: unknown;
  note?: string | null;
}) {
  const clientRequestId = safeRequestId(input.clientRequestId);
  const note = text(input.note, 2_000) || null;
  const context = await loadEpisodeProgramReviewContext(input);
  let evidence;
  try {
    evidence = parseEpisodeProgramReviewPlaybackEvidence(
      input.playbackEvidence,
      context.result.output.durationSeconds,
    );
  } catch (error) {
    throw new EpisodeProgramReviewError(
      message(error),
      400,
      "EPISODE_PROGRAM_REVIEW_EVIDENCE_INVALID",
    );
  }
  const coverage = episodeProgramReviewCoverage(
    evidence,
    context.result.output.durationSeconds,
  );
  if (input.decision === "approved" && !coverage.approvalReady) {
    throw new EpisodeProgramReviewError(
      "Approval requires an audible completed playthrough covering at least 90% of the rendered program, including its beginning, middle, and end.",
      409,
      "EPISODE_PROGRAM_REVIEW_INCOMPLETE",
    );
  }
  if (
    input.decision === "rejected"
    && (coverage.watchedBinCount === 0 || !note || note.length < 3)
  ) {
    throw new EpisodeProgramReviewError(
      "Rejecting a program requires watched playback evidence and a short note describing what should change.",
      409,
      "EPISODE_PROGRAM_REJECTION_EVIDENCE_REQUIRED",
    );
  }
  const actorEmail = input.actor.email.trim().toLowerCase();
  if (!actorEmail) {
    throw new EpisodeProgramReviewError(
      "A verified account email is required for a program decision.",
      400,
      "EPISODE_PROGRAM_REVIEW_ACTOR_REQUIRED",
    );
  }
  const identity = exactIdentity(context);
  const request = {
    schema: "quipsly-episode-program-review-request-v1",
    projectId: context.project.id,
    episodeProductionId: context.episode.id,
    renderJobId: context.job.jobId,
    actorUserId: text(input.actor.userId, 180) || null,
    actorEmail,
    clientRequestId,
    decision: input.decision,
    ...identity,
    evidence,
    coverage,
    note,
  };
  const requestSha256 = sha256(request);
  const existing = await input.prisma.studioEpisodeProgramReviewReceipt.findUnique({
    where: {
      projectId_actorEmail_clientRequestId: {
        projectId: context.project.id,
        actorEmail,
        clientRequestId,
      },
    },
  });
  if (existing) {
    if (existing.requestSha256 !== requestSha256) conflict(
      "That request id is already bound to a different full-program decision.",
      "EPISODE_PROGRAM_REVIEW_IDEMPOTENCY_CONFLICT",
    );
    return {
      ok: true,
      idempotentReplay: true,
      receipt: publicReceipt(existing),
      review: await readEpisodeProgramReviewSummary({
        prisma: input.prisma,
        jobId: context.job.jobId,
      }),
    };
  }

  const receipt = await input.prisma.$transaction(async (tx: any) => {
    await acquirePrismaAdvisoryTransactionLock(
      tx,
      `episode-program-review:${context.job.jobId}:${actorEmail}`,
    );
    const replay = await tx.studioEpisodeProgramReviewReceipt.findUnique({
      where: {
        projectId_actorEmail_clientRequestId: {
          projectId: context.project.id,
          actorEmail,
          clientRequestId,
        },
      },
    });
    if (replay) {
      if (replay.requestSha256 !== requestSha256) conflict(
        "That request id won a race with different full-program evidence.",
        "EPISODE_PROGRAM_REVIEW_IDEMPOTENCY_CONFLICT",
      );
      return replay;
    }
    const [currentBranch, currentJob] = await Promise.all([
      tx.studioEditBranch.findUnique({
        where: { id: context.job.branchId },
        select: { headRevision: true },
      }),
      tx.studioWorkflowJob.findUnique({
        where: { id: context.job.jobId },
        select: { status: true, inputJson: true, resultJson: true },
      }),
    ]);
    if (!currentBranch || currentBranch.headRevision !== context.job.branchRevision) {
      conflict(
        "The shared edit changed after this review candidate rendered. Render and review the current revision.",
        "EPISODE_PROGRAM_REVIEW_EDIT_STALE",
      );
    }
    if (!currentJob || currentJob.status !== "completed") {
      conflict(
        "The registered review candidate changed before the decision could be saved.",
        "EPISODE_PROGRAM_REVIEW_CANDIDATE_STALE",
      );
    }
    const lockedJob = parseEpisodeProgramRenderJob(currentJob.inputJson, context.job.jobId);
    const lockedResult = parseEpisodeProgramRenderResult(
      object(currentJob.resultJson).receipt,
      lockedJob,
    );
    if (!sameIdentity(identity, exactIdentity({ ...context, job: lockedJob, result: lockedResult }))) {
      conflict(
        "The exact rendered bytes or edit evidence changed before the decision could be saved.",
        "EPISODE_PROGRAM_REVIEW_CANDIDATE_STALE",
      );
    }
    return tx.studioEpisodeProgramReviewReceipt.create({
      data: {
        projectId: context.project.id,
        episodeProductionId: context.episode.id,
        renderJobId: context.job.jobId,
        actorUserId: text(input.actor.userId, 180) || null,
        actorEmail,
        clientRequestId,
        decision: input.decision === "approved" ? "APPROVED" : "REJECTED",
        ...identity,
        outputSizeBytes: BigInt(identity.outputSizeBytes),
        requestSha256,
        evidenceJson: json({
          ...evidence,
          coverage,
          clientTrackedPlaybackIsNotProofOfAttentionOrAudibility: true,
          approvalDoesNotCreateMaster: true,
          approvalDoesNotUploadOrPublish: true,
          sourceMediaRemainsImmutable: true,
        }),
        note,
        occurredAt: new Date(),
      },
    });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

  return {
    ok: true,
    idempotentReplay: false,
    receipt: publicReceipt(receipt),
    review: await readEpisodeProgramReviewSummary({
      prisma: input.prisma,
      jobId: context.job.jobId,
    }),
  };
}

export async function loadEpisodeProgramReviewContext(input: Coordinates) {
  const project = await input.prisma.studioProject.findFirst({
    where: { slug: input.projectSlug },
    select: { id: true },
  });
  if (!project) held("Nest not found for full-program review.", 404, "EPISODE_PROGRAM_REVIEW_PROJECT_NOT_FOUND");
  const [episode, row] = await Promise.all([
    input.prisma.studioEpisodeProduction.findFirst({
      where: { slug: input.episodeSlug, projectId: project.id },
      select: { id: true, projectId: true },
    }),
    input.prisma.studioWorkflowJob.findFirst({
      where: {
        id: input.jobId,
        projectId: project.id,
        type: "episode-program-render",
        source: "episode-editor.local-program-review",
        status: "completed",
      },
    }),
  ]);
  if (!episode || !row) held(
    "The completed full-program candidate is unavailable in this Episode.",
    404,
    "EPISODE_PROGRAM_REVIEW_CANDIDATE_NOT_FOUND",
  );
  const job = parseEpisodeProgramRenderJob(row.inputJson, row.id);
  const result = parseEpisodeProgramRenderResult(object(row.resultJson).receipt, job);
  const registration = object(object(row.resultJson).registration);
  if (
    job.projectId !== project.id
    || job.episodeProductionId !== episode.id
    || registration.schema !== "quipsly-episode-program-render-registration-v1"
    || registration.outputIsReviewCandidate !== true
    || registration.outputIsNotApprovedMaster !== true
    || text(registration.playbackUrl, 2_000) === ""
  ) held(
    "The program candidate has no complete protected-playback registration.",
    409,
    "EPISODE_PROGRAM_REVIEW_REGISTRATION_INVALID",
  );
  const [branch, currentExecutor, source] = await Promise.all([
    input.prisma.studioEditBranch.findUnique({
      where: { id: job.branchId },
      select: { headRevision: true },
    }),
    readCurrentLocalExecutorIdentity(),
    input.prisma.studioVideoSource.findUnique({
      where: { id: text(registration.sourceId, 180) },
      select: { id: true, url: true, providerSourceId: true },
    }),
  ]);
  if (!branch || branch.headRevision !== job.branchRevision) held(
    "The shared edit changed after this candidate rendered.",
    409,
    "EPISODE_PROGRAM_REVIEW_EDIT_STALE",
  );
  if (
    !currentExecutor
    || currentExecutor.nodeId !== job.executionTarget.custodianNodeId
    || currentExecutor.storageScopeId !== job.executionTarget.storageScopeId
  ) held(
    "Open this review on the exact Mac and media workspace that own the rendered bytes.",
    409,
    "EPISODE_PROGRAM_REVIEW_EXECUTOR_MISMATCH",
  );
  if (
    !source
    || source.url !== registration.playbackUrl
    || source.providerSourceId !== await verifyLocalRenderResult(
      result.output.locator,
      result.output.sha256,
      result.output.sizeBytes,
    )
  ) held(
    "The protected playback source no longer matches the verified output receipt.",
    409,
    "EPISODE_PROGRAM_REVIEW_OUTPUT_DRIFT",
  );
  return { project, episode, row, job, result, registration, source };
}

function exactIdentity(context: { job: ReturnType<typeof parseEpisodeProgramRenderJob>; result: ReturnType<typeof parseEpisodeProgramRenderResult> }) {
  return {
    branchId: context.job.branchId,
    branchRevision: context.job.branchRevision,
    timelineFingerprintSha256: context.job.timelineFingerprintSha256,
    sourceProjectionFingerprintSha256: context.job.sourceProjectionFingerprintSha256,
    editStateFingerprintSha256: context.job.editStateFingerprintSha256,
    manifestSha256: context.job.manifestSha256,
    outputSha256: context.result.output.sha256,
    outputGeneration: context.result.output.generation,
    outputSizeBytes: context.result.output.sizeBytes,
  };
}
function sameIdentity(left: ReturnType<typeof exactIdentity>, right: ReturnType<typeof exactIdentity>) { return Object.keys(left).every((key) => left[key as keyof typeof left] === right[key as keyof typeof right]); }
function publicReceipt(row: any) { const evidence = object(row.evidenceJson); const coverage = object(evidence.coverage); return { id: String(row.id), jobId: String(row.renderJobId), decision: row.decision === "APPROVED" ? "approved" as const : "rejected" as const, note: text(row.note, 2_000) || null, actorEmail: String(row.actorEmail), reviewedAt: row.occurredAt?.toISOString?.() ?? String(row.occurredAt), watchedFraction: Number(coverage.watchedFraction) || 0 }; }
function emptySummary(): PublicEpisodeProgramReviewSummary { return { latest: null, approvalCount: 0, rejectionCount: 0, boundaries: boundaries() }; }
function boundaries(): PublicEpisodeProgramReviewSummary["boundaries"] { return { outputRemainsReviewCandidate: true, sourceMediaRemainsImmutable: true, masterNotCreated: true, portableUploadNotStarted: true, publicationNotStarted: true }; }
function safeRequestId(value: string) { const result = value.trim(); if (!/^[A-Za-z0-9:_-]{8,220}$/.test(result)) held("A stable program review request id is required.", 400, "EPISODE_PROGRAM_REVIEW_REQUEST_INVALID"); return result; }
function text(value: unknown, maximum = Number.POSITIVE_INFINITY) { return typeof value === "string" ? value.trim().slice(0, maximum) : ""; }
function object(value: unknown): Record<string, any> { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, any> : {}; }
function json(value: unknown): Prisma.InputJsonValue { return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue; }
function stable(value: unknown): unknown { if (Array.isArray(value)) return value.map(stable); if (!value || typeof value !== "object") return value; return Object.fromEntries(Object.entries(value as Record<string, unknown>).sort(([left], [right]) => left.localeCompare(right)).map(([key, item]) => [key, stable(item)])); }
function sha256(value: unknown) { return createHash("sha256").update(JSON.stringify(stable(value))).digest("hex"); }
function message(error: unknown) { return error instanceof Error && error.message.trim() ? error.message : String(error); }
function conflict(message: string, code: string): never { throw new EpisodeProgramReviewError(message, 409, code); }
function held(message: string, status: number, code: string): never { throw new EpisodeProgramReviewError(message, status, code); }
