import {
  TRANSCRIPT_SOURCE_SPAN_SCHEMA,
  type TranscriptSourceSpanEvidence,
} from "@high-ground/quipsly-domain/transcript-derived-task";

function text(value: unknown) {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

function nullableText(value: unknown) {
  return text(value) || null;
}

function acceptedReviewId(segment: any) {
  return text(segment?.acceptedReviewId)
    || text(segment?.acceptedCorrection?.id)
    || text(segment?.acceptedVerification?.id)
    || null;
}

function acceptedCorrectionId(segment: any) {
  return text(segment?.acceptedCorrectionId) || text(segment?.acceptedCorrection?.id) || null;
}

function reviewStatus(segment: any): "provider" | "human-reviewed" {
  return segment?.reviewStatus === "human-reviewed" || acceptedReviewId(segment)
    ? "human-reviewed"
    : "provider";
}

export function unreviewedTranscriptSpanSegmentIds(segments: any[]) {
  return segments
    .filter((segment) => reviewStatus(segment) !== "human-reviewed")
    .map((segment) => text(segment?.id))
    .filter(Boolean);
}

export function transcriptSpanIsFullyHumanReviewed(segments: any[]) {
  return segments.length > 0 && unreviewedTranscriptSpanSegmentIds(segments).length === 0;
}

export type TranscriptSourceReviewState = "human-reviewed" | "provider-transcript";

/**
 * Internal, reversible follow-through may retain provider transcript evidence
 * without pretending a person listened to it. External delivery and source
 * correction continue to use their stricter, playback-confirmed policies.
 */
export function transcriptSpanReviewState(segments: any[]): TranscriptSourceReviewState {
  return transcriptSpanIsFullyHumanReviewed(segments)
    ? "human-reviewed"
    : "provider-transcript";
}

export function transcriptSpanSegmentIds(value: unknown, primarySegmentId: string) {
  const ids = Array.isArray(value)
    ? value.map((candidate) => text(candidate)).filter(Boolean)
    : [];
  if (!ids.length) return primarySegmentId ? [primarySegmentId] : [];
  if (ids.length > 12 || ids[0] !== primarySegmentId || new Set(ids).size !== ids.length) return [];
  return ids;
}

export function resolveTranscriptSpanSegments(input: {
  segmentIds: unknown;
  primarySegmentId: string;
  segments: any[];
}) {
  const segmentIds = transcriptSpanSegmentIds(input.segmentIds, input.primarySegmentId);
  if (!segmentIds.length) return null;
  const byId = new Map(input.segments.map((segment, index) => [text(segment?.id), { segment, index }]));
  const located = segmentIds.map((id) => byId.get(id));
  if (located.some((entry) => !entry)
      || located.some((entry, index) => index > 0 && entry!.index !== located[index - 1]!.index + 1)) return null;
  const resolved = located.map((entry) => entry!.segment);
  if (resolved.some((segment) => !segment)) return null;
  for (let index = 0; index < resolved.length; index += 1) {
    const segment = resolved[index];
    const start = Number(segment?.startSeconds);
    const end = Number(segment?.endSeconds);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return null;
    if (index > 0 && start < Number(resolved[index - 1]?.startSeconds)) return null;
  }
  return resolved;
}

export function transcriptSpanEffectiveText(segments: any[]) {
  return segments.map((segment) => text(segment?.text)).filter(Boolean).join(" ");
}

function sharedSpeaker(segments: any[], field: "speakerLabel" | "providerSpeakerLabel") {
  const values = [...new Set(segments.map((segment) => nullableText(segment?.[field])))];
  return values.length === 1 ? values[0] : null;
}

function sharedText(segments: any[], field: "speakerAuthority" | "sourceBoundParticipantId") {
  const values = [...new Set(segments.map((segment) => nullableText(segment?.[field])))];
  return values.length === 1 ? values[0] : null;
}

export function buildTranscriptSourceAnchorFields(segments: any[]) {
  if (!segments.length) return null;
  const first = segments[0];
  const last = segments.at(-1);
  const effectiveTextSnapshot = transcriptSpanEffectiveText(segments);
  const providerTextSha256 = text(first?.providerTextSha256).toLowerCase();
  const startSeconds = Number(first?.startSeconds);
  const endSeconds = Number(last?.endSeconds);
  if (!text(first?.id) || !effectiveTextSnapshot || !/^[a-f0-9]{64}$/.test(providerTextSha256)
      || !Number.isFinite(startSeconds) || !Number.isFinite(endSeconds) || endSeconds < startSeconds) return null;

  const sourceSpan: TranscriptSourceSpanEvidence | null = segments.length > 1 ? {
    schema: TRANSCRIPT_SOURCE_SPAN_SCHEMA,
    primarySegmentId: text(first.id),
    segmentIds: segments.map((segment) => text(segment.id)),
    startSeconds,
    endSeconds,
    effectiveTextSnapshot,
    segments: segments.map((segment) => ({
      segmentId: text(segment.id),
      startSeconds: Number(segment.startSeconds),
      endSeconds: Number(segment.endSeconds),
      providerTextSha256: text(segment.providerTextSha256).toLowerCase(),
      providerSpeakerLabel: nullableText(segment.providerSpeakerLabel),
      effectiveTextSnapshot: text(segment.text),
      effectiveSpeakerLabelSnapshot: nullableText(segment.speakerLabel),
      acceptedReviewId: acceptedReviewId(segment),
      acceptedCorrectionId: acceptedCorrectionId(segment),
      reviewStatus: reviewStatus(segment),
    })),
  } : null;

  if (sourceSpan?.segments.some((segment) => !segment.segmentId
      || !segment.effectiveTextSnapshot || !/^[a-f0-9]{64}$/.test(segment.providerTextSha256))) return null;

  return {
    segmentId: text(first.id),
    segmentIds: segments.map((segment) => text(segment.id)),
    startSeconds,
    endSeconds,
    providerText: typeof first?.providerText === "string" ? first.providerText : text(first?.text),
    providerTextSha256,
    providerSpeakerLabel: sharedSpeaker(segments, "providerSpeakerLabel"),
    effectiveTextSnapshot,
    effectiveSpeakerLabelSnapshot: sharedSpeaker(segments, "speakerLabel"),
    speakerAuthority: sharedText(segments, "speakerAuthority"),
    sourceBoundParticipantId: sharedText(segments, "sourceBoundParticipantId"),
    acceptedCorrectionId: acceptedCorrectionId(first),
    ...(sourceSpan ? { sourceSpan } : {}),
  };
}
