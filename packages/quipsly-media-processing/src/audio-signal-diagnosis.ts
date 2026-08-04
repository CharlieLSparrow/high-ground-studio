import type { AudioMasterySourceBinding } from "./audio-mastery.js";

export const AUDIO_SIGNAL_DIAGNOSIS_KIND = "quipsly-audio-signal-diagnosis-v1" as const;
export const AUDIO_SIGNAL_DIAGNOSIS_VERSION = 1 as const;

export type AudioSignalChannelStatistics = {
  channel: number | null;
  dcOffset: number;
  peakDbfs: number;
  rmsDbfs: number;
  rmsPeakDbfs: number | null;
  rmsTroughDbfs: number | null;
  crestFactor: number | null;
  flatFactor: number | null;
  peakCount: number | null;
  noiseFloorDbfs: number | null;
  dynamicRangeDb: number | null;
  zeroCrossingRate: number | null;
  nanCount: number;
  infCount: number;
  denormalCount: number;
};

export type AudioSignalObservation = {
  kind: "near-full-scale" | "near-silence" | "dc-offset" | "channel-imbalance" | "invalid-samples";
  severity: "attention" | "warning";
  startSeconds: number;
  endSeconds: number;
  detail: string;
  requiresListening: true;
  evidence: Record<string, number>;
};

export type AudioSignalDiagnosis = {
  kind: typeof AUDIO_SIGNAL_DIAGNOSIS_KIND;
  version: typeof AUDIO_SIGNAL_DIAGNOSIS_VERSION;
  diagnosisId: string;
  analyzedAt: string;
  source: AudioMasterySourceBinding;
  durationSeconds: number;
  sampleRateHz: number;
  channelCount: number;
  overall: AudioSignalChannelStatistics;
  channels: AudioSignalChannelStatistics[];
  nearSilenceSpans: Array<{
    startSeconds: number;
    endSeconds: number;
    durationSeconds: number;
  }>;
  observations: AudioSignalObservation[];
  thresholds: {
    nearFullScaleDbfs: -0.05;
    nearSilenceDbfs: -55;
    nearSilenceMinimumSeconds: 0.25;
    dcOffsetAmplitude: 0.01;
    channelImbalanceDb: 6;
  };
  analyzer: {
    name: "ffmpeg-astats-silencedetect";
    version: string;
    completeDecode: true;
    statisticsAreNotListeningJudgments: true;
    nearSilenceIsNotAutomaticallyADropout: true;
    noiseFloorIsAnEstimate: true;
  };
};

const SHA256 = /^[0-9a-f]{64}$/;
const SAFE_ID = /^[A-Za-z0-9_-]{8,160}$/;

export function parseAudioSignalDiagnosis(value: unknown): AudioSignalDiagnosis {
  const row = record(value);
  const source = parseSource(row.source);
  const thresholds = record(row.thresholds);
  const analyzer = record(row.analyzer);
  const durationSeconds = positive(row.durationSeconds, "durationSeconds");
  const channelCount = positiveInteger(row.channelCount, "channelCount");
  const channels = Array.isArray(row.channels) ? row.channels.map(parseStatistics) : [];
  const overall = parseStatistics(row.overall);
  const nearSilenceSpans = Array.isArray(row.nearSilenceSpans)
    ? row.nearSilenceSpans.map((entry) => {
      const span = record(entry);
      const startSeconds = nonNegative(span.startSeconds, "nearSilenceSpans.startSeconds");
      const endSeconds = nonNegative(span.endSeconds, "nearSilenceSpans.endSeconds");
      const spanDuration = positive(span.durationSeconds, "nearSilenceSpans.durationSeconds");
      if (endSeconds < startSeconds || Math.abs((endSeconds - startSeconds) - spanDuration) > 0.05 || endSeconds > durationSeconds + 0.05) {
        throw new Error("Audio signal near-silence span is outside the decoded source duration.");
      }
      return { startSeconds, endSeconds, durationSeconds: spanDuration };
    })
    : [];
  const observations = Array.isArray(row.observations) ? row.observations.map((entry) => parseObservation(entry, durationSeconds)) : [];
  const diagnosis: AudioSignalDiagnosis = {
    kind: row.kind === AUDIO_SIGNAL_DIAGNOSIS_KIND ? row.kind : invalid("kind"),
    version: row.version === AUDIO_SIGNAL_DIAGNOSIS_VERSION ? row.version : invalid("version"),
    diagnosisId: requiredId(row.diagnosisId, "diagnosisId"),
    analyzedAt: isoDate(row.analyzedAt, "analyzedAt"),
    source,
    durationSeconds,
    sampleRateHz: positiveInteger(row.sampleRateHz, "sampleRateHz"),
    channelCount,
    overall,
    channels,
    nearSilenceSpans,
    observations,
    thresholds: {
      nearFullScaleDbfs: thresholds.nearFullScaleDbfs === -0.05 ? -0.05 : invalid("thresholds.nearFullScaleDbfs"),
      nearSilenceDbfs: thresholds.nearSilenceDbfs === -55 ? -55 : invalid("thresholds.nearSilenceDbfs"),
      nearSilenceMinimumSeconds: thresholds.nearSilenceMinimumSeconds === 0.25 ? 0.25 : invalid("thresholds.nearSilenceMinimumSeconds"),
      dcOffsetAmplitude: thresholds.dcOffsetAmplitude === 0.01 ? 0.01 : invalid("thresholds.dcOffsetAmplitude"),
      channelImbalanceDb: thresholds.channelImbalanceDb === 6 ? 6 : invalid("thresholds.channelImbalanceDb"),
    },
    analyzer: {
      name: analyzer.name === "ffmpeg-astats-silencedetect" ? analyzer.name : invalid("analyzer.name"),
      version: requiredText(analyzer.version, "analyzer.version"),
      completeDecode: analyzer.completeDecode === true ? true : invalid("analyzer.completeDecode"),
      statisticsAreNotListeningJudgments: analyzer.statisticsAreNotListeningJudgments === true ? true : invalid("analyzer.statisticsAreNotListeningJudgments"),
      nearSilenceIsNotAutomaticallyADropout: analyzer.nearSilenceIsNotAutomaticallyADropout === true ? true : invalid("analyzer.nearSilenceIsNotAutomaticallyADropout"),
      noiseFloorIsAnEstimate: analyzer.noiseFloorIsAnEstimate === true ? true : invalid("analyzer.noiseFloorIsAnEstimate"),
    },
  };
  if (
    overall.channel !== null
    || channels.length !== channelCount
    || channels.some((channel, index) => channel.channel !== index + 1)
    || nearSilenceSpans.length > 2_000
    || observations.length > 2_000
  ) {
    throw new Error("Audio signal diagnosis channel or evidence cardinality is invalid.");
  }
  return diagnosis;
}

