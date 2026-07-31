import {
  EPISODE_ROOM_TIMELINE_SOURCE,
  EpisodeRoomRevisionConflict,
  applyEpisodeRoomCommand,
  createEmptyEpisodeRoomState,
  episodeRoomCurrentPassSegmentIds,
  episodeRoomTimelineIsCurrent,
  episodeRoomTimelineMaterializationIsCurrent,
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
  watchId: "asset-clip",
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
  commandActor: EpisodeRoomActor = actor,
) {
  return applyEpisodeRoomCommand(state, command, {
    actor: commandActor,
    acceptedAt,
    receiptId: `receipt-${suffix}`,
    sessionId: `session-${suffix}`,
    segmentId: `segment-${suffix}`,
  });
}

function completedWatchState() {
  let state = createEmptyEpisodeRoomState("2026-07-26T12:00:00.000Z");
  state = apply(state, {
    type: "ADD_CLIP",
    clip,
    clientRequestId: "add-completed-watch",
    expectedRevision: 0,
  }, "2026-07-26T12:00:01.000Z", "add-completed-watch");
  state = apply(state, {
    type: "START_SESSION",
    clientRequestId: "start-completed-watch",
    expectedRevision: 1,
  }, "2026-07-26T12:01:00.000Z", "completed-watch");
  state = apply(state, {
    type: "PLAY",
    positionSeconds: 10,
    clientRequestId: "play-completed-watch",
    expectedRevision: 2,
  }, "2026-07-26T12:01:05.000Z", "completed-watch");
  return apply(state, {
    type: "PAUSE",
    positionSeconds: 15,
    clientRequestId: "pause-completed-watch",
    expectedRevision: 3,
  }, "2026-07-26T12:01:10.000Z", "completed-watch");
}

