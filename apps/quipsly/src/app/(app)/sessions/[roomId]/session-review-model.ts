import {
  isUnreviewedTranscriptActionItemSource,
  type TranscriptActionReviewDecision,
  type TranscriptGoalReviewDecision,
  type TranscriptNoteReviewDecision,
} from "@high-ground/quipsly-domain/coaching-packet";
import type { EditableSessionNoteKind, SessionNoteVisibility } from "@/lib/session-note-contract";

export type SessionReviewCandidate = {
  id: string;
  title: string;
  detail: string;
  transcriptJobId: string;
  recordingAssetId: string;
  roomId: string;
  packetBuildId: string;
  segmentId: string;
  segmentIds?: string[];
  sourceText?: string;
  sourceTextSha256?: string;
  transcriptReviewStatus?: "provider" | "human-reviewed";
  speakerLabel: string | null;
  startSeconds: number;
  endSeconds: number;
  reviewStatus: string;
  humanApprovalRequired: boolean;
  committedActionItemId: string | null;
};

export type SessionReviewGoalCandidate = {
  id: string;
  clientRequestId: string;
  roomId: string;
  transcriptJobId: string;
  recordingAssetId: string;
  packetBuildId: string;
  segmentId: string;
  segmentIds?: string[];
  speakerLabel: string | null;
  startSeconds: number;
  endSeconds: number;
  sourceText: string;
  sourceTextSha256?: string;
  transcriptReviewStatus?: "provider" | "human-reviewed";
  providerTextSha256: string;
  suggestedTitle: string;
  suggestedDescription: string;
  reviewStatus: "READY_FOR_HUMAN_REVIEW" | "EDITED_FOR_REVIEW" | "DEFERRED_BY_HUMAN" | "REJECTED_BY_HUMAN" | "ACCEPTED_AS_GOAL";
  humanApprovalRequired: boolean;
  committedGoalId: string | null;
};

export type SessionReviewNoteCandidate = {
  id: string;
  clientRequestId: string;
  roomId: string;
  transcriptJobId: string;
  recordingAssetId: string;
  summaryNoteId: string;
  packetBuildId: string;
  laneId: string;
  laneLabel: string;
  laneStatus: string;
  segmentId: string;
  segmentIds?: string[];
  speakerLabel: string | null;
  startSeconds: number;
  endSeconds: number;
  sourceText: string;
  sourceTextSha256?: string;
  providerTextSha256: string;
  acceptedReviewId: string | null;
  acceptedCorrectionId: string | null;
  transcriptReviewStatus: "provider" | "human-reviewed";
  suggestedTitle: string;
  suggestedBody: string;
  suggestedKind: EditableSessionNoteKind;
  suggestedVisibility: SessionNoteVisibility;
  reviewStatus: "READY_FOR_HUMAN_REVIEW" | "EDITED_FOR_REVIEW" | "DEFERRED_BY_HUMAN" | "REJECTED_BY_HUMAN" | "ACCEPTED_AS_NOTE" | "MERGED_INTO_NOTE";
  humanApprovalRequired: boolean;
  committedNoteId: string | null;
  lastHumanReview?: {
    receiptId: string;
    decision: TranscriptNoteReviewDecision;
    reviewedAt: string;
    reviewedByUserId: string;
  } | null;
};

export type SessionReviewNoteMergeTarget = {
  id: string;
  title: string | null;
  body: string;
  kind: EditableSessionNoteKind;
  visibility: SessionNoteVisibility;
  updatedAt: string;
  revisionCount: number;
};

export type SessionReviewLaneStatus =
  | "READY_FOR_HUMAN_REVIEW"
  | "APPROVED_FOR_INTERNAL_USE"
  | "NEEDS_REVISION"
  | "REJECTED_BY_HUMAN";

export type SessionReviewLane = {
  id: string;
  label: string;
  status: SessionReviewLaneStatus | string;
  itemCount: number;
  meaning: string;
  sourceTruth: string;
  reviewRule: string;
  humanApprovalRequired: boolean;
  externalSideEffects: boolean;
  humanReview?: {
    status?: string | null;
    note?: string | null;
    reviewedAt?: string | null;
  } | null;
};

