import { EPISODE_ROOM_TIMELINE_SOURCE } from "@/lib/episode-room/episode-room-contract";
import { projectSharedWatchTimeline } from "./shared-watch-timeline";

const receiptBackedClip = {
  id: "episode-room-watch-segment-2",
  assetId: "vault-curiosity",
  trackId: "V9",
  kind: "video" as const,
  startIn: 12,
  duration: 8,
  sourceStart: 2,
  sourceEnd: 10,
  name: "Watched · Be Curious",
  color: "#d37b43",
  generatedFrom: EPISODE_ROOM_TIMELINE_SOURCE,
  recordingSync: {
    episodeRoomSessionId: "room-session-2",
    recordingRoomId: "capture-room-1",
    recordingStartedAt: "2026-07-31T12:00:00.000Z",
    watchSegmentId: "segment-2",
    startReceiptId: "receipt-play-2",
    endReceiptId: "receipt-pause-2",
    watchedAt: "2026-07-31T12:00:12.000Z",
  },
};

describe("Shared Watch production-editor projection", () => {
  it("replaces stale materializations while preserving normal clips and transcript", () => {
    const result = projectSharedWatchTimeline({
      clips: [{
        id: "primary-camera",
        assetId: "camera-asset",
        trackId: "V1",
        kind: "video",
        startIn: 0,
        duration: 60,
        sourceStart: 0,
        sourceEnd: 60,
        name: "Primary camera",
        color: "#2563eb",
      }, { ...receiptBackedClip, id: "episode-room-watch-stale-segment" }],
      transcript: [{
        id: "line-1",
        time: 3,
        duration: 4,
        text: "Retained episode words.",
        deleted: false,
        alert: null,
      }],
    }, {
      episodeRoom: { timelineSync: { sourceRevision: 9 } },
      timelineClips: [receiptBackedClip, receiptBackedClip],
    });

    expect(result.authoritative).toBe(true);
    expect(result.derivativeCount).toBe(1);
    expect(result.timeline.clips.map((clip) => clip.id)).toEqual([
      "primary-camera",
      "episode-room-watch-segment-2",
    ]);
    expect(result.timeline.transcript).toHaveLength(1);
    expect(result.timeline.clips[1]?.recordingSync?.endReceiptId).toBe("receipt-pause-2");
  });

  it("rejects an unreceipted lookalike and leaves an unrelated timeline unchanged", () => {
    const base = { clips: [], transcript: [] };
    const result = projectSharedWatchTimeline(base, {
      timelineClips: [{ ...receiptBackedClip, recordingSync: {} }],
    });

    expect(result).toEqual({ timeline: base, derivativeCount: 0, authoritative: false });
  });

  it("honors an authoritative empty sync by removing an older materialization", () => {
    const result = projectSharedWatchTimeline({
      clips: [receiptBackedClip],
      transcript: [],
    }, {
      episodeRoom: { timelineSync: { sourceRevision: 10, segmentCount: 0 } },
      timelineClips: [],
    });

    expect(result.authoritative).toBe(true);
    expect(result.derivativeCount).toBe(0);
    expect(result.timeline.clips).toEqual([]);
  });
});
