import type { AudioMasterySourceBinding } from "./audio-mastery.js";

export const AUDIO_SIGNAL_PROFILE_CONTRACT_VERSION = 1 as const;
export const AUDIO_SIGNAL_PROFILE_JOB_KIND = "quipsly-audio-signal-profile-job-v1" as const;
export const AUDIO_SIGNAL_PROFILE_RESULT_KIND = "quipsly-audio-signal-profile-result-v1" as const;
export const AUDIO_SIGNAL_PROFILE_ALGORITHM = "quipsly-audio-signal-window-v1" as const;

export type AudioSignalProfileWindow = {
  startSeconds: number;
  durationSeconds: number;
  rmsDbfs: number;
  samplePeakDbfs: number;
  clippedFrameCount: number;
};

export type AudioSignalProfileObservation = {
  kind: "near-digital-silence" | "stereo-imbalance" | "sample-clipping" | "possible-dropout";
  severity: "warning" | "attention";
  startSeconds: number;
  endSeconds: number;
  detail: string;
};

export type AudioSignalProfile = {
  schemaVersion: 1;
  algorithm: typeof AUDIO_SIGNAL_PROFILE_ALGORITHM;
  sampleRate: number;
  channelCount: number;
  analyzedFrameCount: number;
  durationSeconds: number;
  windowDurationSeconds: number;
  rmsDbfs: number;
  samplePeakDbfs: number;
  clippedFrameCount: number;
  clippedFrameFraction: number;
  nearSilentFrameFraction: number;
  leftRmsDbfs: number;
  rightRmsDbfs: number | null;
  stereoBalanceDb: number | null;
  signalStatus: "signal-present" | "attention" | "near-digital-silence";
  thresholds: {
    clippingAmplitude: number;
    nearSilenceDbfs: number;
    possibleDropoutMinimumSeconds: number;
    surroundingSignalDbfs: number;
    stereoImbalanceDb: number;
  };
  waveform: AudioSignalProfileWindow[];
  observations: AudioSignalProfileObservation[];
};

export type AudioSignalProfileJob = {
  kind: typeof AUDIO_SIGNAL_PROFILE_JOB_KIND;
  version: typeof AUDIO_SIGNAL_PROFILE_CONTRACT_VERSION;
  jobId: string;
  projectId: string;
  requestedByEmail: string;
  queuedAt: string;
  source: AudioMasterySourceBinding;
  analyzer: {
    algorithm: typeof AUDIO_SIGNAL_PROFILE_ALGORITHM;
    maximumWindows: 1_200;
    completeDecodeRequired: true;
  };
};

export type AudioSignalProfileResult = {
  kind: typeof AUDIO_SIGNAL_PROFILE_RESULT_KIND;
  version: typeof AUDIO_SIGNAL_PROFILE_CONTRACT_VERSION;
  jobId: string;
  completedAt: string;
  source: AudioMasterySourceBinding;
  media: {
    container: string;
    codec: string;
    sampleRate: number;
    channelCount: number;
    durationSeconds: number;
  };
  audioSignal: AudioSignalProfile;
  analyzer: {
    algorithm: typeof AUDIO_SIGNAL_PROFILE_ALGORITHM;
    ffmpegVersion: string;
    completeDecode: true;
    maximumWindows: 1_200;
  };
  worker: {
    executionId: string;
    buildId: string;
    imageDigest: string | null;
    attempt: number;
  };
  boundaries: {
    originalRemainsSourceTruth: true;
    analysisDoesNotChangeMedia: true;
    observationsRequireHumanInterpretation: true;
  };
};

const SAFE_ID = /^[A-Za-z0-9_-]{8,160}$/;
const SHA256 = /^[0-9a-f]{64}$/;

export function newAudioSignalProfileJob(input: Omit<AudioSignalProfileJob, "kind" | "version" | "analyzer">): AudioSignalProfileJob {
  return parseAudioSignalProfileJob({
    ...input,
    kind: AUDIO_SIGNAL_PROFILE_JOB_KIND,
    version: AUDIO_SIGNAL_PROFILE_CONTRACT_VERSION,
    analyzer: {
      algorithm: AUDIO_SIGNAL_PROFILE_ALGORITHM,
      maximumWindows: 1_200,
      completeDecodeRequired: true,
    },
  });
}

