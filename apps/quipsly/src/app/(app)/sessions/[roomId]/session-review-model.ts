import {
  isUnreviewedTranscriptActionItemSource,
  type TranscriptActionReviewDecision,
  type TranscriptGoalReviewDecision,
  type TranscriptNoteReviewDecision,
} from "@high-ground/quipsly-domain/coaching-packet";
import type { EditableSessionNoteKind, SessionNoteVisibility } from "@/lib/session-note-contract";
import type { SessionTranscriptConfidence } from "@/lib/session-transcript-confidence";

export type SessionReviewGovernedActionReference = {
  actionId: string;
  receiptId: string;
  capabilityId: string;
};

export type SessionReviewHumanDecision = {
  receiptId: string;
  decision: string;
  reviewedAt: string;
  reviewedByUserId: string;
  governance?: SessionReviewGovernedActionReference | null;
};

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
  speakerAuthority?: "correction" | "attribution" | "source-binding" | "provider" | "unresolved";
  startSeconds: number;
  endSeconds: number;
  reviewStatus: string;
  humanApprovalRequired: boolean;
  committedActionItemId: string | null;
  lastHumanReview?: SessionReviewHumanDecision | null;
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
  speakerAuthority?: "correction" | "attribution" | "source-binding" | "provider" | "unresolved";
  startSeconds: number;
  endSeconds: number;
  sourceText: string;
  sourceTextSha256?: string;
  transcriptReviewStatus?: "provider" | "human-reviewed";
  providerTextSha256: string;
  suggestedTitle: string;
  suggestedDescription: string;
  reviewStatus: "READY_FOR_HUMAN_REVIEW" | "EDITED_FOR_REVIEW" | "DEFERRED_BY_HUMAN" | "REJECTED_BY_HUMAN" | "ACCEPTED_AS_GOAL" | "MERGED_INTO_GOAL";
  humanApprovalRequired: boolean;
  committedGoalId: string | null;
  lastHumanReview?: SessionReviewHumanDecision | null;
};

export type SessionReviewGoalMergeTarget = {
  id: string;
  title: string;
  description: string | null;
  status: "ACTIVE" | "PAUSED";
  targetAt: string | null;
  updatedAt: string;
  projectId: string | null;
  roomId: string | null;
  evidenceCount: number;
};