export type SessionReviewPacket = {
  ok: boolean;
  error?: string;
  room?: { id: string; title: string | null; purpose: string; status: string } | null;
  transcriptJob?: {
    id: string;
    status: string;
    provider: string;
    segmentCount: number;
    asset: { id: string; fileName: string | null; status: string; kind: string } | null;
  } | null;
  transcriptProcessingGate?: { allowed: boolean; errorCode?: string; error?: string; explicitReleaseRequired?: boolean };
  packet?: {
    status: string;
    build: { packetBuildId: string | null; correlationMode: string } | null;
    summary: { id: string; title: string | null; body: string; source?: Record<string, unknown>; createdAt: string | null } | null;
    highlights: Array<{ id: string; title: string | null; body: string; createdAt: string | null }>;
    noteCandidates?: SessionReviewNoteCandidate[];
    noteMergeTargets?: SessionReviewNoteMergeTarget[];
    actionCandidates: SessionReviewCandidate[];
    goalCandidates?: SessionReviewGoalCandidate[];
    reviewLanes?: SessionReviewLane[];
    actionItems: Array<{ id: string; title: string; detail: string | null; status: string; dueAt: string | null; source: Record<string, unknown> }>;
    transcriptReview?: {
      snapshotSha256: string;
      segmentCount: number;
      humanReviewedSegmentCount: number;
      providerOnlySegmentCount: number;
      fullyHumanReviewed: boolean;
      packetStale: boolean;
    } | null;
    nextAction: string;
    safeActions?: Array<{
      id: string;
      label: string;
      enabled: boolean;
      risk: string;
      why: string;
      boundary: string;
    }>;
  };
};

export function noteCandidateReviewRequest(input: {
  packet: SessionReviewPacket;
  candidate: SessionReviewNoteCandidate;
  decision: TranscriptNoteReviewDecision;
  title?: string;
  body?: string;
  kind?: EditableSessionNoteKind;
  visibility?: SessionNoteVisibility;
  note?: string;
  mergeTargetNoteId?: string;
  mergeExpectedUpdatedAt?: string;
  mergedTitle?: string;
  mergedBody?: string;
  mergedKind?: EditableSessionNoteKind;
  mergedVisibility?: SessionNoteVisibility;
}) {
  const packetBuildId = input.packet.packet?.build?.packetBuildId;
  const summaryNoteId = input.packet.packet?.summary?.id;
  if (!packetBuildId || !summaryNoteId || summaryNoteId !== input.candidate.summaryNoteId
      || input.packet.packet?.transcriptReview?.packetStale
      || input.candidate.committedNoteId
      || input.candidate.reviewStatus === "ACCEPTED_AS_NOTE"
      || input.candidate.reviewStatus === "MERGED_INTO_NOTE") return null;
  if ((input.decision === "ACCEPT" || input.decision === "MERGE")
      && input.candidate.transcriptReviewStatus !== "human-reviewed") return null;
  if (input.decision === "ACCEPT"
      && (input.body === undefined || input.kind === undefined || input.visibility === undefined)) return null;
  if (input.decision === "EDIT"
      && input.title === undefined && input.body === undefined
      && input.kind === undefined && input.visibility === undefined) return null;
  if ((input.decision === "ACCEPT" || input.decision === "EDIT")
      && input.body !== undefined && !input.body.trim()) return null;
  if (input.decision === "MERGE" && (
    !input.mergeTargetNoteId?.trim()
    || !input.mergeExpectedUpdatedAt?.trim()
    || input.mergedTitle === undefined
    || !input.mergedBody?.trim()
    || input.mergedKind === undefined
    || input.mergedVisibility === undefined
  )) return null;
  return {
    roomId: input.candidate.roomId,
    segmentId: input.candidate.segmentId,
    clientRequestId: input.candidate.clientRequestId,
    expectedProviderTextSha256: input.candidate.providerTextSha256,
    decision: input.decision,
    ...(input.title !== undefined ? { title: input.title.trim() } : {}),
    ...(input.body !== undefined ? { body: input.body.trim() } : {}),
    ...(input.kind !== undefined ? { kind: input.kind } : {}),
    ...(input.visibility !== undefined ? { visibility: input.visibility } : {}),
    ...(input.note?.trim() ? { note: input.note.trim() } : {}),
    ...(input.decision === "MERGE" ? {
      mergeTargetNoteId: input.mergeTargetNoteId!.trim(),
      mergeExpectedUpdatedAt: input.mergeExpectedUpdatedAt,
      mergedTitle: input.mergedTitle!.trim(),
      mergedBody: input.mergedBody!.trim(),
      mergedKind: input.mergedKind,
      mergedVisibility: input.mergedVisibility,
    } : {}),
    surface: "nest-session-packet-review",
    transcriptJobId: input.candidate.transcriptJobId,
    recordingAssetId: input.candidate.recordingAssetId,
    summaryNoteId,
    packetBuildId,
    packetNoteCandidateId: input.candidate.id,
    packetLaneId: input.candidate.laneId,
  };
}

