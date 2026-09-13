import type { AudioMasterySourceBinding } from "./audio-mastery.js";
import type { AudioAlignmentWindowFit } from "./audio-alignment-window-fit.js";
import {
  AUDIO_ALIGNMENT_WINDOW_FIT_POLICY,
  fitAudioAlignmentWindows,
} from "./audio-alignment-window-fit.js";

export const AUDIO_ALIGNMENT_EVIDENCE_KIND = "quipsly-audio-alignment-evidence-v1" as const;
export const AUDIO_ALIGNMENT_ALGORITHM = "normalized-fft-cross-correlation-v1" as const;

export type AudioAlignmentMoment = {
  targetStartSeconds: number;
  expectedSpineStartSeconds: number;
  measuredSpineStartSeconds: number;
  measuredOffsetSeconds: number;
  normalizedCorrelation: number;
  secondBestCorrelation: number;
  peakMargin: number;
};

export type AudioAlignmentEvidence = {
  kind: typeof AUDIO_ALIGNMENT_EVIDENCE_KIND;
  createdAt: string;
  spine: AudioMasterySourceBinding;
  target: AudioMasterySourceBinding;
  analyzer: {
    algorithm: typeof AUDIO_ALIGNMENT_ALGORITHM;
    sampleRate: number;
    windowSeconds: number;
    searchRadiusSeconds: number;
    ffmpegVersion: string;
    windowFit?: AudioAlignmentWindowFit;
  };
  opening: AudioAlignmentMoment;
  later: AudioAlignmentMoment;
  drift: {
    observationIntervalSeconds: number;
    residualDriftMilliseconds: number;
    observedPartsPerMillion: number;
  };
  qualification: {
    minimumCorrelation: number;
    minimumPeakMargin: number;
    qualifiedForAuthorizedAgentReview: boolean;
    reason: string;
  };
  boundaries: {
    sampleAccurateClaimed: false;
    sourceBytesMutated: false;
    timelinePlacementApplied: false;
    personOrDelegatedApprovalStillRequired: true;
  };
};

const SHA256 = /^[0-9a-f]{64}$/;

export function parseAudioAlignmentEvidence(value: unknown): AudioAlignmentEvidence {
  const row = record(value);
  const analyzer = record(row.analyzer);
  const drift = record(row.drift);
  const qualification = record(row.qualification);
  const boundaries = record(row.boundaries);
  const opening = parseMoment(row.opening, "opening");
  const later = parseMoment(row.later, "later");
  const spine = parseSource(row.spine, "spine");
  const target = parseSource(row.target, "target");
  const createdAt = requiredText(row.createdAt, "createdAt");
  const observationIntervalSeconds = positiveNumber(drift.observationIntervalSeconds, "drift.observationIntervalSeconds");
  const residualDriftMilliseconds = finiteNumber(drift.residualDriftMilliseconds, "drift.residualDriftMilliseconds");
  const observedPartsPerMillion = finiteNumber(drift.observedPartsPerMillion, "drift.observedPartsPerMillion");
  const expectedPpm = rounded(residualDriftMilliseconds * 1_000 / observationIntervalSeconds);
  const measuredInterval = rounded(later.targetStartSeconds - opening.targetStartSeconds);
  const measuredDrift = rounded((later.measuredOffsetSeconds - opening.measuredOffsetSeconds) * 1_000);
  const minimumCorrelation = boundedNumber(qualification.minimumCorrelation, 0, 1, "qualification.minimumCorrelation");
  const minimumPeakMargin = boundedNumber(qualification.minimumPeakMargin, 0, 1, "qualification.minimumPeakMargin");
  const qualifies = opening.normalizedCorrelation >= minimumCorrelation
    && later.normalizedCorrelation >= minimumCorrelation
    && opening.peakMargin >= minimumPeakMargin
    && later.peakMargin >= minimumPeakMargin;
  const windowFit = analyzer.windowFit == null
    ? null
    : parseWindowFit(analyzer.windowFit, opening, later);

  if (
    row.kind !== AUDIO_ALIGNMENT_EVIDENCE_KIND
    || !Number.isFinite(Date.parse(createdAt))
    || analyzer.algorithm !== AUDIO_ALIGNMENT_ALGORITHM
    || !Number.isInteger(analyzer.sampleRate)
    || Number(analyzer.sampleRate) < 4_000
    || Number(analyzer.sampleRate) > 48_000
    || positiveNumber(analyzer.windowSeconds, "analyzer.windowSeconds") > 30
    || positiveNumber(analyzer.searchRadiusSeconds, "analyzer.searchRadiusSeconds") > 30
    || !requiredText(analyzer.ffmpegVersion, "analyzer.ffmpegVersion")
    || (windowFit && windowFit.windowSeconds !== Number(analyzer.windowSeconds))
    || later.targetStartSeconds <= opening.targetStartSeconds
    || Math.abs(observationIntervalSeconds - measuredInterval) > 0.000001
    || Math.abs(residualDriftMilliseconds - measuredDrift) > 0.000001
    || Math.abs(observedPartsPerMillion - expectedPpm) > 0.000001
    || qualification.qualifiedForAuthorizedAgentReview !== qualifies
    || !requiredText(qualification.reason, "qualification.reason")
    || boundaries.sampleAccurateClaimed !== false
    || boundaries.sourceBytesMutated !== false
    || boundaries.timelinePlacementApplied !== false
    || boundaries.personOrDelegatedApprovalStillRequired !== true
  ) throw new Error("Audio alignment evidence integrity is invalid.");

  return row as AudioAlignmentEvidence;
}

