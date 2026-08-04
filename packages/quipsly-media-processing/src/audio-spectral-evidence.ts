import type { AudioMasterySourceBinding } from "./audio-mastery.js";

export const AUDIO_SPECTRAL_EVIDENCE_CONTRACT_VERSION = 1 as const;
export const AUDIO_SPECTRAL_EVIDENCE_JOB_KIND = "quipsly-audio-spectral-evidence-job-v1" as const;
export const AUDIO_SPECTRAL_EVIDENCE_RESULT_KIND = "quipsly-audio-spectral-evidence-result-v1" as const;
export const AUDIO_SPECTRAL_EVIDENCE_ALGORITHM = "quipsly-log-stft-tile-pyramid-v1" as const;
export const AUDIO_SPECTRAL_TILE_WIDTH = 512 as const;
export const AUDIO_SPECTRAL_TILE_HEIGHT = 192 as const;
export const AUDIO_SPECTRAL_TILE_BYTES = AUDIO_SPECTRAL_TILE_WIDTH * AUDIO_SPECTRAL_TILE_HEIGHT;
export const AUDIO_SPECTRAL_LEVELS = [
  { id: "overview", tileSpanSeconds: 300 },
  { id: "browse", tileSpanSeconds: 30 },
  { id: "detail", tileSpanSeconds: 5 },
] as const;

export type AudioSpectralLevelId = typeof AUDIO_SPECTRAL_LEVELS[number]["id"];

export type AudioSpectralEvidenceJob = {
  kind: typeof AUDIO_SPECTRAL_EVIDENCE_JOB_KIND;
  version: typeof AUDIO_SPECTRAL_EVIDENCE_CONTRACT_VERSION;
  jobId: string;
  projectId: string;
  requestedByEmail: string;
  queuedAt: string;
  source: AudioMasterySourceBinding;
  analyzer: {
    algorithm: typeof AUDIO_SPECTRAL_EVIDENCE_ALGORITHM;
    completeDecodeRequired: true;
    downmixPolicy: "ffmpeg-default-mono-v1";
    windowFunction: "hann";
    frequencyScale: "logarithmic";
    magnitudeScale: "logarithmic-dbfs";
    dynamicRangeDb: 120;
    upperLimitDbfs: 0;
    tileWidth: typeof AUDIO_SPECTRAL_TILE_WIDTH;
    tileHeight: typeof AUDIO_SPECTRAL_TILE_HEIGHT;
    levels: typeof AUDIO_SPECTRAL_LEVELS;
  };
};

export type AudioSpectralEvidenceResult = {
  kind: typeof AUDIO_SPECTRAL_EVIDENCE_RESULT_KIND;
  version: typeof AUDIO_SPECTRAL_EVIDENCE_CONTRACT_VERSION;
  jobId: string;
  completedAt: string;
  source: AudioMasterySourceBinding;
  media: {
    sampleRate: number;
    channelCount: number;
    durationSeconds: number;
    minimumFrequencyHz: number;
    maximumFrequencyHz: number;
  };
  pyramid: {
    algorithm: typeof AUDIO_SPECTRAL_EVIDENCE_ALGORITHM;
    pixelFormat: "gray8-ffmpeg-intensity-v1";
    tileWidth: typeof AUDIO_SPECTRAL_TILE_WIDTH;
    tileHeight: typeof AUDIO_SPECTRAL_TILE_HEIGHT;
    tileByteLength: typeof AUDIO_SPECTRAL_TILE_BYTES;
    frequencyScale: "logarithmic";
    frequencyOrientation: "high-to-low";
    magnitudeScale: "logarithmic-dbfs";
    dynamicRangeDb: 120;
    upperLimitDbfs: 0;
    levels: Array<{
      id: AudioSpectralLevelId;
      tileSpanSeconds: number;
      tileCount: number;
      byteOffset: number;
    }>;
    pack: {
      provider: "local";
      locator: string;
      sha256: string;
      sizeBytes: number;
      generation: string;
      contentType: "application/vnd.quipsly.spectral-tile-pack";
    };
  };
  analyzer: {
    ffmpegVersion: string;
    completeDecode: true;
    detailFrameCount: number;
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
    visualEvidenceIsNotAnEqDecision: true;
    repairCandidatesRequirePlaybackReview: true;
  };
};

