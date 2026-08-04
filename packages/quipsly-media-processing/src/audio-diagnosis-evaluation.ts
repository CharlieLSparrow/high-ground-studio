export const AUDIO_DIAGNOSIS_CORPUS_KIND = "quipsly-audio-diagnosis-corpus-v1" as const;
export const AUDIO_DIAGNOSIS_RUN_KIND = "quipsly-audio-diagnosis-run-v1" as const;
export const AUDIO_DIAGNOSIS_REPORT_KIND = "quipsly-audio-diagnosis-evaluation-v1" as const;
export const AUDIO_DIAGNOSIS_EVALUATION_VERSION = 1 as const;

export const AUDIO_DIAGNOSIS_LABELS = [
  "sample-clipping",
  "possible-dropout",
  "near-digital-silence",
  "stereo-imbalance",
  "dc-offset",
  "invalid-samples",
  "mains-hum",
  "plosive",
  "sibilance",
  "room-tone-shift",
  "speaker-level-inconsistency",
] as const;

export type AudioDiagnosisLabel = typeof AUDIO_DIAGNOSIS_LABELS[number];
export type AudioDiagnosisTruthOrigin = "synthetic-injection" | "human-playback-review";

export type AudioDiagnosisCorpusEvent = {
  eventId: string;
  label: AudioDiagnosisLabel;
  startSeconds: number;
  endSeconds: number;
  origin: AudioDiagnosisTruthOrigin;
  note: string;
  reviewReceipt: null | {
    reviewerId: string;
    reviewedAt: string;
    playbackStartSeconds: number;
    playbackEndSeconds: number;
  };
};

export type AudioDiagnosisCorpusCase = {
  caseId: string;
  split: "calibration" | "validation" | "retained-challenge";
  source: {
    assetId: string;
    sha256: string;
    durationSeconds: number;
    provenance: "generated-by-corpus-recipe" | "licensed-source" | "participant-consented-recording";
    recipeId: string | null;
  };
  truth: AudioDiagnosisCorpusEvent[];
  negativeLabels: AudioDiagnosisLabel[];
};

export type AudioDiagnosisCorpus = {
  kind: typeof AUDIO_DIAGNOSIS_CORPUS_KIND;
  version: typeof AUDIO_DIAGNOSIS_EVALUATION_VERSION;
  corpusId: string;
  revision: number;
  createdAt: string;
  cases: AudioDiagnosisCorpusCase[];
  boundaries: {
    unlabeledDoesNotMeanNegative: true;
    syntheticTruthDoesNotReplaceHumanListening: true;
    retainedSourcesRequirePermission: true;
  };
};

export type AudioDiagnosisPrediction = {
  predictionId: string;
  caseId: string;
  sourceSha256: string;
  label: AudioDiagnosisLabel;
  startSeconds: number;
  endSeconds: number;
  score: number | null;
  detail: string;
  requiresListening: true;
  changesSource: false;
};

export type AudioDiagnosisRun = {
  kind: typeof AUDIO_DIAGNOSIS_RUN_KIND;
  version: typeof AUDIO_DIAGNOSIS_EVALUATION_VERSION;
  runId: string;
  corpusId: string;
  corpusRevision: number;
  createdAt: string;
  detector: {
    detectorId: string;
    version: string;
    configurationSha256: string;
  };
  predictions: AudioDiagnosisPrediction[];
  boundaries: {
    predictionsAreListeningCandidates: true;
    noTreatmentOrEditApplied: true;
  };
};

export type AudioDiagnosisAcceptancePolicy = {
  policyId: string;
  minimumPositiveEvents: number;
  minimumPositiveCases: number;
  minimumNegativeHours: number;
  minimumHumanReviewedEvents: number;
  minimumPrecision: number;
  minimumRecall: number;
  maximumFalsePositivesPerHour: number;
};

export const AUDIO_DIAGNOSIS_LISTENING_TRIAGE_POLICY: AudioDiagnosisAcceptancePolicy = Object.freeze({
  policyId: "quipsly-listening-triage-v1",
  minimumPositiveEvents: 20,
  minimumPositiveCases: 5,
  minimumNegativeHours: 0.25,
  minimumHumanReviewedEvents: 5,
  minimumPrecision: 0.85,
  minimumRecall: 0.8,
  maximumFalsePositivesPerHour: 1,
});

