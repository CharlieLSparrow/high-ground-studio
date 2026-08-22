import {
  amplitudeToDbfs,
  analyseStudioAudioFrame,
  appendBrowserCaptureMeterAggregate,
  appendBrowserCaptureMeterFrame,
  createBrowserCaptureMeterSummary,
  finishBrowserCaptureMeterSummary,
  parseBrowserMeterWorkletAggregate,
  studioAudioDbfsPercent,
  studioAudioMeterEvidence,
  studioAudioSignalState,
  studioSoundCheckGuidance,
  studioSoundCheckPrompt,
} from "./studio-audio-meter";

describe("studio audio meter evidence", () => {
  it("reports silence honestly without inventing a percentage signal", () => {
    const frame = analyseStudioAudioFrame(new Float32Array(512));
    expect(frame).toEqual({
      rmsDbfs: -120,
      samplePeakDbfs: -120,
      clippedSampleCount: 0,
      sampleCount: 512,
      state: "no-signal",
    });
    expect(studioAudioDbfsPercent(frame.rmsDbfs)).toBe(0);
  });

  it("measures RMS and sample peak in dBFS", () => {
    const samples = new Float32Array([0.5, -0.5, 0.5, -0.5]);
    const frame = analyseStudioAudioFrame(samples);
    expect(frame.rmsDbfs).toBe(-6);
    expect(frame.samplePeakDbfs).toBe(-6);
    expect(frame.state).toBe("hot");
  });

  it("separates sample clipping evidence from loudness and true peak", () => {
    const frame = analyseStudioAudioFrame(new Float32Array([0.1, 0.9995, -1, 0.2]));
    expect(frame.clippedSampleCount).toBe(2);
    expect(frame.samplePeakDbfs).toBe(0);
    expect(frame.state).toBe("clipping-risk");
  });

  it("retains peak hold, clipping counts, and measured track settings", () => {
    const frame = analyseStudioAudioFrame(new Float32Array([0.1, -0.2, 0.1, -0.2]));
    const evidence = studioAudioMeterEvidence(frame, {
      previousPeakHoldDbfs: -3.2,
      previousClippedSampleCount: 4,
      sampleRateHz: 47_999.7,
      channelCount: 1,
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: false,
    });
    expect(evidence.peakHoldDbfs).toBe(-3.2);
    expect(evidence.clippedSampleCountSinceStart).toBe(4);
    expect(evidence.sampleRateHz).toBe(48_000);
    expect(evidence.channelCount).toBe(1);
    expect(evidence.echoCancellation).toBe(true);
    expect(evidence.autoGainControl).toBe(false);
  });

  it("keeps the classification thresholds explicit and deterministic", () => {
    expect(studioAudioSignalState(-70, -60)).toBe("no-signal");
    expect(studioAudioSignalState(-50, -25)).toBe("low");
    expect(studioAudioSignalState(-30, -10)).toBe("ready");
    expect(studioAudioSignalState(-11.9, -6)).toBe("hot");
    expect(studioAudioSignalState(-24, -0.9)).toBe("clipping-risk");
    expect(amplitudeToDbfs(Number.NaN)).toBe(-120);
  });

  it("turns measured call-path states into specific sound-check guidance", () => {
    expect(studioSoundCheckGuidance(null).heading).toBe("Run the selected setup first");
    expect(studioSoundCheckGuidance(studioAudioMeterEvidence(
      analyseStudioAudioFrame(new Float32Array(32)),
    )).heading).toMatch(/not carrying useful speech/i);
    expect(studioSoundCheckGuidance(studioAudioMeterEvidence(
      analyseStudioAudioFrame(new Float32Array([0.02, -0.02])),
    )).heading).toMatch(/healthy speech range/i);
    expect(studioSoundCheckGuidance(studioAudioMeterEvidence(
      analyseStudioAudioFrame(new Float32Array([1, -1])),
    )).heading).toMatch(/lower gain/i);
  });

  it("guides one short sample through normal speech, headroom, plosives, and room tone", () => {
    expect(studioSoundCheckPrompt(10).heading).toMatch(/normal voice/i);
    expect(studioSoundCheckPrompt(7).heading).toMatch(/loudest likely sentence/i);
    expect(studioSoundCheckPrompt(4).detail).toMatch(/plosives/i);
    expect(studioSoundCheckPrompt(2).heading).toMatch(/stay quiet/i);
    expect(studioSoundCheckPrompt(Number.NaN).heading).toMatch(/normal voice/i);
  });

  it("versions capture-time observations without claiming complete-decode mastering evidence", () => {
    const started = createBrowserCaptureMeterSummary({
      startedAt: "2026-08-04T18:00:00.000Z",
      sampleRateHz: 47_999.7,
      sourceChannelCount: 2,
    });
    const observed = appendBrowserCaptureMeterFrame(
      started,
      analyseStudioAudioFrame(new Float32Array([0.5, -1, 0.25, -0.25])),
      "2026-08-04T18:00:00.100Z",
    );
    const stopped = finishBrowserCaptureMeterSummary(
      observed,
      "2026-08-04T18:00:10.000Z",
    );

    expect(stopped).toMatchObject({
      contractKind: "quipsly-browser-source-meter-v2",
      coverage: "realtime-observation-not-complete-decode",
      sampleRateHz: 48_000,
      sourceChannelCount: 2,
      analysisChannelCount: 1,
      observedBlockCount: 1,
      observedSampleCount: 4,
      meterMessageCount: 1,
      missingMessageCount: 0,
      samplePeakDbfs: 0,
      nearFullScaleSampleCount: 1,
      completeDecodePerformed: false,
      integratedLoudnessMeasured: false,
      truePeakMeasured: false,
      stoppedAt: "2026-08-04T18:00:10.000Z",
    });
  });

  it("strictly validates and aggregates render-thread meter evidence", () => {
    const packet = parseBrowserMeterWorkletAggregate({
      kind: "quipsly-capture-meter-aggregate-v1",
      sequence: 3,
      renderQuantumCount: 16,
      analysisChannelCount: 2,
      sampleCount: 4_096,
      sumSquares: 40.96,
      peakAmplitude: 0.5,
      nearFullScaleSampleCount: 0,
    });
    expect(packet).not.toBeNull();
    const summary = appendBrowserCaptureMeterAggregate(
      createBrowserCaptureMeterSummary({
        startedAt: "2026-08-04T18:00:00.000Z",
        sampleRateHz: 48_000,
        sourceChannelCount: 2,
      }),
      packet!,
      "2026-08-04T18:00:00.043Z",
      1,
    );
    expect(summary).toMatchObject({
      measurement: "audio-worklet-render-quantum-aggregate",
      analysisChannelCount: 2,
      observedBlockCount: 16,
      observedSampleCount: 4_096,
      meterMessageCount: 1,
      missingMessageCount: 1,
      highestObservedRmsDbfs: -20,
      samplePeakDbfs: -6,
    });
    expect(parseBrowserMeterWorkletAggregate({
      ...packet,
      sampleCount: -1,
    })).toBeNull();
  });
});
