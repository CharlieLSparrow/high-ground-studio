import assert from "node:assert/strict";
import test from "node:test";

import {
  assertRehearsalManuscript,
  assertRehearsalState,
  expectedMediaForClip,
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
  assert.equal(result.clips.length, 3);
});

test("accepts the exact canonical 34-block rehearsal manuscript", () => {
  const document = {
    ok: true,
    canEdit: true,
    episode: {
      slug: "testflight-rehearsal",
      title: "Testflight Rehearsal",
      documentTitle: "High Ground Odyssey Rehearsal Production Document",
    },
    writing: {
      version: "writing-v34",
      blockCount: 34,
      visibleBlockCount: 34,
      truncated: false,
      textBlocks: Array.from({ length: 34 }, (_, index) => ({
        id: `block-${index + 1}`,
        stableId: `swear-jar-${index + 1}`,
        order: index + 1,
        title: index % 2 === 0 ? null : "Homer",
        body:
          index === 0
            ? "**THE SWEAR JAR**\nHigh Ground Odyssey rehearsal."
            : `Rehearsal block ${index + 1}`,
      })),
    },
  };

  const state = assertRehearsalManuscript(document);
  assert.equal(state.episodeTitle, "Testflight Rehearsal");
  assert.equal(
    state.documentTitle,
    "High Ground Odyssey Rehearsal Production Document",
  );
  assert.equal(state.blockCount, 34);
  assert.equal(state.deliveredBlockCount, 34);
  assert.equal(state.canonicalHeading, "**THE SWEAR JAR**");
  assert.equal(state.stableIdsUnique, true);
  assert.equal(state.allBodiesPresent, true);
});

test("rejects manuscript drift, duplicate identity, or missing text", () => {
  const blocks = Array.from({ length: 34 }, (_, index) => ({
    id: `block-${index + 1}`,
    stableId: `swear-jar-${index + 1}`,
    order: index + 1,
    title: null,
    body:
      index === 0
        ? "**THE SWEAR JAR**\nHigh Ground Odyssey rehearsal."
        : `Rehearsal block ${index + 1}`,
  }));
  const safe = {
    ok: true,
    canEdit: true,
    episode: {
      slug: "testflight-rehearsal",
      title: "Testflight Rehearsal",
      documentTitle: "High Ground Odyssey Rehearsal Production Document",
    },
    writing: {
      version: "writing-v34",
      blockCount: 34,
      visibleBlockCount: 34,
      truncated: false,
      textBlocks: blocks,
    },
  };

  assert.throws(
    () => assertRehearsalManuscript({
      ...safe,
      writing: { ...safe.writing, blockCount: 35 },
    }),
    /failed its native-read contract/,
  );
  assert.throws(
    () => assertRehearsalManuscript({
      ...safe,
      writing: {
        ...safe.writing,
        textBlocks: [
          ...blocks.slice(0, 33),
          { ...blocks[33], stableId: blocks[0].stableId },
        ],
      },
    }),
    /failed its native-read contract/,
  );
  assert.throws(
    () => assertRehearsalManuscript({
      ...safe,
      writing: {
        ...safe.writing,
        textBlocks: [
          { ...blocks[0], body: "" },
          ...blocks.slice(1),
        ],
      },
    }),
    /failed its native-read contract/,
  );
});

test("pins every staged clip to its immutable local media identity", () => {
  assert.deepEqual(
    CLIPS.map((clip) => expectedMediaForClip(clip).byteCount),
    [19_100_059, 10_880_177, 28_459_489],
  );
  assert.throws(
    () => expectedMediaForClip({ title: "Unreviewed surprise.mp4" }),
    /No immutable rehearsal media identity is pinned/,
  );
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
