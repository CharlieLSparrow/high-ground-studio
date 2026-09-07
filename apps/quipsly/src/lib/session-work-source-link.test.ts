import { sessionWorkSourceHref } from "./session-work-source-link";

const generated = { origin: "quipsly-session-follow-through", roomId: "room-1", recordingAssetId: "asset-1" };

describe("work-to-recording navigation", () => {
  it("seeks on the selected source clock, including zero, rather than the assembled clock", () => {
    expect(sessionWorkSourceHref("room-1", { ...generated, sourceStartSeconds: 2.34, startSeconds: 122.34 }))
      .toBe("/sessions/room-1?mode=transcript&source=asset-1&at=2.34");
    expect(sessionWorkSourceHref("room-1", { ...generated, sourceStartSeconds: 0, startSeconds: 120 }))
      .toBe("/sessions/room-1?mode=transcript&source=asset-1&at=0");
  });

  it.each(["note", "task", "goal"])("opens the canonical pointer for a transcript-derived %s", (kind) => {
    expect(sessionWorkSourceHref("room-1", {
      schema: `quipsly-transcript-derived-${kind}-v1`, roomId: "room-1",
      transcriptJobId: "job-1", segmentId: "segment-1", startSeconds: 3.5, endSeconds: 6,
      providerTextSha256: "a".repeat(64), effectiveTextSnapshot: "I will write tomorrow.",
      recordingAssetId: "asset-1", playbackSourceId: "playback-1",
    })).toBe("/sessions/room-1?mode=transcript&source=asset-1&at=3.5");
  });

  it("opens the combined transcript for a recap without fabricating a timestamp", () => {
    expect(sessionWorkSourceHref("room-1", generated)).toBe("/sessions/room-1?mode=transcript");
  });

  it.each([NaN, Infinity, -1])("does not manufacture a seek for invalid source time %s", (at) => {
    expect(sessionWorkSourceHref("room-1", { ...generated, sourceStartSeconds: at, startSeconds: 120 }))
      .toBe("/sessions/room-1?mode=transcript");
  });

  it("does not interpret source-local time as session time without an identified recording", () => {
    expect(sessionWorkSourceHref("room-1", { ...generated, recordingAssetId: null, sourceStartSeconds: 3 }))
      .toBe("/sessions/room-1?mode=transcript");
  });

  it("encodes identifiers without letting metadata supply a destination URL", () => {
    expect(sessionWorkSourceHref("room/one", {
      ...generated, roomId: "room/one", recordingAssetId: "asset&at=999", startSeconds: 4, href: "https://wrong.test",
    })).toBe("/sessions/room%2Fone?mode=transcript&source=asset%26at%3D999&at=4");
  });

  it.each([null, [], {}, { roomId: "room-1" }, { ...generated, roomId: "another-room" }, {
    schema: "quipsly-transcript-derived-note-v1", roomId: "room-1", recordingAssetId: "asset-1", startSeconds: 2,
  }])("does not invent a source from missing, unrelated, or incomplete metadata", (source) => {
    expect(sessionWorkSourceHref("room-1", source)).toBeNull();
  });

  it("requires the stored row to belong to a session", () => {
    expect(sessionWorkSourceHref(null, generated)).toBeNull();
  });
});
