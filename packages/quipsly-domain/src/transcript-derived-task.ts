export const TRANSCRIPT_DERIVED_TASK_SCHEMA = "quipsly-transcript-derived-task-v1" as const;
export const TRANSCRIPT_DERIVED_GOAL_SCHEMA = "quipsly-transcript-derived-goal-v1" as const;
export const TRANSCRIPT_DERIVED_NOTE_SCHEMA = "quipsly-transcript-derived-note-v1" as const;
export const TRANSCRIPT_SOURCE_SPAN_SCHEMA = "quipsly-transcript-source-span-v1" as const;

export type TranscriptSourceSpanSegmentEvidence = {
  segmentId: string;
  startSeconds: number;
  endSeconds: number;
  providerTextSha256: string;
  providerSpeakerLabel: string | null;
  effectiveTextSnapshot: string;
  effectiveSpeakerLabelSnapshot: string | null;
  acceptedReviewId: string | null;
  acceptedCorrectionId: string | null;
  reviewStatus: "provider" | "human-reviewed";
};

/**
 * Additive multi-segment evidence receipt. The enclosing source keeps its
 * original `segmentId` as a stable deep link, while this receipt proves every
 * immutable provider segment used by the accepted wording.
 */
export type TranscriptSourceSpanEvidence = {
  schema: typeof TRANSCRIPT_SOURCE_SPAN_SCHEMA;
  primarySegmentId: string;
  segmentIds: string[];
  startSeconds: number;
  endSeconds: number;
  effectiveTextSnapshot: string;
  segments: TranscriptSourceSpanSegmentEvidence[];
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
  sourceSpan?: TranscriptSourceSpanEvidence | null;
};

export type TranscriptDerivedGoalSourceAnchor = Omit<TranscriptDerivedTaskSourceAnchor, "schema"> & {
  schema: typeof TRANSCRIPT_DERIVED_GOAL_SCHEMA;
};

export type TranscriptDerivedNoteSourceAnchor = Omit<TranscriptDerivedTaskSourceAnchor, "schema"> & {
  schema: typeof TRANSCRIPT_DERIVED_NOTE_SCHEMA;
};

