import type { AudibleEventDetectorReceipt } from "./audible-event-analysis";

export type AudibleEventTruthVerdict = "positive" | "absent";
export type AudibleEventTruthWorkload = "podcast" | "coaching";
export type AudibleEventTruthSplit = "calibration" | "validation" | "retained-challenge";

export type PublicAudibleEventTruthReceipt = {
  id: string;
  sourceId: string;
  detectorAnalysisId: string;
  classificationIdentifier: string;
  displayLabel: string;
  family: string;
  verdict: AudibleEventTruthVerdict;
  workload: AudibleEventTruthWorkload;
  split: AudibleEventTruthSplit;
  reviewStartSeconds: number;
  reviewEndSeconds: number;
  eventStartSeconds: number | null;
  eventEndSeconds: number | null;
  supersedesReceiptId: string | null;
  note: string;
  occurredAt: string;
};

export type AudibleEventQualificationMetric = {
  classificationIdentifier: string;
  displayLabel: string;
  status: "insufficient-evidence" | "fails-acceptance" | "qualified-for-listening-triage";
  sourceCount: number;
  positiveEventCount: number;
  positiveSourceCount: number;
  calibrationReceiptCount: number;
  labeledHours: number;
  negativeHours: number;
  truePositiveCount: number;
  falsePositiveCount: number;
  falseNegativeCount: number;
  precision: number | null;
  recall: number | null;
  f1: number | null;
  falsePositivesPerLabeledHour: number | null;
  medianOnsetErrorSeconds: number | null;
  medianOffsetErrorSeconds: number | null;
  workloadCoverage: { podcast: number; coaching: number };
  shortfalls: string[];
};

export type AudibleEventCorpusStatus = {
  available: boolean;
  sourceReceipts: PublicAudibleEventTruthReceipt[];
  projectQualification: {
    detector: null | {
      algorithm: string;
      classifierIdentifier: string;
      configurationSha256: string;
    };
    activeReceiptCount: number;
    supersededReceiptCount: number;
    sourceCount: number;
    metrics: AudibleEventQualificationMetric[];
  };
  boundaries: {
    unlabeledTimeIsExcluded: true;
    groundTruthIsIndependentFromSuggestions: true;
    qualificationAllowsListeningTriageOnly: true;
    qualificationNeverAuthorizesTreatmentOrEditing: true;
    reviewerIdentityIsNotProjected: true;
  };
};

export type AudibleEventTruthEvaluationInput = PublicAudibleEventTruthReceipt & {
  sourceSha256: string;
  sourceDurationSeconds: number;
  detectorConfigurationSha256: string;
  analysis: AudibleEventDetectorReceipt;
};

const POLICY = Object.freeze({
  minimumPositiveEvents: 20,
  minimumPositiveSources: 5,
  minimumNegativeHours: 0.25,
  minimumPodcastSources: 1,
  minimumCoachingSources: 1,
  minimumPrecision: 0.85,
  minimumRecall: 0.8,
  maximumFalsePositivesPerLabeledHour: 1,
});

export function activeAudibleEventTruthReceipts<T extends { id: string; supersedesReceiptId: string | null }>(rows: T[]): T[] {
  const superseded = new Set(rows.map((row) => row.supersedesReceiptId).filter((id): id is string => Boolean(id)));
  return rows.filter((row) => !superseded.has(row.id));
}

export function evaluateAudibleEventTruth(input: {
  receipts: AudibleEventTruthEvaluationInput[];
  detectorConfigurationSha256: string;
}): AudibleEventQualificationMetric[] {
  const active = activeAudibleEventTruthReceipts(input.receipts)
    .filter((row) => row.detectorConfigurationSha256 === input.detectorConfigurationSha256);
  const identifiers = [...new Set(active.map((row) => canonicalClassificationIdentifier(row.classificationIdentifier)))].sort();
  return identifiers.map((identifier) => evaluateClassification(identifier, active));
}

export function audibleEventCorpusBoundaries(): AudibleEventCorpusStatus["boundaries"] {
  return {
    unlabeledTimeIsExcluded: true,
    groundTruthIsIndependentFromSuggestions: true,
    qualificationAllowsListeningTriageOnly: true,
    qualificationNeverAuthorizesTreatmentOrEditing: true,
    reviewerIdentityIsNotProjected: true,
  };
}

