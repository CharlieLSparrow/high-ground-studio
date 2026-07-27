/** @jest-environment node */

import {
  requireCurrentEpisodeProductionRevision,
} from "./episode-production-revision";

describe("episode production revision boundary", () => {
  const actual = new Date(
    "2026-07-27T21:00:00.123Z",
  );

  it("accepts the exact persisted revision", () => {
    expect(
      requireCurrentEpisodeProductionRevision(
        "2026-07-27T15:00:00.123-06:00",
        actual,
      ),
    ).toEqual({
      ok: true,
      expectedUpdatedAt: actual,
      actualUpdatedAt:
        "2026-07-27T21:00:00.123Z",
    });
  });

  it("requires a revision for consequential review changes", () => {
    expect(
      requireCurrentEpisodeProductionRevision(
        undefined,
        actual,
      ),
    ).toMatchObject({
      ok: false,
      code: "episode-production-revision-required",
      actualUpdatedAt:
        "2026-07-27T21:00:00.123Z",
    });
  });

  it("rejects a stale revision", () => {
    expect(
      requireCurrentEpisodeProductionRevision(
        "2026-07-27T20:59:59.999Z",
        actual,
      ),
    ).toMatchObject({
      ok: false,
      code: "episode-production-revision-stale",
      actualUpdatedAt:
        "2026-07-27T21:00:00.123Z",
    });
  });
});
