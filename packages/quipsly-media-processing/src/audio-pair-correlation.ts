import type { AudioMasterySourceBinding } from "./audio-mastery.js";

export const AUDIO_PAIR_CORRELATION_CONTRACT_VERSION = 1 as const;
export const AUDIO_PAIR_CORRELATION_JOB_KIND = "quipsly-audio-pair-correlation-job-v1" as const;
export const AUDIO_PAIR_CORRELATION_RESULT_KIND = "quipsly-audio-pair-correlation-result-v1" as const;
export const AUDIO_PAIR_CORRELATION_ALGORITHM = "quipsly-pcm-power-envelope-correlation-v1" as const;

export type AudioPairCorrelationRange = {
  programStartSeconds: number;
  programEndSeconds: number;
  sourceStartSeconds: number;
  sourceEndSeconds: number;
  alignment: "program-clock" | "qualified-candidate";
  alignmentEvidenceJobId: string | null;
};

export type AudioPairCorrelationSource = {
  role: "reference" | "observation";
  productionRole: string;
  participantId: string | null;
  source: AudioMasterySourceBinding;
  range: AudioPairCorrelationRange;
};

export type AudioPairCorrelationJob = {
  kind: typeof AUDIO_PAIR_CORRELATION_JOB_KIND;
  version: typeof AUDIO_PAIR_CORRELATION_CONTRACT_VERSION;
  jobId: string;
  projectId: string;
  episodeProductionId: string;
  programFingerprintSha256: string;
  activeDecisionReceiptIds: string[];
  requestedByEmail: string;
  queuedAt: string;
  reference: AudioPairCorrelationSource;
  observation: AudioPairCorrelationSource;
  analyzer: {
    algorithm: typeof AUDIO_PAIR_CORRELATION_ALGORITHM;
    sampleRate: 16_000;
    channelPolicy: "ffmpeg-default-mono-v1";
    frameDurationMilliseconds: 10;
    maximumLagMilliseconds: 2_000;
    segmentDurationSeconds: 10;
    maximumAnalyzedSeconds: 30;
  };
  boundaries: {
    correlationIsNotCausation: true;
    measurementDoesNotClassifyBleedOrEcho: true;
    requiresProtectedPlaybackReview: true;
    createsNoTimelineOrMixChange: true;
    originalSourcesRemainTruth: true;
  };
};

export type AudioPairCorrelationMeasurement = {
  analyzedDurationSeconds: number;
  sampleRate: 16_000;
  frameDurationMilliseconds: 10;
  comparedFrameCount: number;
  activeFrameCount: number;
  zeroLagPowerCorrelation: number;
  peakPowerCorrelation: number;
  peakAbsolutePowerCorrelation: number;
  bestLagMilliseconds: number;
  peakProminence: number;
  waveformCorrelationAtBestLag: number;
  referenceRmsDbfs: number;
  observationRmsDbfs: number;
  observationToReferenceLevelDb: number;
  reliability: number;
};

export type AudioPairCorrelationResult = {
  kind: typeof AUDIO_PAIR_CORRELATION_RESULT_KIND;
  version: typeof AUDIO_PAIR_CORRELATION_CONTRACT_VERSION;
  jobId: string;
  completedAt: string;
  programFingerprintSha256: string;
  activeDecisionReceiptIds: string[];
  reference: AudioPairCorrelationSource;
  observation: AudioPairCorrelationSource;
  measurement: AudioPairCorrelationMeasurement;
  segments: Array<{
    programStartSeconds: number;
    programEndSeconds: number;
    measurement: AudioPairCorrelationMeasurement;
  }>;
  analyzer: AudioPairCorrelationJob["analyzer"] & {
    ffmpegVersion: string;
    completeRangeDecode: true;
  };
  worker: { executionId: string; buildId: string; imageDigest: string | null; attempt: number };
  boundaries: AudioPairCorrelationJob["boundaries"] & {
    exactSourcesVerifiedBeforeAndAfter: true;
    resultIsMeasurementNotMixAuthorization: true;
  };
};

const SAFE_ID = /^[A-Za-z0-9_-]{8,160}$/;
const SHA256 = /^[0-9a-f]{64}$/;

