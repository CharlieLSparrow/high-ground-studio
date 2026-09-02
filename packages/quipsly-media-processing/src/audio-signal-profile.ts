import type { AudioMasterySourceBinding } from "./audio-mastery.js";

export const AUDIO_SIGNAL_PROFILE_CONTRACT_VERSION = 1 as const;
export const AUDIO_SIGNAL_PROFILE_JOB_KIND = "quipsly-audio-signal-profile-job-v1" as const;
export const AUDIO_SIGNAL_PROFILE_RESULT_KIND = "quipsly-audio-signal-profile-result-v1" as const;
export const AUDIO_SIGNAL_PROFILE_ALGORITHM = "quipsly-audio-signal-window-v1" as const;
export const AUDIO_FREQUENCY_PROFILE_ALGORITHM = "quipsly-audio-broad-band-rms-v1" as const;
export const AUDIO_LOUDNESS_PROFILE_ALGORITHM = "itu-r-bs.1770-5-integrated-v1" as const;
export const AUDIO_SIGNAL_PROFILE_CLOUD_MANIFEST_KIND = "quipsly-audio-signal-profile-cloud-manifest-v1" as const;
export const AUDIO_SIGNAL_PROFILE_CLOUD_QUEUE_KIND = "quipsly-audio-signal-profile-cloud-queue-v1" as const;
export const AUDIO_SIGNAL_PROFILE_CLOUD_CONTROL_PREFIX = "media-vault/control/audio-signal-profile" as const;
export const AUDIO_SIGNAL_PROFILE_CLOUD_MANIFEST_PREFIX = `${AUDIO_SIGNAL_PROFILE_CLOUD_CONTROL_PREFIX}/manifests` as const;
export const AUDIO_SIGNAL_PROFILE_CLOUD_QUEUE_PREFIX = `${AUDIO_SIGNAL_PROFILE_CLOUD_CONTROL_PREFIX}/queue` as const;
export const AUDIO_SIGNAL_PROFILE_CLOUD_RESULT_PREFIX = `${AUDIO_SIGNAL_PROFILE_CLOUD_CONTROL_PREFIX}/results` as const;
export const AUDIO_SIGNAL_PROFILE_CLOUD_DEAD_LETTER_PREFIX = `${AUDIO_SIGNAL_PROFILE_CLOUD_CONTROL_PREFIX}/dead-letter` as const;

export type AudioFrequencyBandId = "rumble" | "warmth" | "body" | "speech" | "presence" | "air";

export type AudioFrequencyProfile = {
  algorithm: typeof AUDIO_FREQUENCY_PROFILE_ALGORITHM;
  completeDecode: true;
  downmixPolicy: "ffmpeg-default-mono-v1";
  windowDurationSeconds: number;
  analyzedFrameCount: number;
  bands: Array<{
    id: AudioFrequencyBandId;
    label: string;
    minimumHz: number;
    maximumHz: number;
  }>;
  overallBandRmsDbfs: number[];
  windows: Array<{
    startSeconds: number;
    durationSeconds: number;
    bandRmsDbfs: number[];
  }>;
  boundaries: {
    broadBandsAreNotARepairSpectrogram: true;
    measurementsAreNotEqDecisions: true;
    stereoIsDownmixedForFrequencyOverview: true;
  };
};

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

