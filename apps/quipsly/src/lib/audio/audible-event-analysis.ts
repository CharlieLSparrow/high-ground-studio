export type AudibleEventDetectorSuggestion = {
  eventId: string;
  classificationIdentifier: string;
  displayLabel: string;
  family: "dialogue" | "content" | "environment" | "capture";
  startSeconds: number;
  endSeconds: number;
  confidence: number;
  contributingWindowCount: number;
  detail: string;
};

export type AudibleEventDetectorReceipt = {
  schemaVersion: 1;
  analysisId: string;
  supersedesAnalysisId: string | null;
  status: "completed" | "failed";
  algorithm: "apple-sound-classifier-file-v1";
  classifierIdentifier: "SNClassifierIdentifierVersion1";
  analyzedAt: string;
  sourceSHA256: string | null;
  sourceByteCount: number;
  durationSeconds: number;
  requestedWindowDurationSeconds: number;
  effectiveWindowDurationSeconds: number;
  overlapFactor: number;
  minimumCandidateConfidence: number;
  knownClassificationCount: number;
  knownClassificationsSHA256: string;
  resultWindowCount: number;
  suggestions: AudibleEventDetectorSuggestion[];
  failureCode: string | null;
  failureDetail: string | null;
  boundaries: {
    classifierOutputIsListeningTriageOnly: true;
    classifierScoreIsNotAudibility: true;
    noMediaChanged: true;
    noRepairOrEditAuthorized: true;
    humanReviewRequired: true;
  };
};

const SAFE_ID = /^[A-Za-z0-9._-]{8,180}$/;
const SHA256 = /^[0-9a-f]{64}$/;
const FAMILIES = new Set<AudibleEventDetectorSuggestion["family"]>(["dialogue", "content", "environment", "capture"]);

export function parseAudibleEventDetectorReceipt(value: unknown): AudibleEventDetectorReceipt | null {
  const row = object(value);
  const analysisId = text(row.analysisId);
  const supersedesAnalysisId = nullableText(row.supersedesAnalysisId);
  const status = row.status === "completed" || row.status === "failed" ? row.status : null;
  const analyzedAt = text(row.analyzedAt);
  const sourceSHA256 = nullableText(row.sourceSHA256)?.toLowerCase() ?? null;
  const sourceByteCount = nonNegativeInteger(row.sourceByteCount);
  const durationSeconds = positive(row.durationSeconds);
  const requestedWindowDurationSeconds = positive(row.requestedWindowDurationSeconds);
  const effectiveWindowDurationSeconds = positive(row.effectiveWindowDurationSeconds);
  const overlapFactor = probability(row.overlapFactor, false);
  const minimumCandidateConfidence = probability(row.minimumCandidateConfidence, true);
  const knownClassificationCount = nonNegativeInteger(row.knownClassificationCount);
  const knownClassificationsSHA256 = text(row.knownClassificationsSHA256)?.toLowerCase() ?? null;
  const resultWindowCount = nonNegativeInteger(row.resultWindowCount);
  const boundaries = object(row.boundaries);

  if (
    row.schemaVersion !== 1
    || !analysisId
    || !SAFE_ID.test(analysisId)
    || (supersedesAnalysisId !== null && !SAFE_ID.test(supersedesAnalysisId))
    || status === null
    || row.algorithm !== "apple-sound-classifier-file-v1"
    || row.classifierIdentifier !== "SNClassifierIdentifierVersion1"
    || !analyzedAt
    || !Number.isFinite(Date.parse(analyzedAt))
    || (sourceSHA256 !== null && !SHA256.test(sourceSHA256))
    || sourceByteCount === null
    || durationSeconds === null
    || requestedWindowDurationSeconds === null
    || effectiveWindowDurationSeconds === null
    || overlapFactor === null
    || overlapFactor >= 1
    || minimumCandidateConfidence === null
    || knownClassificationCount === null
    || !knownClassificationsSHA256
    || !SHA256.test(knownClassificationsSHA256)
    || resultWindowCount === null
    || boundaries.classifierOutputIsListeningTriageOnly !== true
    || boundaries.classifierScoreIsNotAudibility !== true
    || boundaries.noMediaChanged !== true
    || boundaries.noRepairOrEditAuthorized !== true
    || boundaries.humanReviewRequired !== true
  ) return null;

  if (!Array.isArray(row.suggestions)) return null;
  const rawSuggestions = row.suggestions;
  if (rawSuggestions.length > 500) return null;
  const suggestions = rawSuggestions
    .flatMap((entry): AudibleEventDetectorSuggestion[] => {
      const suggestion = object(entry);
      const eventId = text(suggestion.eventId);
      const classificationIdentifier = text(suggestion.classificationIdentifier);
      const displayLabel = text(suggestion.displayLabel);
      const family = text(suggestion.family) as AudibleEventDetectorSuggestion["family"] | null;
      const startSeconds = nonNegative(suggestion.startSeconds);
      const endSeconds = nonNegative(suggestion.endSeconds);
      const confidence = probability(suggestion.confidence, true);
      const contributingWindowCount = positiveInteger(suggestion.contributingWindowCount);
      const detail = text(suggestion.detail);
      if (
        !eventId
        || !SAFE_ID.test(eventId)
        || !classificationIdentifier
        || !displayLabel
        || !family
        || !FAMILIES.has(family)
        || startSeconds === null
        || endSeconds === null
        || endSeconds <= startSeconds
        || endSeconds > durationSeconds + 0.05
        || confidence === null
        || contributingWindowCount === null
        || !detail
      ) return [];
      return [{ eventId, classificationIdentifier, displayLabel, family, startSeconds, endSeconds, confidence, contributingWindowCount, detail }];
    });
  if (suggestions.length !== rawSuggestions.length) return null;
  if (new Set(suggestions.map((suggestion) => suggestion.eventId)).size !== suggestions.length) return null;

  const failureCode = nullableText(row.failureCode);
  const failureDetail = nullableText(row.failureDetail);
  if (
    (status === "completed" && (failureCode !== null || failureDetail !== null))
    || (status === "completed" && sourceSHA256 === null)
    || (status === "failed" && (!failureCode || !failureDetail || suggestions.length > 0))
  ) return null;

  return {
    schemaVersion: 1,
    analysisId,
    supersedesAnalysisId,
    status,
    algorithm: "apple-sound-classifier-file-v1",
    classifierIdentifier: "SNClassifierIdentifierVersion1",
    analyzedAt,
    sourceSHA256,
    sourceByteCount,
    durationSeconds,
    requestedWindowDurationSeconds,
    effectiveWindowDurationSeconds,
    overlapFactor,
    minimumCandidateConfidence,
    knownClassificationCount,
    knownClassificationsSHA256,
    resultWindowCount,
    suggestions,
    failureCode,
    failureDetail,
    boundaries: {
      classifierOutputIsListeningTriageOnly: true,
      classifierScoreIsNotAudibility: true,
      noMediaChanged: true,
      noRepairOrEditAuthorized: true,
      humanReviewRequired: true,
    },
  };
}

