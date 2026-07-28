/** @jest-environment node */

jest.mock("@/lib/prisma", () => ({
  getPrismaClient: jest.fn(() => ({})),
}));

import { normalizeWatchDerivatives } from "./episode-edit-store";

describe("Episode editor Shared Watch derivatives", () => {
  it("loads only complete receipt-backed Episode Room timeline spans", () => {
    expect(normalizeWatchDerivatives({
      timelineClips: [
        {
          id: "episode-room-watch-segment-1",
          assetId: "asset-clip",
          startIn: 12.5,
          duration: 4,
          sourceStart: 2,
          sourceEnd: 6,
          name: "Watched · reference clip",
          color: "#d37b43",
          kind: "video",
          generatedFrom: "quipsly-episode-room-watch.v1",
          recordingSync: {
            episodeRoomSessionId: "episode-room-session-1",
            recordingRoomId: "call-room-1",
            recordingStartedAt: "2026-07-27T18:59:00.000Z",
            watchSegmentId: "segment-1",
            startReceiptId: "receipt-start",
            endReceiptId: "receipt-end",
            watchedAt: "2026-07-27T19:00:00.000Z",
          },
        },
        {
          id: "unrelated-timeline-clip",
          assetId: "asset-host",
          startIn: 0,
          duration: 10,
          kind: "video",
          generatedFrom: "another-editor",
        },
        {
          id: "incomplete-watch-span",
          assetId: "asset-clip",
          startIn: 20,
          duration: 3,
          kind: "video",
          generatedFrom: "quipsly-episode-room-watch.v1",
          recordingSync: {
            watchSegmentId: "segment-2",
            startReceiptId: "receipt-start-2",
          },
        },
      ],
    })).toEqual([{
      id: "episode-room-watch-segment-1",
      assetId: "asset-clip",
      name: "Watched · reference clip",
      kind: "video",
      startSeconds: 12.5,
      durationSeconds: 4,
      sourceStartSeconds: 2,
      sourceEndSeconds: 6,
      color: "#d37b43",
      episodeRoomSessionId: "episode-room-session-1",
      watchSegmentId: "segment-1",
      startReceiptId: "receipt-start",
      endReceiptId: "receipt-end",
      watchedAt: "2026-07-27T19:00:00.000Z",
      recordingRoomId: "call-room-1",
      recordingStartedAt: "2026-07-27T18:59:00.000Z",
    }]);
  });
});
