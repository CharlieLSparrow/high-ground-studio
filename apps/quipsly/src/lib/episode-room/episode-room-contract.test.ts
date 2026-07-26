import {
  EPISODE_ROOM_TIMELINE_SOURCE,
  EpisodeRoomRevisionConflict,
  applyEpisodeRoomCommand,
  createEmptyEpisodeRoomState,
  episodeRoomTimelineClips,
  projectedEpisodeRoomPosition,
  type EpisodeRoomActor,
  type EpisodeRoomClip,
  type EpisodeRoomCommand,
  type EpisodeRoomState,
} from "./episode-room-contract";

const actor: EpisodeRoomActor = {
  userId: "user-charlie",
  email: "charlie@example.com",
  label: "Charlie",
};

const clip: EpisodeRoomClip = {
  assetId: "asset-clip",
  sourceId: "source-clip",
  title: "The clip we discuss",
  kind: "video",
  playbackUrl: "/api/ingest/media/source-clip",
  durationSeconds: 120,
  importRole: "reference-clip",
  addedAt: "2026-07-26T12:00:00.000Z",
  addedBy: "Charlie",
};

function apply(
  state: EpisodeRoomState,
  command: EpisodeRoomCommand,
  acceptedAt: string,
  suffix: string,
) {
  return applyEpisodeRoomCommand(state, command, {
    actor,
    acceptedAt,
    receiptId: `receipt-${suffix}`,
    sessionId: `session-${suffix}`,
    segmentId: `segment-${suffix}`,
  });
}

