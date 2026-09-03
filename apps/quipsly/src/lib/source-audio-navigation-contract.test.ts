import {
  SOURCE_AUDIO_NAVIGATION_PROFILE,
  newSourceAudioNavigationJob,
  newSourceAudioNavigationResult,
  parseSourceAudioNavigationJob,
  parseSourceAudioNavigationResult,
  sourceAudioNavigationIdentity,
} from "@high-ground/quipsly-media-processing";

import { publicSourceVisualNavigationFrames } from "@/lib/server/source-visual-overview";

function audioSignal() {
  return {
    schemaVersion: 1 as const,
    algorithm: "quipsly-audio-signal-window-v1" as const,
    sampleRate: 48_000,
    channelCount: 2,
    analyzedFrameCount: 48_000,
    durationSeconds: 1,
    windowDurationSeconds: 1,
    rmsDbfs: -20,
    samplePeakDbfs: -2,
    clippedFrameCount: 0,
    clippedFrameFraction: 0,
    nearSilentFrameFraction: 0,
    leftRmsDbfs: -20,
    rightRmsDbfs: -21,
    stereoBalanceDb: -1,
    signalStatus: "signal-present" as const,
    thresholds: {
      clippingAmplitude: 0.999,
      nearSilenceDbfs: -72,
      possibleDropoutMinimumSeconds: 0.25,
      surroundingSignalDbfs: -45,
      stereoImbalanceDb: 12,
    },
    waveform: [
      {
        startSeconds: 0,
        durationSeconds: 1,
        rmsDbfs: -20,
        samplePeakDbfs: -2,
        clippedFrameCount: 0,
      },
    ],
    frequencyProfile: {
      algorithm: "quipsly-audio-broad-band-rms-v1" as const,
      completeDecode: true as const,
      downmixPolicy: "ffmpeg-default-mono-v1" as const,
      windowDurationSeconds: 1,
      analyzedFrameCount: 48_000,
      bands: [
        {
          id: "speech" as const,
          label: "Speech",
          minimumHz: 500,
          maximumHz: 2_000,
        },
      ],
      overallBandRmsDbfs: [-22],
      windows: [
        {
          startSeconds: 0,
          durationSeconds: 1,
          bandRmsDbfs: [-22],
        },
      ],
      boundaries: {
        broadBandsAreNotARepairSpectrogram: true as const,
        measurementsAreNotEqDecisions: true as const,
        stereoIsDownmixedForFrequencyOverview: true as const,
      },
    },
    loudness: null,
    observations: [],
  };
}

function job() {
  return newSourceAudioNavigationJob({
    jobId: "sanjob_12345678",
    projectId: "project_12345678",
    projectSlug: "homer-source-room",
    actorUserId: "user_12345678",
    actorEmail: "homer@example.com",
    queuedAt: "2026-08-07T12:00:00.000Z",
    source: {
      sourceRevisionId: "revision_12345678",
      identitySha256: "a".repeat(64),
      expectedContentSha256: "b".repeat(64),
    },
    input: {
      derivativeId: "proxy_12345678",
      provider: "local",
      locator: "/private/tmp/quipsly-media-ingest/proxy.mp4",
      generation: `sha256:${"c".repeat(64)}`,
      contentSha256: "c".repeat(64),
      sizeBytes: 10_000,
      contentType: "video/mp4",
      durationSeconds: 1,
    },
  });
}