describe("Episode Room contract", () => {
  test("keeps saved range identity separate from its source and clamps shared playback", () => {
    const savedRange: EpisodeRoomClip = {
      ...clip,
      watchId: "media-vault-clip:curiosity-opening",
      title: "Curiosity opening",
      rangeStartSeconds: 4,
      rangeEndSeconds: 12,
    };
    let state = createEmptyEpisodeRoomState("2026-07-26T12:00:00.000Z");
    state = apply(state, {
      type: "ADD_CLIP",
      clip: savedRange,
      clientRequestId: "add-saved-range",
      expectedRevision: 0,
    }, "2026-07-26T12:00:01.000Z", "add-saved-range");
    expect(state).toMatchObject({
      selectedClipId: savedRange.watchId,
      positionSeconds: 4,
      durationSeconds: 12,
    });

    state = apply(state, {
      type: "START_SESSION",
      clientRequestId: "start-saved-range",
      expectedRevision: 1,
    }, "2026-07-26T12:01:00.000Z", "start-saved-range");
    state = apply(state, {
      type: "PLAY",
      positionSeconds: 0,
      clientRequestId: "play-saved-range",
      expectedRevision: 2,
    }, "2026-07-26T12:01:01.000Z", "play-saved-range");
    state = apply(state, {
      type: "PAUSE",
      positionSeconds: 20,
      clientRequestId: "pause-saved-range",
      expectedRevision: 3,
    }, "2026-07-26T12:01:09.000Z", "pause-saved-range");

    expect(state.positionSeconds).toBe(12);
    expect(state.segments[0]).toMatchObject({
      clipId: savedRange.watchId,
      sourceStartSeconds: 4,
      sourceEndSeconds: 12,
    });
    expect(episodeRoomTimelineClips(state)[0]).toMatchObject({
      assetId: clip.assetId,
      sourceStart: 4,
      sourceEnd: 12,
      duration: 8,
    });
  });

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

  test("materializes only the current rehearsal or recording pass", () => {
    let state = createEmptyEpisodeRoomState("2026-07-26T12:00:00.000Z");
    state = apply(state, {
      type: "ADD_CLIP",
      clip,
      clientRequestId: "add-current-pass",
      expectedRevision: 0,
    }, "2026-07-26T12:00:01.000Z", "add-current-pass");
    state = apply(state, {
      type: "PLAY",
      positionSeconds: 0,
      clientRequestId: "play-old-pass",
      expectedRevision: 1,
    }, "2026-07-26T12:00:02.000Z", "play-old-pass");
    state = apply(state, {
      type: "PAUSE",
      positionSeconds: 2,
      clientRequestId: "pause-old-pass",
      expectedRevision: 2,
    }, "2026-07-26T12:00:04.000Z", "pause-old-pass");
    state = apply(state, {
      type: "START_SESSION",
      clientRequestId: "start-current-pass",
      expectedRevision: 3,
    }, "2026-07-26T12:01:00.000Z", "current-pass");
    state = apply(state, {
      type: "PLAY",
      positionSeconds: 10,
      clientRequestId: "play-current-pass",
      expectedRevision: 4,
    }, "2026-07-26T12:01:01.000Z", "play-current-pass");
    state = apply(state, {
      type: "PAUSE",
      positionSeconds: 13,
      clientRequestId: "pause-current-pass",
      expectedRevision: 5,
    }, "2026-07-26T12:01:04.000Z", "pause-current-pass");

    expect(state.segments).toHaveLength(2);
    expect(episodeRoomTimelineClips(state)).toEqual([
      expect.objectContaining({
        id: "episode-room-watch-segment-play-current-pass",
        sourceStart: 10,
        sourceEnd: 13,
        startIn: 1,
        duration: 3,
      }),
    ]);
    expect(episodeRoomTimelineClips({
      ...state,
      session: undefined,
    })).toEqual([]);
  });

  test("closes a remote pause from the authoritative clock when the device has no local position", () => {
    const remoteActor: EpisodeRoomActor = {
      userId: "user-homer",
      email: "homer@example.com",
      label: "Homer",
    };
    let state = createEmptyEpisodeRoomState("2026-07-26T12:00:00.000Z");
    state = apply(state, {
      type: "ADD_CLIP",
      clip,
      clientRequestId: "add-remote-pause",
      expectedRevision: 0,
    }, "2026-07-26T12:00:01.000Z", "add-remote-pause");
    state = apply(state, {
      type: "START_SESSION",
      clientRequestId: "clock-remote-pause",
      expectedRevision: 1,
    }, "2026-07-26T12:01:00.000Z", "clock-remote-pause");
    state = apply(state, {
      type: "PLAY",
      positionSeconds: 4,
      clientRequestId: "play-remote-pause",
      expectedRevision: 2,
    }, "2026-07-26T12:01:05.000Z", "play-remote-pause");
    state = apply(state, {
      type: "PAUSE",
      clientRequestId: "pause-without-device-time",
      expectedRevision: 3,
    }, "2026-07-26T12:01:07.000Z", "pause-without-device-time", remoteActor);

    expect(state.positionSeconds).toBe(6);
    expect(state.segments[0]).toMatchObject({
      sourceStartSeconds: 4,
      sourceEndSeconds: 6,
      episodeStartSeconds: 5,
      episodeEndSeconds: 7,
    });
    expect(state.lastCommand).toMatchObject({
      command: "PAUSE",
      actorEmail: "homer@example.com",
      actorLabel: "Homer",
    });
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

  test("tracks timeline freshness by exact current-pass segment identity", () => {
    const watched = completedWatchState();
    const sourceSegmentIds = episodeRoomCurrentPassSegmentIds(watched);
    const synced = {
      ...watched,
      timelineSync: {
        syncedAt: "2026-07-26T12:01:11.000Z",
        syncedBy: "Charlie",
        sourceRevision: watched.revision,
        segmentCount: 1,
        timelineClipCount: 1,
        sourceSegmentIds,
      },
    };

    expect(sourceSegmentIds).toEqual(["segment-completed-watch"]);
    expect(episodeRoomTimelineIsCurrent(synced)).toBe(true);
    expect(episodeRoomTimelineIsCurrent({
      ...synced,
      revision: synced.revision + 1,
    })).toBe(true);
    expect(episodeRoomTimelineIsCurrent({
      ...synced,
      timelineSync: {
        ...synced.timelineSync,
        sourceSegmentIds: ["a-different-segment"],
      },
    })).toBe(false);
    expect(episodeRoomTimelineIsCurrent({
      ...synced,
      session: {
        id: "new-rehearsal-pass",
        startedAt: "2026-07-26T12:02:00.000Z",
        startedBy: "Charlie",
      },
    })).toBe(false);
  });

  test("keeps legacy revision freshness compatible while exact IDs roll forward", () => {
    const watched = completedWatchState();
    const legacy = {
      ...watched,
      timelineSync: {
        syncedAt: "2026-07-26T12:01:11.000Z",
        syncedBy: "Charlie",
        sourceRevision: watched.revision,
        segmentCount: 1,
        timelineClipCount: 1,
      },
    };

    expect(episodeRoomTimelineIsCurrent(legacy)).toBe(true);
    expect(
      episodeRoomTimelineMaterializationIsCurrent(
        legacy,
        episodeRoomTimelineClips(legacy),
      ),
    ).toBe(false);
    expect(episodeRoomTimelineIsCurrent({
      ...legacy,
      revision: legacy.revision + 1,
    })).toBe(false);
    expect(episodeRoomTimelineIsCurrent({
      ...legacy,
      session: {
        id: "empty-pass",
        startedAt: "2026-07-26T12:02:00.000Z",
        startedBy: "Charlie",
      },
      timelineSync: {
        ...legacy.timelineSync,
        sourceRevision: legacy.revision + 1,
        segmentCount: 0,
        timelineClipCount: 0,
        sourceSegmentIds: [],
      },
    })).toBe(true);
  });

  test("requires exact persisted Watch derivatives before treating sync as idempotent", () => {
    const watched = completedWatchState();
    const timeline = episodeRoomTimelineClips(watched);
    const synced = {
      ...watched,
      timelineSync: {
        syncedAt: "2026-07-26T12:01:11.000Z",
        syncedBy: "Charlie",
        sourceRevision: watched.revision,
        segmentCount: timeline.length,
        timelineClipCount: timeline.length,
        sourceSegmentIds: episodeRoomCurrentPassSegmentIds(watched),
      },
    };

    expect(episodeRoomTimelineMaterializationIsCurrent(synced, [
      { id: "unrelated-editor-clip", generatedFrom: "manual" },
      ...timeline,
    ])).toBe(true);
    expect(episodeRoomTimelineMaterializationIsCurrent(synced, [{
      ...timeline[0],
      id: "wrong-derivative-id",
    }])).toBe(false);
    expect(episodeRoomTimelineMaterializationIsCurrent(synced, [{
      ...timeline[0],
      recordingSync: {
        ...timeline[0]?.recordingSync,
        watchSegmentId: "wrong-watch-segment",
      },
    }])).toBe(false);
    expect(episodeRoomTimelineMaterializationIsCurrent(synced, [
      ...timeline,
      {
        id: "malformed-extra-watch-row",
        generatedFrom: EPISODE_ROOM_TIMELINE_SOURCE,
      },
    ])).toBe(false);
    expect(episodeRoomTimelineMaterializationIsCurrent(synced, [])).toBe(false);
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
