export const AUDIO_MASTERY_REVIEW_EVIDENCE_SCHEMA = "quipsly-audio-mastery-playback-review-v1" as const;

export type AudioMasteryReviewSeriesPoint = {
  timeMs: number;
  shortTermLufs: number | null;
  truePeakDbtp: number | null;
};

export type AudioMasteryReviewMeasurement = {
  durationSeconds: number;
  integratedLufs: number;
  seriesResolutionMs: number;
  series: AudioMasteryReviewSeriesPoint[];
};

export type AudioMasteryReviewMoment = {
  id: "loudest-source" | "quietest-sustained" | "largest-shift";
  timeSeconds: number;
  label: string;
  detail: string;
};

export type AudioMasteryPlaybackReviewEvidence = {
  schema: typeof AUDIO_MASTERY_REVIEW_EVIDENCE_SCHEMA;
  sourceListenedSecondBins: number[];
  masteredListenedSecondBins: number[];
  monitorModes: Array<"matched" | "delivery">;
  completedAt: string;
};

export type AudioMasteryReviewCoverage = {
  requiredMoments: AudioMasteryReviewMoment[];
  sourceCompletedMomentIds: AudioMasteryReviewMoment["id"][];
  masteredCompletedMomentIds: AudioMasteryReviewMoment["id"][];
  sourceComplete: boolean;
  masteredComplete: boolean;
  matchedMonitorObserved: boolean;
  deliveryMonitorObserved: boolean;
  approvalReady: boolean;
};

function finite(value: number | null): value is number {
  return value !== null && Number.isFinite(value);
}

function alignedPoint(series: AudioMasteryReviewSeriesPoint[], timeMs: number, toleranceMs: number) {
  let best: AudioMasteryReviewSeriesPoint | null = null;
  let distance = Number.POSITIVE_INFINITY;
  for (const point of series) {
    const candidateDistance = Math.abs(point.timeMs - timeMs);
    if (candidateDistance <= toleranceMs && candidateDistance < distance) {
      best = point;
      distance = candidateDistance;
    }
  }
  return best;
}

export function audioMasteryReviewMoments(
  source: AudioMasteryReviewMeasurement,
  mastered: AudioMasteryReviewMeasurement,
): AudioMasteryReviewMoment[] {
  const moments: AudioMasteryReviewMoment[] = [];
  const loudest = source.series
    .filter((point) => finite(point.truePeakDbtp))
    .sort((left, right) => (right.truePeakDbtp as number) - (left.truePeakDbtp as number))[0];
  if (loudest) {
    moments.push({
      id: "loudest-source",
      timeSeconds: loudest.timeMs / 1_000,
      label: "Loudest source moment",
      detail: `${(loudest.truePeakDbtp as number).toFixed(1)} dBTP before mastering`,
    });
  }

  const quietest = source.series
    .filter((point) => finite(point.shortTermLufs) && (point.shortTermLufs as number) > -70)
    .sort((left, right) => (left.shortTermLufs as number) - (right.shortTermLufs as number))[0];
  if (quietest) {
    moments.push({
      id: "quietest-sustained",
      timeSeconds: quietest.timeMs / 1_000,
      label: "Quietest sustained passage",
      detail: `${(quietest.shortTermLufs as number).toFixed(1)} LUFS over 3 seconds`,
    });
  }

  const toleranceMs = Math.max(source.seriesResolutionMs, mastered.seriesResolutionMs);
  const shift = source.series.flatMap((sourcePoint) => {
    if (!finite(sourcePoint.shortTermLufs)) return [];
    const masteredPoint = alignedPoint(mastered.series, sourcePoint.timeMs, toleranceMs);
    if (!masteredPoint || !finite(masteredPoint.shortTermLufs)) return [];
    return [{
      sourcePoint,
      deltaLu: (masteredPoint.shortTermLufs as number) - (sourcePoint.shortTermLufs as number),
    }];
  }).sort((left, right) => Math.abs(right.deltaLu) - Math.abs(left.deltaLu))[0];
  if (shift) {
    moments.push({
      id: "largest-shift",
      timeSeconds: shift.sourcePoint.timeMs / 1_000,
      label: "Largest processing shift",
      detail: `${shift.deltaLu >= 0 ? "+" : ""}${shift.deltaLu.toFixed(1)} LU at the same decoded moment`,
    });
  }
  return moments;
}