export function parseAudioSignalProfileJob(value: unknown, expectedJobId?: string): AudioSignalProfileJob {
  const row = record(value);
  const analyzer = record(row.analyzer);
  const jobId = requiredId(row.jobId, "jobId");
  if (
    row.kind !== AUDIO_SIGNAL_PROFILE_JOB_KIND
    || row.version !== AUDIO_SIGNAL_PROFILE_CONTRACT_VERSION
    || (expectedJobId && expectedJobId !== jobId)
    || analyzer.algorithm !== AUDIO_SIGNAL_PROFILE_ALGORITHM
    || analyzer.maximumWindows !== 1_200
    || analyzer.completeDecodeRequired !== true
  ) throw new Error("Audio signal profile job contract is invalid.");
  return {
    kind: AUDIO_SIGNAL_PROFILE_JOB_KIND,
    version: AUDIO_SIGNAL_PROFILE_CONTRACT_VERSION,
    jobId,
    projectId: requiredId(row.projectId, "projectId"),
    requestedByEmail: requiredText(row.requestedByEmail, "requestedByEmail").toLowerCase(),
    queuedAt: isoDate(row.queuedAt, "queuedAt"),
    source: parseSource(row.source),
    analyzer: {
      algorithm: AUDIO_SIGNAL_PROFILE_ALGORITHM,
      maximumWindows: 1_200,
      completeDecodeRequired: true,
    },
  };
}

export function parseAudioSignalProfileResult(value: unknown, expectedJob?: AudioSignalProfileJob | unknown): AudioSignalProfileResult {
  const row = record(value);
  const job = expectedJob ? parseAudioSignalProfileJob(expectedJob) : null;
  const jobId = requiredId(row.jobId, "jobId");
  const source = parseSource(row.source);
  const media = record(row.media);
  const analyzer = record(row.analyzer);
  const worker = record(row.worker);
  const boundaries = record(row.boundaries);
  const audioSignal = parseAudioSignalProfile(row.audioSignal);
  if (
    row.kind !== AUDIO_SIGNAL_PROFILE_RESULT_KIND
    || row.version !== AUDIO_SIGNAL_PROFILE_CONTRACT_VERSION
    || (job && (job.jobId !== jobId || !sameSource(job.source, source)))
    || analyzer.algorithm !== AUDIO_SIGNAL_PROFILE_ALGORITHM
    || analyzer.completeDecode !== true
    || analyzer.maximumWindows !== 1_200
    || boundaries.originalRemainsSourceTruth !== true
    || boundaries.analysisDoesNotChangeMedia !== true
    || boundaries.observationsRequireHumanInterpretation !== true
    || audioSignal.sampleRate !== positiveInteger(media.sampleRate, "media.sampleRate")
    || audioSignal.channelCount !== positiveInteger(media.channelCount, "media.channelCount")
    || Math.abs(audioSignal.durationSeconds - positiveNumber(media.durationSeconds, "media.durationSeconds")) > 0.02
  ) throw new Error("Audio signal profile result integrity is invalid.");
  return {
    kind: AUDIO_SIGNAL_PROFILE_RESULT_KIND,
    version: AUDIO_SIGNAL_PROFILE_CONTRACT_VERSION,
    jobId,
    completedAt: isoDate(row.completedAt, "completedAt"),
    source,
    media: {
      container: requiredText(media.container, "media.container"),
      codec: requiredText(media.codec, "media.codec"),
      sampleRate: audioSignal.sampleRate,
      channelCount: audioSignal.channelCount,
      durationSeconds: positiveNumber(media.durationSeconds, "media.durationSeconds"),
    },
    audioSignal,
    analyzer: {
      algorithm: AUDIO_SIGNAL_PROFILE_ALGORITHM,
      ffmpegVersion: requiredText(analyzer.ffmpegVersion, "analyzer.ffmpegVersion"),
      completeDecode: true,
      maximumWindows: 1_200,
    },
    worker: {
      executionId: requiredId(worker.executionId, "worker.executionId"),
      buildId: requiredText(worker.buildId, "worker.buildId"),
      imageDigest: worker.imageDigest == null ? null : requiredText(worker.imageDigest, "worker.imageDigest"),
      attempt: positiveInteger(worker.attempt, "worker.attempt"),
    },
    boundaries: {
      originalRemainsSourceTruth: true,
      analysisDoesNotChangeMedia: true,
      observationsRequireHumanInterpretation: true,
    },
  };
}