export type AudioAlignmentPlacementAssessment = {
  policy: "quipsly-offset-placement-assessment-v1";
  status: "offset-ready" | "drift-detected" | "insufficient-coverage" | "ambiguous-match";
  reason: string;
  offsetOnlyBudgetMilliseconds: number;
  estimatedMaximumOffsetErrorMilliseconds: number | null;
  observedDriftMilliseconds: number;
  observationIntervalSeconds: number;
  targetDurationSeconds: number | null;
  observedSpanFraction: number | null;
  // This is a two-window linear estimate, not a claim that drift is constant
  // between observations or that a tempo transform has been applied.
  estimatedTargetToSpineRate: number;
  estimatedTargetOriginOnSpineSeconds: number;
  correctionApplied: false;
};

/** Separates a distinct acoustic match from suitability for offset-only sync.
 * The 10 ms budget is a Quipsly policy, not an industry accuracy guarantee.
 * Full-duration extrapolation prevents a short observation on a long recording
 * from being mislabeled stable. Never use this to claim sample-accurate sync.
 */
export function assessAudioAlignmentPlacement(value: unknown): AudioAlignmentPlacementAssessment {
  const evidence = parseAudioAlignmentEvidence(value);
  const {opening, drift} = evidence;
  const slope = drift.residualDriftMilliseconds / (1_000 * drift.observationIntervalSeconds);
  const duration = evidence.analyzer.windowFit?.targetDecodedDurationSeconds ?? null;
  const coverage = duration === null ? null : drift.observationIntervalSeconds / duration;
  const maximumError = duration === null ? null : rounded(Math.abs(slope) * Math.max(opening.targetStartSeconds, duration - opening.targetStartSeconds) * 1_000);
  const budget = 10;
  const distinct = evidence.qualification.qualifiedForAuthorizedAgentReview;
  const status: AudioAlignmentPlacementAssessment["status"] = !distinct ? "ambiguous-match"
    : Math.abs(drift.residualDriftMilliseconds) > budget || (maximumError !== null && maximumError > budget) ? "drift-detected"
    : coverage === null || coverage < 0.5 ? "insufficient-coverage" : "offset-ready";
  return {
    policy: "quipsly-offset-placement-assessment-v1", status,
    reason: status === "ambiguous-match" ? "The recordings do not have a distinct enough shared audio match. Recording clocks remain available."
      : status === "drift-detected" ? "The audio matches, but the timing changes across the recording. A start-time adjustment alone will not keep the whole recording aligned."
      : status === "insufficient-coverage" ? "The audio matches at the measured moments. More widely separated measurements or full recording duration are needed to assess drift across the recording."
      : "The measured offset is consistent with Quipsly’s 10 ms offset-only budget across this recording. This is an estimate, not sample-accurate sync.",
    offsetOnlyBudgetMilliseconds: budget,
    estimatedMaximumOffsetErrorMilliseconds: maximumError,
    observedDriftMilliseconds: drift.residualDriftMilliseconds,
    observationIntervalSeconds: drift.observationIntervalSeconds,
    targetDurationSeconds: duration,
    observedSpanFraction: coverage,
    estimatedTargetToSpineRate: 1 + slope,
    estimatedTargetOriginOnSpineSeconds: opening.measuredOffsetSeconds - slope * opening.targetStartSeconds,
    correctionApplied: false,
  };
}

