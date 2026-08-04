/** @jest-environment node */

import { newAudioSignalProfileJob } from "@high-ground/quipsly-media-processing";

import { inspectImmutableStudioMediaSource } from "@/lib/server/episode-collaboration-proxy";
import { mobileCaptureMediaProcessingGate } from "@/lib/server/mobile-capture-processing-gates";

import { episodeEditSignalVisualization, loadEpisodeEditSignalEvidence } from "./episode-edit-signal-evidence";

jest.mock("@/lib/server/mobile-capture-processing-gates", () => ({
  mobileCaptureMediaProcessingGate: jest.fn(),
}));
jest.mock("@/lib/server/episode-collaboration-proxy", () => ({
  inspectImmutableStudioMediaSource: jest.fn(),
}));

const mockedGate = jest.mocked(mobileCaptureMediaProcessingGate);
const mockedInspectStudioSource = jest.mocked(inspectImmutableStudioMediaSource);

function signalProfile() {
  return {
    schemaVersion: 1,
    algorithm: "capture-energy-v1",
    signalStatus: "attention",
    sampleRate: 48_000,
    channelCount: 1,
    analyzedFrameCount: 480_000,
    durationSeconds: 10,
    windowDurationSeconds: 1,
    rmsDbfs: -24,
    samplePeakDbfs: -3,
    clippedFrameCount: 0,
    clippedFrameFraction: 0,
    nearSilentFrameFraction: 0.3,
    thresholds: {
      clippingAmplitude: 0.999,
      nearSilenceDbfs: -72,
      possibleDropoutMinimumSeconds: 1.25,
      surroundingSignalDbfs: -45,
      stereoImbalanceDb: 12,
    },
    waveform: [
      { startSeconds: 0, durationSeconds: 10, rmsDbfs: -24, samplePeakDbfs: -3, clippedFrameCount: 0 },
    ],
    observations: [],
  };
}

function recording(id: string, suffix: string) {
  return {
    id,
    status: "VERIFIED",
    checksum: suffix.repeat(64),
    localManifestJson: {
      checksumSha256: suffix.repeat(64),
      storageGeneration: `generation-${suffix}`,
      reportedSourceProfile: { audioSignal: signalProfile() },
    },
  };
}

function prisma(recordings: unknown[]) {
  return {
    studioEpisodeProduction: {
      findUnique: jest.fn().mockResolvedValue({
        productionJson: {
          importedMedia: recordings.map((item: any) => ({ recordingAssetId: item.id })),
        },
        timelineJson: null,
      }),
    },
    recordingAsset: { findMany: jest.fn().mockResolvedValue(recordings) },
  };
}