export type AudioLoudnessProfile = {
  schemaVersion: 1;
  algorithm: typeof AUDIO_LOUDNESS_PROFILE_ALGORITHM;
  standard: "ITU-R BS.1770-5";
  status: "measured" | "insufficient-duration" | "below-absolute-gate" | "below-relative-gate" | "unsupported-channel-layout";
  sampleRate: number;
  channelCount: number;
  analyzedFrameCount: number;
  measurementBlockDurationSeconds: 0.4;
  measurementBlockStepSeconds: 0.1;
  measurementBlockCount: number;
  absoluteGatedBlockCount: number;
  relativeGatedBlockCount: number;
  absoluteGateLufs: -70;
  relativeGateLufs: number | null;
  integratedLoudnessLufs: number | null;
  maximumMomentaryLoudnessLufs: number | null;
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
  frequencyProfile: AudioFrequencyProfile | null;
  loudness: AudioLoudnessProfile | null;
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
    frequencyAnalysis: {
      algorithm: typeof AUDIO_FREQUENCY_PROFILE_ALGORITHM;
      maximumBands: 6;
      maximumWindows: 1_200;
      completeDecodeRequired: true;
    } | null;
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
    frequencyAnalysis: {
      algorithm: typeof AUDIO_FREQUENCY_PROFILE_ALGORITHM;
      maximumBands: 6;
      maximumWindows: 1_200;
      completeDecode: true;
    } | null;
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

export type AudioSignalProfileCloudManifest = {
  kind: typeof AUDIO_SIGNAL_PROFILE_CLOUD_MANIFEST_KIND;
  version: 1;
  job: AudioSignalProfileJob;
  status: "queued" | "processing" | "completed" | "failed-terminal";
  queuedAt: string;
  updatedAt: string;
  lease: null | { id: string; executionId: string; claimedAt: string; expiresAt: string; attempt: number };
  resultObjectName: string | null;
  failure: null | { code: string; message: string; failedAt: string };
};

export type AudioSignalProfileCloudQueueReceipt = {
  kind: typeof AUDIO_SIGNAL_PROFILE_CLOUD_QUEUE_KIND;
  version: 1;
  jobId: string;
  manifestObjectName: string;
  manifestGeneration: string;
  enqueuedAt: string;
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
      frequencyAnalysis: {
        algorithm: AUDIO_FREQUENCY_PROFILE_ALGORITHM,
        maximumBands: 6,
        maximumWindows: 1_200,
        completeDecodeRequired: true,
      },
    },
  });
}

export function buildAudioSignalProfileCloudManifestObjectName(jobId: string) { return `${AUDIO_SIGNAL_PROFILE_CLOUD_MANIFEST_PREFIX}/${requiredId(jobId, "jobId")}.json`; }
export function buildAudioSignalProfileCloudQueueObjectName(jobId: string) { return `${AUDIO_SIGNAL_PROFILE_CLOUD_QUEUE_PREFIX}/${requiredId(jobId, "jobId")}.json`; }
export function buildAudioSignalProfileCloudResultObjectName(jobId: string) { return `${AUDIO_SIGNAL_PROFILE_CLOUD_RESULT_PREFIX}/${requiredId(jobId, "jobId")}.json`; }
export function buildAudioSignalProfileCloudDeadLetterObjectName(jobId: string) { return `${AUDIO_SIGNAL_PROFILE_CLOUD_DEAD_LETTER_PREFIX}/${requiredId(jobId, "jobId")}.json`; }

export function newAudioSignalProfileCloudManifest(jobValue: AudioSignalProfileJob | unknown): AudioSignalProfileCloudManifest {
  const job = parseAudioSignalProfileJob(jobValue);
  if (job.source.provider !== "gcs" || !validGenerationBoundGcsSignalSource(job.source)) throw new Error("Cloud signal profiling requires one generation-bound GCS source.");
  return parseAudioSignalProfileCloudManifest({ kind: AUDIO_SIGNAL_PROFILE_CLOUD_MANIFEST_KIND, version: 1, job, status: "queued", queuedAt: job.queuedAt, updatedAt: job.queuedAt, lease: null, resultObjectName: null, failure: null }, job.jobId);
}

export function parseAudioSignalProfileCloudQueueReceipt(value: unknown): AudioSignalProfileCloudQueueReceipt {
  const row = record(value);
  const jobId = requiredId(row.jobId, "jobId");
  const parsed: AudioSignalProfileCloudQueueReceipt = {
    kind: row.kind as AudioSignalProfileCloudQueueReceipt["kind"],
    version: Number(row.version) as 1,
    jobId,
    manifestObjectName: requiredText(row.manifestObjectName, "manifestObjectName"),
    manifestGeneration: requiredText(row.manifestGeneration, "manifestGeneration"),
    enqueuedAt: isoDate(row.enqueuedAt, "enqueuedAt"),
  };
  if (parsed.kind !== AUDIO_SIGNAL_PROFILE_CLOUD_QUEUE_KIND || parsed.version !== 1 || parsed.manifestObjectName !== buildAudioSignalProfileCloudManifestObjectName(jobId) || !/^[1-9][0-9]*$/.test(parsed.manifestGeneration)) throw new Error("Audio signal profile cloud queue receipt is invalid.");
  return parsed;
}

