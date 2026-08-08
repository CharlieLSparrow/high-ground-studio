export const EPISODE_PROGRAM_REVIEW_EVIDENCE_KIND =
  "quipsly-episode-program-review-playback-evidence-v1" as const;

export type EpisodeProgramReviewPlaybackEvidence = {
  kind: typeof EPISODE_PROGRAM_REVIEW_EVIDENCE_KIND;
  durationSeconds: number;
  watchedSecondBins: number[];
  playbackStartedAt: string;
  playbackEndedAt: string | null;
  playthroughEnded: boolean;
  maximumPlaybackRate: number;
  mutedAtDecision: boolean;
  volumeAtDecision: number;
  seekCount: number;
};

export type EpisodeProgramReviewCoverage = {
  watchedBinCount: number;
  requiredBinCount: number;
  watchedFraction: number;
  includesStart: boolean;
  includesMiddle: boolean;
  includesEnd: boolean;
  completedPlaythrough: boolean;
  audibleAtDecision: boolean;
  acceptablePlaybackRate: boolean;
  approvalReady: boolean;
};

const MAX_PROGRAM_SECONDS = 12 * 60 * 60;

export function parseEpisodeProgramReviewPlaybackEvidence(
  value: unknown,
  expectedDurationSeconds: number,
): EpisodeProgramReviewPlaybackEvidence {
  const row = record(value);
  const durationSeconds = finite(row.durationSeconds, "durationSeconds");
  if (
    row.kind !== EPISODE_PROGRAM_REVIEW_EVIDENCE_KIND
    || !Number.isFinite(expectedDurationSeconds)
    || expectedDurationSeconds <= 0
    || expectedDurationSeconds > MAX_PROGRAM_SECONDS
    || Math.abs(durationSeconds - expectedDurationSeconds) > 0.25
  ) invalid("Program review evidence does not match the rendered duration.");
  const requiredBinCount = Math.ceil(expectedDurationSeconds);
  const bins = array(row.watchedSecondBins).map((item) => integer(item, "watchedSecondBins"));
  if (
    bins.length > requiredBinCount
    || new Set(bins).size !== bins.length
    || bins.some((bin, index) => bin < 0 || bin >= requiredBinCount || (index > 0 && bin <= bins[index - 1]!))
  ) invalid("Program review second bins must be unique, ordered, and inside the rendered clock.");
  const playbackStartedAt = iso(row.playbackStartedAt, "playbackStartedAt");
  const playthroughEnded = boolean(row.playthroughEnded, "playthroughEnded");
  const playbackEndedAt = row.playbackEndedAt == null
    ? null
    : iso(row.playbackEndedAt, "playbackEndedAt");
  if (playthroughEnded && !playbackEndedAt) invalid("A completed playthrough requires its ended timestamp.");
  const maximumPlaybackRate = finite(row.maximumPlaybackRate, "maximumPlaybackRate");
  const volumeAtDecision = finite(row.volumeAtDecision, "volumeAtDecision");
  if (maximumPlaybackRate < 0.25 || maximumPlaybackRate > 4 || volumeAtDecision < 0 || volumeAtDecision > 1) {
    invalid("Program review playback settings are outside the supported range.");
  }
  return {
    kind: EPISODE_PROGRAM_REVIEW_EVIDENCE_KIND,
    durationSeconds,
    watchedSecondBins: bins,
    playbackStartedAt,
    playbackEndedAt,
    playthroughEnded,
    maximumPlaybackRate,
    mutedAtDecision: boolean(row.mutedAtDecision, "mutedAtDecision"),
    volumeAtDecision,
    seekCount: boundedInteger(row.seekCount, "seekCount", 0, 100_000),
  };
}

export function episodeProgramReviewCoverage(
  evidence: EpisodeProgramReviewPlaybackEvidence | unknown,
  expectedDurationSeconds: number,
): EpisodeProgramReviewCoverage {
  const parsed = parseEpisodeProgramReviewPlaybackEvidence(evidence, expectedDurationSeconds);
  const requiredBinCount = Math.ceil(expectedDurationSeconds);
  const watched = new Set(parsed.watchedSecondBins);
  const middleBin = Math.floor((requiredBinCount - 1) / 2);
  const includesStart = watched.has(0);
  const includesMiddle = watched.has(middleBin);
  const includesEnd = watched.has(requiredBinCount - 1);
  const watchedFraction = requiredBinCount > 0 ? watched.size / requiredBinCount : 0;
  const completedPlaythrough = parsed.playthroughEnded && Boolean(parsed.playbackEndedAt);
  const audibleAtDecision = !parsed.mutedAtDecision && parsed.volumeAtDecision > 0;
  const acceptablePlaybackRate = parsed.maximumPlaybackRate <= 2;
  return {
    watchedBinCount: watched.size,
    requiredBinCount,
    watchedFraction,
    includesStart,
    includesMiddle,
    includesEnd,
    completedPlaythrough,
    audibleAtDecision,
    acceptablePlaybackRate,
    approvalReady:
      watchedFraction >= 0.9
      && includesStart
      && includesMiddle
      && includesEnd
      && completedPlaythrough
      && audibleAtDecision
      && acceptablePlaybackRate,
  };
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}
function array(value: unknown): unknown[] { return Array.isArray(value) ? value : invalid("watchedSecondBins must be an array."); }
function finite(value: unknown, label: string) { const result = typeof value === "number" ? value : Number(value); if (!Number.isFinite(result)) invalid(`${label} must be finite.`); return result; }
function integer(value: unknown, label: string) { const result = finite(value, label); if (!Number.isInteger(result)) invalid(`${label} must contain integers.`); return result; }
function boundedInteger(value: unknown, label: string, minimum: number, maximum: number) { const result = integer(value, label); if (result < minimum || result > maximum) invalid(`${label} is outside the supported range.`); return result; }
function boolean(value: unknown, label: string) { if (typeof value !== "boolean") invalid(`${label} must be boolean.`); return value; }
function iso(value: unknown, label: string) { if (typeof value !== "string" || !value.trim() || !Number.isFinite(Date.parse(value))) invalid(`${label} must be an ISO timestamp.`); return new Date(value).toISOString(); }
function invalid(message: string): never { throw new Error(message); }