const SAFE_ID = /^[A-Za-z0-9_-]{8,160}$/;
const SHA256 = /^[0-9a-f]{64}$/;

export function newAudioSpectralEvidenceJob(input: Omit<AudioSpectralEvidenceJob, "kind" | "version" | "analyzer">): AudioSpectralEvidenceJob {
  return parseAudioSpectralEvidenceJob({
    ...input,
    kind: AUDIO_SPECTRAL_EVIDENCE_JOB_KIND,
    version: AUDIO_SPECTRAL_EVIDENCE_CONTRACT_VERSION,
    analyzer: {
      algorithm: AUDIO_SPECTRAL_EVIDENCE_ALGORITHM,
      completeDecodeRequired: true,
      downmixPolicy: "ffmpeg-default-mono-v1",
      windowFunction: "hann",
      frequencyScale: "logarithmic",
      magnitudeScale: "logarithmic-dbfs",
      dynamicRangeDb: 120,
      upperLimitDbfs: 0,
      tileWidth: AUDIO_SPECTRAL_TILE_WIDTH,
      tileHeight: AUDIO_SPECTRAL_TILE_HEIGHT,
      levels: AUDIO_SPECTRAL_LEVELS,
    },
  });
}

export function parseAudioSpectralEvidenceJob(value: unknown, expectedJobId?: string): AudioSpectralEvidenceJob {
  const row = record(value);
  const analyzer = record(row.analyzer);
  const jobId = id(row.jobId, "jobId");
  const levels = array(analyzer.levels);
  if (
    row.kind !== AUDIO_SPECTRAL_EVIDENCE_JOB_KIND
    || row.version !== AUDIO_SPECTRAL_EVIDENCE_CONTRACT_VERSION
    || (expectedJobId && jobId !== expectedJobId)
    || analyzer.algorithm !== AUDIO_SPECTRAL_EVIDENCE_ALGORITHM
    || analyzer.completeDecodeRequired !== true
    || analyzer.downmixPolicy !== "ffmpeg-default-mono-v1"
    || analyzer.windowFunction !== "hann"
    || analyzer.frequencyScale !== "logarithmic"
    || analyzer.magnitudeScale !== "logarithmic-dbfs"
    || analyzer.dynamicRangeDb !== 120
    || analyzer.upperLimitDbfs !== 0
    || analyzer.tileWidth !== AUDIO_SPECTRAL_TILE_WIDTH
    || analyzer.tileHeight !== AUDIO_SPECTRAL_TILE_HEIGHT
    || JSON.stringify(levels) !== JSON.stringify(AUDIO_SPECTRAL_LEVELS)
  ) throw new Error("Audio spectral evidence job contract is invalid.");
  return {
    kind: AUDIO_SPECTRAL_EVIDENCE_JOB_KIND,
    version: AUDIO_SPECTRAL_EVIDENCE_CONTRACT_VERSION,
    jobId,
    projectId: id(row.projectId, "projectId"),
    requestedByEmail: text(row.requestedByEmail, "requestedByEmail").toLowerCase(),
    queuedAt: iso(row.queuedAt, "queuedAt"),
    source: source(row.source),
    analyzer: {
      algorithm: AUDIO_SPECTRAL_EVIDENCE_ALGORITHM,
      completeDecodeRequired: true,
      downmixPolicy: "ffmpeg-default-mono-v1",
      windowFunction: "hann",
      frequencyScale: "logarithmic",
      magnitudeScale: "logarithmic-dbfs",
      dynamicRangeDb: 120,
      upperLimitDbfs: 0,
      tileWidth: AUDIO_SPECTRAL_TILE_WIDTH,
      tileHeight: AUDIO_SPECTRAL_TILE_HEIGHT,
      levels: AUDIO_SPECTRAL_LEVELS,
    },
  };
}