export function parseAudioSignalProfile(value: unknown): AudioSignalProfile {
  const row = record(value);
  const thresholds = record(row.thresholds);
  const waveform = array(row.waveform).map((item, index) => {
    const window = record(item);
    return {
      startSeconds: nonNegativeNumber(window.startSeconds, `waveform[${index}].startSeconds`),
      durationSeconds: positiveNumber(window.durationSeconds, `waveform[${index}].durationSeconds`),
      rmsDbfs: finiteNumber(window.rmsDbfs, `waveform[${index}].rmsDbfs`),
      samplePeakDbfs: finiteNumber(window.samplePeakDbfs, `waveform[${index}].samplePeakDbfs`),
      clippedFrameCount: nonNegativeInteger(window.clippedFrameCount, `waveform[${index}].clippedFrameCount`),
    };
  });
  if (
    row.schemaVersion !== 1
    || row.algorithm !== AUDIO_SIGNAL_PROFILE_ALGORITHM
    || waveform.length === 0
    || waveform.length > 1_200
  ) throw new Error("Audio signal profile is invalid or unbounded.");
  for (let index = 1; index < waveform.length; index += 1) {
    if (waveform[index].startSeconds < waveform[index - 1].startSeconds) throw new Error("Audio signal waveform is not ordered.");
  }
  const sampleRate = positiveInteger(row.sampleRate, "sampleRate");
  const analyzedFrameCount = positiveInteger(row.analyzedFrameCount, "analyzedFrameCount");
  const durationSeconds = positiveNumber(row.durationSeconds, "durationSeconds");
  const decodedDuration = analyzedFrameCount / sampleRate;
  const waveformEnd = waveform.at(-1)!.startSeconds + waveform.at(-1)!.durationSeconds;
  if (Math.abs(decodedDuration - durationSeconds) > 0.02 || Math.abs(waveformEnd - durationSeconds) > 0.02) {
    throw new Error("Audio signal profile duration evidence is internally inconsistent.");
  }
  const clippedFrameCount = nonNegativeInteger(row.clippedFrameCount, "clippedFrameCount");
  if (waveform.reduce((total, window) => total + window.clippedFrameCount, 0) !== clippedFrameCount) {
    throw new Error("Audio signal clipping evidence is internally inconsistent.");
  }
  const observations = array(row.observations).map((item, index) => {
    const observation = record(item);
    const kind = ["near-digital-silence", "stereo-imbalance", "sample-clipping", "possible-dropout"].includes(String(observation.kind))
      ? observation.kind as AudioSignalProfileObservation["kind"]
      : invalid(`observations[${index}].kind`);
    const severity: AudioSignalProfileObservation["severity"] = observation.severity === "warning" || observation.severity === "attention"
      ? observation.severity
      : invalid(`observations[${index}].severity`);
    const startSeconds = nonNegativeNumber(observation.startSeconds, `observations[${index}].startSeconds`);
    const endSeconds = nonNegativeNumber(observation.endSeconds, `observations[${index}].endSeconds`);
    if (endSeconds < startSeconds || endSeconds > durationSeconds + 0.02) throw new Error(`observations[${index}] has an invalid range.`);
    return {
      kind,
      severity,
      startSeconds,
      endSeconds,
      detail: requiredText(observation.detail, `observations[${index}].detail`),
    };
  });
  const signalStatus = row.signalStatus === "signal-present" || row.signalStatus === "attention" || row.signalStatus === "near-digital-silence"
    ? row.signalStatus
    : invalid("signalStatus");
  return {
    schemaVersion: 1,
    algorithm: AUDIO_SIGNAL_PROFILE_ALGORITHM,
    sampleRate,
    channelCount: positiveInteger(row.channelCount, "channelCount"),
    analyzedFrameCount,
    durationSeconds,
    windowDurationSeconds: positiveNumber(row.windowDurationSeconds, "windowDurationSeconds"),
    rmsDbfs: finiteNumber(row.rmsDbfs, "rmsDbfs"),
    samplePeakDbfs: finiteNumber(row.samplePeakDbfs, "samplePeakDbfs"),
    clippedFrameCount,
    clippedFrameFraction: fraction(row.clippedFrameFraction, "clippedFrameFraction"),
    nearSilentFrameFraction: fraction(row.nearSilentFrameFraction, "nearSilentFrameFraction"),
    leftRmsDbfs: finiteNumber(row.leftRmsDbfs, "leftRmsDbfs"),
    rightRmsDbfs: row.rightRmsDbfs == null ? null : finiteNumber(row.rightRmsDbfs, "rightRmsDbfs"),
    stereoBalanceDb: row.stereoBalanceDb == null ? null : finiteNumber(row.stereoBalanceDb, "stereoBalanceDb"),
    signalStatus,
    thresholds: {
      clippingAmplitude: fraction(thresholds.clippingAmplitude, "thresholds.clippingAmplitude"),
      nearSilenceDbfs: finiteNumber(thresholds.nearSilenceDbfs, "thresholds.nearSilenceDbfs"),
      possibleDropoutMinimumSeconds: positiveNumber(thresholds.possibleDropoutMinimumSeconds, "thresholds.possibleDropoutMinimumSeconds"),
      surroundingSignalDbfs: finiteNumber(thresholds.surroundingSignalDbfs, "thresholds.surroundingSignalDbfs"),
      stereoImbalanceDb: positiveNumber(thresholds.stereoImbalanceDb, "thresholds.stereoImbalanceDb"),
    },
    waveform,
    observations,
  };
}

