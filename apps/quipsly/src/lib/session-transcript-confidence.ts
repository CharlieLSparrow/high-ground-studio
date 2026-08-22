export type SessionTranscriptConfidenceState =
  | "NOT_STARTED"
  | "PROCESSING"
  | "NEEDS_ATTENTION"
  | "READY_TO_REVIEW"
  | "REVIEWED";

export type SessionTranscriptConfidence = {
  schema: "quipsly-session-transcript-confidence-v1";
  state: SessionTranscriptConfidenceState;
  label: string;
  detail: string;
  exactSourceBound: boolean;
  segmentTimingReady: boolean;
  wordEditingReady: boolean;
  speakerAttributionComplete: boolean;
  humanReviewComplete: boolean;
  segmentCount: number;
  wordCount: number;
  reviewedSegmentCount: number;
  speakerClusterCount: number;
  attributedSpeakerClusterCount: number;
  transcriptStartSeconds: number | null;
  transcriptEndSeconds: number | null;
  nextAction: string;
  boundaries: {
    providerConfidenceIsNotMeasuredAccuracy: true;
    speakerLabelIsNotParticipantIdentity: true;
    completedJobAloneIsNotExactSourceProof: true;
    textEditingRequiresImmutableWordTiming: true;
  };
};

type SegmentInput = {
  startSeconds?: unknown;
  endSeconds?: unknown;
  speakerLabel?: unknown;
  corrections?: unknown[] | null;
  verifications?: unknown[] | null;
};

function sha256(value: unknown) {
  const candidate = typeof value === "string" ? value.trim().toLowerCase() : "";
  return /^[a-f0-9]{64}$/.test(candidate) ? candidate : null;
}

function number(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export function buildSessionTranscriptConfidence(input: {
  job: {
    id?: unknown;
    status?: unknown;
    assetId?: unknown;
    sourceSha256?: unknown;
    segments?: SegmentInput[] | null;
    speakerAttributions?: Array<{ providerSpeakerLabel?: unknown; status?: unknown }> | null;
    _count?: { segments?: unknown; words?: unknown } | null;
  } | null;
  asset: { id?: unknown; checksum?: unknown } | null;
  processingAllowed: boolean;
}): SessionTranscriptConfidence {
  const status = text(input.job?.status).toUpperCase();
  const segments = Array.isArray(input.job?.segments) ? input.job.segments : [];
  const segmentCount = Math.max(0, Number(input.job?._count?.segments ?? segments.length) || 0);
  const wordCount = Math.max(0, Number(input.job?._count?.words ?? 0) || 0);
  const timings = segments.map((segment) => ({ start: number(segment.startSeconds), end: number(segment.endSeconds) }));
  const validStarts = timings.flatMap((timing) => timing.start === null ? [] : [timing.start]);
  const validEnds = timings.flatMap((timing) => timing.end === null ? [] : [timing.end]);
  const segmentTimingReady = status === "COMPLETED"
    && segmentCount > 0
    && segments.length === segmentCount
    && timings.every((timing) => timing.start !== null && timing.end !== null && timing.start >= 0 && timing.end >= timing.start);
  const sourceHash = sha256(input.job?.sourceSha256);
  const assetHash = sha256(input.asset?.checksum);
  const exactSourceBound = Boolean(
    input.job
    && input.asset
    && text(input.job.assetId)
    && text(input.job.assetId) === text(input.asset.id)
    && sourceHash
    && sourceHash === assetHash,
  );
  const speakerLabels = [...new Set(segments.map((segment) => text(segment.speakerLabel)).filter(Boolean))];
  const activeAttributions = new Set((input.job?.speakerAttributions ?? [])
    .filter((attribution) => text(attribution.status).toLowerCase() === "active")
    .map((attribution) => text(attribution.providerSpeakerLabel))
    .filter(Boolean));
  const attributedSpeakerClusterCount = speakerLabels.filter((label) => activeAttributions.has(label)).length;
  const speakerAttributionComplete = speakerLabels.length > 0 && attributedSpeakerClusterCount === speakerLabels.length;
  const reviewedSegmentCount = segments.filter((segment) => (
    (Array.isArray(segment.corrections) && segment.corrections.length > 0)
    || (Array.isArray(segment.verifications) && segment.verifications.length > 0)
  )).length;
  const humanReviewComplete = segmentCount > 0 && reviewedSegmentCount === segmentCount;
  const wordEditingReady = exactSourceBound && segmentTimingReady && wordCount > 0 && input.processingAllowed;
  const running = ["QUEUED", "RUNNING", "PROCESSING"].includes(status);
  const failed = ["FAILED", "HELD", "CANCELED"].includes(status);
  const reviewReady = status === "COMPLETED" && exactSourceBound && segmentTimingReady && input.processingAllowed;
  const state: SessionTranscriptConfidenceState = !input.job
    ? "NOT_STARTED"
    : running
      ? "PROCESSING"
      : failed || !reviewReady
        ? "NEEDS_ATTENTION"
        : humanReviewComplete && speakerAttributionComplete
          ? "REVIEWED"
          : "READY_TO_REVIEW";
  const copy: Record<SessionTranscriptConfidenceState, [string, string]> = {
    NOT_STARTED: ["Transcript not started", "A verified recording is needed before Quipsly can create timed text."],
    PROCESSING: ["Creating timed transcript", "Quipsly is transcribing the exact released recording in the background."],
    NEEDS_ATTENTION: ["Transcript needs attention", !input.processingAllowed
      ? "Current consent or release evidence does not permit transcript use."
      : status === "COMPLETED" && !exactSourceBound
        ? "The completed text is not proven against the currently selected recording bytes."
        : status === "COMPLETED" && !segmentTimingReady
          ? "The completed text is missing a complete, structurally valid segment timeline."
          : "The transcript job did not complete normally."],
    READY_TO_REVIEW: ["Transcript ready to review", "Timed text is bound to the exact recording. Listen, correct words, and identify speakers where needed."],
    REVIEWED: ["Transcript reviewed", "Every segment has playback-reviewed text and every provider speaker cluster has a reviewed identity."],
  };
  const nextAction = state === "NOT_STARTED"
    ? "Start transcription from the verified recording."
    : state === "PROCESSING"
      ? "You can leave this page; Quipsly will keep the durable job running."
      : state === "NEEDS_ATTENTION"
        ? "Open transcript details to repair consent, source binding, or timing evidence."
        : !speakerAttributionComplete
          ? "Listen to a sample from each speaker and confirm who they are."
          : !humanReviewComplete
            ? "Review uncertain segments against recording playback."
            : "Use the reviewed transcript for edits, notes, tasks, and goals.";

  return {
    schema: "quipsly-session-transcript-confidence-v1",
    state,
    label: copy[state][0],
    detail: copy[state][1],
    exactSourceBound,
    segmentTimingReady,
    wordEditingReady,
    speakerAttributionComplete,
    humanReviewComplete,
    segmentCount,
    wordCount,
    reviewedSegmentCount,
    speakerClusterCount: speakerLabels.length,
    attributedSpeakerClusterCount,
    transcriptStartSeconds: validStarts.length ? Math.min(...validStarts) : null,
    transcriptEndSeconds: validEnds.length ? Math.max(...validEnds) : null,
    nextAction,
    boundaries: {
      providerConfidenceIsNotMeasuredAccuracy: true,
      speakerLabelIsNotParticipantIdentity: true,
      completedJobAloneIsNotExactSourceProof: true,
      textEditingRequiresImmutableWordTiming: true,
    },
  };
}