describe("Episode Room contract", () => {
  test("records shared play and pause as an aligned watch segment", () => {
    let state = createEmptyEpisodeRoomState("2026-07-26T12:00:00.000Z");
    state = apply(state, {
      type: "ADD_CLIP",
      clip,
      clientRequestId: "add-1",
      expectedRevision: 0,
    }, "2026-07-26T12:00:01.000Z", "add");
    state = apply(state, {
      type: "START_SESSION",
      clientRequestId: "session-1",
      expectedRevision: 1,
    }, "2026-07-26T12:01:00.000Z", "clock");
    state = apply(state, {
      type: "PLAY",
      positionSeconds: 10,
      clientRequestId: "play-1",
      expectedRevision: 2,
    }, "2026-07-26T12:01:05.000Z", "play");
    state = apply(state, {
      type: "PAUSE",
      positionSeconds: 25,
      clientRequestId: "pause-1",
      expectedRevision: 3,
    }, "2026-07-26T12:01:20.000Z", "pause");

    expect(state).toMatchObject({
      revision: 4,
      status: "paused",
      positionSeconds: 25,
      selectedClipId: "asset-clip",
    });
    expect(state.segments).toEqual([
      expect.objectContaining({
        id: "segment-play",
        clipId: "asset-clip",
        sourceStartSeconds: 10,
        sourceEndSeconds: 25,
        episodeStartSeconds: 5,
        episodeEndSeconds: 20,
        startReceiptId: "receipt-play",
        endReceiptId: "receipt-pause",
      }),
    ]);

    expect(episodeRoomTimelineClips(state)).toEqual([
      expect.objectContaining({
        id: "episode-room-watch-segment-play",
        assetId: "asset-clip",
        trackId: "V9",
        startIn: 5,
        duration: 15,
        sourceStart: 10,
        sourceEnd: 25,
        generatedFrom: EPISODE_ROOM_TIMELINE_SOURCE,
      }),
    ]);
  });

  test("closes and reopens the receipt segment when a playing clip seeks", () => {
    let state = createEmptyEpisodeRoomState("2026-07-26T12:00:00.000Z");
    state = apply(state, {
      type: "ADD_CLIP",
      clip,
      clientRequestId: "add-2",
      expectedRevision: 0,
    }, "2026-07-26T12:00:01.000Z", "add");
    state = apply(state, {
      type: "PLAY",
      positionSeconds: 0,
      clientRequestId: "play-2",
      expectedRevision: 1,
    }, "2026-07-26T12:00:10.000Z", "play");
    state = apply(state, {
      type: "SEEK",
      fromPositionSeconds: 5,
      positionSeconds: 30,
      clientRequestId: "seek-2",
      expectedRevision: 2,
    }, "2026-07-26T12:00:15.000Z", "seek");
    state = apply(state, {
      type: "PAUSE",
      positionSeconds: 35,
      clientRequestId: "pause-2",
      expectedRevision: 3,
    }, "2026-07-26T12:00:20.000Z", "pause");

    expect(state.segments).toEqual([
      expect.objectContaining({ sourceStartSeconds: 0, sourceEndSeconds: 5 }),
      expect.objectContaining({ sourceStartSeconds: 30, sourceEndSeconds: 35 }),
    ]);
    expect(state.segments[1]?.startReceiptId).toBe("receipt-seek");
  });

  test("preserves the authoritative recording room anchor on every timeline segment", () => {
    let state = createEmptyEpisodeRoomState("2026-07-26T12:00:00.000Z");
    state = apply(state, {
      type: "ADD_CLIP",
      clip,
      clientRequestId: "add-recording-clock",
      expectedRevision: 0,
    }, "2026-07-26T12:00:01.000Z", "add-recording-clock");
    state = apply(state, {
      type: "START_SESSION",
      recordingRoomId: "call-room-episode-4",
      recordingStartedAt: "2026-07-26T12:00:30.000Z",
      clientRequestId: "bind-recording-clock",
      expectedRevision: 1,
    }, "2026-07-26T12:01:00.000Z", "bind-recording-clock");
    state = apply(state, {
      type: "PLAY",
      positionSeconds: 3,
      clientRequestId: "play-recording-clock",
      expectedRevision: 2,
    }, "2026-07-26T12:01:05.000Z", "play-recording-clock");
    state = apply(state, {
      type: "PAUSE",
      positionSeconds: 8,
      clientRequestId: "pause-recording-clock",
      expectedRevision: 3,
    }, "2026-07-26T12:01:10.000Z", "pause-recording-clock");

    expect(state.segments[0]).toMatchObject({
      recordingRoomId: "call-room-episode-4",
      recordingStartedAt: "2026-07-26T12:00:30.000Z",
      episodeStartSeconds: 35,
      episodeEndSeconds: 40,
    });
    expect(episodeRoomTimelineClips(state)[0]?.recordingSync).toMatchObject({
      recordingRoomId: "call-room-episode-4",
      recordingStartedAt: "2026-07-26T12:00:30.000Z",
    });
  });

  test("is idempotent by client request id and rejects a stale revision", () => {
    const initial = createEmptyEpisodeRoomState("2026-07-26T12:00:00.000Z");
    const command: EpisodeRoomCommand = {
      type: "ADD_CLIP",
      clip,
      clientRequestId: "same-request",
      expectedRevision: 0,
    };
    const once = apply(initial, command, "2026-07-26T12:00:01.000Z", "once");
    const twice = apply(once, command, "2026-07-26T12:00:02.000Z", "twice");
    expect(twice).toEqual(once);

    expect(() => apply(once, {
      type: "PLAY",
      positionSeconds: 0,
      clientRequestId: "stale-play",
      expectedRevision: 0,
    }, "2026-07-26T12:00:03.000Z", "stale")).toThrow(EpisodeRoomRevisionConflict);
  });

  test("projects a playing position from the authoritative effective time", () => {
    expect(projectedEpisodeRoomPosition({
      status: "playing",
      positionSeconds: 10,
      effectiveAt: "2026-07-26T12:00:00.000Z",
      durationSeconds: 12,
    }, "2026-07-26T12:00:10.000Z")).toBe(12);
  });

  test("requires playback to be paused before timeline materialization", () => {
    let state = createEmptyEpisodeRoomState("2026-07-26T12:00:00.000Z");
    state = apply(state, {
      type: "ADD_CLIP",
      clip,
      clientRequestId: "add-sync",
      expectedRevision: 0,
    }, "2026-07-26T12:00:01.000Z", "add-sync");
    state = apply(state, {
      type: "PLAY",
      positionSeconds: 0,
      clientRequestId: "play-sync",
      expectedRevision: 1,
    }, "2026-07-26T12:00:02.000Z", "play-sync");

    expect(() => apply(state, {
      type: "SYNC_TIMELINE",
      clientRequestId: "sync-playing",
      expectedRevision: 2,
    }, "2026-07-26T12:00:03.000Z", "sync-playing")).toThrow("Pause the shared clip");
  });
});
