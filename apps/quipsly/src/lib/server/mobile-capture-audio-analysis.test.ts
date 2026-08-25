/** @jest-environment node */

import { queueAudioSignalProfile } from "@/lib/server/audio-signal-profile";

import { ensureMobileCaptureAudioAnalysisQueued } from "./mobile-capture-audio-analysis";

jest.mock("@/lib/server/audio-signal-profile", () => ({
  queueAudioSignalProfile: jest.fn(),
}));

function manifest(overrides: Record<string, unknown> = {}) {
  return {
    sourceType: "audio",
    contentType: "audio/webm",
    projectSlug: "coach-home",
    actorEmail: "coach@example.test",
    finalization: {
      processingDisposition: "RELEASED",
      mediaAssetId: "media-1",
      sourceId: "source-1",
    },
    ...overrides,
  } as never;
}

describe("automatic mobile Capture audio analysis", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(queueAudioSignalProfile).mockResolvedValue({
      jobId: "profile-job-1",
      status: "queued",
    } as never);
  });

  it("idempotently queues the exact promoted audio source after processing release", async () => {
    await expect(ensureMobileCaptureAudioAnalysisQueued({
      prisma: { lane: "test" },
      manifest: manifest(),
    })).resolves.toEqual({
      status: "queued",
      jobId: "profile-job-1",
      jobStatus: "queued",
    });
    expect(queueAudioSignalProfile).toHaveBeenCalledWith({
      prisma: { lane: "test" },
      projectSlug: "coach-home",
      assetId: "media-1",
      sourceId: "source-1",
      actorEmail: "coach@example.test",
    });
  });

  it.each([
    ["video", manifest({ sourceType: "video", contentType: "video/mp4" }), "not-audio"],
    ["held audio", manifest({ finalization: { processingDisposition: "HELD", mediaAssetId: "media-1", sourceId: "source-1" } }), "processing-held"],
    ["unpromoted audio", manifest({ finalization: { processingDisposition: "RELEASED", mediaAssetId: null, sourceId: null } }), "promotion-incomplete"],
  ])("does not queue %s", async (_label, candidate, reason) => {
    await expect(ensureMobileCaptureAudioAnalysisQueued({
      prisma: {},
      manifest: candidate,
    })).resolves.toEqual({ status: "not-applicable", reason });
    expect(queueAudioSignalProfile).not.toHaveBeenCalled();
  });

  it("surfaces a scheduling failure so the caller can log it and retry finalization", async () => {
    jest.mocked(queueAudioSignalProfile).mockRejectedValue(new Error("queue unavailable"));
    await expect(ensureMobileCaptureAudioAnalysisQueued({
      prisma: {},
      manifest: manifest(),
    })).rejects.toThrow("queue unavailable");
  });
});