describe("source audio navigation contract", () => {
  test("binds complete-decode evidence to one exact proxy generation", () => {
    const queued = job();
    const result = newSourceAudioNavigationResult({
      jobId: queued.jobId,
      completedAt: "2026-08-07T12:00:05.000Z",
      source: queued.source,
      input: {
        ...queued.input,
        observedContentSha256: queued.input.contentSha256,
        observedSizeBytes: queued.input.sizeBytes,
      },
      media: {
        container: "mov,mp4,m4a,3gp,3g2,mj2",
        codec: "aac",
        sampleRate: 48_000,
        channelCount: 2,
        durationSeconds: 1,
      },
      audioSignal: audioSignal(),
      analyzer: {
        profile: SOURCE_AUDIO_NAVIGATION_PROFILE,
        algorithm: queued.analyzer.algorithm,
        ffmpegVersion: "7.1",
        completeDecode: true,
        maximumWindows: 1_200,
        frequencyAnalysis: {
          algorithm: queued.analyzer.frequencyAnalysis.algorithm,
          maximumBands: 6,
          maximumWindows: 1_200,
          completeDecode: true,
        },
      },
      worker: {
        executionId: "worker_12345678",
        buildId: "build-1",
        attempt: 1,
      },
    });
    expect(parseSourceAudioNavigationJob(queued, queued.jobId)).toEqual(queued);
    expect(parseSourceAudioNavigationResult(result, queued)).toEqual(result);
    expect(result.boundaries).toEqual({
      originalRemainsSourceTruth: true,
      inputDerivativeRemainsUnchanged: true,
      analysisDoesNotChangeMedia: true,
      observationsRequireHumanInterpretation: true,
    });
    expect(
      sourceAudioNavigationIdentity({
        projectId: queued.projectId,
        sourceRevisionId: queued.source.sourceRevisionId,
        sourceIdentitySha256: queued.source.identitySha256,
        inputGeneration: queued.input.generation,
      }),
    ).toContain(SOURCE_AUDIO_NAVIGATION_PROFILE);
    expect(
      sourceAudioNavigationIdentity({
        projectId: queued.projectId,
        sourceRevisionId: queued.source.sourceRevisionId,
        sourceIdentitySha256: queued.source.identitySha256,
        inputGeneration: queued.input.generation,
        inputDerivativeId: "proxy_executor_a_12345678",
      }),
    ).not.toBe(
      sourceAudioNavigationIdentity({
        projectId: queued.projectId,
        sourceRevisionId: queued.source.sourceRevisionId,
        sourceIdentitySha256: queued.source.identitySha256,
        inputGeneration: queued.input.generation,
        inputDerivativeId: "proxy_executor_b_12345678",
      }),
    );
  });

  test("rejects evidence observed from different bytes", () => {
    const queued = job();
    const value = {
      kind: "quipsly-source-audio-navigation-result-v1",
      version: 1,
      jobId: queued.jobId,
      completedAt: "2026-08-07T12:00:05.000Z",
      source: queued.source,
      input: {
        ...queued.input,
        observedContentSha256: "d".repeat(64),
        observedSizeBytes: queued.input.sizeBytes,
      },
      media: {
        container: "mp4",
        codec: "aac",
        sampleRate: 48_000,
        channelCount: 2,
        durationSeconds: 1,
      },
      audioSignal: audioSignal(),
      analyzer: {
        profile: SOURCE_AUDIO_NAVIGATION_PROFILE,
        algorithm: queued.analyzer.algorithm,
        ffmpegVersion: "7.1",
        completeDecode: true,
        maximumWindows: 1_200,
        frequencyAnalysis: {
          algorithm: queued.analyzer.frequencyAnalysis.algorithm,
          maximumBands: 6,
          maximumWindows: 1_200,
          completeDecode: true,
        },
      },
      worker: {
        executionId: "worker_12345678",
        buildId: "build-1",
        attempt: 1,
      },
      boundaries: {
        originalRemainsSourceTruth: true,
        inputDerivativeRemainsUnchanged: true,
        analysisDoesNotChangeMedia: true,
        observationsRequireHumanInterpretation: true,
      },
    };
    expect(() => parseSourceAudioNavigationResult(value, queued)).toThrow(
      "Source audio navigation result is invalid",
    );
  });

  test("publishes only bounded ordered contact-sheet samples", () => {
    expect(
      publicSourceVisualNavigationFrames({
        output: {
          columns: 4,
          rows: 2,
          sampleTimesSeconds: [0.5, 1.5, 2.5, 3.5, 4.5, 5.5, 6.5, 7.5],
        },
      }),
    ).toEqual({
      columns: 4,
      rows: 2,
      sampleTimesSeconds: [0.5, 1.5, 2.5, 3.5, 4.5, 5.5, 6.5, 7.5],
    });
    expect(
      publicSourceVisualNavigationFrames({
        output: { columns: 4, rows: 2, sampleTimesSeconds: [1, 1] },
      }),
    ).toBeNull();
  });
});