export function parseAudioSignalProfileCloudManifest(value: unknown, expectedJobId?: string): AudioSignalProfileCloudManifest {
  const row = record(value);
  const job = parseAudioSignalProfileJob(row.job, expectedJobId);
  const status = requiredText(row.status, "status") as AudioSignalProfileCloudManifest["status"];
  const lease = row.lease == null ? null : parseSignalCloudLease(row.lease);
  const failure = row.failure == null ? null : parseSignalCloudFailure(row.failure);
  const resultObjectName = row.resultObjectName == null ? null : requiredText(row.resultObjectName, "resultObjectName");
  const parsed: AudioSignalProfileCloudManifest = { kind: row.kind as AudioSignalProfileCloudManifest["kind"], version: Number(row.version) as 1, job, status, queuedAt: isoDate(row.queuedAt, "queuedAt"), updatedAt: isoDate(row.updatedAt, "updatedAt"), lease, resultObjectName, failure };
  if (
    parsed.kind !== AUDIO_SIGNAL_PROFILE_CLOUD_MANIFEST_KIND || parsed.version !== 1 || job.source.provider !== "gcs"
    || !validGenerationBoundGcsSignalSource(job.source) || parsed.queuedAt !== job.queuedAt
    || !["queued", "processing", "completed", "failed-terminal"].includes(status)
    || (status === "processing") !== Boolean(lease)
    || (status === "completed" ? resultObjectName !== buildAudioSignalProfileCloudResultObjectName(job.jobId) : resultObjectName !== null)
    || (status === "failed-terminal") !== Boolean(failure)
  ) throw new Error("Audio signal profile cloud manifest is invalid.");
  return parsed;
}

export function claimAudioSignalProfileCloudManifest(input: { manifest: AudioSignalProfileCloudManifest; leaseId: string; executionId: string; now: Date; leaseDurationMs: number }) {
  if (input.manifest.status === "completed" || input.manifest.status === "failed-terminal") return null;
  if (input.manifest.status === "processing" && input.manifest.lease && Date.parse(input.manifest.lease.expiresAt) > input.now.getTime()) return null;
  if (!Number.isSafeInteger(input.leaseDurationMs) || input.leaseDurationMs < 60_000) throw new Error("Audio signal profile cloud lease duration is invalid.");
  return parseAudioSignalProfileCloudManifest({ ...input.manifest, status: "processing", updatedAt: input.now.toISOString(), lease: { id: requiredId(input.leaseId, "lease.id"), executionId: requiredId(input.executionId, "lease.executionId"), claimedAt: input.now.toISOString(), expiresAt: new Date(input.now.getTime() + input.leaseDurationMs).toISOString(), attempt: (input.manifest.lease?.attempt ?? 0) + 1 }, resultObjectName: null, failure: null }, input.manifest.job.jobId);
}

export function releaseAudioSignalProfileCloudLease(input: { manifest: AudioSignalProfileCloudManifest; leaseId: string; now: Date }) {
  assertSignalCloudLease(input.manifest, input.leaseId);
  return parseAudioSignalProfileCloudManifest({ ...input.manifest, status: "queued", updatedAt: input.now.toISOString(), lease: null }, input.manifest.job.jobId);
}

export function completeAudioSignalProfileCloudManifest(input: { manifest: AudioSignalProfileCloudManifest; leaseId: string; result: AudioSignalProfileResult; now: Date }) {
  assertSignalCloudLease(input.manifest, input.leaseId);
  parseAudioSignalProfileResult(input.result, input.manifest.job);
  return parseAudioSignalProfileCloudManifest({ ...input.manifest, status: "completed", updatedAt: input.now.toISOString(), lease: null, resultObjectName: buildAudioSignalProfileCloudResultObjectName(input.manifest.job.jobId), failure: null }, input.manifest.job.jobId);
}

