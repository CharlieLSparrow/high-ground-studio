import type {
  EpisodeEditExecutionInspection,
  EpisodeEditProcessingJob,
  EpisodeEditTranscriptProjection,
  EpisodeEditTranscriptSegment,
} from "@/lib/editor/program-edit-contract";

type JsonRecord = Record<string, unknown>;

function record(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as JsonRecord
    : {};
}

function text(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

function number(...values: unknown[]): number | null {
  for (const value of values) {
    if (value === null || value === undefined || value === "") continue;
    const parsed = typeof value === "number" ? value : Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function transcriptRows(value: unknown): { rows: unknown[]; sourceFormat: string } | null {
  const root = record(value);
  const timeline = record(root.timeline);
  const data = record(root.data);
  const candidates: Array<[unknown, string]> = [
    [root.transcript, "transcript"],
    [root.blocks, "blocks"],
    [timeline.transcript, "timeline.transcript"],
    [timeline.blocks, "timeline.blocks"],
    [data.transcript, "data.transcript"],
    [data.blocks, "data.blocks"],
  ];
  const candidate = candidates.find(([rows]) => Array.isArray(rows));
  return candidate ? { rows: candidate[0] as unknown[], sourceFormat: candidate[1] } : null;
}

/**
 * Projects every retained Episode transcript shape onto one honest clock.
 * Materialized Episode artifacts carry `time`, which is the reviewed Episode
 * clock; their source timing remains separate provenance. Older source-only
 * projections keep their source clock explicitly. Invalid or untimed rows stay
 * out of the editor rather than receiving invented timing. Provider words remain
 * immutable; this is a read model only.
 */
export function projectEpisodeEditTranscript(value: unknown): EpisodeEditTranscriptProjection {
  const candidate = transcriptRows(value);
  if (!candidate) {
    return {
      status: "unavailable",
      reason: "This Episode does not contain a timed transcript projection yet.",
      sourceFormat: null,
      segmentCount: 0,
      reviewedSegmentCount: 0,
      segments: [],
    };
  }

  const segments = candidate.rows.slice(0, 5_000).flatMap((item, index): EpisodeEditTranscriptSegment[] => {
    const row = record(item);
    const episodeStartSeconds = number(row.time);
    const startSeconds = episodeStartSeconds ?? number(row.startSeconds, row.start, row.sourceStartSeconds);
    const sourceStartSeconds = number(row.sourceStartSeconds);
    const sourceEndSeconds = number(row.sourceEndSeconds);
    const explicitEnd = episodeStartSeconds !== null
      ? number(row.endSeconds, row.end)
      : number(row.endSeconds, row.end, row.sourceEndSeconds);
    const duration = number(row.durationSeconds, row.duration);
    const endSeconds = explicitEnd ?? (
      startSeconds !== null && duration !== null
        ? startSeconds + duration
        : null
    );
    const body = text(row.text, row.body, row.content);
    if (
      startSeconds === null
      || endSeconds === null
      || startSeconds < 0
      || endSeconds <= startSeconds
      || !body
    ) return [];
    const explicitReview = text(row.reviewStatus, row.reviewState);
    const reviewStatus = explicitReview === "human-reviewed" || explicitReview === "confirmed" || explicitReview === "corrected"
      ? "human-reviewed"
      : explicitReview === "provider" || explicitReview === "unreviewed" || explicitReview === "unchecked"
        ? "provider"
        : "unknown";
    return [{
      id: text(row.id, row.segmentId) ?? `${candidate.sourceFormat}:${index}`,
      startSeconds,
      endSeconds,
      timelineClock: episodeStartSeconds !== null ? "episode" : "source",
      sourceStartSeconds,
      sourceEndSeconds,
      text: body,
      speakerLabel: text(row.speakerLabel, row.speaker, row.speakerName),
      reviewStatus,
      sourceTranscriptJobId: text(row.sourceTranscriptJobId, row.transcriptJobId),
      sourceSegmentId: text(row.sourceSegmentId, row.segmentId),
      acceptedReviewId: text(row.acceptedReviewId),
      deactivated: row.deactivated === true || row.deleted === true,
    }];
  }).sort((left, right) => left.startSeconds - right.startSeconds || left.id.localeCompare(right.id));

  if (!segments.length) {
    return {
      status: "unavailable",
      reason: `The retained ${candidate.sourceFormat} transcript has no valid timed segments. No timing was inferred.`,
      sourceFormat: candidate.sourceFormat,
      segmentCount: 0,
      reviewedSegmentCount: 0,
      segments: [],
    };
  }
  return {
    status: "available",
    reason: `${segments.length} retained timed transcript ${segments.length === 1 ? "segment is" : "segments are"} available for edit inspection.`,
    sourceFormat: candidate.sourceFormat,
    segmentCount: segments.length,
    reviewedSegmentCount: segments.filter((segment) => segment.reviewStatus === "human-reviewed").length,
    segments,
  };
}

function providerFrom(value: unknown): string | null {
  const root = record(value);
  const processingControl = record(root.processingControl);
  const source = record(root.source);
  const target = record(root.target);
  const receipt = record(root.receipt);
  const receiptControl = record(receipt.processingControl);
  return text(processingControl.provider, receiptControl.provider, source.provider, target.provider);
}

function laneForProvider(provider: string | null): EpisodeEditProcessingJob["lane"] {
  const normalized = provider?.toLowerCase() ?? "";
  if (/iphone|ios|device|capture/.test(normalized)) return "device";
  if (/gcs|cloud|run|google/.test(normalized)) return "cloud-worker";
  if (/local|mac|desktop/.test(normalized)) return "local-worker";
  return "unassigned";
}

export function projectEpisodeEditProcessingJob(row: {
  id: string;
  type: string;
  status: string;
  inputJson: unknown;
  resultJson: unknown;
  updatedAt: Date;
  completedAt: Date | null;
  error: string | null;
}): EpisodeEditProcessingJob {
  const provider = providerFrom(row.resultJson) ?? providerFrom(row.inputJson);
  return {
    id: row.id,
    type: row.type,
    status: row.status,
    lane: laneForProvider(provider),
    provider,
    updatedAt: row.updatedAt.toISOString(),
    completedAt: row.completedAt?.toISOString() ?? null,
    error: row.error,
  };
}

export function episodeEditExecutionInspection(jobs: EpisodeEditProcessingJob[]): EpisodeEditExecutionInspection {
  return {
    browser: {
      status: "ready",
      detail: "Shared cut decisions, transcript inspection, notes, and reviewed Episode-clock or source-clock evidence run in this browser workspace.",
    },
    native: {
      status: "available-unobserved",
      detail: "Advanced Studio can perform local heavy rendering. A live native-worker heartbeat is not connected to this workspace yet.",
    },
    jobs,
  };
}
