import { randomUUID } from "node:crypto";

import { NextResponse } from "next/server";
import {
  TRANSCRIPT_ACTION_REVIEW_DECISIONS,
  TRANSCRIPT_PACKET_SOURCE,
  isTranscriptActionReviewDecision,
} from "@high-ground/quipsly-domain/coaching-packet";
import { TRANSCRIPT_DERIVED_TASK_SCHEMA } from "@high-ground/quipsly-domain/transcript-derived-task";

import { getPrismaClient } from "@/lib/prisma";
import {
  packetSnapshotMatches,
  packetTemplateMatches,
  packetActionCandidatesFromSource,
  projectTranscriptSegmentsForPacket,
  resolvePacketEvidenceSpan,
  selectLatestCorrelatedPacketNotes,
  TRANSCRIPT_PACKET_SEGMENT_ORDER_BY,
  type TranscriptActionCandidate,
} from "@/lib/server/coaching-packets";
import {
  buildTranscriptSourceAnchorFields,
  unreviewedTranscriptSpanSegmentIds,
} from "@/lib/server/transcript-source-span";
import { mobileCaptureTranscriptProcessingGate } from "@/lib/server/mobile-capture-processing-gates";
import { acquirePrismaAdvisoryTransactionLock } from "@/lib/server/prisma-advisory-lock";
import { getQuipslySessionFromRequest } from "@/lib/server/quipsly-session";
import { sessionMutationAccessWhere } from "@/lib/server/session-access";

const REVIEW_RECEIPT_KIND = "quipsly-action-candidate-review-receipt-v1";
const MATERIALIZED_ACTION_SOURCE = "transcript-action-candidate-acceptance";
const MAX_ACTION_TITLE_LENGTH = 500;
const MAX_ACTION_DETAIL_LENGTH = 5_000;
const MAX_REVIEW_NOTE_LENGTH = 2_000;
const MAX_TAG_COUNT = 24;
const MAX_TAG_ID_LENGTH = 200;
const MAX_DUE_DATE_DISTANCE_MS = 10 * 365 * 86_400_000;

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

function normalizedTagIds(value: unknown) {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > MAX_TAG_COUNT) return null;
  const normalized = value.map((tagId) => text(tagId));
  if (normalized.some((tagId) => !tagId || tagId.length > MAX_TAG_ID_LENGTH)) return null;
  return [...new Set(normalized)].sort();
}

function normalizedDueAt(value: unknown) {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string") return undefined;
  const dueAt = new Date(value);
  if (!Number.isFinite(dueAt.getTime())) return undefined;
  if (Math.abs(dueAt.getTime() - Date.now()) > MAX_DUE_DATE_DISTANCE_MS) return undefined;
  return dueAt;
}

function playbackSourceId(recordingAsset: any) {
  const promotion = sourceJson(sourceJson(recordingAsset?.localManifestJson).promotion);
  const sourceId = text(promotion.sourceId);
  return sourceId && text(promotion.playbackUrl) === `/api/ingest/media/${sourceId}` ? sourceId : "";
}

function materializationIntent(input: {
  assignToMe: boolean;
  dueAt: Date | null;
  tagIds: string[];
}) {
  return {
    assignedUserId: input.assignToMe ? "ACTOR" : null,
    dueAt: input.dueAt?.toISOString() ?? null,
    tagIds: input.tagIds,
  };
}

