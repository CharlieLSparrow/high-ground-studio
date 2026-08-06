import type { AudioPairCorrelationMeasurement } from "@high-ground/quipsly-media-processing";

const SAMPLE_RATE = 16_000 as const;
const FRAME_DURATION_MILLISECONDS = 10 as const;
const FRAME_SAMPLES = 160;
const MAXIMUM_LAG_FRAMES = 200;
const ACTIVE_RMS_DBFS = -60;

export type AudioPairCorrelationAnalysis = {
  measurement: AudioPairCorrelationMeasurement;
  segments: Array<{ startSeconds: number; endSeconds: number; measurement: AudioPairCorrelationMeasurement }>;
};

/**
 * Measures bounded pair similarity after both sources have been decoded to the
 * exact same 16 kHz mono program-clock range. Positive lag means the observed
 * source follows the reference. This reports signal relationships only; role
 * context and protected playback are required before naming bleed or echo.
 */
export function analyzeAudioPairCorrelation(reference: Float32Array, observation: Float32Array): AudioPairCorrelationAnalysis {
  if (reference.length !== observation.length) throw new Error("Audio pair correlation inputs must have identical decoded lengths.");
  if (reference.length < SAMPLE_RATE / 2 || reference.length > SAMPLE_RATE * 30) throw new Error("Audio pair correlation inputs must cover 0.5 to 30 seconds.");
  assertFinite(reference, "reference");
  assertFinite(observation, "observation");
  const measurement = measure(reference, observation);
  const segmentSamples = SAMPLE_RATE * 10;
  const segments = Array.from({ length: Math.ceil(reference.length / segmentSamples) }, (_, index) => {
    const start = index * segmentSamples;
    const end = Math.min(reference.length, start + segmentSamples);
    return {
      startSeconds: start / SAMPLE_RATE,
      endSeconds: end / SAMPLE_RATE,
      measurement: measure(reference.subarray(start, end), observation.subarray(start, end)),
    };
  });
  return { measurement, segments };
}

function measure(reference: Float32Array, observation: Float32Array): AudioPairCorrelationMeasurement {
  const referencePower = powerFrames(reference);
  const observationPower = powerFrames(observation);
  const zeroLagPowerCorrelation = pearsonAtLag(referencePower, observationPower, 0);
  const candidates: Array<{ lagFrames: number; correlation: number }> = [];
  for (let lagFrames = -MAXIMUM_LAG_FRAMES; lagFrames <= MAXIMUM_LAG_FRAMES; lagFrames += 1) {
    if (Math.min(referencePower.length, observationPower.length) - Math.abs(lagFrames) < Math.max(20, Math.floor(referencePower.length / 2))) continue;
    candidates.push({ lagFrames, correlation: pearsonAtLag(referencePower, observationPower, lagFrames) });
  }
  const best = candidates.reduce((winner, candidate) => Math.abs(candidate.correlation) > Math.abs(winner.correlation) ? candidate : winner, candidates[0] ?? { lagFrames: 0, correlation: 0 });
  const competing = candidates
    .filter((candidate) => Math.abs(candidate.lagFrames - best.lagFrames) > 5)
    .map((candidate) => Math.abs(candidate.correlation))
    .sort((left, right) => left - right);
  const competingP95 = percentile(competing, 0.95);
  const peakProminence = rounded(clamp(Math.abs(best.correlation) - competingP95, 0, 1));
  const referenceRms = rms(reference);
  const observationRms = rms(observation);
  const activeFrameCount = referencePower.reduce((count, power, index) => count + (Math.max(amplitudeDbfs(Math.sqrt(power)), amplitudeDbfs(Math.sqrt(observationPower[index] ?? 0))) >= ACTIVE_RMS_DBFS ? 1 : 0), 0);
  const variationReliability = Math.min(1, Math.max(coefficientOfVariation(referencePower), coefficientOfVariation(observationPower)) / 0.5);
  const activeReliability = Math.min(1, activeFrameCount / Math.max(20, referencePower.length * 0.2));
  const durationReliability = Math.min(1, referencePower.length / 100);
  const reliability = rounded(clamp(variationReliability * activeReliability * durationReliability, 0, 1));
  const lagSamples = best.lagFrames * FRAME_SAMPLES;
  return {
    analyzedDurationSeconds: rounded(reference.length / SAMPLE_RATE),
    sampleRate: SAMPLE_RATE,
    frameDurationMilliseconds: FRAME_DURATION_MILLISECONDS,
    comparedFrameCount: referencePower.length,
    activeFrameCount,
    zeroLagPowerCorrelation: rounded(zeroLagPowerCorrelation),
    peakPowerCorrelation: rounded(best.correlation),
    peakAbsolutePowerCorrelation: rounded(Math.abs(best.correlation)),
    bestLagMilliseconds: best.lagFrames * FRAME_DURATION_MILLISECONDS,
    peakProminence,
    waveformCorrelationAtBestLag: rounded(waveformPearson(reference, observation, lagSamples)),
    referenceRmsDbfs: amplitudeDbfs(referenceRms),
    observationRmsDbfs: amplitudeDbfs(observationRms),
    observationToReferenceLevelDb: rounded(amplitudeDbfs(observationRms) - amplitudeDbfs(referenceRms)),
    reliability,
  };
}

