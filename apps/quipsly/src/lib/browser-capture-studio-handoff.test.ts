import {
  browserCaptureAutoHandoffAttempt,
  browserCaptureStudioHandoff,
  browserCaptureStudioReviewHref,
} from "./browser-capture-studio-handoff";

describe("browser Capture Studio handoff", () => {
  it("recomputes one exact complete group and keeps provider media optional and visible", () => {
    const handoff = browserCaptureStudioHandoff({
      sessions: [{
        id: "room-9",
        projectSlug: "high-ground-odyssey",
        episodeSlug: "episode-9",
        studioHandoff: { sourceCount: 999, ready: false },
        captureSources: [
          {
            recordingAssetId: "iphone-video",
            captureGroupId: "take-9",
            fileName: "Homer iPhone.mov",
            kind: "LOCAL_VIDEO",
            recordingStatus: "VERIFIED",
            exactBytesVerified: true,
            processingDisposition: "RELEASED",
            mediaAssetId: null,
          },
          {
            recordingAssetId: "browser-audio",
            captureGroupId: "take-9",
            fileName: "Charlie MV7i.webm",
            kind: "LOCAL_AUDIO",
            recordingStatus: "VERIFIED",
            exactBytesVerified: true,
            processingDisposition: "RELEASED",
            mediaAssetId: "media-audio",
          },
          {
            recordingAssetId: "provider-witness",
            captureGroupId: "take-9",
            fileName: "Room composite.mp4",
            kind: "SERVER_MIX",
            recordingStatus: "VERIFIED",
            exactBytesVerified: true,
            processingDisposition: "RELEASED",
            mediaAssetId: null,
          },
          {
            recordingAssetId: "older-source",
            captureGroupId: "take-8",
            recordingStatus: "VERIFIED",
            exactBytesVerified: true,
            processingDisposition: "RELEASED",
          },
        ],
      }],
    }, "room-9", "take-9");

    expect(handoff).toMatchObject({
      sourceCount: 3,
      verifiedSourceCount: 3,
      promotedSourceCount: 1,
      providerWitnessCount: 1,
      requiredSourceCount: 2,
      verifiedRequiredSourceCount: 2,
      ready: true,
      complete: false,
    });
    expect(handoff?.sources.map((source) => source.recordingAssetId)).toEqual([
      "browser-audio",
      "iphone-video",
      "provider-witness",
    ]);
  });

  it("never lets a held provider witness block verified protected masters", () => {
    expect(browserCaptureStudioHandoff({
      sessions: [{
        id: "room-provider",
        captureSources: [
          {
            recordingAssetId: "iphone-master",
            captureGroupId: "take-provider",
            kind: "LOCAL_VIDEO",
            recordingStatus: "VERIFIED",
            exactBytesVerified: true,
            processingDisposition: "RELEASED",
            mediaAssetId: "media-iphone",
          },
          {
            recordingAssetId: "provider-held",
            captureGroupId: "take-provider",
            kind: "SERVER_MIX",
            recordingStatus: "UPLOADING",
            exactBytesVerified: false,
            processingDisposition: "PENDING",
            mediaAssetId: null,
          },
        ],
      }],
    }, "room-provider", "take-provider")).toMatchObject({
      sourceCount: 2,
      requiredSourceCount: 1,
      verifiedSourceCount: 1,
      verifiedRequiredSourceCount: 1,
      promotedRequiredSourceCount: 1,
      providerWitnessCount: 1,
      ready: true,
      complete: true,
    });
  });

  it("holds partial, unverified, or missing groups instead of trusting aggregate claims", () => {
    expect(browserCaptureStudioHandoff({
      sessions: [{
        id: "room-1",
        studioHandoff: { ready: true, complete: true },
        captureSources: [{
          recordingAssetId: "audio-1",
          captureGroupId: "take-1",
          recordingStatus: "UPLOADING",
          exactBytesVerified: false,
          processingDisposition: "PENDING",
        }],
      }],
    }, "room-1", "take-1")).toMatchObject({
      sourceCount: 1,
      verifiedSourceCount: 0,
      ready: false,
      complete: false,
    });
    expect(browserCaptureStudioHandoff({
      sessions: [{
        id: "room-2",
        captureSources: [{
          recordingAssetId: "audio-2",
          captureGroupId: "take-2",
          recordingStatus: "UPLOADING",
          exactBytesVerified: false,
          processingDisposition: "PENDING",
          mediaAssetId: "premature-media-id",
        }],
      }],
    }, "room-2", "take-2")).toMatchObject({
      ready: false,
      complete: false,
    });
    expect(browserCaptureStudioHandoff({ sessions: [] }, "room-1", "take-1"))
      .toBeNull();
  });

  it("keeps exact interrupted bytes visible but out of Studio until their container is repaired", () => {
    expect(browserCaptureStudioHandoff({
      sessions: [{
        id: "room-recovered",
        captureSources: [{
          recordingAssetId: "recovered-audio",
          captureGroupId: "take-recovered",
          recordingStatus: "VERIFIED",
          exactBytesVerified: true,
          processingDisposition: "RELEASED",
          interruptionRepairRequired: true,
        }],
      }],
    }, "room-recovered", "take-recovered")).toMatchObject({
      verifiedSourceCount: 0,
      ready: false,
      complete: false,
      sources: [{
        recordingAssetId: "recovered-audio",
        exactBytesVerified: true,
        interruptionRepairRequired: true,
        verifiedForStudio: false,
      }],
    });
  });

  it("builds only an exact episode and take review link", () => {
    expect(browserCaptureStudioReviewHref({
      projectSlug: "high-ground-odyssey",
      episodeSlug: "episode-9",
      captureGroupId: "take-9",
    })).toBe(
      "/editor?project=high-ground-odyssey&episode=episode-9&captureGroup=take-9#guided-sync-wizard",
    );
    expect(browserCaptureStudioReviewHref({
      projectSlug: "high-ground-odyssey",
      episodeSlug: null,
      captureGroupId: "take-9",
    })).toBeNull();
  });

  it("creates one stable automatic preparation attempt only for a verified destination-bound take", () => {
    const ready = browserCaptureStudioHandoff({
      sessions: [{
        id: "room-auto",
        projectSlug: "coaching-home",
        captureSources: [
          {
            recordingAssetId: "client-audio",
            captureGroupId: "take-auto",
            kind: "LOCAL_AUDIO",
            recordingStatus: "VERIFIED",
            exactBytesVerified: true,
            processingDisposition: "RELEASED",
            mediaAssetId: null,
          },
          {
            recordingAssetId: "coach-audio",
            captureGroupId: "take-auto",
            kind: "LOCAL_AUDIO",
            recordingStatus: "VERIFIED",
            exactBytesVerified: true,
            processingDisposition: "RELEASED",
            mediaAssetId: null,
          },
        ],
      }],
    }, "room-auto", "take-auto");

    expect(browserCaptureAutoHandoffAttempt(ready)).toEqual({
      key: "take-auto:client-audio:coach-audio",
      projectSlug: "coaching-home",
      recordingAssetIds: ["client-audio", "coach-audio"],
    });
    expect(browserCaptureAutoHandoffAttempt({ ...ready!, complete: true })).toBeNull();
    expect(browserCaptureAutoHandoffAttempt({ ...ready!, ready: false })).toBeNull();
    expect(browserCaptureAutoHandoffAttempt({ ...ready!, projectSlug: null })).toBeNull();
  });
});
