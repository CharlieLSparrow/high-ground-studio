import { createHash } from "node:crypto";

export type EpisodeAudioMixTranscriptReviewStatus = "provider" | "human-corrected" | "human-confirmed";

export type EpisodeAudioMixTranscriptTrack = {
  assetId: string;
  sourceId: string;
  title: string;
  participantLabel: string | null;
  programOffsetSeconds: number;
  transcriptJobId: string | null;
  provider: string | null;
  providerModel: string | null;
  unavailableReason: string | null;
};

export type EpisodeAudioMixTranscriptSegment = {
  id: string;
  transcriptJobId: string;
  startSeconds: number;
  endSeconds: number;
  text: string;
  speakerLabel: string | null;
  confidence: number | null;
  corrections: Array<{
    id: string;
    status: string;
    baseTextSha256: string;
    expectedText: string;
    expectedSpeakerLabel: string | null;
    startSecondsSnapshot: number;
    endSecondsSnapshot: number;
    correctedText: string | null;
    correctedSpeakerLabel: string | null;
    reviewedAt: Date | string | null;
    updatedAt: Date | string;
  }>;
  verifications: Array<{
    id: string;
    reviewKind: string;
    providerTextSha256: string;
    providerSpeakerLabel: string | null;
    startSecondsSnapshot: number;
    endSecondsSnapshot: number;
    createdAt: Date | string;
  }>;
};

export type EpisodeAudioMixTranscriptReview = {
  status: "available" | "partial" | "unavailable";
  detail: string;
  transcribedTrackCount: number;
  missingTrackCount: number;
  checkpoints: Array<{
    second: number;
    snippets: Array<{
      id: string;
      assetId: string;
      sourceId: string;
      trackTitle: string;
      participantLabel: string | null;
      transcriptJobId: string;
      segmentId: string;
      programStartSeconds: number;
      programEndSeconds: number;
      sourceStartSeconds: number;
      sourceEndSeconds: number;
      text: string;
      speakerLabel: string | null;
      providerTextSha256: string;
      provider: string | null;
      providerModel: string | null;
      reviewStatus: EpisodeAudioMixTranscriptReviewStatus;
      reviewReceiptId: string | null;
      providerConfidence: number | null;
    }>;
  }>;
  tracks: Array<{
    assetId: string;
    title: string;
    participantLabel: string | null;
    transcriptJobId: string | null;
    available: boolean;
    detail: string;
  }>;
  boundaries: {
    providerConfidenceIsNotMeasuredAccuracy: true;
    acceptedCorrectionsAreImmutableOverlays: true;
    snippetsAreBoundedToReviewCheckpoints: true;
    transcriptDoesNotAuthorizeMixAutomation: true;
  };
};

const CONTEXT_RADIUS_SECONDS = 8;
const MAX_SNIPPETS_PER_CHECKPOINT = 4;

function sha256(value: string) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function timestamp(value: Date | string | null | undefined) {
  if (value instanceof Date) return value.getTime();
  const parsed = value ? new Date(value).getTime() : Number.NaN;
  return Number.isFinite(parsed) ? parsed : 0;
}

function sameSecond(left: number, right: number) {
  return Number.isFinite(left) && Number.isFinite(right) && Math.abs(left - right) <= 0.001;
}

function validAcceptedCorrection(segment: EpisodeAudioMixTranscriptSegment) {
  return [...segment.corrections]
    .filter((correction) => correction.status === "accepted"
      && correction.baseTextSha256 === sha256(segment.text)
      && correction.expectedText === segment.text
      && (correction.expectedSpeakerLabel ?? null) === (segment.speakerLabel ?? null)
      && sameSecond(correction.startSecondsSnapshot, segment.startSeconds)
      && sameSecond(correction.endSecondsSnapshot, segment.endSeconds))
    .sort((left, right) => timestamp(right.updatedAt) - timestamp(left.updatedAt))[0] ?? null;
}

function validVerification(segment: EpisodeAudioMixTranscriptSegment) {
  return [...segment.verifications]
    .filter((verification) => verification.reviewKind === "confirmed-as-is"
      && verification.providerTextSha256 === sha256(segment.text)
      && (verification.providerSpeakerLabel ?? null) === (segment.speakerLabel ?? null)
      && sameSecond(verification.startSecondsSnapshot, segment.startSeconds)
      && sameSecond(verification.endSecondsSnapshot, segment.endSeconds))
    .sort((left, right) => timestamp(right.createdAt) - timestamp(left.createdAt))[0] ?? null;
}

function distanceFromCheckpoint(startSeconds: number, endSeconds: number, checkpointSecond: number) {
  if (checkpointSecond >= startSeconds && checkpointSecond <= endSeconds) return 0;
  return Math.min(Math.abs(checkpointSecond - startSeconds), Math.abs(checkpointSecond - endSeconds));
}

function rounded(value: number) {
  return Number(value.toFixed(3));
}

function boundedText(value: string) {
  const normalized = value.trim().replace(/\s+/g, " ");
  return normalized.length <= 420 ? normalized : `${normalized.slice(0, 417).trimEnd()}…`;
}

