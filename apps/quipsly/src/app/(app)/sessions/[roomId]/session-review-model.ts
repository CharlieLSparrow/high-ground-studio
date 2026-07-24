import {
  isUnreviewedTranscriptActionItemSource,
  type TranscriptActionReviewDecision,
  type TranscriptGoalReviewDecision,
} from "@high-ground/quipsly-domain/coaching-packet";

export type SessionReviewCandidate = {
  id: string;
  title: string;
  detail: string;
  transcriptJobId: string;
  recordingAssetId: string;
  roomId: string;
  packetBuildId: string;
  segmentId: string;
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
  speakerLabel: string | null;
  startSeconds: number;
  endSeconds: number;
  sourceText: string;
  providerTextSha256: string;
  suggestedTitle: string;
  suggestedDescription: string;
  reviewStatus: "READY_FOR_HUMAN_REVIEW" | "EDITED_FOR_REVIEW" | "DEFERRED_BY_HUMAN" | "REJECTED_BY_HUMAN" | "ACCEPTED_AS_GOAL";
  humanApprovalRequired: boolean;
  committedGoalId: string | null;
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
    actionCandidates: SessionReviewCandidate[];
    goalCandidates?: SessionReviewGoalCandidate[];
    actionItems: Array<{ id: string; title: string; detail: string | null; status: string; dueAt: string | null; source: Record<string, unknown> }>;
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
  note?: string;
}) {
  const summaryNoteId = input.packet.packet?.summary?.id;
  const packetBuildId = input.packet.packet?.build?.packetBuildId;
  if (!summaryNoteId || !packetBuildId || !input.packet.transcriptJob?.asset?.id || input.candidate.committedGoalId || input.candidate.reviewStatus === "ACCEPTED_AS_GOAL") return null;
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
}) {
  const summaryNoteId = input.packet.packet?.summary?.id;
  const packetBuildId = input.packet.packet?.build?.packetBuildId;
  if (!summaryNoteId || !packetBuildId || !input.packet.transcriptJob?.asset?.id) return null;

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
  };
}
