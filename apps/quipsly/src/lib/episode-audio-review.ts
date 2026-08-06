import type { EpisodeAudioActivityMoment } from "./episode-audio-activity-map";
import type { EpisodeAudioComparisonPlan } from "./episode-audio-comparison";

export type EpisodeAudioReviewDecision =
  | "confirmed-overlap"
  | "intentional-overlap"
  | "same-participant-redundancy"
  | "mic-bleed"
  | "confirmed-dialogue-gap"
  | "false-positive"
  | "needs-comparison";

export type EpisodeAudioReviewPlaybackEvidence = {
  schema: "quipsly-episode-audio-review-playback-v1";
  analysisId: string;
  eventId: string;
  programStartSeconds: number;
  programEndSeconds: number;
  sources: Array<{ assetId: string; sourceId: string; sourceStartSeconds: number; sourceEndSeconds: number }>;
  coverage: {
    binDurationSeconds: 0.25;
    totalBinCount: number;
    allMonitorBins: number[];
    soloMonitorBins: Array<{ assetId: string; bins: number[] }>;
  };
  completedAt: string;
  boundaries: { clientObservedPlaybackOnly: true; playbackIsNotClassification: true; sourceBytesUnchanged: true; timelineAndMixUnchanged: true };
};

const LABELS: Record<EpisodeAudioReviewDecision, string> = {
  "confirmed-overlap": "Confirmed overlap",
  "intentional-overlap": "Intentional overlap",
  "same-participant-redundancy": "Expected multi-device redundancy",
  "mic-bleed": "Mic bleed",
  "confirmed-dialogue-gap": "Confirmed dialogue gap",
  "false-positive": "False positive",
  "needs-comparison": "Needs more comparison",
};

export function episodeAudioReviewDecisionOptions(kind: EpisodeAudioActivityMoment["kind"]) {
  const decisions: EpisodeAudioReviewDecision[] = kind === "possible-participant-overlap"
    ? ["confirmed-overlap", "intentional-overlap", "mic-bleed", "false-positive", "needs-comparison"]
    : kind === "same-participant-multidevice"
      ? ["same-participant-redundancy", "mic-bleed", "false-positive", "needs-comparison"]
      : kind === "dialogue-gap"
        ? ["confirmed-dialogue-gap", "false-positive", "needs-comparison"]
        : ["mic-bleed", "false-positive", "needs-comparison"];
  return decisions.map((value) => ({ value, label: LABELS[value] }));
}

function boundedBins(values: Iterable<number>, total: number) {
  return [...new Set([...values].filter((value) => Number.isInteger(value) && value >= 0 && value < total))].sort((left, right) => left - right);
}

export function buildEpisodeAudioReviewPlaybackEvidence(input: {
  analysisId: string;
  plan: EpisodeAudioComparisonPlan;
  allMonitorBins: Iterable<number>;
  soloMonitorBinsByAsset: Map<string, Set<number>>;
  completedAt?: string;
}): EpisodeAudioReviewPlaybackEvidence {
  const totalBinCount = Math.max(1, Math.ceil(input.plan.durationSeconds / 0.25));
  return {
    schema: "quipsly-episode-audio-review-playback-v1",
    analysisId: input.analysisId,
    eventId: input.plan.momentId,
    programStartSeconds: input.plan.programStartSeconds,
    programEndSeconds: input.plan.programEndSeconds,
    sources: input.plan.sources.map((source) => ({ assetId: source.assetId, sourceId: source.sourceId, sourceStartSeconds: source.sourceStartSeconds, sourceEndSeconds: source.sourceEndSeconds })),
    coverage: {
      binDurationSeconds: 0.25,
      totalBinCount,
      allMonitorBins: boundedBins(input.allMonitorBins, totalBinCount),
      soloMonitorBins: input.plan.sources.map((source) => ({ assetId: source.assetId, bins: boundedBins(input.soloMonitorBinsByAsset.get(source.assetId) ?? [], totalBinCount) })),
    },
    completedAt: input.completedAt ?? new Date().toISOString(),
    boundaries: { clientObservedPlaybackOnly: true, playbackIsNotClassification: true, sourceBytesUnchanged: true, timelineAndMixUnchanged: true },
  };
}

export function episodeAudioReviewPlaybackCoverage(evidence: EpisodeAudioReviewPlaybackEvidence) {
  const total = Math.max(1, evidence.coverage.totalBinCount);
  const allRatio = boundedBins(evidence.coverage.allMonitorBins, total).length / total;
  const soloRatios = evidence.sources.map((source) => ({
    assetId: source.assetId,
    ratio: boundedBins(evidence.coverage.soloMonitorBins.find((entry) => entry.assetId === source.assetId)?.bins ?? [], total).length / total,
  }));
  return { allRatio, soloRatios, anyPlayback: allRatio > 0 || soloRatios.some((entry) => entry.ratio > 0) };
}

export function episodeAudioReviewPlaybackReady(evidence: EpisodeAudioReviewPlaybackEvidence, decision: EpisodeAudioReviewDecision) {
  const coverage = episodeAudioReviewPlaybackCoverage(evidence);
  if (decision === "needs-comparison") return coverage.anyPlayback;
  return coverage.allRatio >= 0.75 && coverage.soloRatios.every((entry) => entry.ratio >= (evidence.sources.length === 1 ? 0.75 : 0.6));
}

export function episodeAudioReviewDecisionRequiresNote(decision: EpisodeAudioReviewDecision) {
  return ["intentional-overlap", "mic-bleed", "false-positive", "needs-comparison"].includes(decision);
}