export function timestampForSeconds(value: number) {
  const total = Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

export function goalCandidateReviewRequest(input: {
  packet: SessionReviewPacket;
  candidate: SessionReviewGoalCandidate;
  decision: TranscriptGoalReviewDecision;
  title?: string;
  description?: string;
  targetAt?: string | null;
  tagIds?: string[];
  note?: string;
}) {
  const summaryNoteId = input.packet.packet?.summary?.id;
  const packetBuildId = input.packet.packet?.build?.packetBuildId;
  if (!summaryNoteId || !packetBuildId || !input.packet.transcriptJob?.asset?.id || input.candidate.committedGoalId || input.candidate.reviewStatus === "ACCEPTED_AS_GOAL") return null;
  if (input.decision === "ACCEPT" && input.candidate.transcriptReviewStatus !== "human-reviewed") return null;
  if (input.packet.packet?.transcriptReview?.packetStale) return null;
  return {
    callRoomId: input.candidate.roomId,
    transcriptJobId: input.candidate.transcriptJobId,
    recordingAssetId: input.candidate.recordingAssetId,
    summaryNoteId,
    packetBuildId,
    goalCandidateId: input.candidate.id,
    decision: input.decision,
    ...(input.title !== undefined ? { title: input.title.trim() } : {}),
    ...(input.description !== undefined ? { description: input.description.trim() } : {}),
    ...(input.decision === "ACCEPT" && input.targetAt !== undefined ? { targetAt: input.targetAt } : {}),
    ...(input.decision === "ACCEPT" && input.tagIds !== undefined
      ? { tagIds: [...new Set(input.tagIds.map((tagId) => tagId.trim()).filter(Boolean))].sort() }
      : {}),
    ...(input.note?.trim() ? { note: input.note.trim() } : {}),
  };
}

export function committedTasks(packet: SessionReviewPacket | null) {
  return (packet?.packet?.actionItems ?? []).filter(
    // The shared predicate covers canonical and known legacy packet sources.
    // The defensive candidate flag keeps a malformed legacy row out of the
    // task rail rather than ever presenting inferred work as committed work.
    (item) => !isUnreviewedTranscriptActionItemSource(item.source) && item.source?.candidate !== true,
  );
}

export function candidateReviewRequest(input: {
  packet: SessionReviewPacket;
  candidate: SessionReviewCandidate;
  decision: TranscriptActionReviewDecision;
  title?: string;
  detail?: string;
  note?: string;
  assignToMe?: boolean;
  dueAt?: string | null;
  tagIds?: string[];
}) {
  const summaryNoteId = input.packet.packet?.summary?.id;
  const packetBuildId = input.packet.packet?.build?.packetBuildId;
  if (input.decision === "ACCEPT" && input.candidate.transcriptReviewStatus !== "human-reviewed") return null;
  if (input.packet.packet?.transcriptReview?.packetStale) return null;
  if (!summaryNoteId || !packetBuildId || !input.packet.transcriptJob?.asset?.id) return null;
  const acceptsCanonicalWork = input.decision === "ACCEPT";

  return {
    callRoomId: input.candidate.roomId,
    transcriptJobId: input.candidate.transcriptJobId,
    recordingAssetId: input.candidate.recordingAssetId,
    summaryNoteId,
    packetBuildId,
    actionCandidateId: input.candidate.id,
    decision: input.decision,
    ...(input.title !== undefined ? { title: input.title } : {}),
    ...(input.detail !== undefined ? { detail: input.detail } : {}),
    ...(input.note?.trim() ? { note: input.note.trim() } : {}),
    ...(acceptsCanonicalWork && input.assignToMe !== undefined ? { assignToMe: input.assignToMe } : {}),
    ...(acceptsCanonicalWork && input.dueAt !== undefined ? { dueAt: input.dueAt } : {}),
    ...(acceptsCanonicalWork && input.tagIds !== undefined ? { tagIds: [...new Set(input.tagIds.map((tagId) => tagId.trim()).filter(Boolean))].sort() } : {}),
  };
}

export function packetLaneReviewRequest(input: {
  packet: SessionReviewPacket;
  lane: SessionReviewLane;
  status: SessionReviewLaneStatus;
  note?: string;
}) {
  const summaryNoteId = input.packet.packet?.summary?.id;
  const transcriptJobId = input.packet.transcriptJob?.id;
  const roomId = input.packet.room?.id;
  if (!summaryNoteId || !transcriptJobId || !roomId || !input.lane.id.trim()) return null;
  return {
    callRoomId: roomId,
    transcriptJobId,
    summaryNoteId,
    laneId: input.lane.id,
    status: input.status,
    ...(input.note?.trim() ? { note: input.note.trim() } : {}),
  };
}