export type AudioDiagnosisLabelMetrics = {
  label: AudioDiagnosisLabel;
  status: "insufficient-evidence" | "fails-acceptance" | "qualified-for-listening-triage";
  evaluatedCaseCount: number;
  positiveCaseCount: number;
  positiveEventCount: number;
  humanReviewedEventCount: number;
  evaluatedHours: number;
  negativeHours: number;
  truePositiveCount: number;
  falsePositiveCount: number;
  falseNegativeCount: number;
  precision: number | null;
  recall: number | null;
  f1: number | null;
  falsePositivesPerHour: number | null;
  medianOnsetErrorSeconds: number | null;
  medianOffsetErrorSeconds: number | null;
  matchedPredictionIds: string[];
  unmatchedPredictionIds: string[];
  missedTruthEventIds: string[];
  shortfalls: string[];
};

export type AudioDiagnosisEvaluationReport = {
  kind: typeof AUDIO_DIAGNOSIS_REPORT_KIND;
  version: typeof AUDIO_DIAGNOSIS_EVALUATION_VERSION;
  reportId: string;
  evaluatedAt: string;
  corpus: { corpusId: string; revision: number; caseCount: number };
  detector: AudioDiagnosisRun["detector"];
  criterion: {
    name: "intersection-based-event-matching-v1";
    minimumDetectionCoverage: 0.5;
    minimumGroundTruthCoverage: 0.5;
    onePredictionPerTruth: true;
  };
  policy: AudioDiagnosisAcceptancePolicy;
  labels: AudioDiagnosisLabelMetrics[];
  unscoredPredictionIds: string[];
  boundaries: {
    qualificationAllowsListeningTriageOnly: true;
    qualificationNeverAuthorizesAutomaticTreatment: true;
    aggregateScoresDoNotReplacePerClassReview: true;
  };
};

const ID = /^[A-Za-z0-9_-]{8,160}$/;
const SHA256 = /^[0-9a-f]{64}$/;

export function evaluateAudioDiagnosisRun(input: {
  reportId: string;
  evaluatedAt: string;
  corpus: AudioDiagnosisCorpus | unknown;
  run: AudioDiagnosisRun | unknown;
  policy?: AudioDiagnosisAcceptancePolicy;
}): AudioDiagnosisEvaluationReport {
  const corpus = parseAudioDiagnosisCorpus(input.corpus);
  const run = parseAudioDiagnosisRun(input.run, corpus);
  const policy = parsePolicy(input.policy ?? AUDIO_DIAGNOSIS_LISTENING_TRIAGE_POLICY);
  const unscored = new Set<string>();
  const labels = AUDIO_DIAGNOSIS_LABELS.map((label) => scoreLabel(label, corpus, run, policy, unscored));
  return parseAudioDiagnosisEvaluationReport({
    kind: AUDIO_DIAGNOSIS_REPORT_KIND,
    version: AUDIO_DIAGNOSIS_EVALUATION_VERSION,
    reportId: requiredId(input.reportId, "reportId"),
    evaluatedAt: iso(input.evaluatedAt, "evaluatedAt"),
    corpus: { corpusId: corpus.corpusId, revision: corpus.revision, caseCount: corpus.cases.length },
    detector: run.detector,
    criterion: { name: "intersection-based-event-matching-v1", minimumDetectionCoverage: 0.5, minimumGroundTruthCoverage: 0.5, onePredictionPerTruth: true },
    policy,
    labels,
    unscoredPredictionIds: [...unscored].sort(),
    boundaries: {
      qualificationAllowsListeningTriageOnly: true,
      qualificationNeverAuthorizesAutomaticTreatment: true,
      aggregateScoresDoNotReplacePerClassReview: true,
    },
  });
}

export function parseAudioDiagnosisCorpus(value: unknown): AudioDiagnosisCorpus {
  const row = record(value);
  const boundaries = record(row.boundaries);
  const cases = array(row.cases).map((entry, index) => parseCase(entry, index));
  if (
    row.kind !== AUDIO_DIAGNOSIS_CORPUS_KIND
    || row.version !== AUDIO_DIAGNOSIS_EVALUATION_VERSION
    || cases.length < 1
    || cases.length > 10_000
    || new Set(cases.map((entry) => entry.caseId)).size !== cases.length
    || boundaries.unlabeledDoesNotMeanNegative !== true
    || boundaries.syntheticTruthDoesNotReplaceHumanListening !== true
    || boundaries.retainedSourcesRequirePermission !== true
  ) throw new Error("Audio diagnosis corpus contract is invalid.");
  return {
    kind: AUDIO_DIAGNOSIS_CORPUS_KIND,
    version: AUDIO_DIAGNOSIS_EVALUATION_VERSION,
    corpusId: requiredId(row.corpusId, "corpusId"),
    revision: positiveInteger(row.revision, "revision"),
    createdAt: iso(row.createdAt, "createdAt"),
    cases,
    boundaries: { unlabeledDoesNotMeanNegative: true, syntheticTruthDoesNotReplaceHumanListening: true, retainedSourcesRequirePermission: true },
  };
}