export function failAudioSignalProfileCloudManifest(input: { manifest: AudioSignalProfileCloudManifest; leaseId: string; code: string; message: string; now: Date }) {
  assertSignalCloudLease(input.manifest, input.leaseId);
  return parseAudioSignalProfileCloudManifest({ ...input.manifest, status: "failed-terminal", updatedAt: input.now.toISOString(), lease: null, resultObjectName: null, failure: { code: requiredText(input.code, "failure.code"), message: requiredText(input.message, "failure.message"), failedAt: input.now.toISOString() } }, input.manifest.job.jobId);
}

function assertSignalCloudLease(manifest: AudioSignalProfileCloudManifest, leaseId: string) { if (manifest.status !== "processing" || !manifest.lease || manifest.lease.id !== leaseId) throw new Error("Audio signal profile cloud lease is no longer active."); }
function parseSignalCloudLease(value: unknown) { const row = record(value); return { id: requiredId(row.id, "lease.id"), executionId: requiredId(row.executionId, "lease.executionId"), claimedAt: isoDate(row.claimedAt, "lease.claimedAt"), expiresAt: isoDate(row.expiresAt, "lease.expiresAt"), attempt: positiveInteger(row.attempt, "lease.attempt") }; }
function parseSignalCloudFailure(value: unknown) { const row = record(value); return { code: requiredText(row.code, "failure.code"), message: requiredText(row.message, "failure.message"), failedAt: isoDate(row.failedAt, "failure.failedAt") }; }
function validGenerationBoundGcsSignalSource(source: AudioMasterySourceBinding) { const match = /^gcs:\/\/([a-z0-9][a-z0-9._-]{1,221}[a-z0-9])\/(media-vault\/.+)\?generation=([1-9][0-9]*)$/.exec(source.locator); return Boolean(match && match[3] === source.generation && !match[2].split("/").some((part) => !part || part === "." || part === "..")); }

export function parseAudioSignalProfileJob(value: unknown, expectedJobId?: string): AudioSignalProfileJob {
  const row = record(value);
  const analyzer = record(row.analyzer);
  const frequencyAnalysis = parseFrequencyJobCapability(analyzer.frequencyAnalysis);
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
      frequencyAnalysis,
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
  const frequencyAnalysis = parseFrequencyResultCapability(analyzer.frequencyAnalysis);
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
    || (job ? Boolean(frequencyAnalysis) !== Boolean(job.analyzer.frequencyAnalysis) : false)
    || Boolean(audioSignal.frequencyProfile) !== Boolean(frequencyAnalysis)
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
      frequencyAnalysis,
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
  const frequencyProfile = row.frequencyProfile == null
    ? null
    : parseAudioFrequencyProfile(row.frequencyProfile, { sampleRate, analyzedFrameCount, durationSeconds });
  const loudness = row.loudness == null
    ? null
    : parseAudioLoudnessProfile(row.loudness, { sampleRate, channelCount: positiveInteger(row.channelCount, "channelCount"), analyzedFrameCount });
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
    frequencyProfile,
    loudness,
    observations,
  };
}

