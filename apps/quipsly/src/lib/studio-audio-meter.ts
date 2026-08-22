import type {
  BrowserSourceCaptureMeterSummaryV2,
} from "@high-ground/quipsly-domain";

export const STUDIO_AUDIO_FLOOR_DBFS = -120;
export const STUDIO_AUDIO_DISPLAY_FLOOR_DBFS = -60;
export const STUDIO_AUDIO_CLIPPING_AMPLITUDE = 0.999;

export type StudioAudioSignalState =
  | "inactive"
  | "no-signal"
  | "low"
  | "ready"
  | "hot"
  | "clipping-risk";

export type StudioAudioFrameEvidence = {
  rmsDbfs: number;
  samplePeakDbfs: number;
  clippedSampleCount: number;
  sampleCount: number;
  state: Exclude<StudioAudioSignalState, "inactive">;
};

export type StudioAudioMeterEvidence = StudioAudioFrameEvidence & {
  peakHoldDbfs: number;
  clippedSampleCountSinceStart: number;
  sampleRateHz: number | null;
  channelCount: number | null;
  echoCancellation: boolean | null;
  noiseSuppression: boolean | null;
  autoGainControl: boolean | null;
};

export type BrowserMeterWorkletAggregate = {
  kind: "quipsly-capture-meter-aggregate-v1";
  sequence: number;
  renderQuantumCount: number;
  analysisChannelCount: number;
  sampleCount: number;
  sumSquares: number;
  peakAmplitude: number;
  nearFullScaleSampleCount: number;
};

function finite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function rounded(value: number) {
  return Math.round(value * 10) / 10;
}

export function amplitudeToDbfs(amplitude: number) {
  if (!finite(amplitude) || amplitude <= 0) return STUDIO_AUDIO_FLOOR_DBFS;
  return rounded(Math.max(STUDIO_AUDIO_FLOOR_DBFS, Math.min(0, 20 * Math.log10(amplitude))));
}

export function studioAudioSignalState(
  rmsDbfs: number,
  samplePeakDbfs: number,
  clippedSampleCount = 0,
): Exclude<StudioAudioSignalState, "inactive"> {
  if (clippedSampleCount > 0 || samplePeakDbfs >= -1) return "clipping-risk";
  if (samplePeakDbfs >= -3 || rmsDbfs >= -12) return "hot";
  if (rmsDbfs < -60 && samplePeakDbfs < -54) return "no-signal";
  if (rmsDbfs < -42) return "low";
  return "ready";
}

export function analyseStudioAudioFrame(
  samples: Float32Array,
  clippingAmplitude = STUDIO_AUDIO_CLIPPING_AMPLITUDE,
): StudioAudioFrameEvidence {
  let sumSquares = 0;
  let peakAmplitude = 0;
  let clippedSampleCount = 0;

  for (const rawSample of samples) {
    const sample = finite(rawSample) ? Math.max(-1, Math.min(1, rawSample)) : 0;
    const amplitude = Math.abs(sample);
    sumSquares += sample * sample;
    peakAmplitude = Math.max(peakAmplitude, amplitude);
    if (amplitude >= clippingAmplitude) clippedSampleCount += 1;
  }

  const rmsAmplitude = samples.length > 0 ? Math.sqrt(sumSquares / samples.length) : 0;
  const rmsDbfs = amplitudeToDbfs(rmsAmplitude);
  const samplePeakDbfs = amplitudeToDbfs(peakAmplitude);
  return {
    rmsDbfs,
    samplePeakDbfs,
    clippedSampleCount,
    sampleCount: samples.length,
    state: studioAudioSignalState(rmsDbfs, samplePeakDbfs, clippedSampleCount),
  };
}