export function parseAudioDiagnosisRun(value: unknown, expectedCorpus?: AudioDiagnosisCorpus | unknown): AudioDiagnosisRun {
  const row = record(value);
  const detector = record(row.detector);
  const boundaries = record(row.boundaries);
  const predictions = array(row.predictions).map((entry, index) => parsePrediction(entry, index));
  const corpus = expectedCorpus ? parseAudioDiagnosisCorpus(expectedCorpus) : null;
  if (
    row.kind !== AUDIO_DIAGNOSIS_RUN_KIND
    || row.version !== AUDIO_DIAGNOSIS_EVALUATION_VERSION
    || predictions.length > 100_000
    || new Set(predictions.map((entry) => entry.predictionId)).size !== predictions.length
    || (corpus && (row.corpusId !== corpus.corpusId || row.corpusRevision !== corpus.revision))
    || boundaries.predictionsAreListeningCandidates !== true
    || boundaries.noTreatmentOrEditApplied !== true
  ) throw new Error("Audio diagnosis run contract is invalid.");
  if (corpus) {
    const cases = new Map(corpus.cases.map((entry) => [entry.caseId, entry]));
    for (const prediction of predictions) {
      const fixture = cases.get(prediction.caseId);
      if (!fixture || fixture.source.sha256 !== prediction.sourceSha256 || prediction.endSeconds > fixture.source.durationSeconds + 0.02) {
        throw new Error("Audio diagnosis prediction is not bound to its exact corpus source.");
      }
    }
  }
  return {
    kind: AUDIO_DIAGNOSIS_RUN_KIND,
    version: AUDIO_DIAGNOSIS_EVALUATION_VERSION,
    runId: requiredId(row.runId, "runId"),
    corpusId: requiredId(row.corpusId, "corpusId"),
    corpusRevision: positiveInteger(row.corpusRevision, "corpusRevision"),
    createdAt: iso(row.createdAt, "createdAt"),
    detector: {
      detectorId: requiredId(detector.detectorId, "detector.detectorId"),
      version: requiredText(detector.version, "detector.version"),
      configurationSha256: sha(detector.configurationSha256, "detector.configurationSha256"),
    },
    predictions,
    boundaries: { predictionsAreListeningCandidates: true, noTreatmentOrEditApplied: true },
  };
}

export function parseAudioDiagnosisEvaluationReport(value: unknown): AudioDiagnosisEvaluationReport {
  const row = record(value);
  const corpus = record(row.corpus);
  const detector = record(row.detector);
  const criterion = record(row.criterion);
  const boundaries = record(row.boundaries);
  const labels = array(row.labels).map(parseMetrics);
  if (
    row.kind !== AUDIO_DIAGNOSIS_REPORT_KIND
    || row.version !== AUDIO_DIAGNOSIS_EVALUATION_VERSION
    || labels.length !== AUDIO_DIAGNOSIS_LABELS.length
    || labels.some((entry, index) => entry.label !== AUDIO_DIAGNOSIS_LABELS[index])
    || criterion.name !== "intersection-based-event-matching-v1"
    || criterion.minimumDetectionCoverage !== 0.5
    || criterion.minimumGroundTruthCoverage !== 0.5
    || criterion.onePredictionPerTruth !== true
    || boundaries.qualificationAllowsListeningTriageOnly !== true
    || boundaries.qualificationNeverAuthorizesAutomaticTreatment !== true
    || boundaries.aggregateScoresDoNotReplacePerClassReview !== true
  ) throw new Error("Audio diagnosis evaluation report contract is invalid.");
  return {
    kind: AUDIO_DIAGNOSIS_REPORT_KIND,
    version: AUDIO_DIAGNOSIS_EVALUATION_VERSION,
    reportId: requiredId(row.reportId, "reportId"),
    evaluatedAt: iso(row.evaluatedAt, "evaluatedAt"),
    corpus: { corpusId: requiredId(corpus.corpusId, "corpus.corpusId"), revision: positiveInteger(corpus.revision, "corpus.revision"), caseCount: positiveInteger(corpus.caseCount, "corpus.caseCount") },
    detector: { detectorId: requiredId(detector.detectorId, "detector.detectorId"), version: requiredText(detector.version, "detector.version"), configurationSha256: sha(detector.configurationSha256, "detector.configurationSha256") },
    criterion: { name: "intersection-based-event-matching-v1", minimumDetectionCoverage: 0.5, minimumGroundTruthCoverage: 0.5, onePredictionPerTruth: true },
    policy: parsePolicy(row.policy),
    labels,
    unscoredPredictionIds: array(row.unscoredPredictionIds).map((entry, index) => requiredId(entry, `unscoredPredictionIds[${index}]`)),
    boundaries: { qualificationAllowsListeningTriageOnly: true, qualificationNeverAuthorizesAutomaticTreatment: true, aggregateScoresDoNotReplacePerClassReview: true },
  };
}

