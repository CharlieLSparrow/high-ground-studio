import { randomUUID } from "node:crypto";

import {
  TRANSCRIPT_GOAL_REVIEW_DECISIONS,
  TRANSCRIPT_PACKET_SOURCE,
  isTranscriptGoalReviewDecision,
  type TranscriptGoalReviewDecision,
} from "@high-ground/quipsly-domain/coaching-packet";
import { TRANSCRIPT_DERIVED_GOAL_SCHEMA } from "@high-ground/quipsly-domain/transcript-derived-task";
import { NextResponse } from "next/server";

import { getPrismaClient } from "@/lib/prisma";
import { packetSnapshotMatches, selectLatestCorrelatedPacketNotes } from "@/lib/server/coaching-packets";
import { mobileCaptureTranscriptProcessingGate } from "@/lib/server/mobile-capture-processing-gates";
import { acquirePrismaAdvisoryTransactionLock } from "@/lib/server/prisma-advisory-lock";
import { getQuipslySessionFromRequest } from "@/lib/server/quipsly-session";
import { TranscriptCorrectionError } from "@/lib/server/transcript-corrections";
import {
  createTranscriptDerivedGoalInTransaction,
  transcriptDerivedGoalBoundaries,
} from "../../goals/route-implementation";
import { buildPacketGoalCandidates } from "../route-implementation";

const REVIEW_RECEIPT_KIND = "quipsly-goal-candidate-review-receipt-v1";
const MAX_GOAL_TITLE_LENGTH = 240;
const MAX_GOAL_DESCRIPTION_LENGTH = 5_000;
const MAX_REVIEW_NOTE_LENGTH = 2_000;

class GoalReviewBoundaryError extends Error {
  constructor(readonly status: number, readonly errorCode: string, message: string) {
    super(message);
  }
}

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function objects(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is Record<string, unknown> => Object.keys(object(item)).length > 0) : [];
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function hasOwn(value: Record<string, unknown>, key: string) {
  return Object.prototype.hasOwnProperty.call(value, key);
}

async function readJson(request: Request) {
  try { return object(await request.json()); } catch { return {}; }
}

function decision(value: unknown): TranscriptGoalReviewDecision | null {
  const normalized = text(value).toUpperCase();
  return isTranscriptGoalReviewDecision(normalized) ? normalized : null;
}

function roomAccess(userId: string, isStaff: boolean, roomId: string) {
  return isStaff ? { id: roomId } : {
    id: roomId,
    OR: [
      { createdByUserId: userId },
      { participants: { some: { userId } } },
      { booking: { clientUserId: userId } },
      { booking: { coachUserId: userId } },
    ],
  };
}

function boundaries() {
  return {
    explicitHumanDecision: true,
    acceptCreatesOneActorOwnedGoal: true,
    editRejectDeferCreateNoGoal: true,
    ...transcriptDerivedGoalBoundaries(),
  };
}

function goalMatches(goal: any, input: {
  actorId: string;
  roomId: string;
  clientRequestId: string;
}) {
  const source = object(goal?.sourceJson);
  return goal?.ownerUserId === input.actorId
    && goal?.roomId === input.roomId
    && source.schema === TRANSCRIPT_DERIVED_GOAL_SCHEMA
    && text(source.clientRequestId) === input.clientRequestId
    && text(source.createdByUserId) === input.actorId;
}