describe("episode edit signal evidence", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedGate.mockResolvedValue({ allowed: true } as never);
  });

  it("binds one verified released signal profile to immutable source identity", async () => {
    const result = await loadEpisodeEditSignalEvidence({
      prisma: prisma([recording("recording-1", "a")]) as never,
      projectId: "project-1",
      projectSlug: "high-ground-odyssey",
      episodeSlug: "episode-4",
    });

    expect(result).toEqual(expect.objectContaining({
      status: "available",
      candidateCount: 1,
      evidence: expect.objectContaining({
        mediaAssetKind: "capture-recording",
        mediaAssetId: "recording-1",
        sourceSha256: "a".repeat(64),
        storageGeneration: "generation-a",
        signalProfileSha256: expect.stringMatching(/^[0-9a-f]{64}$/),
      }),
    }));
    expect(episodeEditSignalVisualization(result.evidence!, 1)).toEqual(expect.objectContaining({
      mediaAssetKind: "capture-recording",
      mediaAssetId: "recording-1",
      durationSeconds: 10,
      nearSilenceDbfs: -72,
      waveform: [{ startSeconds: 0, durationSeconds: 10, rmsDbfs: -24, samplePeakDbfs: -3, clippedFrameCount: 0 }],
    }));
  });

  it("binds an explicitly selected Studio source to its complete-decode profile and current immutable receipt", async () => {
    const sourceBinding = {
      assetId: "studio-asset-001",
      provider: "gcs" as const,
      locator: "gs://quipsly-test/studio-source.mov",
      generation: "1700000000000000",
      sha256: "f".repeat(64),
      sizeBytes: 480_000,
      contentType: "video/quicktime",
    };
    const job = newAudioSignalProfileJob({
      jobId: "audio_signal_studio_001",
      projectId: "project-studio-001",
      requestedByEmail: "editor@example.test",
      queuedAt: "2026-08-04T20:00:00.000Z",
      source: sourceBinding,
    });
    const profile = {
      ...signalProfile(),
      algorithm: "quipsly-audio-signal-window-v1",
      leftRmsDbfs: -24,
      rightRmsDbfs: null,
      stereoBalanceDb: null,
      frequencyProfile: {
        algorithm: "quipsly-audio-broad-band-rms-v1",
        completeDecode: true,
        downmixPolicy: "ffmpeg-default-mono-v1",
        windowDurationSeconds: 10,
        analyzedFrameCount: 480_000,
        bands: [{ id: "speech", label: "Speech", minimumHz: 500, maximumHz: 2_000 }],
        overallBandRmsDbfs: [-20],
        windows: [{ startSeconds: 0, durationSeconds: 10, bandRmsDbfs: [-20] }],
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
        endSeconds: 5.5,
        detail: "A measured low-energy interval follows surrounding signal.",
      }],
    };
    const receipt = {
      kind: "quipsly-audio-signal-profile-result-v1",
      version: 1,
      jobId: job.jobId,
      completedAt: "2026-08-04T20:01:00.000Z",
      source: sourceBinding,
      media: { container: "mov", codec: "pcm_s16le", sampleRate: 48_000, channelCount: 1, durationSeconds: 10 },
      audioSignal: profile,
      analyzer: {
        algorithm: "quipsly-audio-signal-window-v1",
        ffmpegVersion: "test",
        completeDecode: true,
        maximumWindows: 1_200,
        frequencyAnalysis: {
          algorithm: "quipsly-audio-broad-band-rms-v1",
          maximumBands: 6,
          maximumWindows: 1_200,
          completeDecode: true,
        },
      },
      worker: { executionId: "execution-studio-001", buildId: "build-test", imageDigest: null, attempt: 1 },
      boundaries: { originalRemainsSourceTruth: true, analysisDoesNotChangeMedia: true, observationsRequireHumanInterpretation: true },
    };
    mockedInspectStudioSource.mockResolvedValue({
      provider: "gcs",
      locator: sourceBinding.locator,
      generation: sourceBinding.generation,
      sha256: sourceBinding.sha256,
      sizeBytes: sourceBinding.sizeBytes,
    } as never);
    const studioPrisma = {
      studioEpisodeProduction: { findUnique: jest.fn().mockResolvedValue({ productionJson: { importedMedia: [{ id: sourceBinding.assetId, sourceId: "studio-source-001" }] }, timelineJson: null }) },
      recordingAsset: { findMany: jest.fn().mockResolvedValue([]) },
      studioAssetProcessingJob: { findMany: jest.fn().mockResolvedValue([{ id: job.jobId, assetId: sourceBinding.assetId, inputJson: job, resultJson: { receipt } }]) },
      studioMediaAsset: { findMany: jest.fn().mockResolvedValue([{ id: sourceBinding.assetId, url: "/api/ingest/media/studio-source-001", mimeType: "video/quicktime", filename: "Canon R8 take.mov", isProxy: false, assetAttachments: [{ metadataJson: { sourceId: "studio-source-001" } }] }]) },
      studioVideoSource: { findMany: jest.fn().mockResolvedValue([{ id: "studio-source-001", url: "/api/ingest/media/studio-source-001", providerSourceId: "provider-source-studio-001" }]) },
    };

    const result = await loadEpisodeEditSignalEvidence({
      prisma: studioPrisma as never,
      projectId: "project-studio-001",
      projectSlug: "high-ground-odyssey",
      episodeSlug: "episode-8",
      selectedMediaAssetId: sourceBinding.assetId,
    });

    expect(result).toEqual(expect.objectContaining({
      status: "available",
      candidateCount: 1,
      evidence: expect.objectContaining({
        mediaAssetKind: "studio-media",
        mediaAssetId: sourceBinding.assetId,
        sourceSha256: sourceBinding.sha256,
        storageGeneration: sourceBinding.generation,
        protectedPlayback: expect.objectContaining({ sourceId: "studio-source-001", kind: "video" }),
        signal: expect.objectContaining({ observations: [expect.objectContaining({ kind: "possible-dropout", requiresListening: true })] }),
      }),
    }));
    expect(mockedInspectStudioSource).toHaveBeenCalledWith("provider-source-studio-001", "video/quicktime");
  });

  it("refuses to guess between multiple released signal-bearing sources", async () => {
    const result = await loadEpisodeEditSignalEvidence({
      prisma: prisma([recording("recording-1", "a"), recording("recording-2", "b")]) as never,
      projectId: "project-1",
      projectSlug: "high-ground-odyssey",
      episodeSlug: "episode-4",
    });

    expect(result).toEqual(expect.objectContaining({ status: "ambiguous", evidence: null, candidateCount: 2 }));
  });

  it("projects protected playback only from the server promotion receipt", async () => {
    const promoted = recording("recording-promoted", "c");
    (promoted.localManifestJson as Record<string, unknown>).promotion = {
      sourceId: "source-promoted",
      playbackUrl: "/api/ingest/media/source-promoted",
      mediaKind: "audio",
    };
    const result = await loadEpisodeEditSignalEvidence({
      prisma: prisma([promoted]) as never,
      projectId: "project-1",
      projectSlug: "high-ground-odyssey",
      episodeSlug: "episode-4",
    });

    expect(result.evidence?.protectedPlayback).toEqual({
      sourceId: "source-promoted",
      url: "/api/ingest/media/source-promoted",
      kind: "audio",
      label: "Protected Capture source",
      durationSeconds: null,
    });
    expect(episodeEditSignalVisualization(result.evidence!).protectedPlayback?.sourceId).toBe("source-promoted");
  });

  it("does not use signal evidence while normalized media release is held", async () => {
    mockedGate.mockResolvedValue({ allowed: false, errorCode: "release-required" } as never);
    const result = await loadEpisodeEditSignalEvidence({
      prisma: prisma([recording("recording-1", "a")]) as never,
      projectId: "project-1",
      projectSlug: "high-ground-odyssey",
      episodeSlug: "episode-4",
    });

    expect(result).toEqual(expect.objectContaining({ status: "held", evidence: null, candidateCount: 1 }));
  });
});
