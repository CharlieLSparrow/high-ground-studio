/** @jest-environment node */

import {
  promoteRecordingAssetToStudioMedia,
  promoteRecordingCaptureGroupToStudioMedia,
} from "@/lib/server/recording-media-promotion";
import { getQuipslySessionFromRequest } from "@/lib/server/quipsly-session";

import { POST } from "./route";

jest.mock("@/lib/server/recording-media-promotion", () => ({
  promoteRecordingAssetToStudioMedia: jest.fn(),
  promoteRecordingCaptureGroupToStudioMedia: jest.fn(),
}));
jest.mock("@/lib/server/quipsly-session", () => ({
  getQuipslySessionFromRequest: jest.fn(),
}));

function request(body: Record<string, unknown>) {
  return new Request(
    "https://nest.quipsly.com/api/mobile/capture/recordings/promote",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  );
}

describe("mobile recording Studio handoff", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(getQuipslySessionFromRequest).mockResolvedValue({
      user: {
        id: "user-1",
        email: "legacy@example.com",
        primaryEmail: " Producer@Example.com ",
        isStaff: false,
      },
    } as never);
  });

  it("requires a signed-in Quipsly identity", async () => {
    jest.mocked(getQuipslySessionFromRequest).mockResolvedValue(null);

    const response = await POST(request({ recordingAssetId: "asset-1" }));

    expect(response.status).toBe(401);
    expect(promoteRecordingAssetToStudioMedia).not.toHaveBeenCalled();
    expect(promoteRecordingCaptureGroupToStudioMedia).not.toHaveBeenCalled();
  });

  it("sends one exact capture-group snapshot through the group boundary", async () => {
    jest.mocked(promoteRecordingCaptureGroupToStudioMedia).mockResolvedValue({
      ok: true,
      status: "capture-group-promoted",
      captureGroupId: "take-1",
      expectedSourceCount: 3,
      promotedSourceCount: 3,
      alreadyPromotedSourceCount: 0,
      failedSourceCount: 0,
      results: [],
      message: "Complete group ready.",
      boundaries: {
        sourceSetMatched: true,
        originalSourcesMutated: false,
        copiedBlobs: false,
        alignmentRemainsProposal: true,
        humanSyncReviewRequired: true,
        partialResultHidden: false,
        retryIsIdempotent: true,
      },
    } as never);

    const response = await POST(request({
      roomId: "room-1",
      captureGroupId: "take-1",
      expectedRecordingAssetIds: [
        "video-front",
        "audio-master",
        "video-front",
        "video-back",
      ],
      nestSlug: "high-ground",
      episodeSlug: "episode-1",
    }));

    expect(response.status).toBe(200);
    expect(promoteRecordingCaptureGroupToStudioMedia).toHaveBeenCalledWith({
      roomId: "room-1",
      captureGroupId: "take-1",
      expectedRecordingAssetIds: [
        "video-front",
        "audio-master",
        "video-back",
      ],
      actorUserId: "user-1",
      actorEmail: "producer@example.com",
      isStaff: false,
      nestSlug: "high-ground",
      episodeSlug: "episode-1",
    });
    expect(promoteRecordingAssetToStudioMedia).not.toHaveBeenCalled();
    expect(await response.json()).toMatchObject({
      ok: true,
      expectedSourceCount: 3,
      boundaries: { sourceSetMatched: true },
    });
  });

  it("refuses a group request without its exact reviewed source list", async () => {
    const response = await POST(request({
      roomId: "room-1",
      captureGroupId: "take-1",
    }));

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      ok: false,
      error:
        "Session, capture group, and the exact reviewed source list are required.",
    });
    expect(promoteRecordingCaptureGroupToStudioMedia).not.toHaveBeenCalled();
    expect(promoteRecordingAssetToStudioMedia).not.toHaveBeenCalled();
  });

  it("preserves the legacy single-source route for installed builds", async () => {
    jest.mocked(promoteRecordingAssetToStudioMedia).mockResolvedValue({
      ok: true,
      status: "promoted",
      message: "Recording ready.",
      mediaAsset: { id: "media-1" },
    } as never);

    const response = await POST(request({
      recordingAssetId: "asset-1",
      nestSlug: "high-ground",
    }));

    expect(response.status).toBe(200);
    expect(promoteRecordingAssetToStudioMedia).toHaveBeenCalledWith({
      recordingAssetId: "asset-1",
      actorUserId: "user-1",
      actorEmail: "producer@example.com",
      isStaff: false,
      nestSlug: "high-ground",
      episodeSlug: null,
    });
    expect(promoteRecordingCaptureGroupToStudioMedia).not.toHaveBeenCalled();
  });
});