export function parseAudioLoudnessProfile(
  value: unknown,
  expected?: { sampleRate: number; channelCount: number; analyzedFrameCount: number },
): AudioLoudnessProfile {
  const row = record(value);
  const status = requiredText(row.status, "loudness.status") as AudioLoudnessProfile["status"];
  const sampleRate = positiveInteger(row.sampleRate, "loudness.sampleRate");
  const channelCount = positiveInteger(row.channelCount, "loudness.channelCount");
  const analyzedFrameCount = positiveInteger(row.analyzedFrameCount, "loudness.analyzedFrameCount");
  const measurementBlockCount = nonNegativeInteger(row.measurementBlockCount, "loudness.measurementBlockCount");
  const absoluteGatedBlockCount = nonNegativeInteger(row.absoluteGatedBlockCount, "loudness.absoluteGatedBlockCount");
  const relativeGatedBlockCount = nonNegativeInteger(row.relativeGatedBlockCount, "loudness.relativeGatedBlockCount");
  const relativeGateLufs = row.relativeGateLufs == null ? null : finiteNumber(row.relativeGateLufs, "loudness.relativeGateLufs");
  const integratedLoudnessLufs = row.integratedLoudnessLufs == null ? null : finiteNumber(row.integratedLoudnessLufs, "loudness.integratedLoudnessLufs");
  const maximumMomentaryLoudnessLufs = row.maximumMomentaryLoudnessLufs == null ? null : finiteNumber(row.maximumMomentaryLoudnessLufs, "loudness.maximumMomentaryLoudnessLufs");
  if (
    row.schemaVersion !== 1
    || row.algorithm !== AUDIO_LOUDNESS_PROFILE_ALGORITHM
    || row.standard !== "ITU-R BS.1770-5"
    || !["measured", "insufficient-duration", "below-absolute-gate", "below-relative-gate", "unsupported-channel-layout"].includes(status)
    || row.measurementBlockDurationSeconds !== 0.4
    || row.measurementBlockStepSeconds !== 0.1
    || row.absoluteGateLufs !== -70
    || absoluteGatedBlockCount > measurementBlockCount
    || relativeGatedBlockCount > absoluteGatedBlockCount
    || (status === "measured" && (integratedLoudnessLufs === null || maximumMomentaryLoudnessLufs === null || relativeGatedBlockCount < 1))
    || (status !== "measured" && integratedLoudnessLufs !== null)
    || (expected && (sampleRate !== expected.sampleRate || channelCount !== expected.channelCount || analyzedFrameCount !== expected.analyzedFrameCount))
  ) throw new Error("Audio loudness profile is invalid or does not match the decoded source.");
  return {
    schemaVersion: 1,
    algorithm: AUDIO_LOUDNESS_PROFILE_ALGORITHM,
    standard: "ITU-R BS.1770-5",
    status,
    sampleRate,
    channelCount,
    analyzedFrameCount,
    measurementBlockDurationSeconds: 0.4,
    measurementBlockStepSeconds: 0.1,
    measurementBlockCount,
    absoluteGatedBlockCount,
    relativeGatedBlockCount,
    absoluteGateLufs: -70,
    relativeGateLufs,
    integratedLoudnessLufs,
    maximumMomentaryLoudnessLufs,
  };
}

