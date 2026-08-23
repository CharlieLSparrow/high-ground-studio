/** @jest-environment node */

import { queueAudioMastery } from "@/lib/server/audio-mastery";

import { ensureCaptureAudioReadinessQueued } from "./capture-audio-readiness";

jest.mock("server-only", () => ({}));
jest.mock("@/lib/server/audio-mastery", () => ({ queueAudioMastery: jest.fn() }));

const manifest = {
  actorEmail: "coach@example.test",
  projectSlug: "coach-home",
  sourceType: "audio",
  contentType: "audio/webm",
};

describe("automatic Capture audio readiness", () => {
  beforeEach(() => jest.clearAllMocks());

  it("queues a released participant audio source without authorizing replacement or publication", async () => {
    jest.mocked(queueAudioMastery).mockResolvedValue({
      jobId: "audio_mastery_automatic_001",
      status: "queued",
    } as never);

    await expect(ensureCaptureAudioReadinessQueued({
      prisma: { kind: "prisma" },
      manifest,
      finalization: {
        processingDisposition: "RELEASED",
        mediaAssetId: "asset_audio_001",
        sourceId: "source_audio_001",
      },
    })).resolves.toEqual({
      disposition: "retained",
      jobId: "audio_mastery_automatic_001",
      status: "queued",
    });
    expect(queueAudioMastery).toHaveBeenCalledWith({
      prisma: { kind: "prisma" },
      projectSlug: "coach-home",
      assetId: "asset_audio_001",
      sourceId: "source_audio_001",
      profileId: "apple-podcasts-dialogue-v1",
      actorEmail: "coach@example.test",
      retryFailed: false,
    });
  });

  it.each([
    ["held", manifest, { processingDisposition: "HELD", mediaAssetId: null, sourceId: null }, "source-held"],
    ["unmaterialized", manifest, { processingDisposition: "RELEASED", mediaAssetId: null, sourceId: null }, "source-not-materialized"],
    ["video-only", { ...manifest, sourceType: "video", contentType: "video/mp4" }, { processingDisposition: "RELEASED", mediaAssetId: "asset_video_001", sourceId: "source_video_001" }, "non-audio-source"],
  ])("does not manufacture an audio job for a %s source", async (_label, candidateManifest, finalization, reason) => {
    await expect(ensureCaptureAudioReadinessQueued({
      prisma: {},
      manifest: candidateManifest,
      finalization: finalization as never,
    })).resolves.toEqual({ disposition: "skipped", reason });
    expect(queueAudioMastery).not.toHaveBeenCalled();
  });
});
