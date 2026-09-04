import {
  AUDIO_LOUDNESS_PROFILE_ALGORITHM,
  parseAudioLoudnessProfile,
  type AudioLoudnessProfile,
} from "@high-ground/quipsly-media-processing";

type FilterHistory = { v1: number; v2: number; v3: number; v4: number };

/**
 * Complete-decode ITU-R BS.1770-5 programme loudness for the mono and stereo
 * layouts Quipsly currently records. This intentionally measures neither true
 * peak nor a mastering target.
 */
export class Bs1770LoudnessAnalyzer {
  private readonly sampleRate: number;
  private readonly channelCount: number;
  private readonly supported: boolean;
  private readonly blockFrameCount: number;
  private readonly stepFrameCount: number;
  private readonly numerator: number[];
  private readonly denominator: number[];
  private readonly histories: FilterHistory[];
  private readonly energyRing: Float64Array;
  private energyRingIndex = 0;
  private energyRingCount = 0;
  private energyRingSum = 0;
  private analyzedFrameCount = 0;
  private readonly blockEnergies: number[] = [];

  constructor(sampleRate: number, channelCount: number) {
    if (!Number.isSafeInteger(sampleRate) || sampleRate < 16 || sampleRate > 768_000) {
      throw new Error("BS.1770 analysis requires a valid decoded sample rate.");
    }
    if (!Number.isSafeInteger(channelCount) || channelCount < 1) {
      throw new Error("BS.1770 analysis requires a valid decoded channel count.");
    }
    this.sampleRate = sampleRate;
    this.channelCount = channelCount;
    this.supported = channelCount === 1 || channelCount === 2;
    this.blockFrameCount = Math.max(1, Math.round(sampleRate * 0.4));
    this.stepFrameCount = Math.max(1, Math.round(sampleRate * 0.1));

    let f0 = 1_681.974450955533;
    let quality = 0.7071752369554196;
    const gain = 3.999843853973347;
    let k = Math.tan(Math.PI * f0 / sampleRate);
    const highGain = 10 ** (gain / 20);
    const bandGain = highGain ** 0.4996667741545416;
    const shelfA0 = 1 + k / quality + k * k;
    const shelfB = [
      (highGain + bandGain * k / quality + k * k) / shelfA0,
      2 * (k * k - highGain) / shelfA0,
      (highGain - bandGain * k / quality + k * k) / shelfA0,
    ];
    const shelfA = [
      1,
      2 * (k * k - 1) / shelfA0,
      (1 - k / quality + k * k) / shelfA0,
    ];

    f0 = 38.13547087602444;
    quality = 0.5003270373238773;
    k = Math.tan(Math.PI * f0 / sampleRate);
    const highPassA0 = 1 + k / quality + k * k;
    const highPassB = [1, -2, 1];
    const highPassA = [
      1,
      2 * (k * k - 1) / highPassA0,
      (1 - k / quality + k * k) / highPassA0,
    ];
    this.numerator = convolve(shelfB, highPassB);
    this.denominator = convolve(shelfA, highPassA);
    this.histories = Array.from({ length: channelCount }, () => ({ v1: 0, v2: 0, v3: 0, v4: 0 }));
    this.energyRing = new Float64Array(this.blockFrameCount);
  }

  consumeInterleavedFloat32(data: Buffer, completeBytes = data.length): void {
    const frameBytes = this.channelCount * 4;
    if (completeBytes < 0 || completeBytes > data.length || completeBytes % frameBytes !== 0) {
      throw new Error("BS.1770 input must contain complete interleaved float frames.");
    }
    if (!this.supported) {
      this.analyzedFrameCount += completeBytes / frameBytes;
      return;
    }
    for (let offset = 0; offset < completeBytes; offset += frameBytes) {
      let frameEnergy = 0;
      for (let channel = 0; channel < this.channelCount; channel += 1) {
        const sample = data.readFloatLE(offset + channel * 4);
        if (!Number.isFinite(sample)) throw new Error("BS.1770 input contained a non-finite sample.");
        const filtered = this.filteredSample(sample, channel);
        frameEnergy += filtered * filtered;
      }
      this.appendEnergy(frameEnergy);
    }
  }