export function audibleEventDetectorReceiptMatchesSource(
  value: unknown,
  sourceSHA256: string,
  sourceByteCount: number,
) {
  const receipt = parseAudibleEventDetectorReceipt(value);
  const normalizedSHA256 = sourceSHA256.trim().toLowerCase();
  if (
    !receipt
    || !SHA256.test(normalizedSHA256)
    || !Number.isSafeInteger(sourceByteCount)
    || sourceByteCount <= 0
    || receipt.sourceByteCount !== sourceByteCount
  ) return false;
  return receipt.sourceSHA256 === null
    ? receipt.status === "failed"
    : receipt.sourceSHA256 === normalizedSHA256;
}

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function text(value: unknown) {
  const normalized = typeof value === "string" ? value.trim() : "";
  return normalized && normalized.length <= 500 ? normalized : null;
}

function nullableText(value: unknown) {
  return value === null || value === undefined ? null : text(value);
}

function finite(value: unknown) {
  const number = typeof value === "number" ? value : Number.NaN;
  return Number.isFinite(number) ? number : null;
}

function nonNegative(value: unknown) {
  const number = finite(value);
  return number !== null && number >= 0 ? number : null;
}

function positive(value: unknown) {
  const number = finite(value);
  return number !== null && number > 0 ? number : null;
}

function nonNegativeInteger(value: unknown) {
  const number = nonNegative(value);
  return number !== null && Number.isSafeInteger(number) ? number : null;
}

function positiveInteger(value: unknown) {
  const number = positive(value);
  return number !== null && Number.isSafeInteger(number) ? number : null;
}

function probability(value: unknown, includeOne: boolean) {
  const number = finite(value);
  return number !== null && number >= 0 && (includeOne ? number <= 1 : number < 1) ? number : null;
}