export function buildAudioSignalObservations(input: {
  durationSeconds: number;
  overall: AudioSignalChannelStatistics;
  channels: AudioSignalChannelStatistics[];
  nearSilenceSpans: AudioSignalDiagnosis["nearSilenceSpans"];
}): AudioSignalObservation[] {
  const observations: AudioSignalObservation[] = [];
  if (input.overall.peakDbfs >= -0.05) {
    observations.push({
      kind: "near-full-scale",
      severity: "warning",
      startSeconds: 0,
      endSeconds: input.durationSeconds,
      detail: "The complete decode reaches near full scale. This is a clipping-risk candidate, not proof that the waveform was clipped.",
      requiresListening: true,
      evidence: { peakDbfs: input.overall.peakDbfs, thresholdDbfs: -0.05 },
    });
  }
  for (const channel of input.channels) {
    if (Math.abs(channel.dcOffset) >= 0.01) {
      observations.push({
        kind: "dc-offset",
        severity: "attention",
        startSeconds: 0,
        endSeconds: input.durationSeconds,
        detail: `Channel ${channel.channel} has a measurable DC offset. Listen and inspect before applying a corrective filter.`,
        requiresListening: true,
        evidence: { channel: channel.channel as number, dcOffset: channel.dcOffset, thresholdAmplitude: 0.01 },
      });
    }
  }
  if (input.channels.length >= 2) {
    const rmsValues = input.channels.map((channel) => channel.rmsDbfs);
    const imbalanceDb = Math.max(...rmsValues) - Math.min(...rmsValues);
    if (imbalanceDb >= 6) {
      observations.push({
        kind: "channel-imbalance",
        severity: "attention",
        startSeconds: 0,
        endSeconds: input.durationSeconds,
        detail: "The decoded channels differ substantially in average level. Intentional stereo and faulty channel balance must be distinguished by listening.",
        requiresListening: true,
        evidence: { imbalanceDb, thresholdDb: 6 },
      });
    }
  }
  const invalidSampleCount = input.channels.reduce((sum, channel) => sum + channel.nanCount + channel.infCount, 0);
  if (invalidSampleCount > 0) {
    observations.push({
      kind: "invalid-samples",
      severity: "warning",
      startSeconds: 0,
      endSeconds: input.durationSeconds,
      detail: "The decoder reported non-finite samples. The source should not enter automatic mastering until it is repaired or replaced.",
      requiresListening: true,
      evidence: { invalidSampleCount },
    });
  }
  for (const span of input.nearSilenceSpans) {
    observations.push({
      kind: "near-silence",
      severity: "attention",
      startSeconds: span.startSeconds,
      endSeconds: span.endSeconds,
      detail: "This interval stayed below -55 dBFS for at least 250 ms. It may be intentional room tone, a pause, or a dropout; listen before editing it.",
      requiresListening: true,
      evidence: { durationSeconds: span.durationSeconds, thresholdDbfs: -55 },
    });
  }
  return observations.slice(0, 2_000);
}