export type TranscriptMergedNoteSource = {
  receiptId: string;
  packetNoteCandidateId: string;
  mergedAt: string;
  sourceAnchor: TranscriptDerivedNoteSourceAnchor;
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

function hasOwn(value: Record<string, unknown>, key: string) {
  return Object.prototype.hasOwnProperty.call(value, key);
}

export function readTranscriptSourceSpan(value: unknown): TranscriptSourceSpanEvidence | null {
  const source = record(value);
  if (source.schema !== TRANSCRIPT_SOURCE_SPAN_SCHEMA) return null;
  const primarySegmentId = text(source.primarySegmentId, 200);
  const segmentIds = Array.isArray(source.segmentIds)
    ? source.segmentIds.map((value) => text(value, 200))
    : [];
  const startSeconds = finiteSeconds(source.startSeconds);
  const endSeconds = finiteSeconds(source.endSeconds);
  const effectiveTextSnapshot = text(source.effectiveTextSnapshot, 20_000);
  const rawSegments = Array.isArray(source.segments) ? source.segments : [];
  if (!primarySegmentId || segmentIds.length < 2 || segmentIds.length > 12
      || segmentIds.some((id) => !id) || new Set(segmentIds).size !== segmentIds.length
      || segmentIds[0] !== primarySegmentId || startSeconds === null || endSeconds === null
      || endSeconds < startSeconds || !effectiveTextSnapshot || rawSegments.length !== segmentIds.length) {
    return null;
  }

  const segments: TranscriptSourceSpanSegmentEvidence[] = [];
  let priorStart = -1;
  for (let index = 0; index < rawSegments.length; index += 1) {
    const item = record(rawSegments[index]);
    const segmentId = text(item.segmentId, 200);
    const itemStart = finiteSeconds(item.startSeconds);
    const itemEnd = finiteSeconds(item.endSeconds);
    const providerTextSha256 = text(item.providerTextSha256, 64).toLowerCase();
    const itemText = text(item.effectiveTextSnapshot, 10_000);
    const reviewStatus = item.reviewStatus === "human-reviewed" ? "human-reviewed" : item.reviewStatus === "provider" ? "provider" : null;
    if (segmentId !== segmentIds[index] || itemStart === null || itemEnd === null || itemEnd < itemStart
        || itemStart < priorStart || !/^[a-f0-9]{64}$/.test(providerTextSha256)
        || !itemText || reviewStatus === null) return null;
    priorStart = itemStart;
    segments.push({
      segmentId,
      startSeconds: itemStart,
      endSeconds: itemEnd,
      providerTextSha256,
      providerSpeakerLabel: nullableText(item.providerSpeakerLabel, 160),
      effectiveTextSnapshot: itemText,
      effectiveSpeakerLabelSnapshot: nullableText(item.effectiveSpeakerLabelSnapshot, 160),
      acceptedReviewId: nullableText(item.acceptedReviewId, 200),
      acceptedCorrectionId: nullableText(item.acceptedCorrectionId, 200),
      reviewStatus,
    });
  }
  if (segments[0]?.startSeconds !== startSeconds
      || segments.at(-1)?.endSeconds !== endSeconds
      || segments.map((segment) => segment.effectiveTextSnapshot).join(" ") !== effectiveTextSnapshot) return null;
  return {
    schema: TRANSCRIPT_SOURCE_SPAN_SCHEMA,
    primarySegmentId,
    segmentIds,
    startSeconds,
    endSeconds,
    effectiveTextSnapshot,
    segments,
  };
}

function optionalSourceSpan(source: Record<string, unknown>, anchor: {
  segmentId: string;
  startSeconds: number;
  endSeconds: number;
  providerTextSha256: string;
  effectiveTextSnapshot: string;
}) {
  if (!hasOwn(source, "sourceSpan")) return { valid: true as const, sourceSpan: undefined };
  const sourceSpan = readTranscriptSourceSpan(source.sourceSpan);
  const primary = sourceSpan?.segments[0];
  if (!sourceSpan || sourceSpan.primarySegmentId !== anchor.segmentId
      || sourceSpan.startSeconds !== anchor.startSeconds || sourceSpan.endSeconds !== anchor.endSeconds
      || sourceSpan.effectiveTextSnapshot !== anchor.effectiveTextSnapshot
      || primary?.providerTextSha256 !== anchor.providerTextSha256) {
    return { valid: false as const, sourceSpan: null };
  }
  return { valid: true as const, sourceSpan };
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
  const span = optionalSourceSpan(source, { segmentId, startSeconds, endSeconds, providerTextSha256, effectiveTextSnapshot });
  if (!span.valid) return null;
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
    sourceSpan: span.sourceSpan,
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
  const span = optionalSourceSpan(source, { segmentId, startSeconds, endSeconds, providerTextSha256, effectiveTextSnapshot });
  if (!span.valid) return null;
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
    sourceSpan: span.sourceSpan,
  };
}

/** Parses the immutable transcript pointer preserved on a deliberate Session note. */
export function readTranscriptDerivedNoteSource(value: unknown): TranscriptDerivedNoteSourceAnchor | null {
  const source = record(value);
  if (source.schema !== TRANSCRIPT_DERIVED_NOTE_SCHEMA) return null;
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
  const span = optionalSourceSpan(source, { segmentId, startSeconds, endSeconds, providerTextSha256, effectiveTextSnapshot });
  if (!span.valid) return null;
  return {
    schema: TRANSCRIPT_DERIVED_NOTE_SCHEMA,
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
    sourceSpan: span.sourceSpan,
  };
}

/**
 * Reads the latest candidate source appended to an existing canonical note.
 * The note's original source remains untouched; complete prior merge evidence
 * lives in immutable CoachingNoteRevision snapshots.
 */
export function readLastTranscriptMergedNoteSource(value: unknown): TranscriptMergedNoteSource | null {
  const receipt = record(record(value).lastTranscriptCandidateMerge);
  if (receipt.kind !== "quipsly-note-candidate-review-receipt-v1" || receipt.decision !== "MERGE") return null;
  const receiptId = text(receipt.id, 200);
  const packetNoteCandidateId = text(receipt.packetNoteCandidateId, 700);
  const mergedAt = text(receipt.reviewedAt, 80);
  const sourceAnchor = readTranscriptDerivedNoteSource(receipt.candidateSource);
  if (!receiptId || !packetNoteCandidateId || !mergedAt || !sourceAnchor) return null;
  return { receiptId, packetNoteCandidateId, mergedAt, sourceAnchor };
}