export function parseAudioSpectralEvidenceResult(value: unknown, expectedJob?: AudioSpectralEvidenceJob | unknown): AudioSpectralEvidenceResult {
  const row = record(value);
  const job = expectedJob ? parseAudioSpectralEvidenceJob(expectedJob) : null;
  const media = record(row.media);
  const pyramid = record(row.pyramid);
  const pack = record(pyramid.pack);
  const analyzer = record(row.analyzer);
  const worker = record(row.worker);
  const boundaries = record(row.boundaries);
  const parsedSource = source(row.source);
  const jobId = id(row.jobId, "jobId");
  const durationSeconds = positive(media.durationSeconds, "media.durationSeconds");
  let expectedOffset = 0;
  const levels = array(pyramid.levels).map((candidate, index) => {
    const level = record(candidate);
    const expected = AUDIO_SPECTRAL_LEVELS[index];
    const tileCount = integer(level.tileCount, `levels[${index}].tileCount`);
    const byteOffset = integer(level.byteOffset, `levels[${index}].byteOffset`, true);
    if (!expected || level.id !== expected.id || level.tileSpanSeconds !== expected.tileSpanSeconds || tileCount !== Math.ceil(durationSeconds / expected.tileSpanSeconds) || byteOffset !== expectedOffset) {
      throw new Error("Audio spectral pyramid level integrity is invalid.");
    }
    expectedOffset += tileCount * AUDIO_SPECTRAL_TILE_BYTES;
    return { id: expected.id, tileSpanSeconds: expected.tileSpanSeconds, tileCount, byteOffset };
  });
  if (
    row.kind !== AUDIO_SPECTRAL_EVIDENCE_RESULT_KIND
    || row.version !== AUDIO_SPECTRAL_EVIDENCE_CONTRACT_VERSION
    || (job && (job.jobId !== jobId || !sameSource(job.source, parsedSource)))
    || pyramid.algorithm !== AUDIO_SPECTRAL_EVIDENCE_ALGORITHM
    || pyramid.pixelFormat !== "gray8-ffmpeg-intensity-v1"
    || pyramid.tileWidth !== AUDIO_SPECTRAL_TILE_WIDTH
    || pyramid.tileHeight !== AUDIO_SPECTRAL_TILE_HEIGHT
    || pyramid.tileByteLength !== AUDIO_SPECTRAL_TILE_BYTES
    || pyramid.frequencyScale !== "logarithmic"
    || pyramid.frequencyOrientation !== "high-to-low"
    || pyramid.magnitudeScale !== "logarithmic-dbfs"
    || pyramid.dynamicRangeDb !== 120
    || pyramid.upperLimitDbfs !== 0
    || levels.length !== AUDIO_SPECTRAL_LEVELS.length
    || pack.provider !== "local"
    || !String(pack.locator || "").startsWith("/")
    || !String(pack.locator || "").endsWith(".qspx")
    || !SHA256.test(String(pack.sha256 || ""))
    || pack.generation !== `sha256:${pack.sha256}`
    || pack.sizeBytes !== expectedOffset
    || pack.contentType !== "application/vnd.quipsly.spectral-tile-pack"
    || analyzer.completeDecode !== true
    || integer(analyzer.detailFrameCount, "analyzer.detailFrameCount") !== levels[2].tileCount
    || boundaries.originalRemainsSourceTruth !== true
    || boundaries.analysisDoesNotChangeMedia !== true
    || boundaries.visualEvidenceIsNotAnEqDecision !== true
    || boundaries.repairCandidatesRequirePlaybackReview !== true
  ) throw new Error("Audio spectral evidence result integrity is invalid.");
  return {
    kind: AUDIO_SPECTRAL_EVIDENCE_RESULT_KIND,
    version: AUDIO_SPECTRAL_EVIDENCE_CONTRACT_VERSION,
    jobId,
    completedAt: iso(row.completedAt, "completedAt"),
    source: parsedSource,
    media: {
      sampleRate: integer(media.sampleRate, "media.sampleRate"),
      channelCount: integer(media.channelCount, "media.channelCount"),
      durationSeconds,
      minimumFrequencyHz: positive(media.minimumFrequencyHz, "media.minimumFrequencyHz"),
      maximumFrequencyHz: positive(media.maximumFrequencyHz, "media.maximumFrequencyHz"),
    },
    pyramid: {
      algorithm: AUDIO_SPECTRAL_EVIDENCE_ALGORITHM,
      pixelFormat: "gray8-ffmpeg-intensity-v1",
      tileWidth: AUDIO_SPECTRAL_TILE_WIDTH,
      tileHeight: AUDIO_SPECTRAL_TILE_HEIGHT,
      tileByteLength: AUDIO_SPECTRAL_TILE_BYTES,
      frequencyScale: "logarithmic",
      frequencyOrientation: "high-to-low",
      magnitudeScale: "logarithmic-dbfs",
      dynamicRangeDb: 120,
      upperLimitDbfs: 0,
      levels,
      pack: {
        provider: "local",
        locator: text(pack.locator, "pack.locator"),
        sha256: String(pack.sha256),
        sizeBytes: Number(pack.sizeBytes),
        generation: String(pack.generation),
        contentType: "application/vnd.quipsly.spectral-tile-pack",
      },
    },
    analyzer: {
      ffmpegVersion: text(analyzer.ffmpegVersion, "analyzer.ffmpegVersion"),
      completeDecode: true,
      detailFrameCount: Number(analyzer.detailFrameCount),
    },
    worker: {
      executionId: id(worker.executionId, "worker.executionId"),
      buildId: text(worker.buildId, "worker.buildId"),
      imageDigest: worker.imageDigest == null ? null : text(worker.imageDigest, "worker.imageDigest"),
      attempt: integer(worker.attempt, "worker.attempt"),
    },
    boundaries: {
      originalRemainsSourceTruth: true,
      analysisDoesNotChangeMedia: true,
      visualEvidenceIsNotAnEqDecision: true,
      repairCandidatesRequirePlaybackReview: true,
    },
  };
}