export function newAudioPairCorrelationJob(input: Omit<AudioPairCorrelationJob, "kind" | "version" | "analyzer" | "boundaries">): AudioPairCorrelationJob {
  return parseAudioPairCorrelationJob({
    ...input,
    kind: AUDIO_PAIR_CORRELATION_JOB_KIND,
    version: AUDIO_PAIR_CORRELATION_CONTRACT_VERSION,
    analyzer: analyzerContract(),
    boundaries: jobBoundaries(),
  });
}

export function parseAudioPairCorrelationJob(value: unknown, expectedJobId?: string): AudioPairCorrelationJob {
  const row = record(value);
  const jobId = id(row.jobId, "jobId");
  const analyzer = parseAnalyzer(row.analyzer);
  const boundaries = record(row.boundaries);
  if (
    row.kind !== AUDIO_PAIR_CORRELATION_JOB_KIND
    || row.version !== AUDIO_PAIR_CORRELATION_CONTRACT_VERSION
    || (expectedJobId && expectedJobId !== jobId)
    || !hasJobBoundaries(boundaries)
  ) throw new Error("Audio pair correlation job contract is invalid.");
  const reference = parseCorrelationSource(row.reference, "reference");
  const observation = parseCorrelationSource(row.observation, "observation");
  const activeDecisionReceiptIds = sortedUniqueIds(row.activeDecisionReceiptIds, "activeDecisionReceiptIds");
  if (sameSource(reference.source, observation.source)) throw new Error("Audio pair correlation requires two distinct retained sources.");
  if (!activeDecisionReceiptIds.length) throw new Error("Audio pair correlation requires the active canonical program decisions.");
  if (Math.abs(reference.range.programStartSeconds - observation.range.programStartSeconds) > 0.001 || Math.abs(reference.range.programEndSeconds - observation.range.programEndSeconds) > 0.001) throw new Error("Audio pair correlation sources must share one exact program range.");
  if (Math.abs(rangeDuration(reference.range) - rangeDuration(observation.range)) > 0.001) throw new Error("Audio pair correlation ranges must cover the same program duration.");
  if (rangeDuration(reference.range) > analyzer.maximumAnalyzedSeconds + 0.001) throw new Error("Audio pair correlation range exceeds the bounded analysis duration.");
  return {
    kind: AUDIO_PAIR_CORRELATION_JOB_KIND,
    version: AUDIO_PAIR_CORRELATION_CONTRACT_VERSION,
    jobId,
    projectId: id(row.projectId, "projectId"),
    episodeProductionId: id(row.episodeProductionId, "episodeProductionId"),
    programFingerprintSha256: sha(row.programFingerprintSha256, "programFingerprintSha256"),
    activeDecisionReceiptIds,
    requestedByEmail: email(row.requestedByEmail, "requestedByEmail"),
    queuedAt: iso(row.queuedAt, "queuedAt"),
    reference,
    observation,
    analyzer,
    boundaries: jobBoundaries(),
  };
}

