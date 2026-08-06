import { newAudioSignalProfileJob } from "@high-ground/quipsly-media-processing";

import {
  episodeAudioProcessingEvidence,
  episodeAudioSignalActivityEvidence,
} from "./episode-audio-processing-evidence";

const source = {
  assetId: "asset_0001",
  provider: "local" as const,
  locator: "/retained/audio.wav",
  generation: "local-generation-1",
  sha256: "a".repeat(64),
  sizeBytes: 48_000,
  contentType: "audio/wav",
};

describe("episodeAudioProcessingEvidence", () => {
  it("keeps absent work explicitly not queued", () => {
    expect(episodeAudioProcessingEvidence([])).toMatchObject({
      signal: { jobId: null, status: "not-queued", integrityVerified: false },
      transcript: { jobId: null, status: "not-queued", integrityVerified: false },
      alignment: { jobId: null, status: "not-queued", integrityVerified: false },
      mastery: { jobId: null, status: "not-queued", integrityVerified: false },
    });
  });

  it("validates queued exact-source contracts without pretending a result exists", () => {
    const job = newAudioSignalProfileJob({
      jobId: "signal_job_0001",
      projectId: "project_0001",
      requestedByEmail: "producer@example.com",
      queuedAt: "2026-08-06T12:00:00.000Z",
      source,
    });
    expect(episodeAudioProcessingEvidence([{
      id: job.jobId,
      type: "audio-signal-profile",
      status: "queued",
      inputJson: job,
      resultJson: null,
      updatedAt: new Date("2026-08-06T12:00:00.000Z"),
    }]).signal).toMatchObject({
      jobId: "signal_job_0001",
      status: "queued",
      integrityVerified: true,
      durationSeconds: null,
      observationCount: 0,
    });
  });

  it("fails closed when a completed row has no valid result receipt", () => {
    const evidence = episodeAudioProcessingEvidence([{
      id: "signal_job_0002",
      type: "audio-signal-profile",
      status: "completed",
      inputJson: { kind: "not-a-real-contract" },
      resultJson: {},
      updatedAt: new Date("2026-08-06T12:00:00.000Z"),
    }]);
    expect(evidence.signal).toMatchObject({
      status: "failed",
      integrityVerified: false,
      error: "Audio signal evidence failed integrity validation.",
    });
    expect(episodeAudioSignalActivityEvidence([{
      id: "signal_job_0002",
      type: "audio-signal-profile",
      status: "completed",
      inputJson: { kind: "not-a-real-contract" },
      resultJson: {},
    }])).toBeNull();
  });

  it("publishes bounded complete-decode energy without promoting it to voice activity", () => {
    const job = newAudioSignalProfileJob({
      jobId: "signal_job_activity_0001",
      projectId: "project_0001",
      requestedByEmail: "producer@example.com",
      queuedAt: "2026-08-06T12:00:00.000Z",
      source,
    });
    const audioSignal = {
      schemaVersion: 1,
      algorithm: "quipsly-audio-signal-window-v1",
      sampleRate: 48_000,
      channelCount: 1,
      analyzedFrameCount: 48_000,
      durationSeconds: 1,
      windowDurationSeconds: 0.5,
      rmsDbfs: -18,
      samplePeakDbfs: -3,
      clippedFrameCount: 0,
      clippedFrameFraction: 0,
      nearSilentFrameFraction: 0,
      leftRmsDbfs: -18,
      rightRmsDbfs: null,
      stereoBalanceDb: null,
      signalStatus: "signal-present",
      thresholds: { clippingAmplitude: 0.999, nearSilenceDbfs: -72, possibleDropoutMinimumSeconds: 0.25, surroundingSignalDbfs: -45, stereoImbalanceDb: 12 },
      waveform: [
        { startSeconds: 0, durationSeconds: 0.5, rmsDbfs: -18, samplePeakDbfs: -3, clippedFrameCount: 0 },
        { startSeconds: 0.5, durationSeconds: 0.5, rmsDbfs: -19, samplePeakDbfs: -4, clippedFrameCount: 0 },
      ],
      frequencyProfile: {
        algorithm: "quipsly-audio-broad-band-rms-v1",
        completeDecode: true,
        downmixPolicy: "ffmpeg-default-mono-v1",
        windowDurationSeconds: 0.5,
        analyzedFrameCount: 48_000,
        bands: [{ id: "speech", label: "Speech", minimumHz: 500, maximumHz: 2_000 }],
        overallBandRmsDbfs: [-20],
        windows: [
          { startSeconds: 0, durationSeconds: 0.5, bandRmsDbfs: [-18] },
          { startSeconds: 0.5, durationSeconds: 0.5, bandRmsDbfs: [-22] },
        ],
        boundaries: { broadBandsAreNotARepairSpectrogram: true, measurementsAreNotEqDecisions: true, stereoIsDownmixedForFrequencyOverview: true },
      },
      observations: [],
    };
    const receipt = {
      kind: "quipsly-audio-signal-profile-result-v1",
      version: 1,
      jobId: job.jobId,
      completedAt: "2026-08-06T12:01:00.000Z",
      source,
      media: { container: "wav", codec: "pcm_s24le", sampleRate: 48_000, channelCount: 1, durationSeconds: 1 },
      audioSignal,
      analyzer: { algorithm: "quipsly-audio-signal-window-v1", ffmpegVersion: "ffmpeg fixture", completeDecode: true, maximumWindows: 1_200, frequencyAnalysis: { algorithm: "quipsly-audio-broad-band-rms-v1", maximumBands: 6, maximumWindows: 1_200, completeDecode: true } },
      worker: { executionId: "execution_signal_0001", buildId: "build-signal-fixture", imageDigest: null, attempt: 1 },
      boundaries: { originalRemainsSourceTruth: true, analysisDoesNotChangeMedia: true, observationsRequireHumanInterpretation: true },
    };
    const evidence = episodeAudioSignalActivityEvidence([{ id: job.jobId, type: "audio-signal-profile", status: "completed", inputJson: job, resultJson: { receipt } }]);

    expect(evidence).toMatchObject({
      jobId: job.jobId,
      completeDecode: true,
      waveform: [{ startSeconds: 0, rmsDbfs: -18 }, { startSeconds: 0.5, rmsDbfs: -19 }],
      boundaries: { energyIsNotVoiceActivity: true, measurementDoesNotChangeMedia: true, sourceIdentityBound: true },
    });
  });
});