function scoreLabel(label: AudioDiagnosisLabel, corpus: AudioDiagnosisCorpus, run: AudioDiagnosisRun, policy: AudioDiagnosisAcceptancePolicy, unscored: Set<string>): AudioDiagnosisLabelMetrics {
  const evaluatedCases = corpus.cases.filter((entry) => entry.negativeLabels.includes(label) || entry.truth.some((event) => event.label === label));
  const evaluatedIds = new Set(evaluatedCases.map((entry) => entry.caseId));
  const truth = evaluatedCases.flatMap((entry) => entry.truth.filter((event) => event.label === label).map((event) => ({ fixture: entry, event })));
  const predictions = run.predictions.filter((entry) => entry.label === label && evaluatedIds.has(entry.caseId));
  for (const prediction of run.predictions.filter((entry) => entry.label === label && !evaluatedIds.has(entry.caseId))) unscored.add(prediction.predictionId);
  const possiblePairs = predictions.flatMap((prediction) => truth
    .filter((entry) => entry.fixture.caseId === prediction.caseId)
    .map((entry) => ({ prediction, truth: entry.event, intersection: intersectionSeconds(prediction, entry.event) }))
    .filter((entry) => {
      const predictionDuration = Math.max(0.001, entry.prediction.endSeconds - entry.prediction.startSeconds);
      const truthDuration = Math.max(0.001, entry.truth.endSeconds - entry.truth.startSeconds);
      return entry.intersection / predictionDuration >= 0.5 && entry.intersection / truthDuration >= 0.5;
    })
    .sort((left, right) => right.intersection - left.intersection || left.prediction.predictionId.localeCompare(right.prediction.predictionId)));
  const matchedPredictions = new Set<string>();
  const matchedTruth = new Set<string>();
  const onsetErrors: number[] = [];
  const offsetErrors: number[] = [];
  for (const pair of possiblePairs) {
    if (matchedPredictions.has(pair.prediction.predictionId) || matchedTruth.has(pair.truth.eventId)) continue;
    matchedPredictions.add(pair.prediction.predictionId);
    matchedTruth.add(pair.truth.eventId);
    onsetErrors.push(Math.abs(pair.prediction.startSeconds - pair.truth.startSeconds));
    offsetErrors.push(Math.abs(pair.prediction.endSeconds - pair.truth.endSeconds));
  }
  const tp = matchedPredictions.size;
  const fp = predictions.length - tp;
  const fn = truth.length - tp;
  const precision = tp + fp ? tp / (tp + fp) : null;
  const recall = tp + fn ? tp / (tp + fn) : null;
  const f1 = precision === null || recall === null || precision + recall === 0 ? null : 2 * precision * recall / (precision + recall);
  const evaluatedHours = evaluatedCases.reduce((sum, entry) => sum + entry.source.durationSeconds, 0) / 3_600;
  const negativeHours = evaluatedCases.filter((entry) => entry.negativeLabels.includes(label)).reduce((sum, entry) => sum + entry.source.durationSeconds, 0) / 3_600;
  const positiveCaseCount = new Set(truth.map((entry) => entry.fixture.caseId)).size;
  const humanReviewedEventCount = truth.filter((entry) => entry.event.origin === "human-playback-review").length;
  const falsePositivesPerHour = evaluatedHours > 0 ? fp / evaluatedHours : null;
  const evidenceShortfalls = [
    ...(truth.length < policy.minimumPositiveEvents ? [`${policy.minimumPositiveEvents - truth.length} more positive events required`] : []),
    ...(positiveCaseCount < policy.minimumPositiveCases ? [`${policy.minimumPositiveCases - positiveCaseCount} more positive cases required`] : []),
    ...(negativeHours < policy.minimumNegativeHours ? [`${round(policy.minimumNegativeHours - negativeHours, 4)} more labeled-negative hours required`] : []),
    ...(humanReviewedEventCount < policy.minimumHumanReviewedEvents ? [`${policy.minimumHumanReviewedEvents - humanReviewedEventCount} more playback-reviewed events required`] : []),
  ];
  const metricShortfalls = [
    ...(precision === null || precision < policy.minimumPrecision ? [`precision ${formatMetric(precision)} below ${policy.minimumPrecision}`] : []),
    ...(recall === null || recall < policy.minimumRecall ? [`recall ${formatMetric(recall)} below ${policy.minimumRecall}`] : []),
    ...(falsePositivesPerHour === null || falsePositivesPerHour > policy.maximumFalsePositivesPerHour ? [`false positives/hour ${formatMetric(falsePositivesPerHour)} above ${policy.maximumFalsePositivesPerHour}`] : []),
  ];
  const status = evidenceShortfalls.length
    ? "insufficient-evidence" as const
    : metricShortfalls.length
      ? "fails-acceptance" as const
      : "qualified-for-listening-triage" as const;
  return {
    label,
    status,
    evaluatedCaseCount: evaluatedCases.length,
    positiveCaseCount,
    positiveEventCount: truth.length,
    humanReviewedEventCount,
    evaluatedHours: round(evaluatedHours, 6),
    negativeHours: round(negativeHours, 6),
    truePositiveCount: tp,
    falsePositiveCount: fp,
    falseNegativeCount: fn,
    precision: nullableRound(precision),
    recall: nullableRound(recall),
    f1: nullableRound(f1),
    falsePositivesPerHour: nullableRound(falsePositivesPerHour),
    medianOnsetErrorSeconds: nullableRound(median(onsetErrors)),
    medianOffsetErrorSeconds: nullableRound(median(offsetErrors)),
    matchedPredictionIds: [...matchedPredictions].sort(),
    unmatchedPredictionIds: predictions.filter((entry) => !matchedPredictions.has(entry.predictionId)).map((entry) => entry.predictionId).sort(),
    missedTruthEventIds: truth.filter((entry) => !matchedTruth.has(entry.event.eventId)).map((entry) => entry.event.eventId).sort(),
    shortfalls: [...evidenceShortfalls, ...metricShortfalls],
  };
}