export async function POST(request: Request) {
  const session = await getQuipslySessionFromRequest(request);
  if (!session?.user) {
    return NextResponse.json({ ok: false, errorCode: "AUTH_REQUIRED", error: "Sign in before reviewing a goal candidate." }, { status: 401 });
  }

  const body = await readJson(request);
  const roomId = text(body.callRoomId) || text(body.roomId);
  const transcriptJobId = text(body.transcriptJobId);
  const recordingAssetId = text(body.recordingAssetId);
  const summaryNoteId = text(body.summaryNoteId);
  const packetBuildId = text(body.packetBuildId);
  const goalCandidateId = text(body.goalCandidateId);
  const reviewDecision = decision(body.decision);
  const reviewNote = text(body.note) || null;

  if (!roomId || !transcriptJobId || !recordingAssetId || !summaryNoteId || !packetBuildId || !goalCandidateId) {
    return NextResponse.json({
      ok: false,
      errorCode: "GOAL_CANDIDATE_EVIDENCE_REQUIRED",
      error: "Room, transcript, recording asset, summary, packet build, and goal candidate evidence are required.",
    }, { status: 400 });
  }
  if (!reviewDecision) {
    return NextResponse.json({
      ok: false,
      errorCode: "GOAL_CANDIDATE_DECISION_REQUIRED",
      error: "Choose ACCEPT, EDIT, REJECT, or DEFER.",
      allowedDecisions: TRANSCRIPT_GOAL_REVIEW_DECISIONS,
    }, { status: 400 });
  }
  if (reviewDecision === "EDIT" && !hasOwn(body, "title") && !hasOwn(body, "description")) {
    return NextResponse.json({ ok: false, errorCode: "GOAL_CANDIDATE_EDIT_REQUIRED", error: "Edit the candidate title or definition." }, { status: 400 });
  }
  if (hasOwn(body, "title") && !text(body.title)) {
    return NextResponse.json({ ok: false, errorCode: "GOAL_CANDIDATE_TITLE_REQUIRED", error: "An edited goal title cannot be empty." }, { status: 400 });
  }
  if (text(body.title).length > MAX_GOAL_TITLE_LENGTH) {
    return NextResponse.json({ ok: false, errorCode: "GOAL_CANDIDATE_TITLE_TOO_LONG", error: `Goal titles may be at most ${MAX_GOAL_TITLE_LENGTH} characters.` }, { status: 400 });
  }
  if (hasOwn(body, "description") && typeof body.description !== "string") {
    return NextResponse.json({ ok: false, errorCode: "GOAL_CANDIDATE_DESCRIPTION_INVALID", error: "The goal definition must be text." }, { status: 400 });
  }
  if (text(body.description).length > MAX_GOAL_DESCRIPTION_LENGTH) {
    return NextResponse.json({ ok: false, errorCode: "GOAL_CANDIDATE_DESCRIPTION_TOO_LONG", error: `Goal definitions may be at most ${MAX_GOAL_DESCRIPTION_LENGTH} characters.` }, { status: 400 });
  }
  if (reviewNote && reviewNote.length > MAX_REVIEW_NOTE_LENGTH) {
    return NextResponse.json({ ok: false, errorCode: "GOAL_CANDIDATE_REVIEW_NOTE_TOO_LONG", error: `Review notes may be at most ${MAX_REVIEW_NOTE_LENGTH} characters.` }, { status: 400 });
  }

  const prisma = getPrismaClient() as any;
  const actor = {
    id: session.user.id,
    email: session.user.primaryEmail || session.user.email,
    isStaff: session.user.isStaff === true,
  };
  const room = await prisma.callRoom.findFirst({ where: roomAccess(actor.id, actor.isStaff, roomId), select: { id: true } });
  if (!room) {
    return NextResponse.json({ ok: false, errorCode: "ROOM_ACCESS_DENIED", error: "You do not have access to this packet room." }, { status: 404 });
  }

  try {
    const result = await prisma.$transaction(async (tx: any) => {
      await acquirePrismaAdvisoryTransactionLock(tx, `transcript-job-packet-source:${transcriptJobId}`);
      const summaryCandidates = await tx.coachingNote.findMany({
        where: { roomId, kind: "SUMMARY" },
        orderBy: { createdAt: "desc" },
        select: { id: true, roomId: true, sourceJson: true, createdAt: true, updatedAt: true },
      });
      const transcriptSummaries = summaryCandidates.filter((summary: any) => {
        const source = object(summary.sourceJson);
        return source.source === TRANSCRIPT_PACKET_SOURCE && text(source.transcriptJobId) === transcriptJobId;
      });
      const latestSummary = selectLatestCorrelatedPacketNotes(transcriptSummaries).summary;
      const latestSource = object(latestSummary?.sourceJson);
      if (!latestSummary || latestSummary.id !== summaryNoteId || text(latestSource.packetBuildId) !== packetBuildId) {
        throw new GoalReviewBoundaryError(409, "STALE_PACKET_BUILD", "Refresh the packet before reviewing this goal; a newer or different packet build is current.");
      }

      await tx.$queryRaw`SELECT "id" FROM "CoachingNote" WHERE "id" = ${summaryNoteId} FOR UPDATE`;
      const lockedSummary = await tx.coachingNote.findUnique({ where: { id: summaryNoteId } });
      const lockedSource = object(lockedSummary?.sourceJson);
      if (
        !lockedSummary
        || lockedSummary.roomId !== roomId
        || lockedSource.source !== TRANSCRIPT_PACKET_SOURCE
        || text(lockedSource.transcriptJobId) !== transcriptJobId
        || text(lockedSource.recordingAssetId) !== recordingAssetId
        || text(lockedSource.packetBuildId) !== packetBuildId
      ) {
        throw new GoalReviewBoundaryError(409, "STALE_PACKET_BUILD", "The packet summary changed before goal review completed.");
      }

      const transcriptJob = await tx.transcriptJob.findFirst({
        where: { id: transcriptJobId, roomId },
        include: {
          asset: true,
          segments: {
            orderBy: { segmentIndex: "asc" },
            include: {
              corrections: { where: { status: "accepted" }, orderBy: { updatedAt: "desc" } },
              verifications: { orderBy: { createdAt: "desc" } },
            },
          },
        },
      });
      if (!transcriptJob || transcriptJob.status !== "COMPLETED" || transcriptJob.assetId !== recordingAssetId || transcriptJob.asset?.id !== recordingAssetId) {
        throw new GoalReviewBoundaryError(409, "TRANSCRIPT_RECORDING_EVIDENCE_REQUIRED", "Goal review requires a completed transcript bound to the requested recording asset.");
      }
      const gate = await mobileCaptureTranscriptProcessingGate({ prisma: tx, recordingAsset: transcriptJob.asset });
      if (!gate.allowed) throw new GoalReviewBoundaryError(409, gate.errorCode, gate.error);
      if (!packetSnapshotMatches(lockedSource, transcriptJob.segments)) {
        throw new GoalReviewBoundaryError(409, "TRANSCRIPT_REVIEW_CHANGED", "Transcript review changed after this packet was built. Build a new packet before reviewing the goal candidate.");
      }
      const transcriptSnapshotSha256 = text(object(lockedSource.transcriptSnapshot).sha256);

      const actorGoals = await tx.goal.findMany({ where: { ownerUserId: actor.id, roomId } });
      const candidates = buildPacketGoalCandidates({ summary: lockedSummary, latestTranscriptJob: transcriptJob, goals: actorGoals, packetBuildId });
      const candidate = candidates.find((item) => item.id === goalCandidateId);
      if (!candidate
          || candidate.roomId !== roomId
          || candidate.transcriptJobId !== transcriptJobId
          || candidate.recordingAssetId !== recordingAssetId
          || candidate.packetBuildId !== packetBuildId) {
        throw new GoalReviewBoundaryError(409, "STALE_GOAL_CANDIDATE", "The goal candidate is missing from the current packet build. Refresh before reviewing it.");
      }

      const receipts = objects(lockedSource.goalCandidateReviewReceipts);
      const acceptedReceipt = receipts.find((receipt) => text(receipt.goalCandidateId) === goalCandidateId && text(receipt.decision) === "ACCEPT");
      if (acceptedReceipt) {
        if (reviewDecision !== "ACCEPT") {
          throw new GoalReviewBoundaryError(409, "GOAL_CANDIDATE_ALREADY_ACCEPTED", "This candidate already became a Goal and cannot be edited, rejected, or deferred as an uncommitted draft.");
        }
        const acceptedGoal = await tx.goal.findUnique({ where: { id: text(acceptedReceipt.goalId) } });
        if (
          acceptedReceipt.kind !== REVIEW_RECEIPT_KIND
          || text(acceptedReceipt.transcriptJobId) !== transcriptJobId
          || text(acceptedReceipt.recordingAssetId) !== recordingAssetId
          || text(acceptedReceipt.packetBuildId) !== packetBuildId
          || text(acceptedReceipt.summaryNoteId) !== summaryNoteId
          || text(acceptedReceipt.roomId) !== roomId
          || text(acceptedReceipt.transcriptSnapshotSha256) !== transcriptSnapshotSha256
          || !goalMatches(acceptedGoal, { actorId: actor.id, roomId, clientRequestId: candidate.clientRequestId })
        ) {
          throw new GoalReviewBoundaryError(409, "GOAL_CANDIDATE_RECEIPT_MISMATCH", "The accepted candidate receipt no longer matches one canonical goal.");
        }
        return { candidate, receipt: acceptedReceipt, goal: acceptedGoal, idempotentReplay: true };
      }
      if (candidate.committedGoalId && reviewDecision !== "ACCEPT") {
        throw new GoalReviewBoundaryError(409, "GOAL_CANDIDATE_ALREADY_ACCEPTED", "This candidate is already bound to a canonical Goal.");
      }

      const before = { title: candidate.suggestedTitle, description: candidate.suggestedDescription };
      const after = {
        title: hasOwn(body, "title") ? text(body.title) : before.title,
        description: hasOwn(body, "description") ? text(body.description) : before.description,
      };
      const reviewedAt = new Date().toISOString();
      const receiptId = randomUUID();
      let goal: any = null;
      let goalReplay = false;
      if (reviewDecision === "ACCEPT") {
        const creation = await createTranscriptDerivedGoalInTransaction({
          tx,
          actor,
          goal: {
            roomId,
            segmentId: candidate.segmentId,
            clientRequestId: candidate.clientRequestId,
            expectedProviderTextSha256: candidate.providerTextSha256,
            title: after.title,
            description: after.description || null,
            surface: "nest-session-packet-goal-review",
          },
        });
        goal = creation.goal;
        goalReplay = creation.idempotentReplay;
      }

      const receipt = {
        id: receiptId,
        kind: REVIEW_RECEIPT_KIND,
        decision: reviewDecision,
        goalCandidateId,
        clientRequestId: candidate.clientRequestId,
        transcriptJobId,
        recordingAssetId,
        packetBuildId,
        summaryNoteId,
        roomId,
        transcriptSnapshotSha256,
        segmentId: candidate.segmentId,
        providerTextSha256: candidate.providerTextSha256,
        acceptedReviewId: candidate.acceptedReviewId,
        acceptedCorrectionId: candidate.acceptedCorrectionId,
        transcriptReviewStatus: candidate.transcriptReviewStatus,
        reviewedAt,
        reviewedByUserId: actor.id,
        reviewNote,
        candidateDraftBefore: before,
        candidateDraftAfter: after,
        goalId: goal?.id ?? null,
        externalSideEffects: false,
        taskCreated: false,
        targetDateCreated: false,
        reminderCreated: false,
        calendarMutated: false,
        deliveryClaimed: false,
        publicationClaimed: false,
      };
      await tx.coachingNote.update({
        where: { id: summaryNoteId },
        data: { sourceJson: { ...lockedSource, goalCandidateReviewReceipts: [...receipts, receipt], lastGoalCandidateReview: receipt } },
      });
      return { candidate, receipt, goal, idempotentReplay: goalReplay };
    }, { isolationLevel: "Serializable" });

    return NextResponse.json({
      ok: true,
      decision: reviewDecision,
      goalCandidateId,
      candidate: result.candidate,
      receipt: result.receipt,
      goal: result.goal ? { id: result.goal.id, title: result.goal.title, description: result.goal.description, status: result.goal.status, roomId: result.goal.roomId } : null,
      idempotentReplay: result.idempotentReplay,
      boundaries: boundaries(),
      nextAction: reviewDecision === "ACCEPT"
        ? "The reviewed draft is now one actor-owned canonical Goal. Tasks, dates, focus blocks, reminders, calendar events, messages, and delivery remain separate explicit actions."
        : reviewDecision === "EDIT"
          ? "The packet goal draft was edited for further review; no Goal or task was created."
          : reviewDecision === "REJECT"
            ? "The goal candidate was rejected and preserved in packet review history; no Goal or task was created."
            : "The goal candidate was deferred and preserved for later review; no Goal or task was created.",
    });
  } catch (error) {
    if (error instanceof GoalReviewBoundaryError || error instanceof TranscriptCorrectionError) {
      const boundary = error as GoalReviewBoundaryError | TranscriptCorrectionError;
      return NextResponse.json({ ok: false, errorCode: "errorCode" in boundary ? boundary.errorCode : boundary.code, error: boundary.message }, { status: boundary.status });
    }
    console.error("[packet-goal-review] decision failed", error);
    return NextResponse.json({ ok: false, errorCode: "GOAL_CANDIDATE_REVIEW_UNAVAILABLE", error: "Quipsly could not save this goal review. No external action was taken." }, { status: 503 });
  }
}
