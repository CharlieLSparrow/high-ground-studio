import { randomUUID } from "node:crypto";

import {
  TRANSCRIPT_GOAL_REVIEW_DECISIONS,
  TRANSCRIPT_PACKET_SOURCE,
  isTranscriptGoalReviewDecision,
  type TranscriptGoalReviewDecision,
} from "@high-ground/quipsly-domain/coaching-packet";
import {
  TRANSCRIPT_DERIVED_GOAL_SCHEMA,
  TRANSCRIPT_GOAL_EVIDENCE_MERGE_SCHEMA,
  readTranscriptMergedGoalSource,
} from "@high-ground/quipsly-domain/transcript-derived-task";
import { TRANSCRIPT_GOAL_EVIDENCE_MERGE_CAPABILITY_ID } from "@high-ground/quipsly-domain/governed-actions";
import { NextResponse } from "next/server";

import { getPrismaClient } from "@/lib/prisma";
import {
  packetSnapshotMatches,
  packetTemplateMatches,
  projectTranscriptSegmentsForPacket,
  resolvePacketEvidenceSpan,
  selectLatestCorrelatedPacketNotes,
  TRANSCRIPT_PACKET_SEGMENT_ORDER_BY,
} from "@/lib/server/coaching-packets";
import { mobileCaptureTranscriptProcessingGate } from "@/lib/server/mobile-capture-processing-gates";
import { acquirePrismaAdvisoryTransactionLock } from "@/lib/server/prisma-advisory-lock";
import { getQuipslySessionFromRequest } from "@/lib/server/quipsly-session";
import { sessionMutationAccessWhere } from "@/lib/server/session-access";
import { TranscriptCorrectionError } from "@/lib/server/transcript-corrections";
import { transcriptSpanReviewState } from "@/lib/server/transcript-source-span";
import {
  readGovernedActionSourceReference,
  recordSucceededTranscriptWorkAction,
} from "@/lib/server/governed-action-runtime";
import {
  createTranscriptDerivedGoalInTransaction,
  normalizeTranscriptGoalTagIds,
  normalizeTranscriptGoalTargetAt,
  resolveTranscriptGoalEvidenceInTransaction,
  sameTranscriptGoalMaterializationIntent,
  transcriptGoalMaterializationIntent,
  transcriptDerivedGoalBoundaries,
} from "../../goals/route-implementation";
import { buildPacketGoalCandidates } from "../route-implementation";

const REVIEW_RECEIPT_KIND = "quipsly-goal-candidate-review-receipt-v1";
const GOAL_EVIDENCE_MERGE_KIND = "TRANSCRIPT_CANDIDATE_MERGED";
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

function boundaries(input: { targetDateCreated?: boolean; tagsApplied?: boolean; goalEvidenceAppended?: boolean; sourceReviewState?: "human-reviewed" | "provider-transcript" } = {}) {
  return {
    explicitHumanDecision: true,
    humanReviewedSourceRequired: false,
    sourceReviewState: input.sourceReviewState ?? "provider-transcript",
    sourceReviewRecommended: input.sourceReviewState !== "human-reviewed",
    acceptCreatesOneActorOwnedGoal: true,
    mergeAppendsOneActorOwnedGoalEvidenceReceipt: input.goalEvidenceAppended === true,
    mergeChangesNoGoalDefinitionStatusTargetOrTags: true,
    editRejectDeferCreateNoGoal: true,
    canonicalSessionAccess: true,
    canonicalSessionMutationAccess: true,
    sessionAccessRechecked: true,
    ...transcriptDerivedGoalBoundaries(input),
  };
}

function iso(value: unknown) {
  if (value instanceof Date) return value.toISOString();
  if (typeof value !== "string" || !value.trim()) return null;
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : null;
}