function parseCase(value: unknown, index: number): AudioDiagnosisCorpusCase {
  const row = record(value);
  const source = record(row.source);
  const durationSeconds = positive(source.durationSeconds, `cases[${index}].source.durationSeconds`);
  const truth = array(row.truth).map((entry, eventIndex) => parseEvent(entry, index, eventIndex, durationSeconds));
  const negativeLabels = array(row.negativeLabels).map((entry, labelIndex) => label(entry, `cases[${index}].negativeLabels[${labelIndex}]`));
  if (new Set(truth.map((entry) => entry.eventId)).size !== truth.length || new Set(negativeLabels).size !== negativeLabels.length || truth.some((entry) => negativeLabels.includes(entry.label))) {
    throw new Error("Audio diagnosis corpus truth and negative labels conflict.");
  }
  const provenance = ["generated-by-corpus-recipe", "licensed-source", "participant-consented-recording"].includes(String(source.provenance)) ? source.provenance as AudioDiagnosisCorpusCase["source"]["provenance"] : invalid("source.provenance");
  const recipeId = source.recipeId == null ? null : requiredId(source.recipeId, `cases[${index}].source.recipeId`);
  if ((provenance === "generated-by-corpus-recipe") !== Boolean(recipeId)) throw new Error("Generated corpus sources require an exact recipe ID and retained sources cannot claim one.");
  return {
    caseId: requiredId(row.caseId, `cases[${index}].caseId`),
    split: row.split === "calibration" || row.split === "validation" || row.split === "retained-challenge" ? row.split : invalid("case.split"),
    source: { assetId: requiredId(source.assetId, `cases[${index}].source.assetId`), sha256: sha(source.sha256, `cases[${index}].source.sha256`), durationSeconds, provenance, recipeId },
    truth,
    negativeLabels,
  };
}

