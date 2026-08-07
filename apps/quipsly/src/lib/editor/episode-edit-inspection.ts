import type {
  EpisodeEditExecutionInspection,
  EpisodeEditExecutionWorker,
  EpisodeEditProcessingJob,
  EpisodeEditTranscriptProjection,
  EpisodeEditTranscriptSegment,
} from "@/lib/editor/program-edit-contract";
import { episodeRenderProfile } from "@high-ground/quipsly-media-processing";

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
  const input = record(row.inputJson);
  const proof = record(input.proof);
  const result = record(row.resultJson);
  const registration = record(result.registration);
  let renderProfile: EpisodeEditProcessingJob["renderProfile"] = null;
  if (row.type === "episode-render-proof") {
    try {
      renderProfile = episodeRenderProfile(input.renderProfile ?? "proof-10s").id;
    } catch {
      renderProfile = null;
    }
  }
  return {
    id: row.id,
    type: row.type,
    status: row.status,
    lane: laneForProvider(provider),
    provider,
    updatedAt: row.updatedAt.toISOString(),
    completedAt: row.completedAt?.toISOString() ?? null,
    error: row.error,
    manifestSha256: text(input.manifestSha256),
    renderProfile,
    branchRevision: number(input.branchRevision),
    proofStartSeconds: number(proof.sequenceStartSeconds),
    proofEndSeconds: number(proof.sequenceEndSeconds),
    playbackUrl: text(registration.playbackUrl),
  };
}

export function projectEpisodeEditExecutionWorker(row: {
  id: string;
  hostName: string;
  status: string;
  capabilities: unknown;
  lastHeartbeatAt: Date | null;
}, now = new Date()): EpisodeEditExecutionWorker | null {
  const capabilities = record(row.capabilities);
  if (capabilities.schema !== "quipsly-execution-worker-capabilities-v1") return null;
  const heartbeatAge = row.lastHeartbeatAt ? now.getTime() - row.lastHeartbeatAt.getTime() : Number.POSITIVE_INFINITY;
  const status = row.status === "online" && heartbeatAge <= 30_000
    ? "online"
    : heartbeatAge <= 5 * 60_000
      ? "stale"
      : "offline";
  return {
    id: row.id,
    label: row.hostName.replace(/^quipsly-media-worker:/, ""),
    executorKind: capabilities.executorKind === "local-mac" || capabilities.executorKind === "cloud"
      ? capabilities.executorKind
      : "unknown",
    status,
    buildId: text(capabilities.buildId),
    lastHeartbeatAt: row.lastHeartbeatAt?.toISOString() ?? null,
    jobTypes: Array.isArray(capabilities.jobTypes) ? capabilities.jobTypes.filter((value): value is string => typeof value === "string") : [],
    renderProfiles: Array.isArray(capabilities.renderProfiles) ? capabilities.renderProfiles.filter((value): value is string => typeof value === "string") : [],
  };
}

export function episodeEditExecutionInspection(jobs: EpisodeEditProcessingJob[], workers: EpisodeEditExecutionWorker[] = []): EpisodeEditExecutionInspection {
  const nativeOnline = workers.some((worker) => worker.executorKind === "local-mac" && worker.status === "online" && worker.jobTypes.includes("episode-render-proof"));
  return {
    browser: {
      status: "ready",
      detail: "Shared cut decisions, transcript inspection, notes, and reviewed Episode-clock or source-clock evidence run in this browser workspace.",
    },
    native: {
      status: nativeOnline ? "observed" : "available-unobserved",
      detail: nativeOnline
        ? "This Mac is online and can execute exact-source 1280×720, 24 fps Episode proof renders without cloud compute."
        : "Advanced Studio can perform local heavy rendering, but no current exact-source worker heartbeat is visible.",
    },
    workers,
    jobs,
  };
}