function powerFrames(samples: Float32Array) {
  const frames: number[] = [];
  for (let start = 0; start < samples.length; start += FRAME_SAMPLES) {
    const end = Math.min(samples.length, start + FRAME_SAMPLES);
    let sumSquares = 0;
    for (let index = start; index < end; index += 1) sumSquares += samples[index] * samples[index];
    frames.push(sumSquares / Math.max(1, end - start));
  }
  return frames;
}

function pearsonAtLag(reference: number[], observation: number[], lagFrames: number) {
  const referenceStart = Math.max(0, -lagFrames);
  const observationStart = Math.max(0, lagFrames);
  const count = Math.min(reference.length - referenceStart, observation.length - observationStart);
  if (count < 3) return 0;
  return pearson(count, (index) => reference[referenceStart + index], (index) => observation[observationStart + index]);
}

function waveformPearson(reference: Float32Array, observation: Float32Array, lagSamples: number) {
  const referenceStart = Math.max(0, -lagSamples);
  const observationStart = Math.max(0, lagSamples);
  const count = Math.min(reference.length - referenceStart, observation.length - observationStart);
  if (count < FRAME_SAMPLES) return 0;
  return pearson(count, (index) => reference[referenceStart + index], (index) => observation[observationStart + index]);
}

function pearson(count: number, left: (index: number) => number, right: (index: number) => number) {
  let leftSum = 0;
  let rightSum = 0;
  for (let index = 0; index < count; index += 1) { leftSum += left(index); rightSum += right(index); }
  const leftMean = leftSum / count;
  const rightMean = rightSum / count;
  let covariance = 0;
  let leftVariance = 0;
  let rightVariance = 0;
  for (let index = 0; index < count; index += 1) {
    const leftCentered = left(index) - leftMean;
    const rightCentered = right(index) - rightMean;
    covariance += leftCentered * rightCentered;
    leftVariance += leftCentered * leftCentered;
    rightVariance += rightCentered * rightCentered;
  }
  const denominator = Math.sqrt(leftVariance * rightVariance);
  return denominator > 1e-20 ? clamp(covariance / denominator, -1, 1) : 0;
}

function rms(samples: Float32Array) { let sumSquares = 0; for (const sample of samples) sumSquares += sample * sample; return Math.sqrt(sumSquares / samples.length); }
function coefficientOfVariation(values: number[]) { const mean = values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length); if (mean <= 1e-20) return 0; const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / Math.max(1, values.length); return Math.sqrt(variance) / mean; }
function amplitudeDbfs(amplitude: number) { return rounded(20 * Math.log10(Math.max(amplitude, 1e-12))); }
function percentile(values: number[], fraction: number) { if (!values.length) return 0; return values[Math.min(values.length - 1, Math.max(0, Math.round((values.length - 1) * fraction)))]; }
function rounded(value: number) { return Number(value.toFixed(6)); }
function clamp(value: number, minimum: number, maximum: number) { return Math.max(minimum, Math.min(maximum, value)); }
function assertFinite(samples: Float32Array, label: string) { for (const sample of samples) if (!Number.isFinite(sample)) throw new Error(`Audio pair ${label} input contains a non-finite sample.`); }