function parseSource(value: unknown): AudioMasterySourceBinding {
  const row = record(value);
  const provider = row.provider === "local" || row.provider === "gcs" ? row.provider : invalid("source.provider");
  const sha256 = requiredText(row.sha256, "source.sha256");
  if (!SHA256.test(sha256)) throw new Error("source.sha256 is invalid.");
  return {
    assetId: requiredId(row.assetId, "source.assetId"),
    provider,
    locator: requiredText(row.locator, "source.locator"),
    generation: requiredText(row.generation, "source.generation"),
    sha256,
    sizeBytes: positiveInteger(row.sizeBytes, "source.sizeBytes"),
    contentType: requiredText(row.contentType, "source.contentType"),
  };
}

function sameSource(left: AudioMasterySourceBinding, right: AudioMasterySourceBinding) {
  return left.assetId === right.assetId && left.provider === right.provider && left.locator === right.locator
    && left.generation === right.generation && left.sha256 === right.sha256 && left.sizeBytes === right.sizeBytes
    && left.contentType === right.contentType;
}

function record(value: unknown): Record<string, unknown> { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
function array(value: unknown): unknown[] { return Array.isArray(value) ? value : []; }
function requiredText(value: unknown, name: string) { const text = typeof value === "string" ? value.trim() : ""; if (!text) throw new Error(`${name} is required.`); return text; }
function requiredId(value: unknown, name: string) { const id = requiredText(value, name); if (!SAFE_ID.test(id)) throw new Error(`${name} is invalid.`); return id; }
function isoDate(value: unknown, name: string) { const text = requiredText(value, name); if (!Number.isFinite(Date.parse(text))) throw new Error(`${name} is invalid.`); return text; }
function finiteNumber(value: unknown, name: string) { const number = Number(value); if (!Number.isFinite(number)) throw new Error(`${name} is invalid.`); return number; }
function positiveNumber(value: unknown, name: string) { const number = finiteNumber(value, name); if (number <= 0) throw new Error(`${name} must be positive.`); return number; }
function nonNegativeNumber(value: unknown, name: string) { const number = finiteNumber(value, name); if (number < 0) throw new Error(`${name} must be non-negative.`); return number; }
function positiveInteger(value: unknown, name: string) { const number = positiveNumber(value, name); if (!Number.isSafeInteger(number)) throw new Error(`${name} must be an integer.`); return number; }
function nonNegativeInteger(value: unknown, name: string) { const number = nonNegativeNumber(value, name); if (!Number.isSafeInteger(number)) throw new Error(`${name} must be an integer.`); return number; }
function fraction(value: unknown, name: string) { const number = nonNegativeNumber(value, name); if (number > 1) throw new Error(`${name} must be a fraction.`); return number; }
function invalid(name: string): never { throw new Error(`${name} is invalid.`); }