function requiredBins(moment: AudioMasteryReviewMoment, durationSeconds: number) {
  const finalBin = Math.max(0, Math.ceil(durationSeconds) - 1);
  const center = Math.max(0, Math.min(finalBin, Math.floor(moment.timeSeconds)));
  return [...new Set([center - 1, center, center + 1].map((bin) => Math.max(0, Math.min(finalBin, bin))))];
}

function completedMoments(moments: AudioMasteryReviewMoment[], bins: number[], durationSeconds: number) {
  const heard = new Set(bins);
  return moments.filter((moment) => requiredBins(moment, durationSeconds).every((bin) => heard.has(bin))).map((moment) => moment.id);
}

export function audioMasteryReviewCoverage(
  source: AudioMasteryReviewMeasurement,
  mastered: AudioMasteryReviewMeasurement,
  evidence: Pick<AudioMasteryPlaybackReviewEvidence, "sourceListenedSecondBins" | "masteredListenedSecondBins" | "monitorModes">,
): AudioMasteryReviewCoverage {
  const requiredMoments = audioMasteryReviewMoments(source, mastered);
  const sourceCompletedMomentIds = completedMoments(requiredMoments, evidence.sourceListenedSecondBins, source.durationSeconds);
  const masteredCompletedMomentIds = completedMoments(requiredMoments, evidence.masteredListenedSecondBins, mastered.durationSeconds);
  const sourceComplete = requiredMoments.length > 0 && sourceCompletedMomentIds.length === requiredMoments.length;
  const masteredComplete = requiredMoments.length > 0 && masteredCompletedMomentIds.length === requiredMoments.length;
  const matchedMonitorObserved = evidence.monitorModes.includes("matched");
  const deliveryMonitorObserved = evidence.monitorModes.includes("delivery");
  return {
    requiredMoments,
    sourceCompletedMomentIds,
    masteredCompletedMomentIds,
    sourceComplete,
    masteredComplete,
    matchedMonitorObserved,
    deliveryMonitorObserved,
    approvalReady: sourceComplete && masteredComplete && matchedMonitorObserved && deliveryMonitorObserved,
  };
}

export function parseAudioMasteryPlaybackReviewEvidence(
  value: unknown,
  sourceDurationSeconds: number,
  masteredDurationSeconds: number,
): AudioMasteryPlaybackReviewEvidence {
  const row = record(value);
  if (row.schema !== AUDIO_MASTERY_REVIEW_EVIDENCE_SCHEMA) throw new Error("Audio mastery playback evidence has an unsupported schema.");
  const sourceListenedSecondBins = bins(row.sourceListenedSecondBins, sourceDurationSeconds, "sourceListenedSecondBins");
  const masteredListenedSecondBins = bins(row.masteredListenedSecondBins, masteredDurationSeconds, "masteredListenedSecondBins");
  const monitorModes = [...new Set(array(row.monitorModes).map(String).filter((mode): mode is "matched" | "delivery" => mode === "matched" || mode === "delivery"))];
  const completedAt = String(row.completedAt || "");
  const completedAtMs = Date.parse(completedAt);
  const now = Date.now();
  if (!Number.isFinite(completedAtMs) || completedAtMs > now + 5 * 60_000 || completedAtMs < now - 24 * 60 * 60_000) {
    throw new Error("Audio mastery playback evidence requires a recent completion time.");
  }
  return { schema: AUDIO_MASTERY_REVIEW_EVIDENCE_SCHEMA, sourceListenedSecondBins, masteredListenedSecondBins, monitorModes, completedAt: new Date(completedAtMs).toISOString() };
}

function bins(value: unknown, durationSeconds: number, field: string) {
  const maximumBin = Math.max(0, Math.ceil(durationSeconds) - 1);
  const values = [...new Set(array(value).map(Number))];
  if (values.length > 100_000 || values.some((bin) => !Number.isSafeInteger(bin) || bin < 0 || bin > maximumBin)) {
    throw new Error(`Audio mastery ${field} is invalid or unbounded.`);
  }
  return values.sort((left, right) => left - right);
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function array(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}
