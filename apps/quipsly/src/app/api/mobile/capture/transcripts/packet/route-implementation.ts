import { NextResponse } from "next/server";
import {
  isTranscriptGoalReviewDecision,
  isTranscriptNoteReviewDecision,
  transcriptPacketNoteCandidateId,
  type TranscriptGoalReviewStatus,
  type TranscriptNoteReviewStatus,
} from "@high-ground/quipsly-domain/coaching-packet";
import { TRANSCRIPT_DERIVED_NOTE_SCHEMA } from "@high-ground/quipsly-domain/transcript-derived-task";

import { getPrismaClient } from "@/lib/prisma";
import {
  EDITABLE_SESSION_NOTE_KINDS,
  isEditableSessionNoteKind,
  isSessionNoteVisibility,
} from "@/lib/session-note-contract";
import { acquirePrismaAdvisoryTransactionLock } from "@/lib/server/prisma-advisory-lock";
import {
  buildCoachingPacketFromTranscriptJob,
  isUnreviewedTranscriptActionItem,
  mergePacketActionCandidates,
  packetSnapshotMatchesTranscriptJob,
  packetTemplateMatches,
  projectTranscriptJobSegmentsForPacket,
  resolvePacketEvidenceSpan,
  selectLatestCorrelatedPacketNotes,
  TRANSCRIPT_PACKET_SEGMENT_ORDER_BY,
  transcriptJobPacketSnapshot,
} from "@/lib/server/coaching-packets";
import { buildTranscriptSourceAnchorFields } from "@/lib/server/transcript-source-span";
import { buildSessionTranscriptConfidence } from "@/lib/session-transcript-confidence";
import { mobileCaptureTranscriptProcessingGate } from "@/lib/server/mobile-capture-processing-gates";
import {
  captureTranscriptFollowThroughAuthorId,
  reconcileCaptureTranscriptFollowThrough,
} from "@/lib/server/capture-transcript-follow-through";
import { getQuipslySessionFromRequest } from "@/lib/server/quipsly-session";
import { mobileSessionNoteVisibilityWhere } from "@/lib/server/session-note-access";
import { readGovernedActionSourceReference } from "@/lib/server/governed-action-runtime";
import {
  sessionAccessWhere,
  sessionActorAccessWhere,
  sessionMutationAccessWhere,
  sessionMutationActorAccessWhere,
  type SessionAccessActor,
} from "@/lib/server/session-access";

// Kept outside route.ts so candidate builders remain directly testable.
const PACKET_KIND = "quipsly-mobile-capture-transcript-packet-v1";
const REVIEW_LANE_STATUSES = new Set([
  "READY_FOR_HUMAN_REVIEW",
  "APPROVED_FOR_INTERNAL_USE",
  "NEEDS_REVISION",
  "REJECTED_BY_HUMAN",
]);