function mergeTargetSnapshot(goal: any) {
  return {
    id: text(goal?.id),
    title: text(goal?.title),
    description: typeof goal?.description === "string" ? goal.description : null,
    status: text(goal?.status),
    targetAt: iso(goal?.targetAt),
    updatedAt: iso(goal?.updatedAt),
    projectId: text(goal?.projectId) || null,
    roomId: text(goal?.roomId) || null,
    tagIds: Array.isArray(goal?.tagLinks)
      ? goal.tagLinks.map((link: any) => text(link?.tagId)).filter(Boolean).sort()
      : [],
    taskLinks: Array.isArray(goal?.taskLinks)
      ? goal.taskLinks.map((link: any) => ({ actionItemId: text(link?.actionItemId), relationship: text(link?.relationship) }))
          .filter((link: { actionItemId: string }) => link.actionItemId)
          .sort((left: { actionItemId: string }, right: { actionItemId: string }) => left.actionItemId.localeCompare(right.actionItemId))
      : [],
  };
}

function exactMergeTargetRequest(receipt: Record<string, unknown>, targetGoalId: string, expectedUpdatedAt: string) {
  const saved = object(receipt.mergeTargetBefore);
  return text(receipt.goalId) === targetGoalId
    && text(saved.id) === targetGoalId
    && text(saved.updatedAt) === expectedUpdatedAt;
}

function acceptedReceiptIntentMatches(
  receipt: Record<string, unknown>,
  expected: ReturnType<typeof transcriptGoalMaterializationIntent>,
) {
  if (sameTranscriptGoalMaterializationIntent(receipt.materializationIntent, expected)) return true;
  // Pre-target/tag receipts always created an undated, untagged goal from the
  // reviewed draft. Preserve exact replay for that one historical shape.
  if (Object.keys(object(receipt.materializationIntent)).length) return false;
  const draft = object(receipt.candidateDraftAfter);
  return expected.targetAt === null
    && expected.tagIds.length === 0
    && text(draft.title) === expected.title
    && (text(draft.description) || null) === expected.description;
}