function source(value: unknown): AudioMasterySourceBinding {
  const row = record(value);
  const result: AudioMasterySourceBinding = {
    assetId: id(row.assetId, "source.assetId"),
    provider: row.provider === "local" || row.provider === "gcs" ? row.provider : invalid("source.provider"),
    locator: text(row.locator, "source.locator"),
    generation: text(row.generation, "source.generation"),
    sha256: text(row.sha256, "source.sha256"),
    sizeBytes: integer(row.sizeBytes, "source.sizeBytes"),
    contentType: text(row.contentType, "source.contentType"),
  };
  if (!SHA256.test(result.sha256) || result.generation.length > 300 || result.locator.length > 4_096 || (result.provider === "local" && !result.locator.startsWith("/"))) invalid("source binding");
  return result;
}

function sameSource(left: AudioMasterySourceBinding, right: AudioMasterySourceBinding) {
  return left.assetId === right.assetId && left.provider === right.provider && left.locator === right.locator && left.generation === right.generation && left.sha256 === right.sha256 && left.sizeBytes === right.sizeBytes && left.contentType === right.contentType;
}
function record(value: unknown): Record<string, unknown> { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
function array(value: unknown): unknown[] { return Array.isArray(value) ? value : invalid("array"); }
function text(value: unknown, label: string) { const result = typeof value === "string" ? value.trim() : ""; return result ? result : invalid(label); }
function id(value: unknown, label: string) { const result = text(value, label); return SAFE_ID.test(result) ? result : invalid(label); }
function iso(value: unknown, label: string) { const result = text(value, label); return Number.isFinite(Date.parse(result)) ? result : invalid(label); }
function positive(value: unknown, label: string) { const result = Number(value); return Number.isFinite(result) && result > 0 ? result : invalid(label); }
function integer(value: unknown, label: string, allowZero = false) { const result = Number(value); return Number.isSafeInteger(result) && (allowZero ? result >= 0 : result > 0) ? result : invalid(label); }
function invalid(label: string): never { throw new Error(`Invalid audio spectral evidence ${label}.`); }
