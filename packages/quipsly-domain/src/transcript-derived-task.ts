export const TRANSCRIPT_DERIVED_TASK_SCHEMA = "quipsly-transcript-derived-task-v1" as const;
export const TRANSCRIPT_DERIVED_GOAL_SCHEMA = "quipsly-transcript-derived-goal-v1" as const;

export type TaskStatus = "INBOX" | "TODO" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED" | "DEFERRED";

export type QuipslyCanonicalTask = {
  id: string;
  title: string;
  detail?: string | null;
  status: TaskStatus;
  ownerAccountId: string;
  projectId?: string | null;
  sourceAnchorId?: string | null;
  availableAt?: string | null;
  deadlineAt?: string | null;
  scheduledTimeBlock?: {
    startAt: string;
    endAt: string;
  } | null;
  createdAt: string;
  updatedAt: string;
};

export type TaskStatusEventKind =
  | "TASK_CREATED"
  | "TASK_STATUS_CHANGED"
  | "TASK_RESCHEDULED"
  | "TASK_COMPLETED";

export type TaskStatusChangeEvent = {
  id: string;
  taskId: string;
  kind: TaskStatusEventKind;
  previousStatus?: TaskStatus | null;
  nextStatus: TaskStatus;
  actorAccountId: string;
  reason?: string | null;
  timestamp: string;
};

export type TranscriptDerivedTaskSourceAnchor = {
  schema: typeof TRANSCRIPT_DERIVED_TASK_SCHEMA;
  roomId: string;
  transcriptJobId: string;
  segmentId: string;
  startSeconds: number;
  endSeconds: number;
  providerTextSha256: string;
  providerSpeakerLabel: string | null;
  effectiveTextSnapshot: string;
  effectiveSpeakerLabelSnapshot: string | null;
  acceptedCorrectionId: string | null;
  recordingAssetId: string;
  playbackSourceId: string;
};

export type TranscriptDerivedGoalSourceAnchor = Omit<TranscriptDerivedTaskSourceAnchor, "schema"> & {
  schema: typeof TRANSCRIPT_DERIVED_GOAL_SCHEMA;
};

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function text(value: unknown, max: number) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function nullableText(value: unknown, max: number) {
  const result = text(value, max);
  return result || null;
}

function finiteSeconds(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
}

/**
 * Parses the immutable evidence pointer stored on an explicit transcript task.
 * Invalid or incomplete receipts fail closed so consumer surfaces never invent
 * a backlink from partial legacy metadata.
 */
export function readTranscriptDerivedTaskSource(value: unknown): TranscriptDerivedTaskSourceAnchor | null {
  const source = record(value);
  if (source.schema !== TRANSCRIPT_DERIVED_TASK_SCHEMA) return null;
  const roomId = text(source.roomId, 200);
  const transcriptJobId = text(source.transcriptJobId, 200);
  const segmentId = text(source.segmentId, 200);
  const startSeconds = finiteSeconds(source.startSeconds);
  const endSeconds = finiteSeconds(source.endSeconds);
  const providerTextSha256 = text(source.providerTextSha256, 64).toLowerCase();
  const effectiveTextSnapshot = text(source.effectiveTextSnapshot, 10_000);
  const recordingAssetId = text(source.recordingAssetId, 200);
  const playbackSourceId = text(source.playbackSourceId, 200);
  if (!roomId || !transcriptJobId || !segmentId || startSeconds === null || endSeconds === null
      || endSeconds < startSeconds || !/^[a-f0-9]{64}$/.test(providerTextSha256)
      || !effectiveTextSnapshot || !recordingAssetId || !playbackSourceId) {
    return null;
  }
  return {
    schema: TRANSCRIPT_DERIVED_TASK_SCHEMA,
    roomId,
    transcriptJobId,
    segmentId,
    startSeconds,
    endSeconds,
    providerTextSha256,
    providerSpeakerLabel: nullableText(source.providerSpeakerLabel, 160),
    effectiveTextSnapshot,
    effectiveSpeakerLabelSnapshot: nullableText(source.effectiveSpeakerLabelSnapshot, 160),
    acceptedCorrectionId: nullableText(source.acceptedCorrectionId, 200),
    recordingAssetId,
    playbackSourceId,
  };
}

/** Parses the same immutable transcript pointer for an explicitly created Goal. */
export function readTranscriptDerivedGoalSource(value: unknown): TranscriptDerivedGoalSourceAnchor | null {
  const source = record(value);
  if (source.schema !== TRANSCRIPT_DERIVED_GOAL_SCHEMA) return null;
  const roomId = text(source.roomId, 200);
  const transcriptJobId = text(source.transcriptJobId, 200);
  const segmentId = text(source.segmentId, 200);
  const startSeconds = finiteSeconds(source.startSeconds);
  const endSeconds = finiteSeconds(source.endSeconds);
  const providerTextSha256 = text(source.providerTextSha256, 64).toLowerCase();
  const effectiveTextSnapshot = text(source.effectiveTextSnapshot, 10_000);
  const recordingAssetId = text(source.recordingAssetId, 200);
  const playbackSourceId = text(source.playbackSourceId, 200);
  if (!roomId || !transcriptJobId || !segmentId || startSeconds === null || endSeconds === null
      || endSeconds < startSeconds || !/^[a-f0-9]{64}$/.test(providerTextSha256)
      || !effectiveTextSnapshot || !recordingAssetId || !playbackSourceId) return null;
  return {
    schema: TRANSCRIPT_DERIVED_GOAL_SCHEMA,
    roomId,
    transcriptJobId,
    segmentId,
    startSeconds,
    endSeconds,
    providerTextSha256,
    providerSpeakerLabel: nullableText(source.providerSpeakerLabel, 160),
    effectiveTextSnapshot,
    effectiveSpeakerLabelSnapshot: nullableText(source.effectiveSpeakerLabelSnapshot, 160),
    acceptedCorrectionId: nullableText(source.acceptedCorrectionId, 200),
    recordingAssetId,
    playbackSourceId,
  };
}