function parseEvent(value: unknown, caseIndex: number, eventIndex: number, durationSeconds: number): AudioDiagnosisCorpusEvent {
  const row = record(value);
  const review = row.reviewReceipt == null ? null : record(row.reviewReceipt);
  const startSeconds = nonNegative(row.startSeconds, `cases[${caseIndex}].truth[${eventIndex}].startSeconds`);
  const endSeconds = positive(row.endSeconds, `cases[${caseIndex}].truth[${eventIndex}].endSeconds`);
  const origin = row.origin === "synthetic-injection" || row.origin === "human-playback-review" ? row.origin : invalid("truth.origin");
  if (endSeconds <= startSeconds || endSeconds > durationSeconds + 0.02 || (origin === "human-playback-review") !== Boolean(review)) throw new Error("Audio diagnosis truth event boundary or review evidence is invalid.");
  return {
    eventId: requiredId(row.eventId, "truth.eventId"),
    label: label(row.label, "truth.label"),
    startSeconds,
    endSeconds,
    origin,
    note: requiredText(row.note, "truth.note"),
    reviewReceipt: review ? {
      reviewerId: requiredId(review.reviewerId, "review.reviewerId"),
      reviewedAt: iso(review.reviewedAt, "review.reviewedAt"),
      playbackStartSeconds: nonNegative(review.playbackStartSeconds, "review.playbackStartSeconds"),
      playbackEndSeconds: positive(review.playbackEndSeconds, "review.playbackEndSeconds"),
    } : null,
  };
}

function parsePrediction(value: unknown, index: number): AudioDiagnosisPrediction {
  const row = record(value);
  const startSeconds = nonNegative(row.startSeconds, `predictions[${index}].startSeconds`);
  const endSeconds = positive(row.endSeconds, `predictions[${index}].endSeconds`);
  const score = row.score == null ? null : fraction(row.score, `predictions[${index}].score`);
  if (endSeconds <= startSeconds || row.requiresListening !== true || row.changesSource !== false) throw new Error("Audio diagnosis prediction boundary is invalid.");
  return { predictionId: requiredId(row.predictionId, `predictions[${index}].predictionId`), caseId: requiredId(row.caseId, `predictions[${index}].caseId`), sourceSha256: sha(row.sourceSha256, `predictions[${index}].sourceSha256`), label: label(row.label, `predictions[${index}].label`), startSeconds, endSeconds, score, detail: requiredText(row.detail, `predictions[${index}].detail`), requiresListening: true, changesSource: false };
}

function parseMetrics(value: unknown): AudioDiagnosisLabelMetrics {
  const row = record(value);
  const status = row.status === "insufficient-evidence" || row.status === "fails-acceptance" || row.status === "qualified-for-listening-triage" ? row.status : invalid("metrics.status");
  return {
    label: label(row.label, "metrics.label"), status,
    evaluatedCaseCount: nonNegativeInteger(row.evaluatedCaseCount, "metrics.evaluatedCaseCount"), positiveCaseCount: nonNegativeInteger(row.positiveCaseCount, "metrics.positiveCaseCount"), positiveEventCount: nonNegativeInteger(row.positiveEventCount, "metrics.positiveEventCount"), humanReviewedEventCount: nonNegativeInteger(row.humanReviewedEventCount, "metrics.humanReviewedEventCount"),
    evaluatedHours: nonNegative(row.evaluatedHours, "metrics.evaluatedHours"), negativeHours: nonNegative(row.negativeHours, "metrics.negativeHours"), truePositiveCount: nonNegativeInteger(row.truePositiveCount, "metrics.truePositiveCount"), falsePositiveCount: nonNegativeInteger(row.falsePositiveCount, "metrics.falsePositiveCount"), falseNegativeCount: nonNegativeInteger(row.falseNegativeCount, "metrics.falseNegativeCount"),
    precision: nullableFraction(row.precision, "metrics.precision"), recall: nullableFraction(row.recall, "metrics.recall"), f1: nullableFraction(row.f1, "metrics.f1"), falsePositivesPerHour: nullableNonNegative(row.falsePositivesPerHour, "metrics.falsePositivesPerHour"), medianOnsetErrorSeconds: nullableNonNegative(row.medianOnsetErrorSeconds, "metrics.medianOnsetErrorSeconds"), medianOffsetErrorSeconds: nullableNonNegative(row.medianOffsetErrorSeconds, "metrics.medianOffsetErrorSeconds"),
    matchedPredictionIds: idArray(row.matchedPredictionIds, "metrics.matchedPredictionIds"), unmatchedPredictionIds: idArray(row.unmatchedPredictionIds, "metrics.unmatchedPredictionIds"), missedTruthEventIds: idArray(row.missedTruthEventIds, "metrics.missedTruthEventIds"), shortfalls: array(row.shortfalls).map((entry, index) => requiredText(entry, `metrics.shortfalls[${index}]`)),
  };
}

