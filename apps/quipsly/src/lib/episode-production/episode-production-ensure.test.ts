/** @jest-environment node */

import {
  planExistingEpisodeProductionEnsure,
} from "./episode-production-ensure";

const existing = {
  title: "Episode 5",
  boundaryLabel: "Episode 5",
  boundaryKind: "episode",
  boundaryStartBlockId: null,
  boundaryEndBlockId: null,
  boundaryStartOrder: null,
  boundaryEndOrder: null,
};

describe("episode production ensure", () => {
  it("does not manufacture a revision for an unchanged load", () => {
    expect(
      planExistingEpisodeProductionEnsure(
        existing,
        {
          title: "Episode 5",
          boundaryLabel: "Episode 5",
          boundaryKind: "episode",
        },
      ),
    ).toBeNull();
  });

  it("repairs only changed canonical identity fields", () => {
    expect(
      planExistingEpisodeProductionEnsure(
        existing,
        {
          title: "Episode Five",
          boundaryLabel: "Episode 5",
          boundaryKind: "episode",
          boundaryStartBlockId:
            "block-opening",
        },
      ),
    ).toEqual({
      title: "Episode Five",
      boundaryStartBlockId:
        "block-opening",
    });
  });

  it("does not clear optional boundaries that were omitted by a reader", () => {
    expect(
      planExistingEpisodeProductionEnsure(
        {
          ...existing,
          boundaryStartBlockId:
            "block-opening",
          boundaryStartOrder: 4,
        },
        {
          title: "Episode 5",
          boundaryLabel: "Episode 5",
          boundaryKind: "episode",
        },
      ),
    ).toBeNull();
  });
});
