/** @jest-environment node */

jest.mock("server-only", () => ({}));

import {
  episodeRoomWritingUpdatedAt,
  episodeRoomWritingVersion,
} from "./episode-room-writing";

const base = {
  documentUpdatedAt: new Date("2026-07-27T10:00:00.000Z"),
  latestBlockUpdatedAt: new Date("2026-07-27T10:02:00.000Z"),
  blockCount: 4,
  latestOperationId: "operation-4",
};

describe("Episode Room writing revision", () => {
  it("is stable for the same canonical writing signals", () => {
    expect(episodeRoomWritingVersion(base)).toBe(
      episodeRoomWritingVersion({ ...base }),
    );
  });

  it.each([
    ["document timestamp", { documentUpdatedAt: new Date("2026-07-27T10:03:00.000Z") }],
    ["block timestamp", { latestBlockUpdatedAt: new Date("2026-07-27T10:03:00.000Z") }],
    ["block count", { blockCount: 5 }],
    ["operation receipt", { latestOperationId: "operation-5" }],
  ])("changes when the %s changes", (_label, change) => {
    expect(episodeRoomWritingVersion({ ...base, ...change })).not.toBe(
      episodeRoomWritingVersion(base),
    );
  });

  it("reports the latest canonical writing timestamp", () => {
    expect(episodeRoomWritingUpdatedAt(base)).toBe("2026-07-27T10:02:00.000Z");
    expect(episodeRoomWritingUpdatedAt({
      documentUpdatedAt: new Date("2026-07-27T10:04:00.000Z"),
      latestBlockUpdatedAt: base.latestBlockUpdatedAt,
    })).toBe("2026-07-27T10:04:00.000Z");
  });
});