function parsePolicy(value: unknown): AudioDiagnosisAcceptancePolicy {
  const row = record(value);
  return { policyId: requiredId(row.policyId, "policyId"), minimumPositiveEvents: positiveInteger(row.minimumPositiveEvents, "minimumPositiveEvents"), minimumPositiveCases: positiveInteger(row.minimumPositiveCases, "minimumPositiveCases"), minimumNegativeHours: positive(row.minimumNegativeHours, "minimumNegativeHours"), minimumHumanReviewedEvents: positiveInteger(row.minimumHumanReviewedEvents, "minimumHumanReviewedEvents"), minimumPrecision: fraction(row.minimumPrecision, "minimumPrecision"), minimumRecall: fraction(row.minimumRecall, "minimumRecall"), maximumFalsePositivesPerHour: nonNegative(row.maximumFalsePositivesPerHour, "maximumFalsePositivesPerHour") };
}

function intersectionSeconds(left: { startSeconds: number; endSeconds: number }, right: { startSeconds: number; endSeconds: number }) { return Math.max(0, Math.min(left.endSeconds, right.endSeconds) - Math.max(left.startSeconds, right.startSeconds)); }
function median(values: number[]) { if (!values.length) return null; const sorted = [...values].sort((a, b) => a - b); const middle = Math.floor(sorted.length / 2); return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2; }
function round(value: number, places = 6) { const scale = 10 ** places; return Math.round(value * scale) / scale; }
function nullableRound(value: number | null) { return value === null ? null : round(value); }
function formatMetric(value: number | null) { return value === null ? "unavailable" : round(value, 3).toString(); }
function record(value: unknown): Record<string, unknown> { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
function array(value: unknown): unknown[] { return Array.isArray(value) ? value : []; }
function requiredText(value: unknown, field: string) { const result = typeof value === "string" ? value.trim() : ""; return result ? result : invalid(field); }
function requiredId(value: unknown, field: string) { const result = requiredText(value, field); return ID.test(result) ? result : invalid(field); }
function sha(value: unknown, field: string) { const result = requiredText(value, field); return SHA256.test(result) ? result : invalid(field); }
function iso(value: unknown, field: string) { const result = requiredText(value, field); return Number.isFinite(Date.parse(result)) ? result : invalid(field); }
function numeric(value: unknown, field: string) { const result = Number(value); return Number.isFinite(result) ? result : invalid(field); }
function positive(value: unknown, field: string) { const result = numeric(value, field); return result > 0 ? result : invalid(field); }
function nonNegative(value: unknown, field: string) { const result = numeric(value, field); return result >= 0 ? result : invalid(field); }
function positiveInteger(value: unknown, field: string) { const result = positive(value, field); return Number.isSafeInteger(result) ? result : invalid(field); }
function nonNegativeInteger(value: unknown, field: string) { const result = nonNegative(value, field); return Number.isSafeInteger(result) ? result : invalid(field); }
function fraction(value: unknown, field: string) { const result = nonNegative(value, field); return result <= 1 ? result : invalid(field); }
function nullableFraction(value: unknown, field: string) { return value == null ? null : fraction(value, field); }
function nullableNonNegative(value: unknown, field: string) { return value == null ? null : nonNegative(value, field); }
function label(value: unknown, field: string): AudioDiagnosisLabel { return AUDIO_DIAGNOSIS_LABELS.includes(value as AudioDiagnosisLabel) ? value as AudioDiagnosisLabel : invalid(field); }
function idArray(value: unknown, field: string) { const ids = array(value).map((entry, index) => requiredId(entry, `${field}[${index}]`)); if (new Set(ids).size !== ids.length) invalid(field); return ids; }
function invalid(field: string): never { throw new Error(`Invalid audio diagnosis evaluation ${field}.`); }
