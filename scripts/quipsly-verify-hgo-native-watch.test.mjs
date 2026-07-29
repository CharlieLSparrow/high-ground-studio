import assert from "node:assert/strict";
import test from "node:test";

import {
  assertRehearsalState,
  parseArguments,
} from "./quipsly-verify-hgo-native-watch.mjs";

const CLIPS = [
  {
    assetId: "be-curious",
    title: "Ted Lasso Be Curious.mp4",
    playbackUrl: "/api/ingest/media/be-curious",
  },
  {
    assetId: "lucy",
    title: "I love lucy.mp4",
    playbackUrl: "/api/ingest/media/lucy",
  },
  {
    assetId: "lotr",
    title: "LOTR Ring Back.mp4",
    playbackUrl: "/api/ingest/media/lotr",
  },
];

function safeWatch(overrides = {}) {
  return {
    outsiderDenied: true,
    document: {
      ok: true,
      canEdit: true,
      serverNow: "2026-07-29T10:19:32.000Z",
      room: {
        version: "quipsly-episode-room.v1",
        revision: 5,
        status: "paused",
        positionSeconds: 0,
        selectedClipId: "be-curious",
        clips: CLIPS,
        segments: [],
        receipts: [],
        ...overrides,
      },
    },
  };
}

test("requires an explicit path-free HTTPS preview origin", () => {
  assert.throws(
    () => parseArguments(["--base-url", "http://localhost:3000"]),
    /explicit HTTPS preview origin/,
  );
  assert.throws(
    () => parseArguments(["--base-url", "https://preview.example.test/path"]),
    /origin without a path/,
  );
  assert.equal(
    parseArguments(["--base-url", "https://preview.example.test"]).baseUrl,
    "https://preview.example.test",
  );
});

test("accepts the exact paused, session-free rehearsal Watch state", () => {
  const result = assertRehearsalState(safeWatch());
  assert.equal(result.state.exactClipOrder, true);
  assert.equal(result.state.leadSelected, true);
  assert.equal(result.state.sessionStarted, false);
  assert.equal(result.state.watchedSegmentCount, 0);
  assert.equal(result.selectedClip.assetId, "be-curious");
});

test("rejects a reordered lead clip", () => {
  assert.throws(
    () => assertRehearsalState(safeWatch({
      clips: [CLIPS[1], CLIPS[0], CLIPS[2]],
    })),
    /failed its safety contract/,
  );
});

test("rejects an invented rehearsal session or watched segment", () => {
  assert.throws(
    () => assertRehearsalState(safeWatch({
      session: {
        id: "unexpected-session",
        startedAt: "2026-07-29T10:19:32.000Z",
        startedBy: "Nobody",
      },
    })),
    /failed its safety contract/,
  );
  assert.throws(
    () => assertRehearsalState(safeWatch({
      segments: [{ id: "unexpected-segment" }],
    })),
    /failed its safety contract/,
  );
});