export type SessionReviewTaskMergeTarget = {
  id: string;
  title: string;
  detail: string | null;
  status: "OPEN";
  dueAt: string | null;
  updatedAt: string;
  projectId: string | null;
  roomId: string | null;
  evidenceCount: number;
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
  speakerAuthority?: "correction" | "attribution" | "source-binding" | "provider" | "unresolved";
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
  lastHumanReview?: SessionReviewHumanDecision | null;
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
    wordCount?: number;
    readiness?: SessionTranscriptConfidence;
    asset: { id: string; fileName: string | null; status: string; kind: string } | null;
  } | null;
  selectedRecordingAsset?: {
    id: string;
    fileName: string | null;
    status: string;
    kind: string;
    explicitlySelected: boolean;
  } | null;
  transcriptProcessingGate?: { allowed: boolean; errorCode?: string; error?: string; explicitReleaseRequired?: boolean };
  packet?: {
    reviewAccess?: {
      canReviewPrivatePacket: boolean;
      role: "CANONICAL_REVIEWER" | "SESSION_PARTICIPANT";
      boundary: string;
    };
    status: string;
    build: { packetBuildId: string | null; correlationMode: string } | null;
    summary: { id: string; title: string | null; body: string; source?: Record<string, unknown>; createdAt: string | null } | null;
    highlights: Array<{ id: string; title: string | null; body: string; createdAt: string | null }>;
    results?: {
      automaticallyCreated: true;
      editable: true;
      removable: true;
      summary: { id: string; title: string | null; body: string };
      notes: Array<{
        id: string;
        title: string | null;
        body: string;
        source: SessionTranscriptResultSource;
      }>;
      tasks: Array<{
        id: string;
        title: string;
        detail: string | null;
        status: string;
        assignedUserId: string | null;
        dueAt: string | null;
        completedAt: string | null;
        source: SessionTranscriptResultSource;
      }>;
      goals: Array<{
        id: string;
        title: string;
        description: string | null;
        status: string;
        ownerUserId: string;
        targetAt: string | null;
        achievedAt: string | null;
        source: SessionTranscriptResultSource;
      }>;
    } | null;
    noteCandidates?: SessionReviewNoteCandidate[];
    noteMergeTargets?: SessionReviewNoteMergeTarget[];
    actionCandidates: SessionReviewCandidate[];
    taskMergeTargets?: SessionReviewTaskMergeTarget[];
    goalCandidates?: SessionReviewGoalCandidate[];
    goalMergeTargets?: SessionReviewGoalMergeTarget[];
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

export type SessionTranscriptResultSource = {
  segmentId: string | null;
  startSeconds: number | null;
  endSeconds: number | null;
  speakerLabel: string | null;
};

export type SessionCandidateReviewKind = "note" | "task" | "goal";
export type SessionCandidateReviewState = "ready" | "listen-first" | "deferred" | "decided";

type SessionCandidateReviewQueueBase = {
  id: string;
  anchorId: string;
  kind: SessionCandidateReviewKind;
  state: SessionCandidateReviewState;
  title: string;
  segmentId: string;
  startSeconds: number;
  endSeconds: number;
};

export type SessionCandidateReviewQueueItem =
  | (SessionCandidateReviewQueueBase & { kind: "note"; candidate: SessionReviewNoteCandidate })
  | (SessionCandidateReviewQueueBase & { kind: "task"; candidate: SessionReviewCandidate })
  | (SessionCandidateReviewQueueBase & { kind: "goal"; candidate: SessionReviewGoalCandidate });

export type SessionCandidateReviewProgress = {
  total: number;
  ready: number;
  listenFirst: number;
  deferred: number;
  decided: number;
  handled: number;
  remaining: number;
};

function candidateReviewState(input: {
  reviewStatus: string;
  transcriptReviewStatus?: "provider" | "human-reviewed";
  committedId?: string | null;
}): SessionCandidateReviewState {
  const status = input.reviewStatus.trim().toUpperCase();
  if (input.committedId || status.includes("ACCEPTED") || status.includes("MERGED") || status.includes("REJECTED")) {
    return "decided";
  }
  if (status.includes("DEFERRED")) return "deferred";
  if (input.transcriptReviewStatus !== "human-reviewed") return "listen-first";
  return "ready";
}

function queueAnchorId(kind: SessionCandidateReviewKind, id: string) {
  return `candidate-review-${kind}-${encodeURIComponent(id)}`;
}

/**
 * Projects every packet candidate into one source-time review queue without
 * changing any candidate or commit boundary. Notes come first when multiple
 * proposal kinds point at the same transcript moment, followed by goals and
 * then concrete tasks.
 */
export function sessionCandidateReviewQueue(packet: SessionReviewPacket | null): SessionCandidateReviewQueueItem[] {
  const noteItems: SessionCandidateReviewQueueItem[] = (packet?.packet?.noteCandidates ?? []).map((candidate) => ({
    id: candidate.id,
    anchorId: queueAnchorId("note", candidate.id),
    kind: "note",
    state: candidateReviewState({
      reviewStatus: candidate.reviewStatus,
      transcriptReviewStatus: candidate.transcriptReviewStatus,
      committedId: candidate.committedNoteId,
    }),
    title: candidate.suggestedTitle || candidate.laneLabel,
    segmentId: candidate.segmentId,
    startSeconds: candidate.startSeconds,
    endSeconds: candidate.endSeconds,
    candidate,
  }));
  const taskItems: SessionCandidateReviewQueueItem[] = (packet?.packet?.actionCandidates ?? []).map((candidate) => ({
    id: candidate.id,
    anchorId: queueAnchorId("task", candidate.id),
    kind: "task",
    state: candidateReviewState({
      reviewStatus: candidate.reviewStatus,
      transcriptReviewStatus: candidate.transcriptReviewStatus,
      committedId: candidate.committedActionItemId,
    }),
    title: candidate.title,
    segmentId: candidate.segmentId,
    startSeconds: candidate.startSeconds,
    endSeconds: candidate.endSeconds,
    candidate,
  }));
  const goalItems: SessionCandidateReviewQueueItem[] = (packet?.packet?.goalCandidates ?? []).map((candidate) => ({
    id: candidate.id,
    anchorId: queueAnchorId("goal", candidate.id),
    kind: "goal",
    state: candidateReviewState({
      reviewStatus: candidate.reviewStatus,
      transcriptReviewStatus: candidate.transcriptReviewStatus,
      committedId: candidate.committedGoalId,
    }),
    title: candidate.suggestedTitle,
    segmentId: candidate.segmentId,
    startSeconds: candidate.startSeconds,
    endSeconds: candidate.endSeconds,
    candidate,
  }));
  const kindOrder: Record<SessionCandidateReviewKind, number> = { note: 0, goal: 1, task: 2 };
  return [...noteItems, ...taskItems, ...goalItems].sort((left, right) => (
    left.startSeconds - right.startSeconds
      || left.endSeconds - right.endSeconds
      || kindOrder[left.kind] - kindOrder[right.kind]
      || left.id.localeCompare(right.id)
  ));
}

export function sessionCandidateReviewProgress(items: SessionCandidateReviewQueueItem[]): SessionCandidateReviewProgress {
  return items.reduce<SessionCandidateReviewProgress>((progress, item) => {
    progress.total += 1;
    if (item.state === "ready") {
      progress.ready += 1;
      progress.remaining += 1;
    }
    if (item.state === "listen-first") {
      progress.listenFirst += 1;
      progress.remaining += 1;
    }
    if (item.state === "deferred") {
      progress.deferred += 1;
      progress.handled += 1;
    }
    if (item.state === "decided") {
      progress.decided += 1;
      progress.handled += 1;
    }
    return progress;
  }, { total: 0, ready: 0, listenFirst: 0, deferred: 0, decided: 0, handled: 0, remaining: 0 });
}

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
  mergeTargetGoalId?: string;
  mergeExpectedUpdatedAt?: string;
}) {
  const summaryNoteId = input.packet.packet?.summary?.id;
  const packetBuildId = input.packet.packet?.build?.packetBuildId;
  if (!summaryNoteId || !packetBuildId || !input.packet.transcriptJob?.asset?.id || input.candidate.committedGoalId || input.candidate.reviewStatus === "ACCEPTED_AS_GOAL" || input.candidate.reviewStatus === "MERGED_INTO_GOAL") return null;
  if (input.decision === "MERGE" && (!input.mergeTargetGoalId?.trim() || !input.mergeExpectedUpdatedAt?.trim())) return null;
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
    ...(input.decision === "MERGE" ? {
      mergeTargetGoalId: input.mergeTargetGoalId!.trim(),
      mergeExpectedUpdatedAt: input.mergeExpectedUpdatedAt,
    } : {}),
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
  mergeTargetTaskId?: string;
  mergeExpectedUpdatedAt?: string;
}) {
  const summaryNoteId = input.packet.packet?.summary?.id;
  const packetBuildId = input.packet.packet?.build?.packetBuildId;
  if (input.packet.packet?.transcriptReview?.packetStale) return null;
  if (!summaryNoteId || !packetBuildId || !input.packet.transcriptJob?.asset?.id) return null;
  const acceptsCanonicalWork = input.decision === "ACCEPT";
  if (input.decision === "MERGE" && (!input.mergeTargetTaskId?.trim() || !input.mergeExpectedUpdatedAt?.trim())) return null;

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
    ...(input.decision === "MERGE" ? {
      mergeTargetTaskId: input.mergeTargetTaskId!.trim(),
      mergeExpectedUpdatedAt: input.mergeExpectedUpdatedAt,
    } : {}),
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