export function emptyEpisodeAudioMixTranscriptReview(detail = "Build a completed matched A/B preview before loading checkpoint transcript context."): EpisodeAudioMixTranscriptReview {
  return {
    status: "unavailable",
    detail,
    transcribedTrackCount: 0,
    missingTrackCount: 0,
    checkpoints: [],
    tracks: [],
    boundaries: {
      providerConfidenceIsNotMeasuredAccuracy: true,
      acceptedCorrectionsAreImmutableOverlays: true,
      snippetsAreBoundedToReviewCheckpoints: true,
      transcriptDoesNotAuthorizeMixAutomation: true,
    },
  };
}

/**
 * Projects readable transcript context beside matched A/B checkpoints without
 * weakening the text-free activity-map boundary. Provider segments remain
 * immutable; only current, snapshot-matching human review receipts change the
 * effective text or review label.
 */
export function projectEpisodeAudioMixTranscriptReview(input: {
  checkpointSeconds: number[];
  tracks: EpisodeAudioMixTranscriptTrack[];
  segments: EpisodeAudioMixTranscriptSegment[];
}): EpisodeAudioMixTranscriptReview {
  const tracksByJob = new Map(input.tracks.flatMap((track) => track.transcriptJobId ? [[track.transcriptJobId, track] as const] : []));
  const canonicalSegments = input.segments.filter((segment) => tracksByJob.has(segment.transcriptJobId));
  const transcribedTrackCount = input.tracks.filter((track) => track.transcriptJobId).length;
  const missingTrackCount = input.tracks.length - transcribedTrackCount;
  const status = transcribedTrackCount === 0 ? "unavailable" : missingTrackCount === 0 ? "available" : "partial";
  const detail = status === "available"
    ? "Every included track has exact-source timed transcript context."
    : status === "partial"
      ? `${transcribedTrackCount} of ${input.tracks.length} included tracks have exact-source timed transcript context.`
      : "No included exact source has a completed, integrity-verified timed transcript yet.";

  const checkpoints = [...new Set(input.checkpointSeconds.filter(Number.isFinite).map((second) => rounded(Math.max(0, second))))]
    .sort((left, right) => left - right)
    .map((second) => {
      const snippets = input.tracks.flatMap((track) => {
        if (!track.transcriptJobId) return [];
        const sourceCheckpoint = second - track.programOffsetSeconds;
        const closest = canonicalSegments
          .filter((segment) => segment.transcriptJobId === track.transcriptJobId
            && segment.endSeconds >= sourceCheckpoint - CONTEXT_RADIUS_SECONDS
            && segment.startSeconds <= sourceCheckpoint + CONTEXT_RADIUS_SECONDS)
          .sort((left, right) => distanceFromCheckpoint(left.startSeconds, left.endSeconds, sourceCheckpoint) - distanceFromCheckpoint(right.startSeconds, right.endSeconds, sourceCheckpoint)
            || left.startSeconds - right.startSeconds)[0] ?? null;
        if (!closest) return [];
        const correction = validAcceptedCorrection(closest);
        const verification = correction ? null : validVerification(closest);
        const reviewStatus: EpisodeAudioMixTranscriptReviewStatus = correction ? "human-corrected" : verification ? "human-confirmed" : "provider";
        return [{
          id: `${second}:${track.assetId}:${closest.id}`,
          assetId: track.assetId,
          sourceId: track.sourceId,
          trackTitle: track.title,
          participantLabel: track.participantLabel,
          transcriptJobId: closest.transcriptJobId,
          segmentId: closest.id,
          programStartSeconds: rounded(closest.startSeconds + track.programOffsetSeconds),
          programEndSeconds: rounded(closest.endSeconds + track.programOffsetSeconds),
          sourceStartSeconds: rounded(closest.startSeconds),
          sourceEndSeconds: rounded(closest.endSeconds),
          text: boundedText(correction?.correctedText || closest.text),
          speakerLabel: correction?.correctedSpeakerLabel ?? closest.speakerLabel ?? track.participantLabel,
          providerTextSha256: sha256(closest.text),
          provider: track.provider,
          providerModel: track.providerModel,
          reviewStatus,
          reviewReceiptId: correction?.id ?? verification?.id ?? null,
          providerConfidence: typeof closest.confidence === "number" && Number.isFinite(closest.confidence) ? closest.confidence : null,
          distance: distanceFromCheckpoint(closest.startSeconds, closest.endSeconds, sourceCheckpoint),
        }];
      })
        .sort((left, right) => left.distance - right.distance || left.trackTitle.localeCompare(right.trackTitle))
        .slice(0, MAX_SNIPPETS_PER_CHECKPOINT)
        .map(({ distance: _distance, ...snippet }) => snippet);
      return { second, snippets };
    });

  return {
    status,
    detail,
    transcribedTrackCount,
    missingTrackCount,
    checkpoints,
    tracks: input.tracks.map((track) => ({
      assetId: track.assetId,
      title: track.title,
      participantLabel: track.participantLabel,
      transcriptJobId: track.transcriptJobId,
      available: Boolean(track.transcriptJobId),
      detail: track.transcriptJobId ? "Exact-source timed transcript available." : track.unavailableReason || "Timed transcript unavailable.",
    })),
    boundaries: emptyEpisodeAudioMixTranscriptReview().boundaries,
  };
}
