export type AudioInputHealth =
  | "idle"
  | "requesting-access"
  | "checking"
  | "digital-silence"
  | "too-quiet"
  | "healthy"
  | "clipping-risk";

export type AudioFrameMeasurement = {
  sampleCount: number;
  nonZeroSampleCount: number;
  sumSquares: number;
  peakAmplitude: number;
  clippedSampleCount: number;
};

export type AudioInputPreflightSummary = {
  status: AudioInputHealth;
  observedMs: number;
  frameCount: number;
  sampleCount: number;
  nonZeroSampleCount: number;
  peakAmplitude: number;
  rmsAmplitude: number;
  peakDbfs: number;
  rmsDbfs: number;
  clippedSampleCount: number;
  clippedSampleFraction: number;
};

export const AUDIO_INPUT_PREFLIGHT = Object.freeze({
  minimumObservationMs: 800,
  tooQuietPeakDbfs: -48,
  tooQuietRmsDbfs: -60,
  clippingRiskPeakDbfs: -1,
  clippedAmplitude: 0.999,
  meterFloorDbfs: -72,
});

export const EMPTY_AUDIO_INPUT_SUMMARY: AudioInputPreflightSummary = Object.freeze({
  status: "idle",
  observedMs: 0,
  frameCount: 0,
  sampleCount: 0,
  nonZeroSampleCount: 0,
  peakAmplitude: 0,
  rmsAmplitude: 0,
  peakDbfs: Number.NEGATIVE_INFINITY,
  rmsDbfs: Number.NEGATIVE_INFINITY,
  clippedSampleCount: 0,
  clippedSampleFraction: 0,
});

export function amplitudeToDbfs(amplitude: number) {
  if (!Number.isFinite(amplitude) || amplitude <= 0) return Number.NEGATIVE_INFINITY;
  return 20 * Math.log10(amplitude);
}

export function measureAudioFrame(samples: Float32Array): AudioFrameMeasurement {
  let peakAmplitude = 0;
  let sumSquares = 0;
  let nonZeroSampleCount = 0;
  let clippedSampleCount = 0;

  for (const rawSample of samples) {
    const sample = Number.isFinite(rawSample) ? rawSample : 0;
    const amplitude = Math.abs(sample);
    peakAmplitude = Math.max(peakAmplitude, amplitude);
    sumSquares += sample * sample;
    if (sample !== 0) nonZeroSampleCount += 1;
    if (amplitude >= AUDIO_INPUT_PREFLIGHT.clippedAmplitude) clippedSampleCount += 1;
  }

  return {
    sampleCount: samples.length,
    nonZeroSampleCount,
    sumSquares,
    peakAmplitude,
    clippedSampleCount,
  };
}

export function summarizeAudioInputFrames(
  frames: readonly AudioFrameMeasurement[],
  observedMs: number,
): AudioInputPreflightSummary {
  const sampleCount = frames.reduce((total, frame) => total + frame.sampleCount, 0);
  const nonZeroSampleCount = frames.reduce((total, frame) => total + frame.nonZeroSampleCount, 0);
  const sumSquares = frames.reduce((total, frame) => total + frame.sumSquares, 0);
  const clippedSampleCount = frames.reduce((total, frame) => total + frame.clippedSampleCount, 0);
  const peakAmplitude = frames.reduce((maximum, frame) => Math.max(maximum, frame.peakAmplitude), 0);
  const rmsAmplitude = sampleCount > 0 ? Math.sqrt(sumSquares / sampleCount) : 0;
  const peakDbfs = amplitudeToDbfs(peakAmplitude);
  const rmsDbfs = amplitudeToDbfs(rmsAmplitude);
  const clippedSampleFraction = sampleCount > 0 ? clippedSampleCount / sampleCount : 0;

  let status: AudioInputHealth = "checking";
  if (sampleCount === 0) status = observedMs > 0 ? "digital-silence" : "idle";
  else if (observedMs < AUDIO_INPUT_PREFLIGHT.minimumObservationMs) status = "checking";
  else if (clippedSampleCount > 0 || peakDbfs >= AUDIO_INPUT_PREFLIGHT.clippingRiskPeakDbfs) status = "clipping-risk";
  else if (nonZeroSampleCount === 0) status = "digital-silence";
  else if (
    peakDbfs < AUDIO_INPUT_PREFLIGHT.tooQuietPeakDbfs
    && rmsDbfs < AUDIO_INPUT_PREFLIGHT.tooQuietRmsDbfs
  ) status = "too-quiet";
  else status = "healthy";

  return {
    status,
    observedMs: Math.max(0, observedMs),
    frameCount: frames.length,
    sampleCount,
    nonZeroSampleCount,
    peakAmplitude,
    rmsAmplitude,
    peakDbfs,
    rmsDbfs,
    clippedSampleCount,
    clippedSampleFraction,
  };
}

export function dbfsToMeterHeight(dbfs: number, maximumHeight = 44) {
  if (!Number.isFinite(dbfs)) return 0;
  const normalized = Math.max(
    0,
    Math.min(1, (dbfs - AUDIO_INPUT_PREFLIGHT.meterFloorDbfs) / Math.abs(AUDIO_INPUT_PREFLIGHT.meterFloorDbfs)),
  );
  return normalized * maximumHeight;
}

export function formatDbfs(value: number) {
  return Number.isFinite(value) ? `${value.toFixed(1)} dBFS` : "−∞ dBFS";
}

export function audioInputHealthCopy(status: AudioInputHealth) {
  if (status === "requesting-access") return {
    label: "Waiting for browser",
    detail: "Quipsly has requested the selected input but has not received a media stream yet. Approve browser access or check the site permission.",
  };
  if (status === "checking") return {
    label: "Listening",
    detail: "Speak at normal episode level while Quipsly measures the selected input.",
  };
  if (status === "digital-silence") return {
    label: "Digital silence",
    detail: "The device is connected but every measured sample is exactly zero. Check interface or virtual-mixer routing.",
  };
  if (status === "too-quiet") return {
    label: "Input too quiet",
    detail: "Signal exists, but the observed level is too low for a confident production recording.",
  };
  if (status === "clipping-risk") return {
    label: "Clipping risk",
    detail: "The input reached within 1 dB of digital full scale or produced clipped samples. Lower input gain.",
  };
  if (status === "healthy") return {
    label: "Signal verified",
    detail: "Measurable signal is reaching this browser. Keep watching the meter during the take.",
  };
  return {
    label: "Not checked",
    detail: "Arm the microphone and speak to verify the complete input path before recording.",
  };
}