export function parseAudioFrequencyProfile(
  value: unknown,
  expected?: { sampleRate: number; analyzedFrameCount: number; durationSeconds: number },
): AudioFrequencyProfile {
  const row = record(value);
  const boundaries = record(row.boundaries);
  const bands = array(row.bands).map((item, index) => {
    const band = record(item);
    const id = ["rumble", "warmth", "body", "speech", "presence", "air"].includes(String(band.id))
      ? band.id as AudioFrequencyBandId
      : invalid(`frequencyProfile.bands[${index}].id`);
    const minimumHz = positiveNumber(band.minimumHz, `frequencyProfile.bands[${index}].minimumHz`);
    const maximumHz = positiveNumber(band.maximumHz, `frequencyProfile.bands[${index}].maximumHz`);
    if (maximumHz <= minimumHz) throw new Error(`frequencyProfile.bands[${index}] has an invalid range.`);
    return { id, label: requiredText(band.label, `frequencyProfile.bands[${index}].label`), minimumHz, maximumHz };
  });
  if (bands.length < 1 || bands.length > 6 || new Set(bands.map((band) => band.id)).size !== bands.length) {
    throw new Error("Audio frequency profile bands are invalid or unbounded.");
  }
  for (let index = 1; index < bands.length; index += 1) {
    if (bands[index].minimumHz < bands[index - 1].maximumHz) throw new Error("Audio frequency profile bands overlap or are unordered.");
  }
  const overallBandRmsDbfs = array(row.overallBandRmsDbfs).map((entry, index) => finiteNumber(entry, `frequencyProfile.overallBandRmsDbfs[${index}]`));
  const windows = array(row.windows).map((item, index) => {
    const window = record(item);
    const bandRmsDbfs = array(window.bandRmsDbfs).map((entry, bandIndex) => finiteNumber(entry, `frequencyProfile.windows[${index}].bandRmsDbfs[${bandIndex}]`));
    if (bandRmsDbfs.length !== bands.length) throw new Error(`frequencyProfile.windows[${index}] does not cover every band.`);
    return {
      startSeconds: nonNegativeNumber(window.startSeconds, `frequencyProfile.windows[${index}].startSeconds`),
      durationSeconds: positiveNumber(window.durationSeconds, `frequencyProfile.windows[${index}].durationSeconds`),
      bandRmsDbfs,
    };
  });
  const analyzedFrameCount = positiveInteger(row.analyzedFrameCount, "frequencyProfile.analyzedFrameCount");
  const windowDurationSeconds = positiveNumber(row.windowDurationSeconds, "frequencyProfile.windowDurationSeconds");
  if (
    row.algorithm !== AUDIO_FREQUENCY_PROFILE_ALGORITHM
    || row.completeDecode !== true
    || row.downmixPolicy !== "ffmpeg-default-mono-v1"
    || overallBandRmsDbfs.length !== bands.length
    || windows.length < 1
    || windows.length > 1_200
    || boundaries.broadBandsAreNotARepairSpectrogram !== true
    || boundaries.measurementsAreNotEqDecisions !== true
    || boundaries.stereoIsDownmixedForFrequencyOverview !== true
  ) throw new Error("Audio frequency profile is invalid or unbounded.");
  if (windows[0]!.startSeconds > 0.02) throw new Error("Audio frequency profile does not begin on the source clock.");
  for (let index = 1; index < windows.length; index += 1) {
    const previousEnd = windows[index - 1]!.startSeconds + windows[index - 1]!.durationSeconds;
    if (Math.abs(windows[index]!.startSeconds - previousEnd) > 0.02) throw new Error("Audio frequency profile windows are not contiguous on the source clock.");
  }
  const endSeconds = windows.at(-1)!.startSeconds + windows.at(-1)!.durationSeconds;
  const durationSeconds = expected?.durationSeconds ?? endSeconds;
  if (
    (expected && analyzedFrameCount !== expected.analyzedFrameCount)
    || (expected && bands.some((band) => band.maximumHz >= expected.sampleRate / 2))
    || Math.abs(endSeconds - durationSeconds) > 0.02
  ) throw new Error("Audio frequency profile duration or Nyquist evidence is inconsistent.");
  return {
    algorithm: AUDIO_FREQUENCY_PROFILE_ALGORITHM,
    completeDecode: true,
    downmixPolicy: "ffmpeg-default-mono-v1",
    windowDurationSeconds,
    analyzedFrameCount,
    bands,
    overallBandRmsDbfs,
    windows,
    boundaries: {
      broadBandsAreNotARepairSpectrogram: true,
      measurementsAreNotEqDecisions: true,
      stereoIsDownmixedForFrequencyOverview: true,
    },
  };
}

function parseFrequencyJobCapability(value: unknown): AudioSignalProfileJob["analyzer"]["frequencyAnalysis"] {
  if (value == null) return null;
  const row = record(value);
  if (
    row.algorithm !== AUDIO_FREQUENCY_PROFILE_ALGORITHM
    || row.maximumBands !== 6
    || row.maximumWindows !== 1_200
    || row.completeDecodeRequired !== true
  ) throw new Error("Audio signal frequency job capability is invalid.");
  return { algorithm: AUDIO_FREQUENCY_PROFILE_ALGORITHM, maximumBands: 6, maximumWindows: 1_200, completeDecodeRequired: true };
}

function parseFrequencyResultCapability(value: unknown): AudioSignalProfileResult["analyzer"]["frequencyAnalysis"] {
  if (value == null) return null;
  const row = record(value);
  if (
    row.algorithm !== AUDIO_FREQUENCY_PROFILE_ALGORITHM
    || row.maximumBands !== 6
    || row.maximumWindows !== 1_200
    || row.completeDecode !== true
  ) throw new Error("Audio signal frequency result capability is invalid.");
  return { algorithm: AUDIO_FREQUENCY_PROFILE_ALGORITHM, maximumBands: 6, maximumWindows: 1_200, completeDecode: true };
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