function parseWindowFit(
  value: unknown,
  opening: AudioAlignmentMoment,
  later: AudioAlignmentMoment,
): AudioAlignmentWindowFit {
  const row = record(value);
  const parsed: AudioAlignmentWindowFit = {
    policy: row.policy as AudioAlignmentWindowFit["policy"],
    spineDecodedDurationSeconds: positiveNumber(
      row.spineDecodedDurationSeconds,
      "analyzer.windowFit.spineDecodedDurationSeconds",
    ),
    targetDecodedDurationSeconds: positiveNumber(
      row.targetDecodedDurationSeconds,
      "analyzer.windowFit.targetDecodedDurationSeconds",
    ),
    initialOffsetSeconds: finiteNumber(
      row.initialOffsetSeconds,
      "analyzer.windowFit.initialOffsetSeconds",
    ),
    requestedOpeningTargetSeconds: nonNegativeNumber(
      row.requestedOpeningTargetSeconds,
      "analyzer.windowFit.requestedOpeningTargetSeconds",
    ),
    requestedLaterTargetSeconds: nonNegativeNumber(
      row.requestedLaterTargetSeconds,
      "analyzer.windowFit.requestedLaterTargetSeconds",
    ),
    analyzedOpeningTargetSeconds: nonNegativeNumber(
      row.analyzedOpeningTargetSeconds,
      "analyzer.windowFit.analyzedOpeningTargetSeconds",
    ),
    analyzedLaterTargetSeconds: nonNegativeNumber(
      row.analyzedLaterTargetSeconds,
      "analyzer.windowFit.analyzedLaterTargetSeconds",
    ),
    windowSeconds: boundedNumber(
      row.windowSeconds,
      1,
      30,
      "analyzer.windowFit.windowSeconds",
    ),
    adjustedToDecodedDuration: row.adjustedToDecodedDuration === true,
  };
  const fitted = fitAudioAlignmentWindows({
    spineDurationSeconds: parsed.spineDecodedDurationSeconds,
    targetDurationSeconds: parsed.targetDecodedDurationSeconds,
    initialOffsetSeconds: parsed.initialOffsetSeconds,
    requestedOpeningTargetSeconds: parsed.requestedOpeningTargetSeconds,
    requestedLaterTargetSeconds: parsed.requestedLaterTargetSeconds,
    windowSeconds: parsed.windowSeconds,
  });
  if (
    parsed.policy !== AUDIO_ALIGNMENT_WINDOW_FIT_POLICY
    || parsed.adjustedToDecodedDuration !== fitted.adjustedToDecodedDuration
    || Math.abs(parsed.analyzedOpeningTargetSeconds - fitted.openingTargetSeconds) > 0.000001
    || Math.abs(parsed.analyzedLaterTargetSeconds - fitted.laterTargetSeconds) > 0.000001
    || Math.abs(opening.targetStartSeconds - fitted.openingTargetSeconds) > 0.000001
    || Math.abs(later.targetStartSeconds - fitted.laterTargetSeconds) > 0.000001
  ) throw new Error("Audio alignment decoded-window fit integrity is invalid.");
  return parsed;
}