export function canonicalClassificationIdentifier(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function evaluateClassification(identifier: string, all: AudibleEventTruthEvaluationInput[]): AudibleEventQualificationMetric {
  const allClassReceipts = all.filter((row) => canonicalClassificationIdentifier(row.classificationIdentifier) === identifier);
  const calibrationReceiptCount = allClassReceipts.filter((row) => row.split === "calibration").length;
  const receipts = allClassReceipts.filter((row) => row.split !== "calibration");
  const positives = receipts.filter((row) => row.verdict === "positive");
  const sources = new Map<string, AudibleEventTruthEvaluationInput[]>();
  for (const receipt of receipts) {
    if (!sources.has(receipt.sourceId)) sources.set(receipt.sourceId, []);
    sources.get(receipt.sourceId)?.push(receipt);
  }
  const truePredictions = new Set<string>();
  const matchedTruth = new Set<string>();
  const falsePredictions = new Set<string>();
  const onsetErrors: number[] = [];
  const offsetErrors: number[] = [];
  let labeledSeconds = 0;
  let negativeSeconds = 0;

  for (const [sourceId, sourceRows] of sources) {
    const analysis = [...sourceRows].sort((left, right) => Date.parse(right.analysis.analyzedAt) - Date.parse(left.analysis.analyzedAt))[0]?.analysis;
    if (!analysis) continue;
    const labeledRanges = mergeRanges(sourceRows.map((row) => [row.reviewStartSeconds, row.reviewEndSeconds] as const));
    const negativeRanges = mergeRanges(sourceRows.filter((row) => row.verdict === "absent").map((row) => [row.reviewStartSeconds, row.reviewEndSeconds] as const));
    labeledSeconds += durationOf(labeledRanges);
    negativeSeconds += durationOf(negativeRanges);
    const sourceTruth = positives.filter((row) => row.sourceId === sourceId);
    const predictions = analysis.suggestions.filter((suggestion) => (
      canonicalClassificationIdentifier(suggestion.classificationIdentifier) === identifier
      && coverageByRanges(suggestion.startSeconds, suggestion.endSeconds, labeledRanges) >= 0.5
    ));
    const pairs = predictions.flatMap((prediction) => sourceTruth.flatMap((truth) => {
      if (truth.eventStartSeconds === null || truth.eventEndSeconds === null) return [];
      const overlap = intersection(prediction.startSeconds, prediction.endSeconds, truth.eventStartSeconds, truth.eventEndSeconds);
      const predictionCoverage = overlap / Math.max(0.001, prediction.endSeconds - prediction.startSeconds);
      const truthCoverage = overlap / Math.max(0.001, truth.eventEndSeconds - truth.eventStartSeconds);
      return predictionCoverage >= 0.5 && truthCoverage >= 0.5 ? [{ prediction, predictionKey: `${sourceId}:${analysis.analysisId}:${prediction.eventId}`, truth, overlap }] : [];
    })).sort((left, right) => right.overlap - left.overlap || left.prediction.eventId.localeCompare(right.prediction.eventId));
    for (const pair of pairs) {
      if (truePredictions.has(pair.predictionKey) || matchedTruth.has(pair.truth.id)) continue;
      truePredictions.add(pair.predictionKey);
      matchedTruth.add(pair.truth.id);
      onsetErrors.push(Math.abs(pair.prediction.startSeconds - (pair.truth.eventStartSeconds ?? pair.prediction.startSeconds)));
      offsetErrors.push(Math.abs(pair.prediction.endSeconds - (pair.truth.eventEndSeconds ?? pair.prediction.endSeconds)));
    }
    for (const prediction of predictions) {
      const predictionKey = `${sourceId}:${analysis.analysisId}:${prediction.eventId}`;
      if (!truePredictions.has(predictionKey)) falsePredictions.add(predictionKey);
    }
  }

  const tp = truePredictions.size;
  const fp = falsePredictions.size;
  const fn = positives.length - matchedTruth.size;
  const precision = tp + fp > 0 ? tp / (tp + fp) : null;
  const recall = tp + fn > 0 ? tp / (tp + fn) : null;
  const f1 = precision === null || recall === null || precision + recall === 0 ? null : 2 * precision * recall / (precision + recall);
  const labeledHours = labeledSeconds / 3_600;
  const negativeHours = negativeSeconds / 3_600;
  const falsePositivesPerLabeledHour = labeledHours > 0 ? fp / labeledHours : null;
  const positiveSourceCount = new Set(positives.map((row) => row.sourceId)).size;
  const workloadCoverage = {
    podcast: new Set(receipts.filter((row) => row.workload === "podcast").map((row) => row.sourceId)).size,
    coaching: new Set(receipts.filter((row) => row.workload === "coaching").map((row) => row.sourceId)).size,
  };
  const evidenceShortfalls = [
    ...(positives.length < POLICY.minimumPositiveEvents ? [`${POLICY.minimumPositiveEvents - positives.length} more positive events required`] : []),
    ...(positiveSourceCount < POLICY.minimumPositiveSources ? [`${POLICY.minimumPositiveSources - positiveSourceCount} more positive sources required`] : []),
    ...(negativeHours < POLICY.minimumNegativeHours ? [`${round(POLICY.minimumNegativeHours - negativeHours, 4)} more labeled-negative hours required`] : []),
    ...(workloadCoverage.podcast < POLICY.minimumPodcastSources ? ["podcast source evidence required"] : []),
    ...(workloadCoverage.coaching < POLICY.minimumCoachingSources ? ["coaching source evidence required"] : []),
  ];
  const metricShortfalls = [
    ...(precision === null || precision < POLICY.minimumPrecision ? [`precision ${format(precision)} below ${POLICY.minimumPrecision}`] : []),
    ...(recall === null || recall < POLICY.minimumRecall ? [`recall ${format(recall)} below ${POLICY.minimumRecall}`] : []),
    ...(falsePositivesPerLabeledHour === null || falsePositivesPerLabeledHour > POLICY.maximumFalsePositivesPerLabeledHour ? [`false positives/labeled hour ${format(falsePositivesPerLabeledHour)} above ${POLICY.maximumFalsePositivesPerLabeledHour}`] : []),
  ];
  const status = evidenceShortfalls.length > 0
    ? "insufficient-evidence" as const
    : metricShortfalls.length > 0
      ? "fails-acceptance" as const
      : "qualified-for-listening-triage" as const;
  return {
    classificationIdentifier: identifier,
    displayLabel: allClassReceipts[0]?.displayLabel || identifier,
    status,
    sourceCount: sources.size,
    positiveEventCount: positives.length,
    positiveSourceCount,
    calibrationReceiptCount,
    labeledHours: round(labeledHours, 6),
    negativeHours: round(negativeHours, 6),
    truePositiveCount: tp,
    falsePositiveCount: fp,
    falseNegativeCount: fn,
    precision: nullableRound(precision),
    recall: nullableRound(recall),
    f1: nullableRound(f1),
    falsePositivesPerLabeledHour: nullableRound(falsePositivesPerLabeledHour),
    medianOnsetErrorSeconds: nullableRound(median(onsetErrors)),
    medianOffsetErrorSeconds: nullableRound(median(offsetErrors)),
    workloadCoverage,
    shortfalls: [...evidenceShortfalls, ...metricShortfalls],
  };
}

function mergeRanges(ranges: ReadonlyArray<readonly [number, number]>) {
  const sorted = ranges.filter(([start, end]) => Number.isFinite(start) && Number.isFinite(end) && end > start).sort((left, right) => left[0] - right[0]);
  const merged: Array<[number, number]> = [];
  for (const [start, end] of sorted) {
    const previous = merged.at(-1);
    if (!previous || start > previous[1]) merged.push([start, end]);
    else previous[1] = Math.max(previous[1], end);
  }
  return merged;
}
function durationOf(ranges: Array<[number, number]>) { return ranges.reduce((sum, [start, end]) => sum + end - start, 0); }
function coverageByRanges(start: number, end: number, ranges: Array<[number, number]>) { return ranges.reduce((sum, range) => sum + intersection(start, end, range[0], range[1]), 0) / Math.max(0.001, end - start); }
function intersection(startA: number, endA: number, startB: number, endB: number) { return Math.max(0, Math.min(endA, endB) - Math.max(startA, startB)); }
function median(values: number[]) { if (values.length === 0) return null; const sorted = [...values].sort((left, right) => left - right); const middle = Math.floor(sorted.length / 2); return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2; }
function round(value: number, places = 6) { const scale = 10 ** places; return Math.round(value * scale) / scale; }
function nullableRound(value: number | null) { return value === null ? null : round(value); }
function format(value: number | null) { return value === null ? "not measured" : round(value, 3).toFixed(3); }
