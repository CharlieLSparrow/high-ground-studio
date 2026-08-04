import {
  amplitudeToDbfs,
  audioInputHealthCopy,
  dbfsToMeterHeight,
  formatDbfs,
  measureAudioFrame,
  summarizeAudioInputFrames,
} from "./audio-input-preflight";

function constantSamples(value: number, count = 4_800) {
  return new Float32Array(count).fill(value);
}

describe("recorder audio input preflight", () => {
  it("distinguishes exact digital zero from an armed microphone", () => {
    const summary = summarizeAudioInputFrames([measureAudioFrame(constantSamples(0))], 1_200);

    expect(summary.status).toBe("digital-silence");
    expect(summary.nonZeroSampleCount).toBe(0);
    expect(summary.peakDbfs).toBe(Number.NEGATIVE_INFINITY);
    expect(formatDbfs(summary.peakDbfs)).toBe("−∞ dBFS");
    expect(audioInputHealthCopy(summary.status).detail).toMatch(/every measured sample is exactly zero/i);
  });

  it("does not claim to be listening before the browser returns a media stream", () => {
    expect(audioInputHealthCopy("requesting-access")).toEqual({
      label: "Waiting for browser",
      detail: expect.stringMatching(/has not received a media stream yet/i),
    });
  });

  it("reports measurable but production-risk quiet input", () => {
    const summary = summarizeAudioInputFrames([measureAudioFrame(constantSamples(0.0005))], 1_200);

    expect(summary.status).toBe("too-quiet");
    expect(summary.peakDbfs).toBeCloseTo(-66.02, 1);
    expect(summary.nonZeroSampleCount).toBeGreaterThan(0);
  });

  it("accepts a healthy spoken-level signal", () => {
    const summary = summarizeAudioInputFrames([measureAudioFrame(constantSamples(0.1))], 1_200);

    expect(summary.status).toBe("healthy");
    expect(summary.peakDbfs).toBeCloseTo(-20, 4);
    expect(summary.rmsDbfs).toBeCloseTo(-20, 4);
  });

  it("identifies near-full-scale samples as a clipping risk", () => {
    const summary = summarizeAudioInputFrames([measureAudioFrame(constantSamples(0.95))], 1_200);

    expect(summary.status).toBe("clipping-risk");
    expect(summary.clippedSampleCount).toBe(0);
    expect(summary.peakDbfs).toBeGreaterThan(-1);
  });

  it("combines frame energy by sample count instead of averaging dB values", () => {
    const summary = summarizeAudioInputFrames([
      measureAudioFrame(constantSamples(0.1, 100)),
      measureAudioFrame(constantSamples(0.2, 300)),
    ], 1_200);

    expect(summary.rmsAmplitude).toBeCloseTo(Math.sqrt(0.0325), 6);
    expect(summary.sampleCount).toBe(400);
    expect(summary.frameCount).toBe(2);
  });

  it("renders digital zero at zero height instead of faking a visible meter", () => {
    expect(amplitudeToDbfs(0)).toBe(Number.NEGATIVE_INFINITY);
    expect(dbfsToMeterHeight(Number.NEGATIVE_INFINITY)).toBe(0);
    expect(dbfsToMeterHeight(-72)).toBe(0);
    expect(dbfsToMeterHeight(0)).toBe(44);
  });
});
