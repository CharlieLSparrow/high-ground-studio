import { randomUUID } from "node:crypto";

import { NextResponse } from "next/server";
import {
  TRANSCRIPT_ACTION_REVIEW_DECISIONS,
  TRANSCRIPT_PACKET_SOURCE,
  isTranscriptActionReviewDecision,
} from "@high-ground/quipsly-domain/coaching-packet";

import { getPrismaClient } from "@/lib/prisma";
import {
  packetActionCandidatesFromSource,
  selectLatestCorrelatedPacketNotes,
  type TranscriptActionCandidate,
} from "@/lib/server/coaching-packets";
import { mobileCaptureTranscriptProcessingGate } from "@/lib/server/mobile-capture-processing-gates";
import { getQuipslySessionFromRequest } from "@/lib/server/quipsly-session";

const REVIEW_RECEIPT_KIND = "quipsly-action-candidate-review-receipt-v1";
const MATERIALIZED_ACTION_SOURCE = "transcript-action-candidate-acceptance";
const MAX_ACTION_TITLE_LENGTH = 500;
const MAX_ACTION_DETAIL_LENGTH = 5_000;
const MAX_REVIEW_NOTE_LENGTH = 2_000;

class ReviewBoundaryError extends Error {
  constructor(
    readonly status: number,
    readonly errorCode: string,
    message: string,
  ) {
    super(message);
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function sourceJson(value: unknown): Record<string, unknown> {
  return isObject(value) ? value : {};
}

function asObjects(value: unknown) {
  return Array.isArray(value) ? value.filter(isObject) : [];
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function hasOwn(value: Record<string, unknown>, key: string) {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function normalizedDecision(value: unknown) {
  const decision = text(value).toUpperCase();
  return isTranscriptActionReviewDecision(decision) ? decision : "";
}

async function readJson(request: Request) {
  try {
    const value = await request.json();
    return isObject(value) ? value : {};
  } catch {
    return {};
  }
}

function canAccessRoomWhere(userId: string, isStaff: boolean, roomId: string) {
  return isStaff
    ? { id: roomId }
    : {
        id: roomId,
        OR: [
          { createdByUserId: userId },
          { participants: { some: { userId } } },
          { booking: { clientUserId: userId } },
          { booking: { coachUserId: userId } },
        ],
      };
}

function reviewStatus(decision: string): TranscriptActionCandidate["reviewStatus"] {
  if (decision === "ACCEPT") return "ACCEPTED_AS_ACTION_ITEM";
  if (decision === "EDIT") return "EDITED_FOR_REVIEW";
  if (decision === "REJECT") return "REJECTED_BY_HUMAN";
  return "DEFERRED_BY_HUMAN";
}

function validateCandidateEvidence(input: {
  candidate: TranscriptActionCandidate;
  roomId: string;
  transcriptJobId: string;
  recordingAssetId: string;
  packetBuildId: string;
}) {
  if (
    input.candidate.roomId !== input.roomId
    || input.candidate.transcriptJobId !== input.transcriptJobId
    || input.candidate.recordingAssetId !== input.recordingAssetId
    || input.candidate.packetBuildId !== input.packetBuildId
  ) {
    throw new ReviewBoundaryError(
      409,
      "ACTION_CANDIDATE_EVIDENCE_MISMATCH",
      "The action candidate no longer matches this room, transcript, recording asset, and packet build.",
    );
  }
}

function packetSummarySource(input: {
  summary: any;
  transcriptJobId: string;
  recordingAssetId: string;
  packetBuildId: string;
}) {
  const source = sourceJson(input.summary?.sourceJson);
  if (
    source.source !== TRANSCRIPT_PACKET_SOURCE
    || text(source.transcriptJobId) !== input.transcriptJobId
    || text(source.recordingAssetId) !== input.recordingAssetId
    || text(source.packetBuildId) !== input.packetBuildId
  ) {
    throw new ReviewBoundaryError(
      409,
      "STALE_PACKET_BUILD",
      "The requested packet build is stale or no longer matches its transcript and recording evidence.",
    );
  }
  return source;
}

function acceptedActionMatches(item: any, input: {
  roomId: string;
  summaryNoteId: string;
  actionCandidateId: string;
  transcriptJobId: string;
  recordingAssetId: string;
  packetBuildId: string;
}) {
  const source = sourceJson(item?.sourceJson);
  return item?.roomId === input.roomId
    && item?.noteId === input.summaryNoteId
    && source.source === TRANSCRIPT_PACKET_SOURCE
    && source.materializationSource === MATERIALIZED_ACTION_SOURCE
    && source.candidate === false
    && text(source.actionCandidateId) === input.actionCandidateId
    && text(source.transcriptJobId) === input.transcriptJobId
    && text(source.recordingAssetId) === input.recordingAssetId
    && text(source.packetBuildId) === input.packetBuildId;
}

function responseBoundaries() {
  return {
    humanDecisionRequired: true,
    noExternalAssignment: true,
    noClientDelivery: true,
    noCalendarMutation: true,
    noPublicationClaim: true,
    acceptCreatesOneUnassignedActionItem: true,
    editRejectDeferCreateNoOpenWork: true,
    recordingAndTranscriptEvidenceRequired: true,
  };
}

export async function POST(request: Request) {
  const session = await getQuipslySessionFromRequest(request);
  if (!session?.user) {
    return NextResponse.json(
      { ok: false, errorCode: "AUTH_REQUIRED", error: "Sign in before reviewing an action candidate." },
      { status: 401 },
    );
  }

  const body = await readJson(request);
  const roomId = text(body.callRoomId) || text(body.roomId);
  const transcriptJobId = text(body.transcriptJobId);
  const recordingAssetId = text(body.recordingAssetId);
  const summaryNoteId = text(body.summaryNoteId);
  const packetBuildId = text(body.packetBuildId);
  const actionCandidateId = text(body.actionCandidateId);
  const decision = normalizedDecision(body.decision);
  const reviewNote = text(body.note) || null;

  if (!roomId || !transcriptJobId || !recordingAssetId || !summaryNoteId || !packetBuildId || !actionCandidateId) {
    return NextResponse.json(
      {
        ok: false,
        errorCode: "ACTION_CANDIDATE_EVIDENCE_REQUIRED",
        error: "Room, transcript, recording asset, summary, packet build, and action candidate evidence are required.",
      },
      { status: 400 },
    );
  }
  if (!decision) {
    return NextResponse.json(
      {
        ok: false,
        errorCode: "ACTION_CANDIDATE_DECISION_REQUIRED",
        error: "Choose ACCEPT, EDIT, REJECT, or DEFER.",
        allowedDecisions: TRANSCRIPT_ACTION_REVIEW_DECISIONS,
      },
      { status: 400 },
    );
  }
  if (decision === "EDIT" && !hasOwn(body, "title") && !hasOwn(body, "detail")) {
    return NextResponse.json(
      { ok: false, errorCode: "ACTION_CANDIDATE_EDIT_REQUIRED", error: "Edit the candidate title or detail." },
      { status: 400 },
    );
  }
  if (hasOwn(body, "title") && !text(body.title)) {
    return NextResponse.json(
      { ok: false, errorCode: "ACTION_CANDIDATE_TITLE_REQUIRED", error: "An edited action title cannot be empty." },
      { status: 400 },
    );
  }
  if (hasOwn(body, "title") && text(body.title).length > MAX_ACTION_TITLE_LENGTH) {
    return NextResponse.json(
      {
        ok: false,
        errorCode: "ACTION_CANDIDATE_TITLE_TOO_LONG",
        error: `Action titles may be at most ${MAX_ACTION_TITLE_LENGTH} characters.`,
      },
      { status: 400 },
    );
  }
  if (hasOwn(body, "detail") && typeof body.detail !== "string") {
    return NextResponse.json(
      { ok: false, errorCode: "ACTION_CANDIDATE_DETAIL_INVALID", error: "Edited action detail must be text." },
      { status: 400 },
    );
  }
  if (typeof body.detail === "string" && body.detail.trim().length > MAX_ACTION_DETAIL_LENGTH) {
    return NextResponse.json(
      {
        ok: false,
        errorCode: "ACTION_CANDIDATE_DETAIL_TOO_LONG",
        error: `Action details may be at most ${MAX_ACTION_DETAIL_LENGTH} characters.`,
      },
      { status: 400 },
    );
  }
  if (reviewNote && reviewNote.length > MAX_REVIEW_NOTE_LENGTH) {
    return NextResponse.json(
      {
        ok: false,
        errorCode: "ACTION_CANDIDATE_REVIEW_NOTE_TOO_LONG",
        error: `Review notes may be at most ${MAX_REVIEW_NOTE_LENGTH} characters.`,
      },
      { status: 400 },
    );
  }

  const prisma = getPrismaClient() as any;
  const userId = session.user.id;
  const room = await prisma.callRoom.findFirst({
    where: canAccessRoomWhere(userId, session.user.isStaff, roomId),
    select: { id: true },
  });
  if (!room) {
    return NextResponse.json(
      { ok: false, errorCode: "ROOM_ACCESS_DENIED", error: "You do not have access to this packet room." },
      { status: 404 },
    );
  }

  const summaryCandidates = await prisma.coachingNote.findMany({
    where: { roomId, kind: "SUMMARY" },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      kind: true,
      roomId: true,
      bookingId: true,
      sourceJson: true,
      createdAt: true,
      updatedAt: true,
    },
  });
  const transcriptSummaries = summaryCandidates.filter((summary: any) => {
    const source = sourceJson(summary.sourceJson);
    return source.source === TRANSCRIPT_PACKET_SOURCE && text(source.transcriptJobId) === transcriptJobId;
  });
  const latestSummary = selectLatestCorrelatedPacketNotes(transcriptSummaries).summary;
  const latestSource = latestSummary ? sourceJson(latestSummary.sourceJson) : {};
  if (
    !latestSummary
    || latestSummary.id !== summaryNoteId
    || text(latestSource.packetBuildId) !== packetBuildId
  ) {
    return NextResponse.json(
      {
        ok: false,
        errorCode: "STALE_PACKET_BUILD",
        error: "Refresh the packet before reviewing this candidate; a newer or different packet build is current.",
      },
      { status: 409 },
    );
  }

  const transcriptJob = await prisma.transcriptJob.findFirst({
    where: { id: transcriptJobId, roomId },
    include: { asset: true },
  });
  if (
    !transcriptJob
    || transcriptJob.status !== "COMPLETED"
    || !transcriptJob.asset
    || transcriptJob.asset.id !== recordingAssetId
    || transcriptJob.assetId !== recordingAssetId
  ) {
    return NextResponse.json(
      {
        ok: false,
        errorCode: "TRANSCRIPT_RECORDING_EVIDENCE_REQUIRED",
        error: "Candidate review requires a completed transcript bound to the requested recording asset.",
      },
      { status: 409 },
    );
  }

  const transcriptGate = await mobileCaptureTranscriptProcessingGate({
    prisma,
    recordingAsset: transcriptJob.asset,
  });
  if (!transcriptGate.allowed) {
    return NextResponse.json(
      {
        ok: false,
        errorCode: transcriptGate.errorCode,
        error: transcriptGate.error,
        explicitReleaseRequired: true,
      },
      { status: 409 },
    );
  }

  try {
    const result = await prisma.$transaction(async (tx: any) => {
      await tx.$queryRaw`SELECT "id" FROM "CoachingNote" WHERE "id" = ${summaryNoteId} FOR UPDATE`;

      // Re-read transcript and release evidence inside the same serializable
      // transaction that commits the review. The earlier check gives a fast,
      // useful error; this check prevents a consent/release change in between
      // from materializing work against stale processing permission.
      const lockedTranscriptJob = await tx.transcriptJob.findFirst({
        where: { id: transcriptJobId, roomId },
        include: { asset: true },
      });
      if (
        !lockedTranscriptJob
        || lockedTranscriptJob.status !== "COMPLETED"
        || !lockedTranscriptJob.asset
        || lockedTranscriptJob.asset.id !== recordingAssetId
        || lockedTranscriptJob.assetId !== recordingAssetId
      ) {
        throw new ReviewBoundaryError(
          409,
          "TRANSCRIPT_RECORDING_EVIDENCE_REQUIRED",
          "Transcript or recording evidence changed before candidate review completed.",
        );
      }
      const lockedTranscriptGate = await mobileCaptureTranscriptProcessingGate({
        prisma: tx,
        recordingAsset: lockedTranscriptJob.asset,
      });
      if (!lockedTranscriptGate.allowed) {
        throw new ReviewBoundaryError(
          409,
          lockedTranscriptGate.errorCode,
          lockedTranscriptGate.error,
        );
      }

      const lockedSummary = await tx.coachingNote.findUnique({
        where: { id: summaryNoteId },
        select: {
          id: true,
          roomId: true,
          bookingId: true,
          room: { select: { projectId: true } },
          sourceJson: true,
          createdAt: true,
          updatedAt: true,
        },
      });
      if (!lockedSummary || lockedSummary.roomId !== roomId) {
        throw new ReviewBoundaryError(409, "STALE_PACKET_BUILD", "The packet summary changed before review completed.");
      }

      const lockedSource = packetSummarySource({
        summary: lockedSummary,
        transcriptJobId,
        recordingAssetId,
        packetBuildId,
      });
      const lockedCandidates = packetActionCandidatesFromSource(lockedSource);
      const candidate = lockedCandidates.find((item) => item.id === actionCandidateId);
      if (!candidate) {
        throw new ReviewBoundaryError(
          409,
          "STALE_ACTION_CANDIDATE",
          "The action candidate is missing from the current packet build. Refresh before reviewing it.",
        );
      }
      validateCandidateEvidence({ candidate, roomId, transcriptJobId, recordingAssetId, packetBuildId });

      const receipts = asObjects(lockedSource.actionCandidateReviewReceipts);
      const acceptedReceipt = receipts.find((receipt) => (
        text(receipt.actionCandidateId) === actionCandidateId
        && text(receipt.decision) === "ACCEPT"
      ));
      if (acceptedReceipt) {
        if (decision !== "ACCEPT") {
          throw new ReviewBoundaryError(
            409,
            "ACTION_CANDIDATE_ALREADY_ACCEPTED",
            "This candidate already became an ActionItem and cannot be edited, rejected, or deferred as an uncommitted draft.",
          );
        }
        if (
          acceptedReceipt.kind !== REVIEW_RECEIPT_KIND
          || text(acceptedReceipt.transcriptJobId) !== transcriptJobId
          || text(acceptedReceipt.recordingAssetId) !== recordingAssetId
          || text(acceptedReceipt.packetBuildId) !== packetBuildId
          || text(acceptedReceipt.summaryNoteId) !== summaryNoteId
          || text(acceptedReceipt.roomId) !== roomId
        ) {
          throw new ReviewBoundaryError(
            409,
            "ACTION_CANDIDATE_RECEIPT_MISMATCH",
            "The accepted candidate receipt no longer matches this packet build and source evidence.",
          );
        }
        const acceptedActionItemId = text(acceptedReceipt.actionItemId);
        const acceptedActionItem = acceptedActionItemId
          ? await tx.actionItem.findUnique({ where: { id: acceptedActionItemId } })
          : null;
        const acceptedActionSource = sourceJson(acceptedActionItem?.sourceJson);
        if (
          !acceptedActionItem
          || text(acceptedActionSource.reviewReceiptId) !== text(acceptedReceipt.id)
          || !acceptedActionMatches(acceptedActionItem, {
            roomId,
            summaryNoteId,
            actionCandidateId,
            transcriptJobId,
            recordingAssetId,
            packetBuildId,
          })
        ) {
          throw new ReviewBoundaryError(
            409,
            "ACTION_CANDIDATE_RECEIPT_MISMATCH",
            "The accepted candidate receipt no longer matches one materialized action item.",
          );
        }
        return {
          candidate,
          receipt: acceptedReceipt,
          actionItem: acceptedActionItem,
          idempotentReplay: true,
        };
      }

      if (candidate.committedActionItemId || candidate.reviewStatus === "ACCEPTED_AS_ACTION_ITEM") {
        throw new ReviewBoundaryError(
          409,
          "ACTION_CANDIDATE_RECEIPT_REQUIRED",
          "The candidate claims acceptance without a matching packet receipt. Repair evidence before continuing.",
        );
      }

      const reviewedAt = new Date().toISOString();
      const receiptId = randomUUID();
      const draftBefore = { title: candidate.title, detail: candidate.detail };
      const draftAfter = {
        title: hasOwn(body, "title") ? text(body.title) : candidate.title,
        detail: hasOwn(body, "detail") ? String(body.detail).trim() : candidate.detail,
      };
      let actionItem: any = null;

      if (decision === "ACCEPT") {
        const packetActionItems = await tx.actionItem.findMany({
          where: { roomId, noteId: summaryNoteId },
        });
        const matchingActions = packetActionItems.filter((item: any) => acceptedActionMatches(item, {
          roomId,
          summaryNoteId,
          actionCandidateId,
          transcriptJobId,
          recordingAssetId,
          packetBuildId,
        }));
        if (matchingActions.length > 1) {
          throw new ReviewBoundaryError(
            409,
            "DUPLICATE_ACTION_CANDIDATE_MATERIALIZATION",
            "More than one action item already claims this candidate. Resolve the evidence conflict before continuing.",
          );
        }
        if (matchingActions.length === 1) {
          throw new ReviewBoundaryError(
            409,
            "ACTION_CANDIDATE_MATERIALIZATION_WITHOUT_RECEIPT",
            "An action item already claims this candidate without a matching packet receipt. Repair the evidence conflict before continuing.",
          );
        }
        actionItem = await tx.actionItem.create({
          data: {
            roomId,
            bookingId: lockedSummary.bookingId ?? null,
            projectId: lockedSummary.room?.projectId ?? null,
            noteId: summaryNoteId,
            assignedUserId: null,
            title: draftAfter.title,
            detail: draftAfter.detail || null,
            status: "OPEN",
            sourceJson: {
              source: TRANSCRIPT_PACKET_SOURCE,
              materializationSource: MATERIALIZED_ACTION_SOURCE,
              candidate: false,
              humanAccepted: true,
              reviewReceiptId: receiptId,
              actionCandidateId,
              transcriptJobId,
              recordingAssetId,
              packetBuildId,
              packetSummaryNoteId: summaryNoteId,
              roomId,
              segmentId: candidate.segmentId,
              speakerLabel: candidate.speakerLabel,
              startSeconds: candidate.startSeconds,
              endSeconds: candidate.endSeconds,
              acceptedAt: reviewedAt,
              acceptedByUserId: userId,
              externalSideEffects: false,
              assignmentClaimed: false,
              deliveryClaimed: false,
              publicationClaimed: false,
            },
          },
        });
      }

      const receipt = {
        id: receiptId,
        kind: REVIEW_RECEIPT_KIND,
        decision,
        actionCandidateId,
        transcriptJobId,
        recordingAssetId,
        packetBuildId,
        summaryNoteId,
        roomId,
        reviewedAt,
        reviewedByUserId: userId,
        reviewNote,
        candidateDraftBefore: draftBefore,
        candidateDraftAfter: draftAfter,
        actionItemId: actionItem?.id ?? null,
        externalSideEffects: false,
        assignmentClaimed: false,
        deliveryClaimed: false,
        publicationClaimed: false,
      };
      const updatedCandidate: TranscriptActionCandidate & Record<string, unknown> = {
        ...candidate,
        title: draftAfter.title,
        detail: draftAfter.detail,
        reviewStatus: reviewStatus(decision),
        humanApprovalRequired: decision !== "ACCEPT",
        committedActionItemId: actionItem?.id ?? null,
        lastHumanReview: {
          receiptId,
          decision,
          reviewedAt,
          reviewedByUserId: userId,
        },
      };
      const updatedCandidates = lockedCandidates.map((item) => (
        item.id === actionCandidateId ? updatedCandidate : item
      ));

      await tx.coachingNote.update({
        where: { id: summaryNoteId },
        data: {
          sourceJson: {
            ...lockedSource,
            actionCandidates: updatedCandidates,
            actionCandidateReviewReceipts: [...receipts, receipt],
            lastActionCandidateReview: receipt,
          },
        },
      });

      return { candidate: updatedCandidate, receipt, actionItem, idempotentReplay: false };
    }, { isolationLevel: "Serializable" });

    return NextResponse.json({
      ok: true,
      decision,
      roomId,
      transcriptJobId,
      recordingAssetId,
      packetBuildId,
      summaryNoteId,
      actionCandidateId,
      candidate: result.candidate,
      receipt: result.receipt,
      actionItem: result.actionItem
        ? {
            id: result.actionItem.id,
            title: result.actionItem.title,
            detail: result.actionItem.detail,
            status: result.actionItem.status,
            assignedUserId: result.actionItem.assignedUserId ?? null,
            source: sourceJson(result.actionItem.sourceJson),
          }
        : null,
      idempotentReplay: result.idempotentReplay,
      boundaries: responseBoundaries(),
      nextAction: decision === "ACCEPT"
        ? "The accepted draft is now one unassigned Quipsly ActionItem. Assignment, scheduling, delivery, and publication remain separate explicit actions."
        : decision === "EDIT"
          ? "The packet draft was edited for further review; no open work was created."
          : decision === "REJECT"
            ? "The candidate was rejected and preserved in packet review history; no open work was created."
            : "The candidate was deferred and preserved for later review; no open work was created.",
    });
  } catch (error) {
    if (error instanceof ReviewBoundaryError) {
      return NextResponse.json(
        { ok: false, errorCode: error.errorCode, error: error.message },
        { status: error.status },
      );
    }
    throw error;
  }
}