export function parseAudioPairCorrelationResult(value: unknown, expectedJob?: AudioPairCorrelationJob | unknown): AudioPairCorrelationResult {
  const row = record(value);
  const job = expectedJob ? parseAudioPairCorrelationJob(expectedJob) : null;
  const boundaries = record(row.boundaries);
  if (
    row.kind !== AUDIO_PAIR_CORRELATION_RESULT_KIND
    || row.version !== AUDIO_PAIR_CORRELATION_CONTRACT_VERSION
    || !hasJobBoundaries(boundaries)
    || boundaries.exactSourcesVerifiedBeforeAndAfter !== true
    || boundaries.resultIsMeasurementNotMixAuthorization !== true
  ) throw new Error("Audio pair correlation result contract is invalid.");
  const reference = parseCorrelationSource(row.reference, "reference");
  const observation = parseCorrelationSource(row.observation, "observation");
  const analyzerRow = record(row.analyzer);
  const analyzer = parseAnalyzer(analyzerRow);
  if (analyzerRow.completeRangeDecode !== true) throw new Error("Audio pair correlation requires a complete bounded-range decode.");
  const result: AudioPairCorrelationResult = {
    kind: AUDIO_PAIR_CORRELATION_RESULT_KIND,
    version: AUDIO_PAIR_CORRELATION_CONTRACT_VERSION,
    jobId: id(row.jobId, "jobId"),
    completedAt: iso(row.completedAt, "completedAt"),
    programFingerprintSha256: sha(row.programFingerprintSha256, "programFingerprintSha256"),
    activeDecisionReceiptIds: sortedUniqueIds(row.activeDecisionReceiptIds, "activeDecisionReceiptIds"),
    reference,
    observation,
    measurement: parseMeasurement(row.measurement),
    segments: array(row.segments).map((entry, index) => {
      const segment = record(entry);
      const programStartSeconds = nonNegative(segment.programStartSeconds, `segments[${index}].programStartSeconds`);
      const programEndSeconds = nonNegative(segment.programEndSeconds, `segments[${index}].programEndSeconds`);
      if (programEndSeconds <= programStartSeconds) throw new Error(`segments[${index}] range is invalid.`);
      const measurement = parseMeasurement(segment.measurement);
      if (Math.abs(measurement.analyzedDurationSeconds - (programEndSeconds - programStartSeconds)) > 0.001) throw new Error(`segments[${index}] measurement duration is inconsistent.`);
      return { programStartSeconds, programEndSeconds, measurement };
    }),
    analyzer: { ...analyzer, ffmpegVersion: requiredText(analyzerRow.ffmpegVersion, "analyzer.ffmpegVersion"), completeRangeDecode: true },
    worker: parseWorker(row.worker),
    boundaries: { ...jobBoundaries(), exactSourcesVerifiedBeforeAndAfter: true, resultIsMeasurementNotMixAuthorization: true },
  };
  if (!result.segments.length || result.segments.length > 3) throw new Error("Audio pair correlation segment coverage is invalid.");
  for (let index = 1; index < result.segments.length; index += 1) if (Math.abs(result.segments[index].programStartSeconds - result.segments[index - 1].programEndSeconds) > 0.001) throw new Error("Audio pair correlation segments are not contiguous.");
  if (job && (
    result.jobId !== job.jobId
    || result.programFingerprintSha256 !== job.programFingerprintSha256
    || JSON.stringify(result.activeDecisionReceiptIds) !== JSON.stringify(job.activeDecisionReceiptIds)
    || !sameCorrelationSource(result.reference, job.reference)
    || !sameCorrelationSource(result.observation, job.observation)
  )) throw new Error("Audio pair correlation result does not match its job.");
  if (job && !sameAnalyzer(result.analyzer, job.analyzer)) throw new Error("Audio pair correlation analyzer changed after queueing.");
  if (job && (
    Math.abs(result.measurement.analyzedDurationSeconds - rangeDuration(job.reference.range)) > 0.001
    || Math.abs(result.segments[0].programStartSeconds - job.reference.range.programStartSeconds) > 0.001
    || Math.abs(result.segments.at(-1)!.programEndSeconds - job.reference.range.programEndSeconds) > 0.001
  )) throw new Error("Audio pair correlation result coverage does not match its job range.");
  return result;
}

function parseMeasurement(value: unknown): AudioPairCorrelationMeasurement {
  const row = record(value);
  const result = {
    analyzedDurationSeconds: positive(row.analyzedDurationSeconds, "measurement.analyzedDurationSeconds"),
    sampleRate: integer(row.sampleRate, "measurement.sampleRate"),
    frameDurationMilliseconds: integer(row.frameDurationMilliseconds, "measurement.frameDurationMilliseconds"),
    comparedFrameCount: integer(row.comparedFrameCount, "measurement.comparedFrameCount"),
    activeFrameCount: integer(row.activeFrameCount, "measurement.activeFrameCount"),
    zeroLagPowerCorrelation: unitSigned(row.zeroLagPowerCorrelation, "measurement.zeroLagPowerCorrelation"),
    peakPowerCorrelation: unitSigned(row.peakPowerCorrelation, "measurement.peakPowerCorrelation"),
    peakAbsolutePowerCorrelation: unit(row.peakAbsolutePowerCorrelation, "measurement.peakAbsolutePowerCorrelation"),
    bestLagMilliseconds: finite(row.bestLagMilliseconds, "measurement.bestLagMilliseconds"),
    peakProminence: unit(row.peakProminence, "measurement.peakProminence"),
    waveformCorrelationAtBestLag: unitSigned(row.waveformCorrelationAtBestLag, "measurement.waveformCorrelationAtBestLag"),
    referenceRmsDbfs: finite(row.referenceRmsDbfs, "measurement.referenceRmsDbfs"),
    observationRmsDbfs: finite(row.observationRmsDbfs, "measurement.observationRmsDbfs"),
    observationToReferenceLevelDb: finite(row.observationToReferenceLevelDb, "measurement.observationToReferenceLevelDb"),
    reliability: unit(row.reliability, "measurement.reliability"),
  };
  if (
    result.sampleRate !== 16_000
    || result.frameDurationMilliseconds !== 10
    || result.comparedFrameCount < 1
    || Math.abs(result.comparedFrameCount - Math.ceil(result.analyzedDurationSeconds * 100)) > 1
    || result.activeFrameCount > result.comparedFrameCount
    || Math.abs(result.bestLagMilliseconds) > 2_000
    || Math.abs(result.peakAbsolutePowerCorrelation - Math.abs(result.peakPowerCorrelation)) > 0.000001
  ) throw new Error("Audio pair correlation measurement configuration is invalid.");
  return result as AudioPairCorrelationMeasurement;
}

