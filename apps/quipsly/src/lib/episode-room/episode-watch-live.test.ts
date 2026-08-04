import { EPISODE_ROOM_VERSION, type EpisodeRoomState } from "./episode-room-contract";
import {
  decodeEpisodeWatchLiveHint,
  episodeWatchLiveHintFromRoom,
  parseEpisodeWatchLiveHint,
} from "./episode-watch-live";

const context = {
  projectSlug: "high-ground-odyssey",
  episodeSlug: "episode-5",
  callRoomId: "session-5",
};

function room(): EpisodeRoomState {
  return {
    version: EPISODE_ROOM_VERSION,
    revision: 9,
    status: "playing",
    positionSeconds: 12,
    effectiveAt: "2026-08-04T12:00:00.000Z",
    clips: [],
    segments: [],
    receipts: [],
    lastCommand: {
      id: "receipt-9",
      clientRequestId: "play-9",
      revision: 9,
      command: "PLAY",
      acceptedAt: "2026-08-04T12:00:00.000Z",
      actorEmail: "host@example.com",
      actorLabel: "Host",
      positionSeconds: 12,
    },
  };
}

describe("episode Watch live authority hints", () => {
  it("projects only the latest canonical receipt", () => {
    expect(episodeWatchLiveHintFromRoom(
      context,
      room(),
      "2026-08-04T12:00:00.050Z",
    )).toEqual(expect.objectContaining({
      schema: "quipsly-episode-watch-hint.v1",
      revision: 9,
      receiptId: "receipt-9",
      command: "PLAY",
      callRoomId: "session-5",
    }));

    const stale = room();
    stale.lastCommand = { ...stale.lastCommand!, revision: 8 };
    expect(episodeWatchLiveHintFromRoom(context, stale)).toBeNull();
  });

  it("rejects cross-episode, cross-session, malformed, and non-canonical packets", () => {
    const hint = episodeWatchLiveHintFromRoom(context, room())!;
    expect(parseEpisodeWatchLiveHint(hint, context)).toEqual(hint);
    expect(parseEpisodeWatchLiveHint({ ...hint, episodeSlug: "episode-6" }, context)).toBeNull();
    expect(parseEpisodeWatchLiveHint({ ...hint, callRoomId: "session-other" }, context)).toBeNull();
    expect(parseEpisodeWatchLiveHint({ ...hint, revision: 1.5 }, context)).toBeNull();
    expect(parseEpisodeWatchLiveHint({ ...hint, receiptId: "" }, context)).toBeNull();
    expect(decodeEpisodeWatchLiveHint(new TextEncoder().encode("not-json"), context)).toBeNull();
  });
});