function parseStatistics(value: unknown): AudioSignalChannelStatistics {
  const row = record(value);
  const channel = row.channel === null ? null : positiveInteger(row.channel, "statistics.channel");
  return {
    channel,
    dcOffset: finite(row.dcOffset, "statistics.dcOffset"),
    peakDbfs: finite(row.peakDbfs, "statistics.peakDbfs"),
    rmsDbfs: finite(row.rmsDbfs, "statistics.rmsDbfs"),
    rmsPeakDbfs: finiteOrNull(row.rmsPeakDbfs, "statistics.rmsPeakDbfs"),
    rmsTroughDbfs: finiteOrNull(row.rmsTroughDbfs, "statistics.rmsTroughDbfs"),
    crestFactor: nonNegativeOrNull(row.crestFactor, "statistics.crestFactor"),
    flatFactor: nonNegativeOrNull(row.flatFactor, "statistics.flatFactor"),
    peakCount: nonNegativeOrNull(row.peakCount, "statistics.peakCount"),
    noiseFloorDbfs: finiteOrNull(row.noiseFloorDbfs, "statistics.noiseFloorDbfs"),
    dynamicRangeDb: nonNegativeOrNull(row.dynamicRangeDb, "statistics.dynamicRangeDb"),
    zeroCrossingRate: nonNegativeOrNull(row.zeroCrossingRate, "statistics.zeroCrossingRate"),
    nanCount: nonNegativeInteger(row.nanCount, "statistics.nanCount"),
    infCount: nonNegativeInteger(row.infCount, "statistics.infCount"),
    denormalCount: nonNegativeInteger(row.denormalCount, "statistics.denormalCount"),
  };
}

function parseObservation(value: unknown, durationSeconds: number): AudioSignalObservation {
  const row = record(value);
  const kinds = ["near-full-scale", "near-silence", "dc-offset", "channel-imbalance", "invalid-samples"] as const;
  const kind = kinds.includes(row.kind as typeof kinds[number]) ? row.kind as typeof kinds[number] : invalid("observation.kind");
  const startSeconds = nonNegative(row.startSeconds, "observation.startSeconds");
  const endSeconds = nonNegative(row.endSeconds, "observation.endSeconds");
  const evidence = Object.fromEntries(Object.entries(record(row.evidence)).map(([key, entry]) => [key, finite(entry, `observation.evidence.${key}`)]));
  if (endSeconds < startSeconds || endSeconds > durationSeconds + 0.05 || row.requiresListening !== true) {
    throw new Error("Audio signal observation is outside the decoded source boundary.");
  }
  return {
    kind,
    severity: row.severity === "warning" ? "warning" : row.severity === "attention" ? "attention" : invalid("observation.severity"),
    startSeconds,
    endSeconds,
    detail: requiredText(row.detail, "observation.detail"),
    requiresListening: true,
    evidence,
  };
}

function parseSource(value: unknown): AudioMasterySourceBinding {
  const row = record(value);
  const sha256 = requiredText(row.sha256, "source.sha256");
  if (!SHA256.test(sha256)) throw new Error("Audio signal source SHA-256 is invalid.");
  return {
    assetId: requiredId(row.assetId, "source.assetId"),
    provider: row.provider === "local" || row.provider === "gcs" ? row.provider : invalid("source.provider"),
    locator: requiredText(row.locator, "source.locator"),
    generation: requiredText(row.generation, "source.generation"),
    sha256,
    sizeBytes: positiveInteger(row.sizeBytes, "source.sizeBytes"),
    contentType: requiredText(row.contentType, "source.contentType"),
  };
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function requiredText(value: unknown, field: string) {
  const result = typeof value === "string" ? value.trim() : "";
  if (!result) throw new Error(`Audio signal ${field} is required.`);
  return result;
}

function requiredId(value: unknown, field: string) {
  const result = requiredText(value, field);
  if (!SAFE_ID.test(result)) throw new Error(`Audio signal ${field} is invalid.`);
  return result;
}

function isoDate(value: unknown, field: string) {
  const result = requiredText(value, field);
  if (!Number.isFinite(Date.parse(result))) throw new Error(`Audio signal ${field} is invalid.`);
  return result;
}

function finite(value: unknown, field: string) {
  const result = Number(value);
  if (!Number.isFinite(result)) throw new Error(`Audio signal ${field} must be finite.`);
  return result;
}

function finiteOrNull(value: unknown, field: string) {
  return value === null ? null : finite(value, field);
}

function positive(value: unknown, field: string) {
  const result = finite(value, field);
  if (result <= 0) throw new Error(`Audio signal ${field} must be positive.`);
  return result;
}

function nonNegative(value: unknown, field: string) {
  const result = finite(value, field);
  if (result < 0) throw new Error(`Audio signal ${field} must be non-negative.`);
  return result;
}

function positiveInteger(value: unknown, field: string) {
  const result = finite(value, field);
  if (!Number.isSafeInteger(result) || result <= 0) throw new Error(`Audio signal ${field} must be a positive integer.`);
  return result;
}

function nonNegativeInteger(value: unknown, field: string) {
  const result = finite(value, field);
  if (!Number.isSafeInteger(result) || result < 0) throw new Error(`Audio signal ${field} must be a non-negative integer.`);
  return result;
}

function nonNegativeOrNull(value: unknown, field: string) {
  if (value === null) return null;
  const result = finite(value, field);
  if (result < 0) throw new Error(`Audio signal ${field} must be non-negative.`);
  return result;
}

function invalid(field: string): never {
  throw new Error(`Audio signal ${field} is invalid.`);
}