  result(): AudioLoudnessProfile {
    if (!this.supported) return this.profile("unsupported-channel-layout", 0, 0, null, null);
    const absoluteGated = this.blockEnergies.filter((energy) => energyToLoudness(energy) >= -70);
    if (!absoluteGated.length) {
      return this.profile(this.blockEnergies.length ? "below-absolute-gate" : "insufficient-duration", 0, 0, null, null);
    }
    const absoluteGatedMean = absoluteGated.reduce((total, energy) => total + energy, 0) / absoluteGated.length;
    const relativeGateEnergy = absoluteGatedMean * 0.1;
    const relativeGateLufs = energyToLoudness(relativeGateEnergy);
    const relativeGated = absoluteGated.filter((energy) => energy >= relativeGateEnergy);
    if (!relativeGated.length) {
      return this.profile("below-relative-gate", absoluteGated.length, 0, relativeGateLufs, null);
    }
    const integratedEnergy = relativeGated.reduce((total, energy) => total + energy, 0) / relativeGated.length;
    return this.profile("measured", absoluteGated.length, relativeGated.length, relativeGateLufs, energyToLoudness(integratedEnergy));
  }

  private filteredSample(sample: number, channel: number): number {
    const history = this.histories[channel];
    let current = sample
      - this.denominator[1] * history.v1
      - this.denominator[2] * history.v2
      - this.denominator[3] * history.v3
      - this.denominator[4] * history.v4;
    const output = this.numerator[0] * current
      + this.numerator[1] * history.v1
      + this.numerator[2] * history.v2
      + this.numerator[3] * history.v3
      + this.numerator[4] * history.v4;
    if (Math.abs(current) < 1e-300) current = 0;
    history.v4 = history.v3;
    history.v3 = history.v2;
    history.v2 = history.v1;
    history.v1 = current;
    return output;
  }

  private appendEnergy(frameEnergy: number): void {
    if (this.energyRingCount === this.blockFrameCount) {
      this.energyRingSum -= this.energyRing[this.energyRingIndex];
    } else {
      this.energyRingCount += 1;
    }
    this.energyRing[this.energyRingIndex] = frameEnergy;
    this.energyRingSum += frameEnergy;
    this.energyRingIndex = (this.energyRingIndex + 1) % this.blockFrameCount;
    this.analyzedFrameCount += 1;
    if (this.energyRingCount !== this.blockFrameCount) return;
    const framesAfterFirstBlock = this.analyzedFrameCount - this.blockFrameCount;
    if (framesAfterFirstBlock % this.stepFrameCount !== 0) return;
    this.blockEnergies.push(Math.max(0, this.energyRingSum / this.blockFrameCount));
  }

  private profile(
    status: AudioLoudnessProfile["status"],
    absoluteGatedBlockCount: number,
    relativeGatedBlockCount: number,
    relativeGateLufs: number | null,
    integratedLoudnessLufs: number | null,
  ): AudioLoudnessProfile {
    const maximumEnergy = this.blockEnergies.reduce<number | null>(
      (maximum, energy) => maximum === null ? energy : Math.max(maximum, energy),
      null,
    );
    return parseAudioLoudnessProfile({
      schemaVersion: 1,
      algorithm: AUDIO_LOUDNESS_PROFILE_ALGORITHM,
      standard: "ITU-R BS.1770-5",
      status,
      sampleRate: this.sampleRate,
      channelCount: this.channelCount,
      analyzedFrameCount: this.analyzedFrameCount,
      measurementBlockDurationSeconds: 0.4,
      measurementBlockStepSeconds: 0.1,
      measurementBlockCount: this.blockEnergies.length,
      absoluteGatedBlockCount,
      relativeGatedBlockCount,
      absoluteGateLufs: -70,
      relativeGateLufs: relativeGateLufs === null ? null : rounded(relativeGateLufs),
      integratedLoudnessLufs: integratedLoudnessLufs === null ? null : rounded(integratedLoudnessLufs),
      // A completely digital-silent block has zero energy, whose logarithmic
      // loudness is -Infinity. The public evidence contract deliberately uses
      // null when no finite loudness exists; leaking -Infinity here makes a
      // healthy silent recording look like a retryable worker failure.
      maximumMomentaryLoudnessLufs: maximumEnergy === null || maximumEnergy <= 0
        ? null
        : rounded(energyToLoudness(maximumEnergy)),
    });
  }
}

function energyToLoudness(energy: number): number {
  return energy > 0 ? -0.691 + 10 * Math.log10(energy) : Number.NEGATIVE_INFINITY;
}

function convolve(left: number[], right: number[]): number[] {
  const result = Array.from({ length: left.length + right.length - 1 }, () => 0);
  for (let leftIndex = 0; leftIndex < left.length; leftIndex += 1) {
    for (let rightIndex = 0; rightIndex < right.length; rightIndex += 1) {
      result[leftIndex + rightIndex] += left[leftIndex] * right[rightIndex];
    }
  }
  return result;
}

function rounded(value: number): number {
  return Math.round(value * 1_000) / 1_000;
}
