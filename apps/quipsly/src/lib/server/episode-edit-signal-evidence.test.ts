/** @jest-environment node */

import { mobileCaptureMediaProcessingGate } from "@/lib/server/mobile-capture-processing-gates";

import { episodeEditSignalVisualization, loadEpisodeEditSignalEvidence } from "./episode-edit-signal-evidence";

jest.mock("@/lib/server/mobile-capture-processing-gates", () => ({
  mobileCaptureMediaProcessingGate: jest.fn(),
}));

const mockedGate = jest.mocked(mobileCaptureMediaProcessingGate);

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
        recordingAssetId: "recording-1",
        sourceSha256: "a".repeat(64),
        storageGeneration: "generation-a",
        signalProfileSha256: expect.stringMatching(/^[0-9a-f]{64}$/),
      }),
    }));
    expect(episodeEditSignalVisualization(result.evidence!, 1)).toEqual(expect.objectContaining({
      recordingAssetId: "recording-1",
      durationSeconds: 10,
      nearSilenceDbfs: -72,
      waveform: [{ startSeconds: 0, durationSeconds: 10, rmsDbfs: -24, samplePeakDbfs: -3, clippedFrameCount: 0 }],
    }));
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
