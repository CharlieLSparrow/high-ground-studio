import {
  buildAudioTranscriptEvidence,
  parseAudioSignalEvidence,
  transcriptTimingIntegrity,
  transcriptWordEditDistance,
} from "./transcript-evidence";

describe("audio and transcript evidence", () => {
  it("keeps full validated Capture waveform resolution for exact edit evidence", () => {
    const waveform = Array.from({ length: 240 }, (_, index) => ({
      startSeconds: index * 0.05,
      durationSeconds: 0.05,
      rmsDbfs: -30,
      samplePeakDbfs: -12,
      clippedFrameCount: 0,
    }));
    const profile = {
      schemaVersion: 1,
      algorithm: "capture-energy-v1",
      signalStatus: "signal-present",
      sampleRate: 48_000,
      channelCount: 1,
      analyzedFrameCount: 576_000,
      durationSeconds: 12,
      windowDurationSeconds: 0.05,
      rmsDbfs: -30,
      samplePeakDbfs: -12,
      clippedFrameCount: 0,
      clippedFrameFraction: 0,
      nearSilentFrameFraction: 0,
      thresholds: {
        clippingAmplitude: 0.999,
        nearSilenceDbfs: -72,
        possibleDropoutMinimumSeconds: 1.25,
        surroundingSignalDbfs: -45,
        stereoImbalanceDb: 12,
      },
      waveform,
      observations: [],
    };

    expect(parseAudioSignalEvidence(profile)?.waveform.length).toBeLessThanOrEqual(180);
    expect(parseAudioSignalEvidence(profile, { maximumWaveformPoints: 1_200 })?.waveform).toHaveLength(240);
  });

  it("measures reviewed WER separately from provider confidence and review coverage", () => {
    const evidence = buildAudioTranscriptEvidence({
      provider: "deepgram",
      providerModel: "nova-3",
      language: "en-US",
      status: "COMPLETED",
      recordingDurationSeconds: 12,
      sourceProfile: {
        container: "m4a",
        codec: "aac-lc",
        includesAudio: true,
        audioSampleRate: 48_000,
        audioChannelCount: 1,
        audioHardwareSampleRate: 48_000,
        audioHardwareInputChannelCount: 1,
        audioRouteName: "Shure MV7i",
        audioRoutePortType: "USBAudio",
        audioInputDataSourceName: "MV7i microphone",
        audioCapturePipeline: "livekit-local-input-pcm",
        pauseTimelinePolicy: "silence-preserves-wall-clock",
        recordedMedia: {
          audioTrackCount: 1,
          audioSampleRate: 48_000,
          audioChannelCount: 1,
          durationSeconds: 12,
        },
        audioSignal: {
          schemaVersion: 1,
          algorithm: "quipsly-audio-signal-window-v1",
          sampleRate: 48_000,
          channelCount: 1,
          analyzedFrameCount: 576_000,
          durationSeconds: 12,
          windowDurationSeconds: 1,
          rmsDbfs: -21.4,
          samplePeakDbfs: -0.4,
          clippedFrameCount: 2,
          clippedFrameFraction: 0.0000035,
          nearSilentFrameFraction: 0.08,
          leftRmsDbfs: -21.4,
          rightRmsDbfs: null,
          stereoBalanceDb: null,
          signalStatus: "attention",
          thresholds: {
            clippingAmplitude: 0.999,
            nearSilenceDbfs: -72,
            possibleDropoutMinimumSeconds: 0.25,
            surroundingSignalDbfs: -45,
            stereoImbalanceDb: 12,
          },
          waveform: [
            { startSeconds: 0, durationSeconds: 4, rmsDbfs: -20, samplePeakDbfs: -1, clippedFrameCount: 2 },
            { startSeconds: 4, durationSeconds: 4, rmsDbfs: -80, samplePeakDbfs: -75, clippedFrameCount: 0 },
            { startSeconds: 8, durationSeconds: 4, rmsDbfs: -18, samplePeakDbfs: -0.4, clippedFrameCount: 0 },
          ],
          frequencyProfile: {
            algorithm: "quipsly-audio-broad-band-rms-v1",
            completeDecode: true,
            downmixPolicy: "ffmpeg-default-mono-v1",
            windowDurationSeconds: 4,
            analyzedFrameCount: 576_000,
            bands: [
              { id: "rumble", label: "Rumble", minimumHz: 20, maximumHz: 80 },
              { id: "speech", label: "Speech", minimumHz: 500, maximumHz: 2_000 },
            ],
            overallBandRmsDbfs: [-42, -20],
            windows: [
              { startSeconds: 0, durationSeconds: 4, bandRmsDbfs: [-45, -18] },
              { startSeconds: 4, durationSeconds: 4, bandRmsDbfs: [-90, -84] },
              { startSeconds: 8, durationSeconds: 4, bandRmsDbfs: [-39, -17] },
            ],
            boundaries: {
              broadBandsAreNotARepairSpectrogram: true,
              measurementsAreNotEqDecisions: true,
              stereoIsDownmixedForFrequencyOverview: true,
            },
          },
          observations: [{
            kind: "possible-dropout",
            severity: "attention",
            startSeconds: 4,
            endSeconds: 8,
            detail: "Near-silent interval surrounded by signal; listen before classifying.",
          }],
        },
      },
      recordingStartedAt: "2026-08-03T18:00:00.000Z",
      recordingSegments: [{
        startedAt: "2026-08-03T18:00:00.000Z",
        stoppedAt: "2026-08-03T18:00:03.000Z",
        durationSeconds: 3,
        stopReason: "interruption",
        boundaryDetail: "active-audio-route-unavailable",
        boundaryAudioRouteName: "Shure MV7i",
        boundaryAudioRoutePortType: "USBAudio",
      }],
      segments: [{
        id: "segment-reviewed",
        startSeconds: 0.4,
        endSeconds: 2,
        providerText: "we ship on friday",
        text: "we ship Friday",
        confidence: 0.9,
        words: [
          { word: "we", punctuatedWord: "We", startSeconds: 0.4, endSeconds: 0.6, confidence: 0.99 },
          { word: "ship", punctuatedWord: "ship", startSeconds: 0.6, endSeconds: 0.9, confidence: 0.98 },
          { word: "on", punctuatedWord: "on", startSeconds: 0.9, endSeconds: 1.1, confidence: 0.44 },
          { word: "friday", punctuatedWord: "Friday", startSeconds: 1.1, endSeconds: 2, confidence: 0.93 },
        ],
        acceptedCorrection: { id: "correction-1" },
        acceptedVerification: null,
      }, {
        id: "segment-unchecked",
        startSeconds: 5,
        endSeconds: 7,
        providerText: "bring the source notes",
        text: "bring the source notes",
        confidence: 0.95,
        words: [
          { word: "bring", punctuatedWord: "Bring", startSeconds: 5, endSeconds: 5.4, confidence: 0.97 },
          { word: "notes", punctuatedWord: "notes", startSeconds: 6.4, endSeconds: 7, confidence: 0.96 },
        ],
        acceptedCorrection: null,
        acceptedVerification: null,
      }],
      speakerGroups: [{ attribution: { id: "speaker-1" } }, { attribution: null }],
    });

    expect(evidence.audio).toMatchObject({
      formatComparison: "MATCH",
      inputRoute: "Shure MV7i",
      decodedSampleRateHz: 48_000,
      decodedChannelCount: 1,
      issues: [],
      signal: {
        status: "attention",
        rmsDbfs: -21.4,
        samplePeakDbfs: -0.4,
        clippedFrameCount: 2,
        rmsIsNotLufs: true,
      },
      timelineEvents: [{
        kind: "interruption",
        startSeconds: 3,
        routeName: "Shure MV7i",
      }],
    });
    expect(evidence.audio.signal?.observations[0]).toMatchObject({
      kind: "possible-dropout",
      requiresListening: true,
    });
    expect(evidence.audio.signal?.frequencyProfile).toMatchObject({
      algorithm: "quipsly-audio-broad-band-rms-v1",
      completeDecode: true,
      broadBandsAreNotARepairSpectrogram: true,
      bands: [{ id: "rumble" }, { id: "speech" }],
    });
    expect(evidence.transcript).toMatchObject({
      provider: "deepgram",
      providerModel: "nova-3",
      wordCount: 6,
      confidenceWordCount: 6,
      lowConfidenceThreshold: 0.65,
      lowConfidenceThresholdAuthority: "quipsly-deepgram-default-v1",
      lowConfidenceWordCount: 1,
      reviewedSegmentCount: 1,
      correctedSegmentCount: 1,
      reviewCoverage: 0.5,
      measuredWordErrorCount: 1,
      measuredReferenceWordCount: 3,
      measuredWordErrorRate: 0.3333,
      measuredScope: "REVIEWED_SAMPLE",
      measuredReviewSegments: [{
        segmentId: "segment-reviewed",
        reviewKind: "corrected",
        wordErrorCount: 1,
        referenceWordCount: 3,
        wordErrorRate: 0.3333,
      }],
      providerSpeakerClusterCount: 2,
      attributedSpeakerClusterCount: 1,
      endsBeforeRecordingBySeconds: 5,
      timingIntegrity: {
        disposition: "structurally-consistent",
        structurallyValidWordCount: 6,
        editableSegmentCount: 2,
        timingIntegrityIsNotMeasuredAccuracy: true,
        attentionSegments: [],
      },
    });
    expect(evidence.transcript.confidenceIsNotMeasuredAccuracy).toBe(true);
    expect(evidence.transcript.attentionSegments[0]).toMatchObject({
      segmentId: "segment-unchecked",
      reviewed: false,
    });
  });

  it("does not invent confidence diagnostics for providers that supplied none", () => {
    const evidence = buildAudioTranscriptEvidence({
      provider: "apple-speech-on-device",
      segments: [{
        id: "segment-1",
        startSeconds: 0,
        endSeconds: 1,
        providerText: "hello",
        text: "hello",
        confidence: null,
        words: [],
        acceptedCorrection: null,
        acceptedVerification: null,
      }],
    });
    expect(evidence.transcript).toMatchObject({
      meanWordConfidence: null,
      lowConfidenceThreshold: null,
      lowConfidenceWordCount: null,
      measuredWordErrorRate: null,
      measuredScope: "NONE",
      timingIntegrity: {
        disposition: "unavailable",
        editableSegmentCount: 0,
      },
    });
    expect(evidence.audio.formatComparison).toBe("NOT_MEASURED");
  });

  it("holds structurally unsafe word timing without calling the check timing accuracy", () => {
    const timing = transcriptTimingIntegrity([{
      id: "segment-unsafe",
      startSeconds: 1,
      endSeconds: 3,
      providerText: "one two three",
      text: "one two three",
      confidence: null,
      words: [
        { word: "one", punctuatedWord: "One", startSeconds: 1, endSeconds: 1.8, confidence: null },
        { word: "two", punctuatedWord: "two", startSeconds: 1.6, endSeconds: 2.1, confidence: null },
        { word: "three", punctuatedWord: "three", startSeconds: 3.1, endSeconds: 3.4, confidence: null },
      ],
      acceptedCorrection: null,
      acceptedVerification: null,
    }]);

    expect(timing).toMatchObject({
      disposition: "review-required",
      structurallyValidWordCount: 1,
      overlappingWordCount: 1,
      outsideSegmentWordCount: 1,
      editableSegmentCount: 0,
      timingIntegrityIsNotMeasuredAccuracy: true,
      attentionSegments: [{
        segmentId: "segment-unsafe",
        reasons: expect.arrayContaining(["overlapping-words", "outside-segment"]),
      }],
    });
  });

  it("accepts an explicit receipt-owned confidence triage threshold without pretending it is accuracy", () => {
    const evidence = buildAudioTranscriptEvidence({
      provider: "retained-fixture",
      confidenceTriageThreshold: 0.65,
      confidenceTriageThresholdAuthority: "retained-fixture-calibration-v1",
      segments: [{
        id: "segment-1",
        startSeconds: 1,
        endSeconds: 2,
        providerText: "repeatable",
        text: "repeatable",
        confidence: 0.58,
        words: [{ word: "repeatable", punctuatedWord: "repeatable", startSeconds: 1, endSeconds: 2, confidence: 0.58 }],
        acceptedCorrection: null,
        acceptedVerification: null,
      }],
    });
    expect(evidence.transcript).toMatchObject({
      lowConfidenceThreshold: 0.65,
      lowConfidenceThresholdAuthority: "retained-fixture-calibration-v1",
      lowConfidenceWordCount: 1,
      confidenceIsNotMeasuredAccuracy: true,
    });
  });

  it("uses ordered word edit distance for substitutions, insertions, and deletions", () => {
    expect(transcriptWordEditDistance("one fast fox", "one brown fox")).toEqual({ errors: 1, referenceWords: 3 });
    expect(transcriptWordEditDistance("one very fast fox", "one fast fox")).toEqual({ errors: 1, referenceWords: 3 });
    expect(transcriptWordEditDistance("one fox", "one fast fox")).toEqual({ errors: 1, referenceWords: 3 });
  });
});