function sameMaterializationIntent(value: unknown, expected: ReturnType<typeof materializationIntent>) {
  const saved = sourceJson(value);
  // Receipts created before this richer review surface were always unassigned,
  // undated, and untagged. Preserve exact replay for that one legacy intent.
  if (!Object.keys(saved).length) {
    return expected.assignedUserId === null && expected.dueAt === null && expected.tagIds.length === 0;
  }
  const savedTags = normalizedTagIds(saved.tagIds);
  return (saved.assignedUserId === "ACTOR" ? "ACTOR" : null) === expected.assignedUserId
    && (text(saved.dueAt) || null) === expected.dueAt
    && savedTags !== null
    && JSON.stringify(savedTags) === JSON.stringify(expected.tagIds);
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

function responseBoundaries(input: { assignedToActor?: boolean; dueDateCreated?: boolean; tagsApplied?: boolean } = {}) {
  return {
    humanDecisionRequired: true,
    noExternalAssignment: true,
    noClientDelivery: true,
    noCalendarMutation: true,
    noPublicationClaim: true,
    acceptCreatesOneCanonicalActionItem: true,
    assignmentRequiresExplicitActorChoice: true,
    assignedToActor: input.assignedToActor === true,
    dueDateCreated: input.dueDateCreated === true,
    projectTagsApplied: input.tagsApplied === true,
    editRejectDeferCreateNoOpenWork: true,
    recordingAndTranscriptEvidenceRequired: true,
    humanReviewedSourceRequired: true,
    canonicalSessionAccess: true,
    canonicalSessionMutationAccess: true,
    sessionAccessRechecked: true,
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
  const assignToMe = body.assignToMe === true;
  const dueAt = normalizedDueAt(body.dueAt);
  const tagIds = normalizedTagIds(body.tagIds);

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
  if (hasOwn(body, "assignToMe") && typeof body.assignToMe !== "boolean") {
    return NextResponse.json(
      { ok: false, errorCode: "ACTION_CANDIDATE_ASSIGNMENT_INVALID", error: "assignToMe must be true or false." },
      { status: 400 },
    );
  }
  if (dueAt === undefined) {
    return NextResponse.json(
      { ok: false, errorCode: "ACTION_CANDIDATE_DUE_AT_INVALID", error: "Choose a valid due date within ten years." },
      { status: 400 },
    );
  }
  if (tagIds === null) {
    return NextResponse.json(
      { ok: false, errorCode: "ACTION_CANDIDATE_TAGS_INVALID", error: `Choose at most ${MAX_TAG_COUNT} valid project tags.` },
      { status: 400 },
    );
  }
  if (decision !== "ACCEPT" && (hasOwn(body, "assignToMe") || hasOwn(body, "dueAt") || hasOwn(body, "tagIds"))) {
    return NextResponse.json(
      { ok: false, errorCode: "ACTION_CANDIDATE_MATERIALIZATION_OPTIONS_INVALID", error: "Owner, due date, and tags apply only when accepting a candidate as canonical work." },
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
  const actor = {
    id: userId,
    primaryEmail: session.user.primaryEmail,
    email: session.user.email,
    isStaff: session.user.isStaff === true,
  };
  const room = await prisma.callRoom.findFirst({
    where: sessionMutationAccessWhere(roomId, actor),
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
      await acquirePrismaAdvisoryTransactionLock(tx, `transcript-job-packet-source:${transcriptJobId}`);
      const authorizedRoom = await tx.callRoom.findFirst({
        where: sessionMutationAccessWhere(roomId, actor),
        select: { id: true },
      });
      if (!authorizedRoom) {
        throw new ReviewBoundaryError(
          404,
          "SESSION_ACCESS_REVOKED",
          "Session access changed before candidate review completed. Refresh before trying again.",
        );
      }
      await tx.$queryRaw`SELECT "id" FROM "CoachingNote" WHERE "id" = ${summaryNoteId} FOR UPDATE`;

      // Re-read transcript and release evidence inside the same serializable
      // transaction that commits the review. The earlier check gives a fast,
      // useful error; this check prevents a consent/release change in between
      // from materializing work against stale processing permission.
      const lockedTranscriptJob = await tx.transcriptJob.findFirst({
        where: { id: transcriptJobId, roomId },
        include: {
          asset: true,
          segments: {
            orderBy: TRANSCRIPT_PACKET_SEGMENT_ORDER_BY,
            include: {
              corrections: { where: { status: "accepted" }, orderBy: { updatedAt: "desc" } },
              verifications: { orderBy: { createdAt: "desc" } },
            },
          },
        },
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
      if (!packetTemplateMatches(lockedSource) || !packetSnapshotMatches(lockedSource, lockedTranscriptJob.segments)) {
        throw new ReviewBoundaryError(
          409,
          "TRANSCRIPT_REVIEW_CHANGED",
          "Transcript review changed after this packet was built. Build a new packet before reviewing the action candidate.",
        );
      }
      const transcriptSnapshotSha256 = text(sourceJson(lockedSource.transcriptSnapshot).sha256);
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
      const projectedSegments = projectTranscriptSegmentsForPacket(lockedTranscriptJob.segments);
      const evidenceSegments = resolvePacketEvidenceSpan(candidate, projectedSegments);
      if (!evidenceSegments) {
        throw new ReviewBoundaryError(
          409,
          "STALE_ACTION_CANDIDATE_EVIDENCE",
          "The action candidate's complete transcript evidence no longer matches this packet. Build the current packet before reviewing it.",
        );
      }
      const sourceAnchor = buildTranscriptSourceAnchorFields(evidenceSegments);
      const sourcePlaybackId = playbackSourceId(lockedTranscriptJob.asset);

      const requestedIntent = materializationIntent({ assignToMe, dueAt, tagIds });

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
          || text(acceptedReceipt.transcriptSnapshotSha256) !== transcriptSnapshotSha256
        ) {
          throw new ReviewBoundaryError(
            409,
            "ACTION_CANDIDATE_RECEIPT_MISMATCH",
            "The accepted candidate receipt no longer matches this packet build and source evidence.",
          );
        }
        if (!sameMaterializationIntent(acceptedReceipt.materializationIntent, requestedIntent)) {
          throw new ReviewBoundaryError(
            409,
            "ACTION_CANDIDATE_IDEMPOTENCY_CONFLICT",
            "This candidate was already accepted with different owner, due-date, or tag choices. Open the canonical task to edit it.",
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

      if (decision === "ACCEPT") {
        const unreviewedSegmentIds = unreviewedTranscriptSpanSegmentIds(evidenceSegments);
        if (unreviewedSegmentIds.length) {
          throw new ReviewBoundaryError(
            409,
            "ACTION_CANDIDATE_TRANSCRIPT_REVIEW_REQUIRED",
            `Listen to and confirm every source segment before creating this task. ${unreviewedSegmentIds.length} segment${unreviewedSegmentIds.length === 1 ? " remains" : "s remain"} provider-only.`,
          );
        }
      }

      const reviewedAt = new Date().toISOString();
      const receiptId = randomUUID();
      const draftBefore = { title: candidate.title, detail: candidate.detail };
      const draftAfter = {
        title: hasOwn(body, "title") ? text(body.title) : candidate.title,
        detail: hasOwn(body, "detail") ? String(body.detail).trim() : candidate.detail,
      };
      let actionItem: any = null;
      let acceptedTags: Array<{ id: string; label: string; slug: string }> = [];

      if (decision === "ACCEPT") {
        if (!sourceAnchor || !sourcePlaybackId) {
          throw new ReviewBoundaryError(
            409,
            "ACTION_CANDIDATE_PLAYBACK_EVIDENCE_REQUIRED",
            "The current transcript segment must remain linked to protected playback before it can become work.",
          );
        }
        const projectId = text(lockedSummary.room?.projectId) || null;
        if (tagIds.length && !projectId) {
          throw new ReviewBoundaryError(
            409,
            "ACTION_CANDIDATE_PROJECT_REQUIRED",
            "This Session needs a canonical Nest project before its accepted task can use project tags.",
          );
        }
        if (tagIds.length) {
          acceptedTags = await tx.studioTag.findMany({
            where: {
              id: { in: tagIds },
              projectId,
              isActive: true,
              mergedIntoTagId: null,
            },
            orderBy: { id: "asc" },
            select: { id: true, label: true, slug: true },
          });
          if (acceptedTags.length !== tagIds.length) {
            throw new ReviewBoundaryError(
              409,
              "ACTION_CANDIDATE_TAG_SELECTION_STALE",
              "One or more selected tags are archived, merged, or outside this Session's project. Refresh before accepting the task.",
            );
          }
        }
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
            projectId,
            noteId: summaryNoteId,
            assignedUserId: assignToMe ? userId : null,
            title: draftAfter.title,
            detail: draftAfter.detail || null,
            status: "OPEN",
            dueAt,
            sourceJson: {
              schema: TRANSCRIPT_DERIVED_TASK_SCHEMA,
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
              transcriptSnapshotSha256,
              roomId,
              ...sourceAnchor,
              playbackSourceId: sourcePlaybackId,
              acceptedAt: reviewedAt,
              acceptedByUserId: userId,
              externalSideEffects: false,
              assignmentClaimed: assignToMe,
              assignedToUserId: assignToMe ? userId : null,
              dueAt: dueAt?.toISOString() ?? null,
              tagIds,
              deliveryClaimed: false,
              publicationClaimed: false,
            },
          },
        });
        if (tagIds.length) {
          await tx.actionItemTagLink.createMany({
            data: tagIds.map((tagId) => ({
              actionItemId: actionItem.id,
              tagId,
              createdByUserId: userId,
              sourceJson: {
                source: MATERIALIZED_ACTION_SOURCE,
                reviewReceiptId: receiptId,
                roomId,
                packetBuildId,
                externalSideEffects: false,
              },
            })),
          });
        }
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
        transcriptSnapshotSha256,
        segmentId: candidate.segmentId,
        segmentIds: sourceAnchor?.segmentIds ?? [candidate.segmentId],
        sourceTextSha256: candidate.sourceTextSha256 ?? null,
        sourceSpan: sourceAnchor?.sourceSpan ?? null,
        reviewedAt,
        reviewedByUserId: userId,
        reviewNote,
        candidateDraftBefore: draftBefore,
        candidateDraftAfter: draftAfter,
        materializationIntent: requestedIntent,
        appliedTags: acceptedTags,
        actionItemId: actionItem?.id ?? null,
        externalSideEffects: false,
        assignmentClaimed: assignToMe,
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
            dueAt: result.actionItem.dueAt instanceof Date ? result.actionItem.dueAt.toISOString() : result.actionItem.dueAt ?? null,
            projectId: result.actionItem.projectId ?? null,
            tagIds: Array.isArray(result.receipt?.materializationIntent?.tagIds) ? result.receipt.materializationIntent.tagIds : [],
            source: sourceJson(result.actionItem.sourceJson),
          }
        : null,
      idempotentReplay: result.idempotentReplay,
      boundaries: responseBoundaries({
        assignedToActor: Boolean(result.actionItem?.assignedUserId),
        dueDateCreated: Boolean(result.actionItem?.dueAt),
        tagsApplied: Array.isArray(result.receipt?.materializationIntent?.tagIds) && result.receipt.materializationIntent.tagIds.length > 0,
      }),
      nextAction: decision === "ACCEPT"
        ? `The accepted draft is now one ${result.actionItem?.assignedUserId ? "actor-owned" : "unassigned"} Quipsly task${result.actionItem?.dueAt ? " with an explicit due date" : ""}${Array.isArray(result.receipt?.materializationIntent?.tagIds) && result.receipt.materializationIntent.tagIds.length > 0 ? " and reviewed project tags" : ""}. Calendar placement, reminders, delivery, and publication remain separate explicit actions.`
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