function parseCorrelationSource(value: unknown, expectedRole: AudioPairCorrelationSource["role"]): AudioPairCorrelationSource {
  const row = record(value);
  if (row.role !== expectedRole) throw new Error(`Audio pair ${expectedRole} role is invalid.`);
  return {
    role: expectedRole,
    productionRole: requiredText(row.productionRole, `${expectedRole}.productionRole`),
    participantId: row.participantId == null ? null : id(row.participantId, `${expectedRole}.participantId`),
    source: parseSource(row.source),
    range: parseRange(row.range, expectedRole),
  };
}

function parseRange(value: unknown, label: string): AudioPairCorrelationRange {
  const row = record(value);
  const alignment = row.alignment === "program-clock" || row.alignment === "qualified-candidate" ? row.alignment : invalid(`${label}.range.alignment`);
  const result = {
    programStartSeconds: nonNegative(row.programStartSeconds, `${label}.range.programStartSeconds`),
    programEndSeconds: nonNegative(row.programEndSeconds, `${label}.range.programEndSeconds`),
    sourceStartSeconds: nonNegative(row.sourceStartSeconds, `${label}.range.sourceStartSeconds`),
    sourceEndSeconds: nonNegative(row.sourceEndSeconds, `${label}.range.sourceEndSeconds`),
    alignment,
    alignmentEvidenceJobId: row.alignmentEvidenceJobId == null ? null : id(row.alignmentEvidenceJobId, `${label}.range.alignmentEvidenceJobId`),
  };
  if (result.programEndSeconds <= result.programStartSeconds || result.sourceEndSeconds <= result.sourceStartSeconds) throw new Error(`Audio pair ${label} range is invalid.`);
  if (Math.abs((result.programEndSeconds - result.programStartSeconds) - (result.sourceEndSeconds - result.sourceStartSeconds)) > 0.001) throw new Error(`Audio pair ${label} source range must match its program duration.`);
  if (alignment === "program-clock" && result.alignmentEvidenceJobId !== null) throw new Error("The program clock must not claim candidate alignment evidence.");
  if (alignment === "qualified-candidate" && result.alignmentEvidenceJobId === null) throw new Error("A qualified candidate requires alignment evidence.");
  return result;
}

function parseSource(value: unknown): AudioMasterySourceBinding {
  const row = record(value);
  return {
    assetId: id(row.assetId, "source.assetId"),
    provider: row.provider === "local" || row.provider === "gcs" ? row.provider : invalid("source.provider"),
    locator: requiredText(row.locator, "source.locator"),
    generation: requiredText(row.generation, "source.generation"),
    sha256: sha(row.sha256, "source.sha256"),
    sizeBytes: positiveInteger(row.sizeBytes, "source.sizeBytes"),
    contentType: requiredText(row.contentType, "source.contentType"),
  };
}

function parseAnalyzer(value: unknown): AudioPairCorrelationJob["analyzer"] {
  const row = record(value);
  if (
    row.algorithm !== AUDIO_PAIR_CORRELATION_ALGORITHM || row.sampleRate !== 16_000
    || row.channelPolicy !== "ffmpeg-default-mono-v1" || row.frameDurationMilliseconds !== 10
    || row.maximumLagMilliseconds !== 2_000 || row.segmentDurationSeconds !== 10 || row.maximumAnalyzedSeconds !== 30
  ) throw new Error("Audio pair correlation analyzer contract is invalid.");
  return analyzerContract();
}