export function studioAudioMeterEvidence(
  frame: StudioAudioFrameEvidence,
  input: {
    previousPeakHoldDbfs?: number | null;
    previousClippedSampleCount?: number;
    sampleRateHz?: number | null;
    channelCount?: number | null;
    echoCancellation?: boolean | null;
    noiseSuppression?: boolean | null;
    autoGainControl?: boolean | null;
  } = {},
): StudioAudioMeterEvidence {
  const previousPeak = finite(input.previousPeakHoldDbfs)
    ? input.previousPeakHoldDbfs
    : STUDIO_AUDIO_FLOOR_DBFS;
  return {
    ...frame,
    peakHoldDbfs: Math.max(previousPeak, frame.samplePeakDbfs),
    clippedSampleCountSinceStart:
      Math.max(0, input.previousClippedSampleCount ?? 0)
      + frame.clippedSampleCount,
    sampleRateHz: finite(input.sampleRateHz) && input.sampleRateHz > 0
      ? Math.round(input.sampleRateHz)
      : null,
    channelCount: finite(input.channelCount) && input.channelCount > 0
      ? Math.round(input.channelCount)
      : null,
    echoCancellation: input.echoCancellation ?? null,
    noiseSuppression: input.noiseSuppression ?? null,
    autoGainControl: input.autoGainControl ?? null,
  };
}

export function studioAudioDbfsPercent(dbfs: number) {
  if (!finite(dbfs)) return 0;
  return Math.max(0, Math.min(100,
    ((dbfs - STUDIO_AUDIO_DISPLAY_FLOOR_DBFS) / -STUDIO_AUDIO_DISPLAY_FLOOR_DBFS) * 100,
  ));
}

export function studioAudioSignalLabel(state: StudioAudioSignalState) {
  switch (state) {
    case "inactive": return "Waiting for test";
    case "no-signal": return "No useful signal";
    case "low": return "Low input";
    case "ready": return "Healthy speech range";
    case "hot": return "Hot input";
    case "clipping-risk": return "Clipping risk";
  }
}

export function studioSoundCheckGuidance(evidence: StudioAudioMeterEvidence | null) {
  switch (evidence?.state ?? "inactive") {
    case "inactive":
      return {
        tone: "neutral" as const,
        heading: "Run the selected setup first",
        detail: "Open the exact microphone, speak naturally, then record a private sample to hear the browser call path through your chosen output.",
      };
    case "no-signal":
      return {
        tone: "warning" as const,
        heading: "The selected path is not carrying useful speech",
        detail: "Check mute, interface gain, cable, and the selected input. Do not join or record until the meter follows your voice.",
      };
    case "low":
      return {
        tone: "warning" as const,
        heading: "Speech is arriving low",
        detail: "Move closer or raise interface gain modestly, then repeat the sample. Leave headroom instead of normalizing a weak call path by ear.",
      };
    case "ready":
      return {
        tone: "ready" as const,
        heading: "Level is in a healthy speech range",
        detail: "Listen for room noise, mouth noise, monitoring delay, and the correct microphone. The meter cannot certify those by itself.",
      };
    case "hot":
      return {
        tone: "warning" as const,
        heading: "Speech is running hot",
        detail: "Lower interface gain or increase mic distance slightly, then repeat the loudest line you expect to deliver.",
      };
    case "clipping-risk":
      return {
        tone: "danger" as const,
        heading: "Clipping risk—lower gain before joining",
        detail: "Near-full-scale samples were observed. Reduce gain, repeat the loudest phrase, and confirm the peak no longer reaches the danger range.",
      };
  }
}

export function studioSoundCheckPrompt(remainingSeconds: number) {
  if (!finite(remainingSeconds) || remainingSeconds > 7) return {
    heading: "Use your normal voice",
    detail: "Speak at the distance and energy you expect during the Session.",
  };
  if (remainingSeconds > 4) return {
    heading: "Try your loudest likely sentence",
    detail: "This reveals whether ordinary emphasis will run out of headroom.",
  };
  if (remainingSeconds > 2) return {
    heading: "Say: Better podcasts put people first",
    detail: "The repeated B and P sounds make plosives and close-mic technique easier to hear on playback.",
  };
  return {
    heading: "Pause and stay quiet",
    detail: "Listen back for room echo, fans, hiss, hum, or an unexpected open microphone.",
  };
}