function goalMatches(goal: any, input: {
  actorId: string;
  roomId: string;
  clientRequestId: string;
  materializationIntent: ReturnType<typeof transcriptGoalMaterializationIntent>;
}) {
  const source = object(goal?.sourceJson);
  const linkedTagIds = Array.isArray(goal?.tagLinks)
    ? goal.tagLinks.map((link: any) => text(link?.tagId)).filter(Boolean).sort()
    : [];
  return goal?.ownerUserId === input.actorId
    && goal?.roomId === input.roomId
    && source.schema === TRANSCRIPT_DERIVED_GOAL_SCHEMA
    && text(source.clientRequestId) === input.clientRequestId
    && text(source.createdByUserId) === input.actorId
    && goal?.title === input.materializationIntent.title
    && (goal?.description ?? null) === input.materializationIntent.description
    && (goal?.targetAt instanceof Date ? goal.targetAt.toISOString() : goal?.targetAt ?? null) === input.materializationIntent.targetAt
    && JSON.stringify(linkedTagIds) === JSON.stringify(input.materializationIntent.tagIds)
    && (sameTranscriptGoalMaterializationIntent(source.materializationIntent, input.materializationIntent)
      || !Object.keys(object(source.materializationIntent)).length);
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
  const mergeTargetGoalId = text(body.mergeTargetGoalId);
  const mergeExpectedUpdatedAt = text(body.mergeExpectedUpdatedAt);
  const targetAt = normalizeTranscriptGoalTargetAt(body.targetAt);
  const tagIds = normalizeTranscriptGoalTagIds(body.tagIds);

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
      error: "Choose ACCEPT, EDIT, MERGE, REJECT, or DEFER.",
      allowedDecisions: TRANSCRIPT_GOAL_REVIEW_DECISIONS,
    }, { status: 400 });
  }
  if (reviewDecision === "EDIT" && !hasOwn(body, "title") && !hasOwn(body, "description")) {
    return NextResponse.json({ ok: false, errorCode: "GOAL_CANDIDATE_EDIT_REQUIRED", error: "Edit the candidate title or definition." }, { status: 400 });
  }
  if (reviewDecision === "MERGE" && (!mergeTargetGoalId || !mergeExpectedUpdatedAt || iso(mergeExpectedUpdatedAt) !== mergeExpectedUpdatedAt)) {
    return NextResponse.json({
      ok: false,
      errorCode: "GOAL_CANDIDATE_MERGE_TARGET_REQUIRED",
      error: "Choose one current existing goal before adding this reviewed transcript evidence.",
    }, { status: 400 });
  }
  if (reviewDecision !== "MERGE" && (hasOwn(body, "mergeTargetGoalId") || hasOwn(body, "mergeExpectedUpdatedAt"))) {
    return NextResponse.json({
      ok: false,
      errorCode: "GOAL_CANDIDATE_MERGE_OPTIONS_INVALID",
      error: "Existing-goal target evidence applies only to MERGE.",
    }, { status: 400 });
  }
  if (reviewDecision === "MERGE" && (hasOwn(body, "title") || hasOwn(body, "description") || hasOwn(body, "targetAt") || hasOwn(body, "tagIds"))) {
    return NextResponse.json({
      ok: false,
      errorCode: "GOAL_CANDIDATE_MERGE_MUTATION_INVALID",
      error: "Merging evidence cannot change the selected goal's title, definition, target date, or tags.",
    }, { status: 400 });
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
  if (targetAt === undefined) {
    return NextResponse.json({ ok: false, errorCode: "GOAL_CANDIDATE_TARGET_AT_INVALID", error: "Choose a valid target date within ten years." }, { status: 400 });
  }
  if (tagIds === null) {
    return NextResponse.json({ ok: false, errorCode: "GOAL_CANDIDATE_TAGS_INVALID", error: "Choose at most 24 valid project tags." }, { status: 400 });
  }
  if (reviewDecision !== "ACCEPT" && (hasOwn(body, "targetAt") || hasOwn(body, "tagIds"))) {
    return NextResponse.json({
      ok: false,
      errorCode: "GOAL_CANDIDATE_MATERIALIZATION_OPTIONS_INVALID",
      error: "Target date and tags apply only when accepting a candidate as a canonical goal.",
    }, { status: 400 });
  }

  const prisma = getPrismaClient() as any;
  const actor = {
    id: session.user.id,
    primaryEmail: session.user.primaryEmail,
    email: session.user.primaryEmail || session.user.email,
    isStaff: session.user.isStaff === true,
  };
  const room = await prisma.callRoom.findFirst({
    where: sessionMutationAccessWhere(roomId, actor),
    select: { id: true, projectId: true },
  });
  if (!room) {
    return NextResponse.json({ ok: false, errorCode: "ROOM_ACCESS_DENIED", error: "You do not have access to this packet room." }, { status: 404 });
  }

  try {
    const result = await prisma.$transaction(async (tx: any) => {
      await acquirePrismaAdvisoryTransactionLock(tx, `transcript-job-packet-source:${transcriptJobId}`);
      const authorizedRoom = await tx.callRoom.findFirst({
        where: sessionMutationAccessWhere(roomId, actor),
        select: { id: true, projectId: true },
      });
      if (!authorizedRoom) {
        throw new GoalReviewBoundaryError(
          404,
          "SESSION_ACCESS_REVOKED",
          "Session access changed before goal review completed. Refresh before trying again.",
        );
      }
      const summaryCandidates = await tx.coachingNote.findMany({
        where: { roomId, kind: "SUMMARY" },
        orderBy: { createdAt: "desc" },
        select: { id: true, roomId: true, kind: true, sourceJson: true, createdAt: true, updatedAt: true },
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
          speakerAttributions: { where: { status: "active" }, orderBy: { updatedAt: "desc" } },
          segments: {
            orderBy: TRANSCRIPT_PACKET_SEGMENT_ORDER_BY,
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
      if (!packetTemplateMatches(lockedSource) || !packetSnapshotMatches(lockedSource, transcriptJob.segments, transcriptJob.speakerAttributions)) {
        throw new GoalReviewBoundaryError(409, "TRANSCRIPT_REVIEW_CHANGED", "Transcript review changed after this packet was built. Build a new packet before reviewing the goal candidate.");
      }
      const transcriptSnapshotSha256 = text(object(lockedSource.transcriptSnapshot).sha256);

      const actorGoals = await tx.goal.findMany({
        where: {
          ownerUserId: actor.id,
          OR: [
            { roomId },
            ...(authorizedRoom.projectId ? [{ projectId: authorizedRoom.projectId }] : []),
          ],
        },
        orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
        take: 500,
      });
      const candidates = buildPacketGoalCandidates({ summary: lockedSummary, latestTranscriptJob: transcriptJob, goals: actorGoals, packetBuildId });
      const candidate = candidates.find((item) => item.id === goalCandidateId);
      if (!candidate
          || candidate.roomId !== roomId
          || candidate.transcriptJobId !== transcriptJobId
          || candidate.recordingAssetId !== recordingAssetId
          || candidate.packetBuildId !== packetBuildId) {
        throw new GoalReviewBoundaryError(409, "STALE_GOAL_CANDIDATE", "The goal candidate is missing from the current packet build. Refresh before reviewing it.");
      }
      const evidenceSegments = resolvePacketEvidenceSpan(
        candidate,
        projectTranscriptSegmentsForPacket(transcriptJob.segments, transcriptJob.speakerAttributions),
      );
      if (!evidenceSegments) {
        throw new GoalReviewBoundaryError(
          409,
          "STALE_GOAL_CANDIDATE_EVIDENCE",
          "The goal candidate's complete transcript evidence changed. Build the current packet before reviewing it.",
        );
      }

      const before = { title: candidate.suggestedTitle, description: candidate.suggestedDescription };
      const after = {
        title: hasOwn(body, "title") ? text(body.title) : before.title,
        description: hasOwn(body, "description") ? text(body.description) : before.description,
      };
      const requestedIntent = transcriptGoalMaterializationIntent({
        title: after.title,
        description: after.description || null,
        targetAt,
        tagIds,
      });

      const receipts = objects(lockedSource.goalCandidateReviewReceipts);
      const terminalReceipt = receipts.filter((receipt) => (
        text(receipt.goalCandidateId) === goalCandidateId
        && (text(receipt.decision) === "ACCEPT" || text(receipt.decision) === "MERGE")
      )).at(-1) ?? null;
      if (terminalReceipt) {
        const completedDecision = text(terminalReceipt.decision);
        if (reviewDecision !== completedDecision) {
          throw new GoalReviewBoundaryError(
            409,
            "GOAL_CANDIDATE_ALREADY_COMPLETED",
            completedDecision === "MERGE"
              ? "This candidate already added evidence to an existing Goal and cannot be reviewed again as an uncommitted draft."
              : "This candidate already became a Goal and cannot be reviewed again as an uncommitted draft.",
          );
        }
        if (completedDecision === "ACCEPT" && !acceptedReceiptIntentMatches(terminalReceipt, requestedIntent)) {
          throw new GoalReviewBoundaryError(
            409,
            "GOAL_CANDIDATE_IDEMPOTENCY_CONFLICT",
            "This candidate was already accepted with different wording, target date, or tags. Open the canonical goal to edit it.",
          );
        }
        if (completedDecision === "MERGE" && !exactMergeTargetRequest(terminalReceipt, mergeTargetGoalId, mergeExpectedUpdatedAt)) {
          throw new GoalReviewBoundaryError(
            409,
            "GOAL_CANDIDATE_IDEMPOTENCY_CONFLICT",
            "This candidate already added evidence to a different goal snapshot. Open that canonical goal instead.",
          );
        }
        const completedGoal = await tx.goal.findUnique({
          where: { id: text(terminalReceipt.goalId) },
          include: { tagLinks: { select: { tagId: true, tag: { select: { id: true, label: true, slug: true } } } } },
        });
        const receiptMatchesPacket = terminalReceipt.kind === REVIEW_RECEIPT_KIND
          && text(terminalReceipt.transcriptJobId) === transcriptJobId
          && text(terminalReceipt.recordingAssetId) === recordingAssetId
          && text(terminalReceipt.packetBuildId) === packetBuildId
          && text(terminalReceipt.summaryNoteId) === summaryNoteId
          && text(terminalReceipt.roomId) === roomId
          && text(terminalReceipt.transcriptSnapshotSha256) === transcriptSnapshotSha256;
        const acceptedGoalMatches = completedDecision !== "ACCEPT" || goalMatches(completedGoal, {
            actorId: actor.id,
            roomId,
            clientRequestId: candidate.clientRequestId,
            materializationIntent: requestedIntent,
          });
        let mergeReceiptMatches = completedDecision !== "MERGE";
        if (completedDecision === "MERGE") {
          const progressReceipt = await tx.goalProgressReceipt.findUnique({
            where: { id: text(terminalReceipt.goalProgressReceiptId) },
          });
          const mergedSource = readTranscriptMergedGoalSource(progressReceipt?.evidenceJson);
          mergeReceiptMatches = Boolean(
            completedGoal?.ownerUserId === actor.id
            && progressReceipt?.kind === GOAL_EVIDENCE_MERGE_KIND
            && progressReceipt?.goalId === completedGoal?.id
            && progressReceipt?.actorUserId === actor.id
            && mergedSource?.receiptId === text(terminalReceipt.id)
            && mergedSource?.goalCandidateId === goalCandidateId
            && mergedSource?.sourceAnchor.roomId === roomId
            && mergedSource?.sourceAnchor.transcriptJobId === transcriptJobId
            && mergedSource?.sourceAnchor.recordingAssetId === recordingAssetId
            && mergedSource?.sourceAnchor.segmentId === candidate.segmentId,
          );
        }
        if (!receiptMatchesPacket || !acceptedGoalMatches || !mergeReceiptMatches) {
          throw new GoalReviewBoundaryError(
            409,
            "GOAL_CANDIDATE_RECEIPT_MISMATCH",
            "The completed candidate receipt no longer matches one canonical Goal and its exact evidence ledger.",
          );
        }
        return {
          candidate,
          receipt: terminalReceipt,
          goal: completedGoal,
          idempotentReplay: true,
          governance: readGovernedActionSourceReference(terminalReceipt.governance),
        };
      }
      if (candidate.committedGoalId && reviewDecision !== "ACCEPT") {
        throw new GoalReviewBoundaryError(409, "GOAL_CANDIDATE_ALREADY_ACCEPTED", "This candidate is already bound to a canonical Goal.");
      }
      const sourceReviewState = transcriptSpanReviewState(evidenceSegments);

      const reviewedAt = new Date().toISOString();
      const receiptId = randomUUID();
      let goal: any = null;
      let goalReplay = false;
      let goalProgressReceiptId: string | null = null;
      let mergeTargetBefore: ReturnType<typeof mergeTargetSnapshot> | null = null;
      let mergeTargetAfter: ReturnType<typeof mergeTargetSnapshot> | null = null;
      let candidateSource: Record<string, unknown> | null = null;
      let governance: ReturnType<typeof readGovernedActionSourceReference> = null;
      if (reviewDecision === "ACCEPT") {
        const creation = await createTranscriptDerivedGoalInTransaction({
          tx,
          actor,
          goal: {
            roomId,
            segmentId: candidate.segmentId,
            segmentIds: candidate.segmentIds,
            clientRequestId: candidate.clientRequestId,
            expectedProviderTextSha256: candidate.providerTextSha256,
            expectedSourceTextSha256: candidate.sourceTextSha256,
            title: after.title,
            description: after.description || null,
            targetAt,
            tagIds,
            surface: "nest-session-packet-goal-review",
          },
        });
        goal = creation.goal;
        goalReplay = creation.idempotentReplay;
        governance = creation.governance;
      } else if (reviewDecision === "MERGE") {
        await tx.$queryRaw`SELECT "id" FROM "Goal" WHERE "id" = ${mergeTargetGoalId} FOR UPDATE`;
        const mergeTarget = await tx.goal.findFirst({
          where: {
            id: mergeTargetGoalId,
            ownerUserId: actor.id,
            status: { in: ["ACTIVE", "PAUSED"] },
            ...(authorizedRoom.projectId
              ? { projectId: authorizedRoom.projectId }
              : { roomId }),
          },
          include: {
            tagLinks: {
              select: {
                tagId: true,
                tag: { select: { id: true, label: true, slug: true } },
              },
            },
            taskLinks: { select: { actionItemId: true, relationship: true } },
          },
        });
        if (!mergeTarget) {
          throw new GoalReviewBoundaryError(
            409,
            "GOAL_CANDIDATE_MERGE_TARGET_UNAVAILABLE",
            "That goal is no longer an active actor-owned goal in this Nest. Refresh and choose another target.",
          );
        }
        mergeTargetBefore = mergeTargetSnapshot(mergeTarget);
        if (mergeTargetBefore.updatedAt !== mergeExpectedUpdatedAt) {
          throw new GoalReviewBoundaryError(
            409,
            "GOAL_CANDIDATE_MERGE_TARGET_CHANGED",
            "That goal changed after you selected it. Refresh and review its current definition before adding evidence.",
          );
        }
        const resolvedEvidence = await resolveTranscriptGoalEvidenceInTransaction({
          tx,
          actor,
          roomId,
          segmentId: candidate.segmentId,
          segmentIds: candidate.segmentIds,
          expectedProviderTextSha256: candidate.providerTextSha256,
          expectedSourceTextSha256: candidate.sourceTextSha256,
        });
        if (
          resolvedEvidence.desk.transcriptJobId !== transcriptJobId
          || resolvedEvidence.playback.recordingAssetId !== recordingAssetId
          || (authorizedRoom.projectId && resolvedEvidence.desk.projectId !== authorizedRoom.projectId)
        ) {
          throw new GoalReviewBoundaryError(
            409,
            "GOAL_CANDIDATE_MERGE_EVIDENCE_CHANGED",
            "The current released transcript evidence no longer matches this packet and Nest.",
          );
        }
        candidateSource = {
          schema: TRANSCRIPT_DERIVED_GOAL_SCHEMA,
          roomId,
          transcriptJobId,
          ...resolvedEvidence.sourceAnchor,
          sourceReviewState,
          automaticallySuggested: true,
          recordingAssetId,
          playbackSourceId: resolvedEvidence.playback.sourceId,
        };
        goalProgressReceiptId = randomUUID();
        const mergedEvidence = {
          schema: TRANSCRIPT_GOAL_EVIDENCE_MERGE_SCHEMA,
          receiptId,
          goalCandidateId,
          mergedAt: reviewedAt,
          mergedByUserId: actor.id,
          candidateSource,
          packet: {
            roomId,
            transcriptJobId,
            recordingAssetId,
            summaryNoteId,
            packetBuildId,
            transcriptSnapshotSha256,
          },
          boundaries: {
            explicitHumanDecision: true,
            goalDefinitionMutated: false,
            goalStatusMutated: false,
            goalTargetMutated: false,
            goalTagsMutated: false,
            goalTaskLinksMutated: false,
            externalSideEffects: false,
          },
        };
        await tx.goalProgressReceipt.create({
          data: {
            id: goalProgressReceiptId,
            goalId: mergeTarget.id,
            actorUserId: actor.id,
            kind: GOAL_EVIDENCE_MERGE_KIND,
            progressPercent: null,
            note: reviewNote || candidate.sourceText.slice(0, MAX_REVIEW_NOTE_LENGTH),
            occurredAt: new Date(reviewedAt),
            evidenceJson: mergedEvidence,
          },
        });
        goal = mergeTarget;
        mergeTargetAfter = mergeTargetSnapshot(mergeTarget);
        const mergeBoundaries = boundaries({ goalEvidenceAppended: true, sourceReviewState });
        governance = await recordSucceededTranscriptWorkAction(tx, {
          capabilityId: TRANSCRIPT_GOAL_EVIDENCE_MERGE_CAPABILITY_ID,
          clientRequestId: receiptId,
          projectId: authorizedRoom.projectId ?? mergeTarget.projectId ?? null,
          roomId,
          actorUserId: actor.id,
          actorEmail: actor.email || "unknown@quipsly.invalid",
          sourceSurface: "nest-session-packet-goal-review",
          targetObjectType: "Goal",
          targetObjectId: mergeTarget.id,
          payload: {
            contractKind: "quipsly-transcript-goal-evidence-merge-payload-v1",
            roomId,
            segmentId: candidate.segmentId,
            segmentIds: candidate.segmentIds,
            expectedProviderTextSha256: candidate.providerTextSha256,
            expectedSourceTextSha256: candidate.sourceTextSha256 ?? null,
            targetObjectId: mergeTarget.id,
            expectedTargetUpdatedAt: mergeExpectedUpdatedAt,
            evidenceReceiptId: goalProgressReceiptId,
            packetReviewReceiptId: receiptId,
          },
          sourceEvidence: {
            objectType: "TranscriptSegmentSpan",
            transcriptSnapshotSha256,
            ...candidateSource,
          },
          result: {
            targetObjectType: "Goal",
            targetObjectId: mergeTarget.id,
            evidenceReceiptId: goalProgressReceiptId,
            targetBefore: mergeTargetBefore,
            targetAfter: mergeTargetAfter,
            status: mergeTarget.status,
          },
          boundaries: mergeBoundaries,
        });
        await tx.goalProgressReceipt.update({
          where: { id: goalProgressReceiptId },
          data: { evidenceJson: { ...mergedEvidence, governance } },
        });
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
        segmentIds: candidate.segmentIds,
        sourceTextSha256: candidate.sourceTextSha256,
        sourceSpan: candidate.sourceSpan,
        providerTextSha256: candidate.providerTextSha256,
        acceptedReviewId: candidate.acceptedReviewId,
        acceptedCorrectionId: candidate.acceptedCorrectionId,
        transcriptReviewStatus: candidate.transcriptReviewStatus,
        reviewedAt,
        reviewedByUserId: actor.id,
        reviewNote,
        candidateDraftBefore: before,
        candidateDraftAfter: after,
        materializationIntent: reviewDecision === "ACCEPT" ? requestedIntent : null,
        appliedTags: reviewDecision === "ACCEPT" && Array.isArray(object(goal?.sourceJson).appliedTags)
          ? object(goal?.sourceJson).appliedTags
          : [],
        goalId: goal?.id ?? null,
        goalProgressReceiptId,
        mergeTargetBefore,
        mergeTargetAfter,
        candidateSource,
        sourceReviewState,
        externalSideEffects: false,
        taskCreated: false,
        goalCreated: reviewDecision === "ACCEPT",
        goalEvidenceAppended: reviewDecision === "MERGE",
        goalDefinitionMutated: false,
        goalStatusMutated: false,
        targetDateCreated: reviewDecision === "ACCEPT" && targetAt !== null,
        projectTagsApplied: reviewDecision === "ACCEPT" && tagIds.length > 0,
        reminderCreated: false,
        calendarMutated: false,
        deliveryClaimed: false,
        publicationClaimed: false,
        governance,
      };
      await tx.coachingNote.update({
        where: { id: summaryNoteId },
        data: { sourceJson: { ...lockedSource, goalCandidateReviewReceipts: [...receipts, receipt], lastGoalCandidateReview: receipt } },
      });
      return { candidate, receipt, goal, idempotentReplay: goalReplay, governance };
    }, { isolationLevel: "Serializable" });

    return NextResponse.json({
      ok: true,
      decision: reviewDecision,
      goalCandidateId,
      candidate: result.candidate,
      receipt: result.receipt,
      governance: result.governance,
      goal: result.goal ? {
        id: result.goal.id,
        title: result.goal.title,
        description: result.goal.description,
        status: result.goal.status,
        roomId: result.goal.roomId,
        targetAt: result.goal.targetAt instanceof Date ? result.goal.targetAt.toISOString() : result.goal.targetAt,
        tags: Array.isArray(object(result.receipt).appliedTags) && (object(result.receipt).appliedTags as unknown[]).length
          ? object(result.receipt).appliedTags
          : Array.isArray(result.goal.tagLinks)
            ? result.goal.tagLinks.flatMap((link: any) => link?.tag ? [link.tag] : [])
            : [],
      } : null,
      idempotentReplay: result.idempotentReplay,
      boundaries: boundaries({
        targetDateCreated: reviewDecision === "ACCEPT" && targetAt !== null,
        tagsApplied: reviewDecision === "ACCEPT" && tagIds.length > 0,
        goalEvidenceAppended: reviewDecision === "MERGE",
        sourceReviewState: result.candidate.transcriptReviewStatus === "human-reviewed"
          ? "human-reviewed"
          : "provider-transcript",
      }),
      nextAction: reviewDecision === "ACCEPT"
        ? `The reviewed draft is now one actor-owned canonical Goal${targetAt ? " with an explicit target date" : ""}${tagIds.length ? " and reviewed project tags" : ""}. Tasks, focus blocks, reminders, calendar events, messages, and delivery remain separate explicit actions.`
        : reviewDecision === "MERGE"
          ? "The reviewed transcript evidence was appended to one selected existing Goal. Its title, definition, status, target date, tags, tasks, and project identity did not change; open Work to inspect the evidence and return to playback."
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