function analyzerContract(): AudioPairCorrelationJob["analyzer"] { return { algorithm: AUDIO_PAIR_CORRELATION_ALGORITHM, sampleRate: 16_000, channelPolicy: "ffmpeg-default-mono-v1", frameDurationMilliseconds: 10, maximumLagMilliseconds: 2_000, segmentDurationSeconds: 10, maximumAnalyzedSeconds: 30 }; }
function jobBoundaries(): AudioPairCorrelationJob["boundaries"] { return { correlationIsNotCausation: true, measurementDoesNotClassifyBleedOrEcho: true, requiresProtectedPlaybackReview: true, createsNoTimelineOrMixChange: true, originalSourcesRemainTruth: true }; }
function hasJobBoundaries(value: Record<string, unknown>) { return Object.entries(jobBoundaries()).every(([key, expected]) => value[key] === expected); }
function rangeDuration(value: AudioPairCorrelationRange) { return value.programEndSeconds - value.programStartSeconds; }
function sameSource(left: AudioMasterySourceBinding, right: AudioMasterySourceBinding) { return left.assetId === right.assetId && left.provider === right.provider && left.locator === right.locator && left.generation === right.generation && left.sha256 === right.sha256 && left.sizeBytes === right.sizeBytes && left.contentType === right.contentType; }
function sameCorrelationSource(left: AudioPairCorrelationSource, right: AudioPairCorrelationSource) { return left.role === right.role && left.productionRole === right.productionRole && left.participantId === right.participantId && sameSource(left.source, right.source) && JSON.stringify(left.range) === JSON.stringify(right.range); }
function sameAnalyzer(left: AudioPairCorrelationResult["analyzer"], right: AudioPairCorrelationJob["analyzer"]) { return Object.entries(right).every(([key, value]) => left[key as keyof typeof left] === value); }
function parseWorker(value: unknown): AudioPairCorrelationResult["worker"] { const row = record(value); return { executionId: id(row.executionId, "worker.executionId"), buildId: requiredText(row.buildId, "worker.buildId"), imageDigest: row.imageDigest == null ? null : requiredText(row.imageDigest, "worker.imageDigest"), attempt: positiveInteger(row.attempt, "worker.attempt") }; }
function record(value: unknown): Record<string, any> { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, any> : {}; }
function array(value: unknown): unknown[] { return Array.isArray(value) ? value : []; }
function requiredText(value: unknown, label: string) { const result = typeof value === "string" ? value.trim() : ""; if (!result) throw new Error(`${label} is required.`); return result; }
function id(value: unknown, label: string) { const result = requiredText(value, label); if (!SAFE_ID.test(result)) throw new Error(`${label} is invalid.`); return result; }
function sha(value: unknown, label: string) { const result = requiredText(value, label).toLowerCase(); if (!SHA256.test(result)) throw new Error(`${label} is invalid.`); return result; }
function email(value: unknown, label: string) { const result = requiredText(value, label).toLowerCase(); if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(result)) throw new Error(`${label} is invalid.`); return result; }
function iso(value: unknown, label: string) { const result = requiredText(value, label); if (!Number.isFinite(Date.parse(result))) throw new Error(`${label} is invalid.`); return result; }
function finite(value: unknown, label: string) { const result = Number(value); if (!Number.isFinite(result)) throw new Error(`${label} is invalid.`); return result; }
function nonNegative(value: unknown, label: string) { const result = finite(value, label); if (result < 0) throw new Error(`${label} must be non-negative.`); return result; }
function positive(value: unknown, label: string) { const result = finite(value, label); if (result <= 0) throw new Error(`${label} must be positive.`); return result; }
function integer(value: unknown, label: string) { const result = nonNegative(value, label); if (!Number.isSafeInteger(result)) throw new Error(`${label} must be an integer.`); return result; }
function positiveInteger(value: unknown, label: string) { const result = integer(value, label); if (result < 1) throw new Error(`${label} must be positive.`); return result; }
function unit(value: unknown, label: string) { const result = finite(value, label); if (result < 0 || result > 1) throw new Error(`${label} must be between zero and one.`); return result; }
function unitSigned(value: unknown, label: string) { const result = finite(value, label); if (result < -1 || result > 1) throw new Error(`${label} must be between negative one and one.`); return result; }
function sortedUniqueIds(value: unknown, label: string) { const values = array(value).map((entry, index) => id(entry, `${label}[${index}]`)); if (new Set(values).size !== values.length) throw new Error(`${label} must be unique.`); return values.sort(); }
function invalid(label: string): never { throw new Error(`${label} is invalid.`); }