export function createBrowserCaptureMeterSummary(input: {
  startedAt: string;
  sampleRateHz: number;
  sourceChannelCount: number | null;
  measurement?: BrowserSourceCaptureMeterSummaryV2["measurement"];
}): BrowserSourceCaptureMeterSummaryV2 {
  return {
    contractKind: "quipsly-browser-source-meter-v2",
    measurement: input.measurement ?? "audio-worklet-render-quantum-aggregate",
    coverage: "realtime-observation-not-complete-decode",
    startedAt: input.startedAt,
    stoppedAt: input.startedAt,
    sampleRateHz: Math.max(1, Math.round(input.sampleRateHz)),
    sourceChannelCount: input.sourceChannelCount === null
      ? null
      : Math.max(1, Math.round(input.sourceChannelCount)),
    analysisChannelCount: 0,
    observedBlockCount: 0,
    observedSampleCount: 0,
    meterMessageCount: 0,
    missingMessageCount: 0,
    tailAggregateFlushed: input.measurement === "analyser-animation-frame-fallback",
    highestObservedRmsDbfs: STUDIO_AUDIO_FLOOR_DBFS,
    samplePeakDbfs: STUDIO_AUDIO_FLOOR_DBFS,
    nearFullScaleSampleCount: 0,
    completeDecodePerformed: false,
    integratedLoudnessMeasured: false,
    truePeakMeasured: false,
  };
}

export function parseBrowserMeterWorkletAggregate(
  value: unknown,
): BrowserMeterWorkletAggregate | null {
  if (!value || typeof value !== "object") return null;
  const packet = value as Record<string, unknown>;
  if (packet.kind !== "quipsly-capture-meter-aggregate-v1") return null;
  const integerFields = [
    "sequence",
    "renderQuantumCount",
    "analysisChannelCount",
    "sampleCount",
    "nearFullScaleSampleCount",
  ] as const;
  if (integerFields.some((key) => (
    !finite(packet[key]) || !Number.isSafeInteger(packet[key]) || packet[key] < 0
  ))) return null;
  if (
    !finite(packet.sumSquares) || packet.sumSquares < 0
    || !finite(packet.peakAmplitude) || packet.peakAmplitude < 0 || packet.peakAmplitude > 1
  ) return null;
  return packet as BrowserMeterWorkletAggregate;
}

export function appendBrowserCaptureMeterAggregate(
  summary: BrowserSourceCaptureMeterSummaryV2,
  aggregate: BrowserMeterWorkletAggregate,
  observedAt: string,
  previousSequence: number | null,
): BrowserSourceCaptureMeterSummaryV2 {
  const rmsAmplitude = aggregate.sampleCount > 0
    ? Math.sqrt(aggregate.sumSquares / aggregate.sampleCount)
    : 0;
  const missingMessageCount = previousSequence === null
    ? Math.max(0, aggregate.sequence)
    : Math.max(0, aggregate.sequence - previousSequence - 1);
  return {
    ...summary,
    stoppedAt: observedAt,
    analysisChannelCount: Math.max(summary.analysisChannelCount, aggregate.analysisChannelCount),
    observedBlockCount: summary.observedBlockCount + aggregate.renderQuantumCount,
    observedSampleCount: summary.observedSampleCount + aggregate.sampleCount,
    meterMessageCount: summary.meterMessageCount + 1,
    missingMessageCount: summary.missingMessageCount + missingMessageCount,
    highestObservedRmsDbfs: Math.max(summary.highestObservedRmsDbfs, amplitudeToDbfs(rmsAmplitude)),
    samplePeakDbfs: Math.max(summary.samplePeakDbfs, amplitudeToDbfs(aggregate.peakAmplitude)),
    nearFullScaleSampleCount: summary.nearFullScaleSampleCount + aggregate.nearFullScaleSampleCount,
  };
}

export function appendBrowserCaptureMeterFrame(
  summary: BrowserSourceCaptureMeterSummaryV2,
  frame: StudioAudioFrameEvidence,
  observedAt: string,
): BrowserSourceCaptureMeterSummaryV2 {
  return {
    ...summary,
    stoppedAt: observedAt,
    analysisChannelCount: Math.max(summary.analysisChannelCount, 1),
    observedBlockCount: summary.observedBlockCount + 1,
    observedSampleCount: summary.observedSampleCount + frame.sampleCount,
    meterMessageCount: summary.meterMessageCount + 1,
    highestObservedRmsDbfs: Math.max(
      summary.highestObservedRmsDbfs,
      frame.rmsDbfs,
    ),
    samplePeakDbfs: Math.max(
      summary.samplePeakDbfs,
      frame.samplePeakDbfs,
    ),
    nearFullScaleSampleCount:
      summary.nearFullScaleSampleCount + frame.clippedSampleCount,
  };
}

export function finishBrowserCaptureMeterSummary(
  summary: BrowserSourceCaptureMeterSummaryV2 | null,
  stoppedAt: string,
) {
  return summary ? { ...summary, stoppedAt } : null;
}