class PacketReviewBoundaryError extends Error {
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

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export function packetNoteVisibilityWhere(
  actor: SessionAccessActor,
  roomId: string,
) {
  return {
    AND: [
      { roomId },
      mobileSessionNoteVisibilityWhere({
        actorUserId: actor.id,
        actorEmail: text(actor.primaryEmail).toLowerCase(),
        isStaff: actor.isStaff === true,
      }),
    ],
  };
}

function sourceJson(value: unknown): Record<string, unknown> {
  return isObject(value) ? value : {};
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

const GOAL_REVIEW_RECEIPT_KIND = "quipsly-goal-candidate-review-receipt-v1";
const GOAL_EVIDENCE_MERGE_KIND = "TRANSCRIPT_CANDIDATE_MERGED";
const TASK_EVIDENCE_MERGE_KIND = "TRANSCRIPT_CANDIDATE_MERGED";
const NOTE_REVIEW_RECEIPT_KIND = "quipsly-note-candidate-review-receipt-v1";

export function goalReviewStatus(
  decision: unknown,
): TranscriptGoalReviewStatus {
  if (decision === "ACCEPT") return "ACCEPTED_AS_GOAL";
  if (decision === "MERGE") return "MERGED_INTO_GOAL";
  if (decision === "EDIT") return "EDITED_FOR_REVIEW";
  if (decision === "REJECT") return "REJECTED_BY_HUMAN";
  if (decision === "DEFER") return "DEFERRED_BY_HUMAN";
  return "READY_FOR_HUMAN_REVIEW";
}

export function noteReviewStatus(
  decision: unknown,
): TranscriptNoteReviewStatus {
  if (decision === "ACCEPT") return "ACCEPTED_AS_NOTE";
  if (decision === "MERGE") return "MERGED_INTO_NOTE";
  if (decision === "EDIT") return "EDITED_FOR_REVIEW";
  if (decision === "REJECT") return "REJECTED_BY_HUMAN";
  if (decision === "DEFER") return "DEFERRED_BY_HUMAN";
  return "READY_FOR_HUMAN_REVIEW";
}

export function buildPacketGoalCandidates(input: {
  summary: any;
  latestTranscriptJob: any;
  goals: any[];
  packetBuildId: string | null;
}) {
  if (
    !input.summary ||
    !input.packetBuildId ||
    input.latestTranscriptJob?.status !== "COMPLETED"
  )
    return [];
  const brief = sourceJson(sourceJson(input.summary.sourceJson).packetBrief);
  if (
    brief.kind !== "quipsly-transcript-packet-brief-v1" ||
    brief.candidateOnly !== true ||
    brief.humanApprovalRequired !== true
  )
    return [];
  const goalsSection = asArray(brief.sections)
    .filter(isObject)
    .find((section) => section.id === "goals");
  if (!goalsSection) return [];
  const projectedSegments = projectTranscriptJobSegmentsForPacket(
    input.latestTranscriptJob,
  );
  const committedByRequest = new Map(
    input.goals.flatMap((goal) => {
      const source = sourceJson(goal.sourceJson);
      const requestId = text(source.clientRequestId);
      return source.schema === "quipsly-transcript-derived-goal-v1" && requestId
        ? [[requestId, goal]]
        : [];
    }),
  );
  const reviewReceipts = asArray(
    sourceJson(input.summary.sourceJson).goalCandidateReviewReceipts,
  ).filter(isObject);
  return asArray(goalsSection.items)
    .filter(isObject)
    .flatMap((item) => {
      const segmentId = text(item.segmentId);
      const spanSegments = resolvePacketEvidenceSpan(item, projectedSegments);
      const anchor = spanSegments
        ? buildTranscriptSourceAnchorFields(spanSegments)
        : null;
      const segment = spanSegments?.[0];
      const transcriptText = text(anchor?.effectiveTextSnapshot);
      if (!segment || !anchor || !segmentId || !transcriptText) return [];
      const clientRequestId = `packet-goal-${input.packetBuildId}-${segmentId}`;
      const committedGoal = committedByRequest.get(clientRequestId) ?? null;
      const startSeconds =
        typeof segment.startSeconds === "number"
          ? segment.startSeconds
          : Number.NaN;
      const endSeconds =
        typeof segment.endSeconds === "number"
          ? segment.endSeconds
          : Number.NaN;
      if (
        !Number.isFinite(startSeconds) ||
        !Number.isFinite(endSeconds) ||
        endSeconds < startSeconds
      )
        return [];
      const latestReceipt =
        reviewReceipts
          .filter(
            (receipt) =>
              receipt.kind === GOAL_REVIEW_RECEIPT_KIND &&
              text(receipt.goalCandidateId) === clientRequestId &&
              text(receipt.roomId) === input.latestTranscriptJob.roomId &&
              text(receipt.transcriptJobId) === input.latestTranscriptJob.id &&
              text(receipt.recordingAssetId) ===
                input.latestTranscriptJob.assetId &&
              text(receipt.packetBuildId) === input.packetBuildId &&
              isTranscriptGoalReviewDecision(text(receipt.decision)),
          )
          .at(-1) ?? null;
      const mergedGoal =
        latestReceipt?.decision === "MERGE"
          ? (input.goals.find(
              (goal) => text(goal?.id) === text(latestReceipt.goalId),
            ) ?? null)
          : null;
      const terminalGoal = committedGoal ?? mergedGoal;
      const reviewedDraft = sourceJson(latestReceipt?.candidateDraftAfter);
      const suggestedTitle =
        text(reviewedDraft.title).slice(0, 240) ||
        text(item.text).slice(0, 240) ||
        transcriptText.slice(0, 240);
      const suggestedDescription =
        text(reviewedDraft.description).slice(0, 5_000) ||
        transcriptText.slice(0, 5_000);
      return [
        {
          id: clientRequestId,
          clientRequestId,
          roomId: input.latestTranscriptJob.roomId,
          transcriptJobId: input.latestTranscriptJob.id,
          recordingAssetId: input.latestTranscriptJob.assetId,
          packetBuildId: input.packetBuildId,
          segmentId,
          segmentIds: anchor.segmentIds,
          speakerLabel: text(segment.speakerLabel) || null,
          speakerAuthority: segment.speakerAuthority,
          startSeconds: anchor.startSeconds,
          endSeconds: anchor.endSeconds,
          sourceText: transcriptText,
          sourceTextSha256: text(item.sourceTextSha256),
          providerTextSha256: anchor.providerTextSha256,
          sourceSpan: anchor.sourceSpan,
          acceptedReviewId: segment.acceptedReviewId,
          acceptedCorrectionId: segment.acceptedCorrectionId,
          transcriptReviewStatus: spanSegments.every(
            (item) => item.reviewStatus === "human-reviewed",
          )
            ? "human-reviewed"
            : "provider",
          suggestedTitle,
          suggestedDescription,
          reviewStatus: committedGoal
            ? "ACCEPTED_AS_GOAL"
            : mergedGoal
              ? "MERGED_INTO_GOAL"
              : goalReviewStatus(latestReceipt?.decision),
          humanApprovalRequired: !terminalGoal,
          committedGoalId: terminalGoal?.id ?? null,
          lastHumanReview: latestReceipt
            ? {
                receiptId: text(latestReceipt.id),
                decision: text(latestReceipt.decision),
                reviewedAt: text(latestReceipt.reviewedAt),
                reviewedByUserId: text(latestReceipt.reviewedByUserId),
                governance: readGovernedActionSourceReference(
                  latestReceipt.governance,
                ),
              }
            : null,
        },
      ];
    });
}

export function buildPacketNoteCandidates(input: {
  summary: any;
  latestTranscriptJob: any;
  notes: any[];
  packetBuildId: string | null;
  actorUserId: string;
}) {
  if (
    !input.summary ||
    !input.packetBuildId ||
    input.latestTranscriptJob?.status !== "COMPLETED"
  )
    return [];
  const summarySource = sourceJson(input.summary.sourceJson);
  const lanes = asArray(summarySource.reviewLanes).filter(isObject);
  if (!lanes.length) return [];
  const projectedSegments = projectTranscriptJobSegmentsForPacket(
    input.latestTranscriptJob,
  );
  const reviewReceipts = asArray(
    summarySource.noteCandidateReviewReceipts,
  ).filter(isObject);
  const transcriptSnapshotSha256 = text(
    sourceJson(summarySource.transcriptSnapshot).sha256,
  );
  const committedByCandidate = new Map(
    input.notes.flatMap((note) => {
      const source = sourceJson(note.sourceJson);
      const candidateId = text(source.packetNoteCandidateId);
      return source.schema === TRANSCRIPT_DERIVED_NOTE_SCHEMA &&
        note.authorUserId === input.actorUserId &&
        candidateId
        ? [[candidateId, note]]
        : [];
    }),
  );
  const seen = new Set<string>();
  const candidates: any[] = [];

  const latestExactHistoricalDraft = (evidence: {
    laneId: string;
    segmentId: string;
    segmentIds: string[];
    sourceTextSha256: string;
    providerTextSha256: string;
  }) =>
    input.notes
      .flatMap((note) => {
        const source = sourceJson(note?.sourceJson);
        if (
          source.source !== "transcript-packet-builder" ||
          text(source.transcriptJobId) !== input.latestTranscriptJob.id ||
          text(source.roomId) !== input.latestTranscriptJob.roomId ||
          text(source.recordingAssetId) !== input.latestTranscriptJob.assetId
        )
          return [];
        return asArray(source.noteCandidateReviewReceipts)
          .filter(isObject)
          .flatMap((receipt) => {
            const receiptSegments = asArray(receipt.segmentIds)
              .map(text)
              .filter(Boolean);
            const exactSegments =
              receiptSegments.length === evidence.segmentIds.length &&
              receiptSegments.every(
                (id, index) => id === evidence.segmentIds[index],
              );
            const decision = text(receipt.decision);
            return receipt.kind === NOTE_REVIEW_RECEIPT_KIND &&
              text(receipt.reviewedByUserId) === input.actorUserId &&
              text(receipt.roomId) === input.latestTranscriptJob.roomId &&
              text(receipt.transcriptJobId) === input.latestTranscriptJob.id &&
              text(receipt.recordingAssetId) ===
                input.latestTranscriptJob.assetId &&
              text(receipt.packetLaneId) === evidence.laneId &&
              text(receipt.segmentId) === evidence.segmentId &&
              exactSegments &&
              evidence.sourceTextSha256 &&
              text(receipt.sourceTextSha256) === evidence.sourceTextSha256 &&
              text(receipt.providerTextSha256) ===
                evidence.providerTextSha256 &&
              ["EDIT", "DEFER", "REJECT"].includes(decision)
              ? [
                  {
                    receipt,
                    timestamp: Date.parse(text(receipt.reviewedAt)) || 0,
                  },
                ]
              : [];
          });
      })
      .sort(
        (left, right) =>
          left.timestamp - right.timestamp ||
          text(left.receipt.id).localeCompare(text(right.receipt.id)),
      )
      .at(-1)?.receipt ?? null;

  for (const lane of lanes) {
    const laneId = text(lane.id);
    const laneLabel = text(lane.label) || "Session note";
    const laneStatus = text(lane.status) || "READY_FOR_HUMAN_REVIEW";
    if (!laneId || laneStatus === "EMPTY") continue;
    for (const item of asArray(lane.items).filter(isObject)) {
      const segmentId = text(item.segmentId);
      const spanSegments = resolvePacketEvidenceSpan(item, projectedSegments);
      const anchor = spanSegments
        ? buildTranscriptSourceAnchorFields(spanSegments)
        : null;
      const segment = spanSegments?.[0];
      if (!segment || !anchor || !segmentId) continue;
      const id = transcriptPacketNoteCandidateId(
        input.packetBuildId,
        laneId,
        segmentId,
      );
      if (seen.has(id)) continue;
      seen.add(id);
      const committed = committedByCandidate.get(id) ?? null;
      const latestReceipt =
        reviewReceipts
          .filter(
            (receipt) =>
              receipt.kind === NOTE_REVIEW_RECEIPT_KIND &&
              text(receipt.packetNoteCandidateId) === id &&
              text(receipt.reviewedByUserId) === input.actorUserId &&
              text(receipt.roomId) === input.latestTranscriptJob.roomId &&
              text(receipt.transcriptJobId) === input.latestTranscriptJob.id &&
              text(receipt.recordingAssetId) ===
                input.latestTranscriptJob.assetId &&
              text(receipt.packetBuildId) === input.packetBuildId &&
              text(receipt.summaryNoteId) === input.summary.id &&
              text(receipt.packetLaneId) === laneId &&
              text(receipt.transcriptSnapshotSha256) ===
                transcriptSnapshotSha256 &&
              isTranscriptNoteReviewDecision(text(receipt.decision)),
          )
          .at(-1) ?? null;
      const sourceTextSha256 = text(item.sourceTextSha256);
      const historicalDraftReceipt = latestReceipt
        ? null
        : latestExactHistoricalDraft({
            laneId,
            segmentId,
            segmentIds: anchor.segmentIds,
            sourceTextSha256,
            providerTextSha256: anchor.providerTextSha256,
          });
      const reviewedDraft = sourceJson(
        (latestReceipt ?? historicalDraftReceipt)?.candidateDraftAfter,
      );
      const sourceText = text(anchor.effectiveTextSnapshot);
      if (!sourceText) continue;
      candidates.push({
        id,
        clientRequestId: id,
        roomId: input.latestTranscriptJob.roomId,
        transcriptJobId: input.latestTranscriptJob.id,
        recordingAssetId: input.latestTranscriptJob.assetId,
        summaryNoteId: input.summary.id,
        packetBuildId: input.packetBuildId,
        laneId,
        laneLabel,
        laneStatus,
        segmentId,
        segmentIds: anchor.segmentIds,
        speakerLabel: text(segment.speakerLabel) || null,
        speakerAuthority: segment.speakerAuthority,
        startSeconds: anchor.startSeconds,
        endSeconds: anchor.endSeconds,
        sourceText,
        sourceTextSha256,
        providerTextSha256: anchor.providerTextSha256,
        sourceSpan: anchor.sourceSpan,
        acceptedReviewId: segment.acceptedReviewId,
        acceptedCorrectionId: segment.acceptedCorrectionId,
        transcriptReviewStatus: spanSegments.every(
          (entry) => entry.reviewStatus === "human-reviewed",
        )
          ? "human-reviewed"
          : "provider",
        suggestedTitle: text(reviewedDraft.title).slice(0, 500) || laneLabel,
        suggestedBody: text(reviewedDraft.body).slice(0, 20_000) || sourceText,
        suggestedKind: isEditableSessionNoteKind(reviewedDraft.kind)
          ? reviewedDraft.kind
          : "SESSION_NOTE",
        suggestedVisibility: isSessionNoteVisibility(reviewedDraft.visibility)
          ? reviewedDraft.visibility
          : "AUTHOR_PRIVATE",
        reviewStatus: committed
          ? "ACCEPTED_AS_NOTE"
          : noteReviewStatus(latestReceipt?.decision),
        humanApprovalRequired:
          !committed && text(latestReceipt?.decision) !== "MERGE",
        committedNoteId:
          committed?.id ??
          (text(latestReceipt?.decision) === "MERGE"
            ? text(latestReceipt?.noteId) || null
            : null),
        lastHumanReview: latestReceipt
          ? {
              receiptId: text(latestReceipt.id),
              decision: text(latestReceipt.decision),
              reviewedAt: text(latestReceipt.reviewedAt),
              reviewedByUserId: text(latestReceipt.reviewedByUserId),
              governance: readGovernedActionSourceReference(
                latestReceipt.governance,
              ),
            }
          : null,
        carriedForwardDraft: historicalDraftReceipt
          ? {
              receiptId: text(historicalDraftReceipt.id),
              decision: text(historicalDraftReceipt.decision),
              reviewedAt: text(historicalDraftReceipt.reviewedAt),
              reviewedByUserId: text(historicalDraftReceipt.reviewedByUserId),
              packetBuildId: text(historicalDraftReceipt.packetBuildId),
              exactSourceMatch: true,
            }
          : null,
      });
      if (candidates.length >= 30) return candidates;
    }
  }
  return candidates;
}

function reviewLaneReadyCount(lanes: unknown[]) {
  return lanes.filter((lane: any) => lane?.status === "READY_FOR_HUMAN_REVIEW")
    .length;
}

function reviewLaneNextAction(status: string) {
  if (status === "APPROVED_FOR_INTERNAL_USE") {
    return "This lane is approved inside Quipsly only. Choose a separate explicit action before assigning, delivering, publishing, or exporting it.";
  }
  if (status === "NEEDS_REVISION") {
    return "Revise this lane against the transcript and source recording evidence before approving or routing it.";
  }
  if (status === "REJECTED_BY_HUMAN") {
    return "This lane is rejected for now. Preserve the evidence, but do not route it into follow-up work unless a human reopens it.";
  }
  return "This lane is ready for human review before it becomes a task, note, quote, clip, article, or client-facing packet.";
}

async function readJson(request: Request) {
  try {
    const value = await request.json();
    return isObject(value) ? value : {};
  } catch {
    return {};
  }
}

function packetBoundaries() {
  return {
    sideEffectFreeRead: true,
    buildCreatesReviewArtifactsOnly: true,
    noRecordingStarted: true,
    noTranscriptProviderRunFromPacketRead: true,
    noExternalDelivery: true,
    noPublicationClaim: true,
    canonicalSessionAccess: true,
    canonicalSessionMutationAccess: true,
    sessionAccessRecheckedOnMutation: true,
    recordingSourceTruth:
      "Recording assets remain source evidence. Transcript segments are derived evidence. Coaching packet notes and action candidates are review projections built from completed transcript evidence. ActionItem records are committed work only after explicit human acceptance.",
    reviewRule:
      "Packet output is review-ready material, not client-delivered notes, published podcast copy, or canonical truth until a human approves the next action and a receipt is attached.",
    legacyCandidateCompatibility:
      "Older packets may still have candidate=true ActionItem rows. They remain preserved for auditability but are returned as uncommitted action candidates, not open work.",
    legacyBuildCompatibility:
      "Older packet notes have no packetBuildId. Nest still chooses their newest summary, but must fall back to transcript-wide legacy highlights because exact historical build correlation cannot be reconstructed safely.",
  };
}

function packetSafeActions(input: {
  latestTranscriptJob: any;
  selectedRecordingAsset: any;
  summary: any;
  highlights: any[];
  actionCandidates: any[];
  actionItems: any[];
  transcriptProcessingAllowed: boolean;
  packetStale: boolean;
  canReviewPrivatePacket: boolean;
}) {
  const transcriptCompleted =
    input.transcriptProcessingAllowed &&
    input.latestTranscriptJob?.status === "COMPLETED";
  const transcriptRunning = input.latestTranscriptJob?.status === "RUNNING";
  const sourceAvailable = Boolean(
    input.selectedRecordingAsset?.id ?? input.latestTranscriptJob?.asset?.id,
  );
  const packetReady = Boolean(input.summary);

  return [
    {
      id: "build-review-packet",
      label: "Build review packet",
      risk: "medium",
      enabled:
        input.canReviewPrivatePacket &&
        transcriptCompleted &&
        (!packetReady || input.packetStale),
      why: !input.canReviewPrivatePacket
        ? "Private follow-up review belongs to the canonical coach, transcript requester, or Session creator."
        : input.packetStale
          ? "Transcript review changed after this packet was built. Build a new append-only packet before reviewing candidates."
          : packetReady
            ? "A packet already exists. Use force only when intentionally creating a new review artifact from the same transcript."
            : transcriptCompleted
              ? "Completed transcript evidence is ready to become a reviewable summary, highlights, and uncommitted action candidates."
              : transcriptRunning
                ? "Transcription is still running. Wait for completed transcript evidence before packet building."
                : "Packet building waits on a completed transcript job with segments.",
      boundary:
        "Creates Nest-owned review notes and uncommitted action candidates only. It must not create open work, send follow-up, publish copy, charge money, or claim external delivery.",
    },
    {
      id: "review-packet",
      label: "Review packet",
      enabled:
        input.transcriptProcessingAllowed && packetReady && !input.packetStale,
      risk: "human-approval-required",
      why: input.packetStale
        ? "This packet is pinned to an older transcript-review snapshot and cannot be reviewed into canonical work."
        : packetReady
          ? `A packet exists with ${input.highlights.length} highlight(s), ${input.actionCandidates.length} action candidate(s), and ${input.actionItems.length} accepted action item(s).`
          : "Review waits until a packet exists.",
      boundary:
        "Review can refine, approve, or route next work. External delivery still requires a separate explicit action and receipt.",
    },
    {
      id: "repair-transcript-first",
      label: input.latestTranscriptJob?.id
        ? "Repair transcript first"
        : "Start source-bound transcript",
      enabled:
        input.transcriptProcessingAllowed &&
        sourceAvailable &&
        !transcriptCompleted,
      risk: "medium",
      why: input.latestTranscriptJob?.id
        ? `Transcript status is ${input.latestTranscriptJob.status || "unknown"}, so packet output would be incomplete or misleading.`
        : sourceAvailable
          ? "This released source has no transcript job yet. Start one from its exact RecordingAsset identity."
          : "No transcript job or selected RecordingAsset exists yet.",
      boundary:
        "Transcript repair changes derived transcript evidence only. It must preserve recording asset truth and remain inspectable.",
    },
  ];
}

function fallbackReviewLanes(input: {
  summary: any;
  highlights: any[];
  actionCandidates: any[];
}) {
  const summarySource = sourceJson(input.summary?.sourceJson);
  const savedReviewLanes = asArray(summarySource.reviewLanes).filter(isObject);
  if (savedReviewLanes.length) return savedReviewLanes;

  return [
    {
      id: "client-follow-up",
      label: "Client follow-up notes",
      status: input.summary ? "APPROVED_FOR_INTERNAL_USE" : "EMPTY",
      itemCount: input.summary ? 1 : 0,
      meaning: "Editable recap material for the client or coachee.",
      sourceTruth: "Derived from transcript packet summary evidence only.",
      reviewRule:
        "Edit or remove it in Quipsly; external delivery remains separate.",
      humanApprovalRequired: false,
      externalSideEffects: false,
      items: input.summary
        ? [
            {
              noteId: input.summary.id,
              title: input.summary.title,
              text: input.summary.body,
            },
          ]
        : [],
    },
    {
      id: "goals-and-tasks",
      label: "Goals and tasks",
      status: input.actionCandidates.length
        ? "APPROVED_FOR_INTERNAL_USE"
        : "EMPTY",
      itemCount: input.actionCandidates.length,
      meaning: "Editable commitments, tasks, goals, and next-session prep.",
      sourceTruth:
        "Derived from transcript-backed source moments with timestamps attached.",
      reviewRule:
        "Quipsly creates ordinary work; people can edit, reassign, complete, or remove it.",
      humanApprovalRequired: false,
      externalSideEffects: false,
      items: input.actionCandidates.slice(0, 5).map((candidate: any) => ({
        actionCandidateId: candidate.id,
        segmentId: candidate.segmentId,
        title: candidate.title,
        text: candidate.detail,
        status: candidate.reviewStatus,
      })),
    },
    {
      id: "podcast-production",
      label: "Podcast and episode notes",
      status: input.highlights.length ? "APPROVED_FOR_INTERNAL_USE" : "EMPTY",
      itemCount: input.highlights.length,
      meaning: "Beats, clips, quotes, article seeds, and episode notes.",
      sourceTruth: "Derived from transcript-backed highlight candidates.",
      reviewRule:
        "Use and edit these inside Quipsly. Publishing remains a separate action.",
      humanApprovalRequired: false,
      externalSideEffects: false,
      items: input.highlights.slice(0, 5).map((note: any) => ({
        noteId: note.id,
        title: note.title,
        text: note.body,
      })),
    },
  ];
}

function normalizeReviewLaneStatus(value: unknown) {
  const status = text(value)
    .toUpperCase()
    .replace(/[\s-]+/g, "_");
  return REVIEW_LANE_STATUSES.has(status) ? status : "";
}

function packetLaneReviewSafeActions(lane: any) {
  const status = text(lane?.status).toUpperCase();
  const canReview =
    status === "READY_FOR_HUMAN_REVIEW" || status === "NEEDS_REVISION";
  return [
    {
      id: "approve-lane-inside-quipsly",
      label: "Approve inside Quipsly",
      enabled: canReview,
      risk: "human-approval-required",
      boundary:
        "Marks this lane as internally reviewed only. It must not send, publish, assign, schedule, charge, or claim external delivery.",
    },
    {
      id: "request-lane-revision",
      label: "Request revision",
      enabled: status !== "REJECTED_BY_HUMAN",
      risk: "low",
      boundary:
        "Keeps the packet in review and asks for source-backed refinement. It has no external side effects.",
    },
    {
      id: "reject-lane",
      label: "Reject lane",
      enabled: status !== "REJECTED_BY_HUMAN",
      risk: "low",
      boundary:
        "Rejects this candidate lane for now while preserving the transcript evidence and review record.",
    },
  ];
}

async function resolveRoomIdFromRequest(
  prisma: any,
  request: Request,
  actor: SessionAccessActor,
  access: "read" | "mutate" = "read",
) {
  const url = new URL(request.url);
  const roomId =
    text(url.searchParams.get("callRoomId")) ||
    text(url.searchParams.get("roomId"));
  const transcriptJobId = text(url.searchParams.get("transcriptJobId"));

  if (roomId) {
    const room = await prisma.callRoom.findFirst({
      where:
        access === "mutate"
          ? sessionMutationAccessWhere(roomId, actor)
          : sessionAccessWhere(roomId, actor),
      select: { id: true },
    });
    return room?.id ?? null;
  }

  if (transcriptJobId) {
    const job = await prisma.transcriptJob.findFirst({
      where: {
        id: transcriptJobId,
        room:
          access === "mutate"
            ? sessionMutationActorAccessWhere(actor)
            : sessionActorAccessWhere(actor),
      },
      select: { roomId: true },
    });
    return job?.roomId ?? null;
  }

  return "";
}

export async function GET(request: Request) {
  const session = await getQuipslySessionFromRequest(request);

  if (!session?.user) {
    return NextResponse.json(
      { ok: false, error: "Sign in before reading a coaching packet." },
      { status: 401 },
    );
  }

  const prisma = getPrismaClient() as any;
  const actor: SessionAccessActor = session.user;
  const roomId = await resolveRoomIdFromRequest(prisma, request, actor);
  const requestUrl = new URL(request.url);
  const requestedRecordingAssetId = text(
    requestUrl.searchParams.get("recordingAssetId"),
  );

  if (roomId === "") {
    return NextResponse.json(
      {
        ok: false,
        error:
          "Choose a capture room or transcript job before reading a coaching packet.",
      },
      { status: 400 },
    );
  }

  if (!roomId) {
    return NextResponse.json(
      { ok: false, error: "You do not have access to this coaching packet." },
      { status: 404 },
    );
  }

  const currentTranscript = await prisma.transcriptJob.findFirst({
    where: { roomId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      requestedBy: true,
      room: {
        select: {
          createdByUserId: true,
          booking: { select: { coachUserId: true } },
        },
      },
    },
  });
  if (
    currentTranscript?.id &&
    captureTranscriptFollowThroughAuthorId(currentTranscript) === actor.id
  ) {
    try {
      await reconcileCaptureTranscriptFollowThrough({
        prisma,
        transcriptJobId: currentTranscript.id,
        refreshExistingPacket: true,
      });
    } catch (error) {
      console.error(
        "[Capture Follow-through] Session packet refresh remains retryable",
        {
          roomId,
          transcriptJobId: currentTranscript.id,
          reason: error instanceof Error ? error.message : "unknown",
        },
      );
    }
  }

  const [
    room,
    notes,
    actionItems,
    selectedRecordingAsset,
    latestTranscriptJob,
  ] = await Promise.all([
    prisma.callRoom.findUnique({
      where: { id: roomId },
      select: {
        id: true,
        title: true,
        purpose: true,
        status: true,
        scheduledStart: true,
        scheduledEnd: true,
        projectId: true,
        project: {
          select: {
            id: true,
            name: true,
            tags: {
              where: { isActive: true, mergedIntoTagId: null },
              orderBy: [{ label: "asc" }, { id: "asc" }],
              take: 100,
              select: { id: true, label: true, slug: true },
            },
          },
        },
        tagLinks: { select: { tagId: true } },
        booking: {
          select: {
            id: true,
            status: true,
            paymentPolicy: true,
            offering: { select: { title: true, kind: true } },
            clientUser: {
              select: { id: true, name: true, primaryEmail: true },
            },
            coachUser: { select: { id: true, name: true, primaryEmail: true } },
          },
        },
      },
    }),
    prisma.coachingNote.findMany({
      where: packetNoteVisibilityWhere(actor, roomId),
      orderBy: [{ kind: "asc" }, { createdAt: "asc" }],
      select: {
        id: true,
        kind: true,
        title: true,
        body: true,
        sourceJson: true,
        authorUserId: true,
        createdAt: true,
        updatedAt: true,
        visibility: true,
        _count: { select: { revisions: true } },
      },
    }),
    prisma.actionItem.findMany({
      where: {
        roomId,
        OR: [
          { assignedUserId: actor.id },
          {
            assignedUserId: null,
            note: { authorUserId: actor.id },
          },
        ],
      },
      orderBy: [{ status: "asc" }, { createdAt: "asc" }],
      select: {
        id: true,
        title: true,
        detail: true,
        status: true,
        dueAt: true,
        completedAt: true,
        sourceJson: true,
        createdAt: true,
      },
    }),
    requestedRecordingAssetId
      ? prisma.recordingAsset.findFirst({
          where: { id: requestedRecordingAssetId, roomId },
          select: {
            id: true,
            roomId: true,
            participantId: true,
            fileName: true,
            status: true,
            kind: true,
            checksum: true,
            byteSize: true,
            storageBucket: true,
            storageObjectPath: true,
            localManifestJson: true,
          },
        })
      : Promise.resolve(null),
    prisma.transcriptJob.findFirst({
      where: {
        roomId,
        ...(requestedRecordingAssetId
          ? { assetId: requestedRecordingAssetId }
          : {}),
      },
      orderBy: { createdAt: "desc" },
      include: {
        room: {
          select: {
            createdByUserId: true,
            booking: { select: { coachUserId: true } },
          },
        },
        asset: {
          select: {
            id: true,
            roomId: true,
            participantId: true,
            fileName: true,
            status: true,
            kind: true,
            checksum: true,
            byteSize: true,
            storageBucket: true,
            storageObjectPath: true,
            localManifestJson: true,
          },
        },
        segments: {
          orderBy: { startSeconds: "asc" },
          take: 1000,
          include: {
            corrections: {
              where: { status: "accepted" },
              orderBy: { updatedAt: "desc" },
            },
            verifications: { orderBy: { createdAt: "desc" } },
          },
        },
        speakerAttributions: {
          where: { status: "active" },
          orderBy: { updatedAt: "desc" },
        },
        _count: { select: { segments: true, words: true } },
      },
    }),
  ]);

  if (requestedRecordingAssetId && !selectedRecordingAsset) {
    return NextResponse.json(
      {
        ok: false,
        error: "This recording source is not part of the accessible Session.",
      },
      { status: 404 },
    );
  }

  const selectedTranscriptAsset =
    selectedRecordingAsset ?? latestTranscriptJob?.asset ?? null;
  const transcriptGate = selectedTranscriptAsset
    ? await mobileCaptureTranscriptProcessingGate({
        prisma,
        recordingAsset: selectedTranscriptAsset,
      })
    : {
        allowed: false as const,
        errorCode: "TRANSCRIPT_RECORDING_ASSET_REQUIRED",
        error: "Transcript processing requires bound recording asset evidence.",
      };
  const transcriptProcessingAllowed = transcriptGate.allowed;
  const transcriptConfidence = buildSessionTranscriptConfidence({
    job: latestTranscriptJob,
    asset: selectedTranscriptAsset,
    processingAllowed: transcriptProcessingAllowed,
  });
  const transcriptHeld =
    Boolean(selectedTranscriptAsset) && !transcriptProcessingAllowed;
  const packetAuthorUserId =
    captureTranscriptFollowThroughAuthorId(latestTranscriptJob);
  const canReviewPrivatePacket = Boolean(
    packetAuthorUserId && packetAuthorUserId === actor.id,
  );
  const packetNotes =
    transcriptProcessingAllowed && canReviewPrivatePacket
      ? notes.filter((note: any) => {
          const source = sourceJson(note.sourceJson);
          return (
            source.source === "transcript-packet-builder" &&
            text(source.transcriptJobId) === latestTranscriptJob?.id
          );
        })
      : [];
  const selectedPacketBuild = selectLatestCorrelatedPacketNotes(packetNotes);
  const summary = selectedPacketBuild.summary;
  const highlights = selectedPacketBuild.highlights;
  const currentTranscriptSnapshot = latestTranscriptJob
    ? transcriptJobPacketSnapshot(latestTranscriptJob)
    : null;
  const packetStale = Boolean(
    summary &&
    latestTranscriptJob &&
    (!packetTemplateMatches(summary.sourceJson) ||
      !packetSnapshotMatchesTranscriptJob(
        summary.sourceJson,
        latestTranscriptJob,
      )),
  );
  const allPacketActionItems =
    transcriptProcessingAllowed && canReviewPrivatePacket
      ? actionItems.filter((item: any) => {
          const source = sourceJson(item.sourceJson);
          return (
            source.source === "transcript-packet-builder" &&
            text(source.transcriptJobId) === latestTranscriptJob?.id
          );
        })
      : [];
  const actionCandidates =
    transcriptProcessingAllowed && summary
      ? mergePacketActionCandidates({
          sourceJson: summary.sourceJson,
          legacyActionItems: allPacketActionItems,
        })
      : [];
  const packetActionItems = allPacketActionItems.filter(
    (item: any) => !isUnreviewedTranscriptActionItem(item),
  );
  const openActionItems = packetActionItems.filter(
    (item: any) => item.status === "OPEN",
  );
  const safeActions = packetSafeActions({
    latestTranscriptJob,
    selectedRecordingAsset: selectedTranscriptAsset,
    summary,
    highlights,
    actionCandidates,
    actionItems: packetActionItems,
    transcriptProcessingAllowed,
    packetStale,
    canReviewPrivatePacket,
  });
  const reviewLanes = transcriptProcessingAllowed
    ? fallbackReviewLanes({ summary, highlights, actionCandidates })
    : [];
  const goalRows =
    transcriptProcessingAllowed && summary
      ? await prisma.goal.findMany({
          where: {
            ownerUserId: actor.id,
            OR: [
              { roomId },
              ...(room?.projectId ? [{ projectId: room.projectId }] : []),
            ],
          },
          orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
          take: 500,
          select: {
            id: true,
            title: true,
            description: true,
            status: true,
            targetAt: true,
            updatedAt: true,
            projectId: true,
            roomId: true,
            sourceJson: true,
            _count: {
              select: {
                progressReceipts: { where: { kind: GOAL_EVIDENCE_MERGE_KIND } },
              },
            },
          },
        })
      : [];
  const taskMergeRows =
    transcriptProcessingAllowed && summary
      ? await prisma.actionItem.findMany({
          where: {
            assignedUserId: actor.id,
            status: "OPEN",
            OR: [
              { roomId },
              ...(room?.projectId ? [{ projectId: room.projectId }] : []),
            ],
          },
          orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
          take: 500,
          select: {
            id: true,
            title: true,
            detail: true,
            status: true,
            dueAt: true,
            updatedAt: true,
            projectId: true,
            roomId: true,
            sourceJson: true,
            _count: {
              select: {
                evidenceReceipts: { where: { kind: TASK_EVIDENCE_MERGE_KIND } },
              },
            },
          },
        })
      : [];
  const goalCandidates = buildPacketGoalCandidates({
    summary,
    latestTranscriptJob,
    goals: goalRows,
    packetBuildId: selectedPacketBuild.packetBuildId,
  });
  const noteCandidates =
    transcriptProcessingAllowed && !packetStale
      ? buildPacketNoteCandidates({
          summary,
          latestTranscriptJob,
          notes,
          packetBuildId: selectedPacketBuild.packetBuildId,
          actorUserId: actor.id,
        })
      : [];
  const noteMergeTargets = notes
    .filter(
      (note: any) =>
        note.authorUserId === actor.id &&
        EDITABLE_SESSION_NOTE_KINDS.includes(note.kind),
    )
    .map((note: any) => ({
      id: note.id,
      title: note.title,
      body: note.body,
      kind: String(note.kind),
      visibility: String(note.visibility),
      updatedAt: note.updatedAt?.toISOString?.() ?? null,
      revisionCount: note._count?.revisions ?? 0,
    }));
  const goalMergeTargets = goalRows
    .filter(
      (goal: any) =>
        (goal.status === "ACTIVE" || goal.status === "PAUSED") &&
        (room?.projectId
          ? goal.projectId === room.projectId
          : goal.roomId === roomId),
    )
    .map((goal: any) => ({
      id: goal.id,
      title: goal.title,
      description: goal.description,
      status: goal.status,
      targetAt: goal.targetAt?.toISOString?.() ?? null,
      updatedAt: goal.updatedAt?.toISOString?.() ?? null,
      projectId: goal.projectId,
      roomId: goal.roomId,
      evidenceCount: goal._count?.progressReceipts ?? 0,
    }));
  const taskMergeTargets = taskMergeRows
    .filter(
      (task: any) =>
        !isUnreviewedTranscriptActionItem(task) &&
        (room?.projectId
          ? task.projectId === room.projectId
          : task.roomId === roomId),
    )
    .map((task: any) => ({
      id: task.id,
      title: task.title,
      detail: task.detail,
      status: task.status,
      dueAt: task.dueAt?.toISOString?.() ?? null,
      updatedAt: task.updatedAt?.toISOString?.() ?? null,
      projectId: task.projectId,
      roomId: task.roomId,
      evidenceCount: task._count?.evidenceReceipts ?? 0,
    }));

  return NextResponse.json({
    ok: true,
    packetKind: PACKET_KIND,
    generatedAt: new Date().toISOString(),
    boundaries: packetBoundaries(),
    room: room
      ? {
          id: room.id,
          title: room.title,
          purpose: room.purpose,
          status: room.status,
          scheduledStart: room.scheduledStart?.toISOString?.() ?? null,
          scheduledEnd: room.scheduledEnd?.toISOString?.() ?? null,
          booking: room.booking
            ? {
                id: room.booking.id,
                status: room.booking.status,
                paymentPolicy: room.booking.paymentPolicy,
                offeringTitle: room.booking.offering?.title ?? null,
                offeringKind: room.booking.offering?.kind ?? null,
                clientLabel:
                  room.booking.clientUser?.name ||
                  room.booking.clientUser?.primaryEmail ||
                  null,
                coachLabel:
                  room.booking.coachUser?.name ||
                  room.booking.coachUser?.primaryEmail ||
                  null,
              }
            : null,
        }
      : null,
    transcriptJob: latestTranscriptJob
      ? {
          id: latestTranscriptJob.id,
          status: latestTranscriptJob.status,
          provider: latestTranscriptJob.provider,
          segmentCount: latestTranscriptJob._count?.segments ?? 0,
          wordCount: latestTranscriptJob._count?.words ?? 0,
          readiness: transcriptConfidence,
          asset: latestTranscriptJob.asset
            ? {
                id: latestTranscriptJob.asset.id,
                fileName: latestTranscriptJob.asset.fileName,
                status: latestTranscriptJob.asset.status,
                kind: latestTranscriptJob.asset.kind,
              }
            : null,
        }
      : null,
    selectedRecordingAsset: selectedTranscriptAsset
      ? {
          id: selectedTranscriptAsset.id,
          fileName: selectedTranscriptAsset.fileName,
          status: selectedTranscriptAsset.status,
          kind: selectedTranscriptAsset.kind,
          explicitlySelected: Boolean(requestedRecordingAssetId),
        }
      : null,
    transcriptProcessingGate: transcriptProcessingAllowed
      ? { allowed: true }
      : {
          allowed: false,
          errorCode: transcriptGate.errorCode,
          error: transcriptGate.error,
          explicitReleaseRequired: true,
        },
    packet: {
      reviewAccess: {
        canReviewPrivatePacket,
        role: canReviewPrivatePacket
          ? "CANONICAL_REVIEWER"
          : "SESSION_PARTICIPANT",
        boundary: canReviewPrivatePacket
          ? "Private transcript follow-up is visible only to its canonical reviewer."
          : "Session access does not include another participant's private transcript follow-up.",
      },
      build: summary
        ? {
            packetBuildId: selectedPacketBuild.packetBuildId,
            correlationMode: selectedPacketBuild.correlationMode,
          }
        : null,
      status: transcriptHeld
        ? "TRANSCRIPT_HELD"
        : !canReviewPrivatePacket
          ? "PRIVATE_REVIEWER_ONLY"
          : packetStale
            ? "TRANSCRIPT_REVIEW_CHANGED"
            : summary
              ? "READY_FOR_REVIEW"
              : latestTranscriptJob?.status === "COMPLETED"
                ? "PACKET_READY_TO_BUILD"
                : "NOT_READY",
      summary: summary
        ? {
            id: summary.id,
            title: summary.title,
            body: summary.body,
            source: sourceJson(summary.sourceJson),
            createdAt: summary.createdAt?.toISOString?.() ?? null,
            updatedAt: summary.updatedAt?.toISOString?.() ?? null,
          }
        : null,
      highlights: highlights.map((note: any) => ({
        id: note.id,
        title: note.title,
        body: note.body,
        source: sourceJson(note.sourceJson),
        createdAt: note.createdAt?.toISOString?.() ?? null,
      })),
      noteCandidates,
      noteMergeTargets,
      actionCandidates,
      taskMergeTargets,
      goalCandidates,
      goalMergeTargets,
      goalCandidateReview: {
        endpoint: "/api/mobile/capture/transcripts/packet/goals",
        method: "POST",
        allowedDecisions: ["ACCEPT", "EDIT", "MERGE", "REJECT", "DEFER"],
        boundary:
          "ACCEPT creates one actor-owned ACTIVE Goal. MERGE appends reviewed source evidence to one explicitly selected existing actor-owned goal in this Nest without changing its definition, status, target, tags, tasks, or project. Ignoring, editing, rejecting, or deferring creates no goal or external side effect.",
      },
      actionCandidateReview: {
        endpoint: "/api/mobile/capture/transcripts/packet/actions",
        method: "POST",
        allowedDecisions: ["ACCEPT", "EDIT", "MERGE", "REJECT", "DEFER"],
        requiredEvidence: [
          "roomId",
          "transcriptJobId",
          "recordingAssetId",
          "summaryNoteId",
          "packetBuildId",
          "actionCandidateId",
        ],
        boundary:
          "ACCEPT can materialize one canonical Quipsly ActionItem after the reviewer inspects owner, due date, and active same-project tags. MERGE appends reviewed source evidence to one explicitly selected existing actor-owned task in this Nest without changing task state. EDIT, REJECT, and DEFER preserve packet review state without creating open work or external side effects.",
      },
      taskMaterialization: {
        project: room?.project
          ? { id: room.project.id, name: room.project.name }
          : null,
        tags: (room?.project?.tags ?? []).map((tag: any) => ({
          id: tag.id,
          label: tag.label,
          slug: tag.slug,
          selectedForSession: (room?.tagLinks ?? []).some(
            (link: any) => link.tagId === tag.id,
          ),
        })),
        ownerChoices: ["ACTOR", "UNASSIGNED"],
        defaultOwner: "ACTOR",
        boundary:
          "This is a review form, not an inference. Tags are active canonical vocabulary from the exact Session project; no reminder, calendar event, delivery, or publication is implied.",
      },
      actionItems: packetActionItems.map((item: any) => ({
        id: item.id,
        title: item.title,
        detail: item.detail,
        status: item.status,
        dueAt: item.dueAt?.toISOString?.() ?? null,
        completedAt: item.completedAt?.toISOString?.() ?? null,
        source: sourceJson(item.sourceJson),
        createdAt: item.createdAt?.toISOString?.() ?? null,
      })),
      counts: {
        highlights: highlights.length,
        noteCandidates: noteCandidates.length,
        actionCandidates: actionCandidates.length,
        goalCandidates: goalCandidates.length,
        actionItems: packetActionItems.length,
        openActionItems: openActionItems.length,
        reviewLanes: reviewLanes.length,
        readyReviewLanes: reviewLanes.filter(
          (lane: any) => lane?.status === "READY_FOR_HUMAN_REVIEW",
        ).length,
        transcriptSegments: currentTranscriptSnapshot?.segmentCount ?? 0,
        humanReviewedTranscriptSegments:
          currentTranscriptSnapshot?.humanReviewedSegmentCount ?? 0,
        providerOnlyTranscriptSegments:
          currentTranscriptSnapshot?.providerOnlySegmentCount ?? 0,
      },
      transcriptReview: currentTranscriptSnapshot
        ? {
            snapshotSha256: currentTranscriptSnapshot.sha256,
            segmentCount: currentTranscriptSnapshot.segmentCount,
            humanReviewedSegmentCount:
              currentTranscriptSnapshot.humanReviewedSegmentCount,
            providerOnlySegmentCount:
              currentTranscriptSnapshot.providerOnlySegmentCount,
            fullyHumanReviewed:
              currentTranscriptSnapshot.providerOnlySegmentCount === 0,
            packetStale,
          }
        : null,
      reviewLanes,
      nextAction: transcriptHeld
        ? "Await reviewed transcript release before building, reading, or reviewing packet projections."
        : !canReviewPrivatePacket
          ? "Continue using the Session transcript and shared follow-up. Private review remains with the canonical reviewer."
          : packetStale
            ? "Transcript review changed after this packet was built. Build a new packet before accepting any note, goal, or task candidate."
            : summary
              ? "Use or adjust the summary, highlights, tasks, and goals Quipsly created from this Session."
              : latestTranscriptJob?.status === "COMPLETED"
                ? "Build a packet from the completed transcript."
                : "Finish transcription before packet review.",
      safeActions,
    },
  });
}

export async function POST(request: Request) {
  const session = await getQuipslySessionFromRequest(request);

  if (!session?.user) {
    return NextResponse.json(
      { ok: false, error: "Sign in before building a coaching packet." },
      { status: 401 },
    );
  }

  const body = await readJson(request);
  const transcriptJobId = text(body.transcriptJobId);
  const force = body.force === true;

  if (!transcriptJobId) {
    return NextResponse.json(
      {
        ok: false,
        error: "Choose a transcript job before building a coaching packet.",
      },
      { status: 400 },
    );
  }

  const prisma = getPrismaClient() as any;
  const userId = session.user.id;
  const actor: SessionAccessActor = session.user;
  const job = await prisma.transcriptJob.findFirst({
    where: {
      id: transcriptJobId,
      room: sessionMutationActorAccessWhere(actor),
    },
    select: {
      id: true,
      requestedBy: true,
      room: {
        select: {
          createdByUserId: true,
          booking: { select: { coachUserId: true } },
        },
      },
    },
  });

  if (!job) {
    return NextResponse.json(
      { ok: false, error: "You do not have access to this transcript job." },
      { status: 404 },
    );
  }
  const canonicalAuthorUserId = captureTranscriptFollowThroughAuthorId(job);
  if (!canonicalAuthorUserId || canonicalAuthorUserId !== userId) {
    return NextResponse.json(
      {
        ok: false,
        errorCode: "PRIVATE_PACKET_REVIEWER_REQUIRED",
        error:
          "Private transcript follow-up belongs to the canonical Session reviewer.",
      },
      { status: 404 },
    );
  }

  const result = await prisma.$transaction(
    async (tx: any) => {
      await acquirePrismaAdvisoryTransactionLock(
        tx,
        `transcript-job-packet-source:${transcriptJobId}`,
      );
      const authorizedJob = await tx.transcriptJob.findFirst({
        where: {
          id: transcriptJobId,
          room: sessionMutationActorAccessWhere(actor),
        },
        select: {
          id: true,
          requestedBy: true,
          room: {
            select: {
              createdByUserId: true,
              booking: { select: { coachUserId: true } },
            },
          },
        },
      });
      if (
        !authorizedJob ||
        captureTranscriptFollowThroughAuthorId(authorizedJob) !==
          canonicalAuthorUserId
      ) {
        return {
          ok: false,
          status: 404,
          errorCode: "SESSION_ACCESS_REVOKED",
          error:
            "Session access changed before the packet build began. Refresh before trying again.",
        };
      }
      return buildCoachingPacketFromTranscriptJob({
        prisma: tx,
        transcriptJobId,
        authorUserId: canonicalAuthorUserId,
        force,
      });
    },
    { isolationLevel: "Serializable" },
  );
  const status = result.ok
    ? 200
    : "status" in result && typeof result.status === "number"
      ? result.status
      : 500;

  return NextResponse.json(
    {
      ...result,
      packetKind: PACKET_KIND,
      generatedAt: new Date().toISOString(),
      boundaries: packetBoundaries(),
      nextAction: result.ok
        ? "Read the packet, review highlights and action candidates, then explicitly accept any candidate that should become an ActionItem. Delivery and publishing remain separate human-approved actions."
        : "Resolve the packet blocker, then retry from the completed transcript evidence.",
    },
    { status },
  );
}

export async function PATCH(request: Request) {
  const session = await getQuipslySessionFromRequest(request);

  if (!session?.user) {
    return NextResponse.json(
      { ok: false, error: "Sign in before reviewing a packet lane." },
      { status: 401 },
    );
  }

  const body = await readJson(request);
  const laneId = text(body.laneId);
  const requestedStatus = normalizeReviewLaneStatus(body.status);
  const reviewNote = text(body.note);
  const roomIdFromBody = text(body.callRoomId) || text(body.roomId);
  const transcriptJobIdFromBody = text(body.transcriptJobId);
  const summaryNoteId = text(body.summaryNoteId);

  if (!laneId) {
    return NextResponse.json(
      {
        ok: false,
        error: "Choose a packet review lane before updating review state.",
      },
      { status: 400 },
    );
  }

  if (!requestedStatus) {
    return NextResponse.json(
      {
        ok: false,
        error: "Choose a valid packet lane review status.",
        allowedStatuses: Array.from(REVIEW_LANE_STATUSES),
      },
      { status: 400 },
    );
  }

  const prisma = getPrismaClient() as any;
  const userId = session.user.id;
  const actor: SessionAccessActor = session.user;
  const url = new URL(request.url);
  const roomIdQuery =
    text(url.searchParams.get("callRoomId")) ||
    text(url.searchParams.get("roomId"));
  const transcriptJobIdQuery = text(url.searchParams.get("transcriptJobId"));
  const lookupUrl = new URL(request.url);
  if (roomIdFromBody && !roomIdQuery)
    lookupUrl.searchParams.set("callRoomId", roomIdFromBody);
  if (transcriptJobIdFromBody && !transcriptJobIdQuery)
    lookupUrl.searchParams.set("transcriptJobId", transcriptJobIdFromBody);

  const roomId = await resolveRoomIdFromRequest(
    prisma,
    new Request(lookupUrl.toString()),
    actor,
    "mutate",
  );

  if (roomId === "") {
    return NextResponse.json(
      {
        ok: false,
        error:
          "Choose a capture room or transcript job before reviewing a packet lane.",
      },
      { status: 400 },
    );
  }

  if (!roomId) {
    return NextResponse.json(
      { ok: false, error: "You do not have access to this packet lane." },
      { status: 404 },
    );
  }

  const summaryCandidates = await prisma.coachingNote.findMany({
    where: {
      roomId,
      kind: "SUMMARY",
    },
    orderBy: { createdAt: "desc" },
    take: 200,
    select: {
      id: true,
      kind: true,
      title: true,
      sourceJson: true,
      createdAt: true,
      updatedAt: true,
    },
  });
  const transcriptSummaries = summaryCandidates.filter((note: any) => {
    const source = sourceJson(note.sourceJson);
    return (
      source.source === "transcript-packet-builder" &&
      (!transcriptJobIdFromBody ||
        text(source.transcriptJobId) === transcriptJobIdFromBody)
    );
  });
  const summary =
    selectLatestCorrelatedPacketNotes(transcriptSummaries).summary;

  if (!summary) {
    return NextResponse.json(
      {
        ok: false,
        error: "Build a transcript packet before reviewing packet lanes.",
      },
      { status: 409 },
    );
  }
  if (summaryNoteId && summary.id !== summaryNoteId) {
    return NextResponse.json(
      {
        ok: false,
        errorCode: "STALE_PACKET_BUILD",
        error:
          "Refresh the packet before reviewing this lane; a newer packet build is current.",
      },
      { status: 409 },
    );
  }

  const packetTranscriptJobId = text(
    sourceJson(summary.sourceJson).transcriptJobId,
  );
  if (!packetTranscriptJobId) {
    return NextResponse.json(
      {
        ok: false,
        errorCode: "TRANSCRIPT_RECORDING_EVIDENCE_REQUIRED",
        error:
          "Packet review requires bound transcript and recording asset evidence.",
      },
      { status: 409 },
    );
  }

  let mutation;
  try {
    mutation = await prisma.$transaction(
      async (tx: any) => {
        await acquirePrismaAdvisoryTransactionLock(
          tx,
          `transcript-job-packet-source:${packetTranscriptJobId}`,
        );
        const authorizedRoom = await tx.callRoom.findFirst({
          where: sessionMutationAccessWhere(roomId, actor),
          select: { id: true },
        });
        if (!authorizedRoom) {
          throw new PacketReviewBoundaryError(
            404,
            "SESSION_ACCESS_REVOKED",
            "Session access changed before lane review completed. Refresh before trying again.",
          );
        }
        await tx.$queryRaw`SELECT "id" FROM "CoachingNote" WHERE "id" = ${summary.id} FOR UPDATE`;
        const lockedSummary = await tx.coachingNote.findUnique({
          where: { id: summary.id },
        });
        const source = sourceJson(lockedSummary?.sourceJson);
        if (
          !lockedSummary ||
          lockedSummary.roomId !== roomId ||
          text(source.transcriptJobId) !== packetTranscriptJobId
        ) {
          throw new PacketReviewBoundaryError(
            409,
            "STALE_PACKET_BUILD",
            "The packet changed before lane review completed.",
          );
        }
        const lanes = asArray(source.reviewLanes).filter(isObject);
        const lane = lanes.find(
          (candidate: any) => text(candidate.id) === laneId,
        );
        if (!lane) {
          throw new PacketReviewBoundaryError(
            404,
            "PACKET_REVIEW_LANE_NOT_FOUND",
            "Packet review lane was not found on this packet.",
          );
        }
        const laneItemCount =
          typeof lane.itemCount === "number" && Number.isFinite(lane.itemCount)
            ? lane.itemCount
            : asArray(lane.items).length;
        if (laneItemCount <= 0) {
          throw new PacketReviewBoundaryError(
            409,
            "PACKET_REVIEW_LANE_EMPTY",
            "This packet lane has no candidate material to review.",
          );
        }
        const packetTranscriptJob = await tx.transcriptJob.findFirst({
          where: { id: packetTranscriptJobId, roomId },
          include: {
            asset: true,
            segments: {
              orderBy: TRANSCRIPT_PACKET_SEGMENT_ORDER_BY,
              include: {
                corrections: {
                  where: { status: "accepted" },
                  orderBy: { updatedAt: "desc" },
                },
                verifications: { orderBy: { createdAt: "desc" } },
              },
            },
            speakerAttributions: {
              where: { status: "active" },
              orderBy: { updatedAt: "desc" },
            },
          },
        });
        if (!packetTranscriptJob?.asset) {
          throw new PacketReviewBoundaryError(
            409,
            "TRANSCRIPT_RECORDING_EVIDENCE_REQUIRED",
            "Packet review requires bound transcript and recording asset evidence.",
          );
        }
        const transcriptGate = await mobileCaptureTranscriptProcessingGate({
          prisma: tx,
          recordingAsset: packetTranscriptJob.asset,
        });
        if (!transcriptGate.allowed) {
          throw new PacketReviewBoundaryError(
            409,
            transcriptGate.errorCode,
            transcriptGate.error,
          );
        }
        if (
          !packetTemplateMatches(source) ||
          !packetSnapshotMatchesTranscriptJob(source, packetTranscriptJob)
        ) {
          throw new PacketReviewBoundaryError(
            409,
            "TRANSCRIPT_REVIEW_CHANGED",
            "Transcript review changed after this packet was built. Build a new packet before reviewing this lane.",
          );
        }
        const reviewedAt = new Date().toISOString();
        const reviewRecord = {
          status: requestedStatus,
          note: reviewNote || null,
          reviewedAt,
          reviewedByUserId: userId,
          externalSideEffects: false,
          deliveryClaimed: false,
          publicationClaimed: false,
        };
        const updatedLanes = lanes.map((candidate: any) =>
          text(candidate.id) !== laneId
            ? candidate
            : {
                ...candidate,
                status: requestedStatus,
                humanApprovalRequired:
                  requestedStatus !== "APPROVED_FOR_INTERNAL_USE",
                externalSideEffects: false,
                humanReview: reviewRecord,
              },
        );
        const updatedLane = updatedLanes.find(
          (candidate: any) => text(candidate.id) === laneId,
        );
        await tx.coachingNote.update({
          where: { id: summary.id },
          data: {
            sourceJson: {
              ...source,
              reviewLanes: updatedLanes,
              reviewLaneCount: updatedLanes.length,
              reviewLaneReadyCount: reviewLaneReadyCount(updatedLanes),
              lastHumanReview: { laneId, ...reviewRecord },
            },
          },
        });
        return { reviewedAt, updatedLane, updatedLanes };
      },
      { isolationLevel: "Serializable" },
    );
  } catch (error) {
    if (error instanceof PacketReviewBoundaryError) {
      return NextResponse.json(
        { ok: false, errorCode: error.errorCode, error: error.message },
        { status: error.status },
      );
    }
    throw error;
  }

  const { reviewedAt, updatedLane, updatedLanes } = mutation;

  return NextResponse.json({
    ok: true,
    packetKind: PACKET_KIND,
    generatedAt: reviewedAt,
    boundaries: {
      ...packetBoundaries(),
      packetLaneReviewMutation: "App-owned packet review state only.",
      noExternalMutation: true,
      noClientDelivery: true,
      noPublicationClaim: true,
      noTaskAssignment: true,
    },
    roomId,
    summaryNoteId: summary.id,
    reviewLaneId: laneId,
    reviewLaneStatus: requestedStatus,
    reviewLane: updatedLane,
    reviewLanes: updatedLanes,
    reviewLaneCount: updatedLanes.length,
    reviewLaneReadyCount: reviewLaneReadyCount(updatedLanes),
    safeActions: packetLaneReviewSafeActions(updatedLane),
    nextAction: reviewLaneNextAction(requestedStatus),
  });
}