function parseMoment(value: unknown, label: string): AudioAlignmentMoment {
  const row = record(value);
  const targetStartSeconds = nonNegativeNumber(row.targetStartSeconds, `${label}.targetStartSeconds`);
  const expectedSpineStartSeconds = nonNegativeNumber(row.expectedSpineStartSeconds, `${label}.expectedSpineStartSeconds`);
  const measuredSpineStartSeconds = nonNegativeNumber(row.measuredSpineStartSeconds, `${label}.measuredSpineStartSeconds`);
  const measuredOffsetSeconds = finiteNumber(row.measuredOffsetSeconds, `${label}.measuredOffsetSeconds`);
  const normalizedCorrelation = boundedNumber(row.normalizedCorrelation, -1, 1, `${label}.normalizedCorrelation`);
  const secondBestCorrelation = boundedNumber(row.secondBestCorrelation, -1, 1, `${label}.secondBestCorrelation`);
  const peakMargin = boundedNumber(row.peakMargin, 0, 2, `${label}.peakMargin`);
  if (Math.abs(measuredOffsetSeconds - rounded(measuredSpineStartSeconds - targetStartSeconds)) > 0.000001) {
    throw new Error(`Audio alignment ${label} offset is inconsistent.`);
  }
  if (Math.abs(peakMargin - rounded(normalizedCorrelation - secondBestCorrelation)) > 0.000001) {
    throw new Error(`Audio alignment ${label} peak margin is inconsistent.`);
  }
  return { targetStartSeconds, expectedSpineStartSeconds, measuredSpineStartSeconds, measuredOffsetSeconds, normalizedCorrelation, secondBestCorrelation, peakMargin };
}

function parseSource(value: unknown, label: string): AudioMasterySourceBinding {
  const row = record(value);
  const sha256 = requiredText(row.sha256, `${label}.sha256`).toLowerCase();
  const provider = requiredText(row.provider, `${label}.provider`);
  if (!SHA256.test(sha256)) throw new Error(`Audio alignment ${label} SHA-256 is invalid.`);
  if (provider !== "local" && provider !== "gcs") throw new Error(`Audio alignment ${label} provider is invalid.`);
  return {
    assetId: requiredText(row.assetId, `${label}.assetId`),
    provider,
    locator: requiredText(row.locator, `${label}.locator`),
    generation: requiredText(row.generation, `${label}.generation`),
    sha256,
    sizeBytes: positiveInteger(row.sizeBytes, `${label}.sizeBytes`),
    contentType: requiredText(row.contentType, `${label}.contentType`),
  };
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function requiredText(value: unknown, label: string) {
  const parsed = typeof value === "string" ? value.trim() : "";
  if (!parsed) throw new Error(`Audio alignment ${label} is required.`);
  return parsed;
}

function finiteNumber(value: unknown, label: string) {
  if (typeof value !== "number" || !Number.isFinite(value)) throw new Error(`Audio alignment ${label} must be finite.`);
  return value;
}

function nonNegativeNumber(value: unknown, label: string) {
  const parsed = finiteNumber(value, label);
  if (parsed < 0) throw new Error(`Audio alignment ${label} must be non-negative.`);
  return parsed;
}

function positiveNumber(value: unknown, label: string) {
  const parsed = finiteNumber(value, label);
  if (parsed <= 0) throw new Error(`Audio alignment ${label} must be positive.`);
  return parsed;
}

function positiveInteger(value: unknown, label: string) {
  const parsed = finiteNumber(value, label);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) throw new Error(`Audio alignment ${label} must be a positive integer.`);
  return parsed;
}

function boundedNumber(value: unknown, minimum: number, maximum: number, label: string) {
  const parsed = finiteNumber(value, label);
  if (parsed < minimum || parsed > maximum) throw new Error(`Audio alignment ${label} is outside its safe bounds.`);
  return parsed;
}

function rounded(value: number, places = 6) {
  const scale = 10 ** places;
  return Math.round((value + Number.EPSILON) * scale) / scale;
}
