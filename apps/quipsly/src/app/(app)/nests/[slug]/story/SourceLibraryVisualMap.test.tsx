import { render, screen } from "@testing-library/react";

import {
  SourceLibraryVisualMap,
  sourceLibraryVisualSampleIndexes,
} from "./SourceLibraryVisualMap";

const visualOverview = {
  id: "visual-1",
  playbackUrl: "/api/media/derivatives/visual-1",
  navigationFrames: {
    columns: 4,
    rows: 2,
    sampleTimesSeconds: [3.75, 11.25, 18.75, 26.25, 33.75, 41.25, 48.75, 56.25],
  },
};

describe("SourceLibraryVisualMap", () => {
  it("shows representative first, middle, and last source-clock cells without squeezing the sprite", () => {
    const { container } = render(
      <SourceLibraryVisualMap
        visualOverview={visualOverview}
        sourceLabel="Homer lake walk"
      />,
    );

    expect(
      screen.getByRole("img", {
        name: "Homer lake walk visual map with 8 source-time samples from 0:03 to 0:56",
      }),
    ).toBeInTheDocument();
    expect(screen.getByText("0:03")).toBeInTheDocument();
    expect(screen.getByText("0:33")).toBeInTheDocument();
    expect(screen.getByText("0:56")).toBeInTheDocument();
    expect(container.querySelectorAll('[style*="visual-1"]')).toHaveLength(3);
  });

  it("uses bounded evenly distributed samples and rejects an invalid grid", () => {
    expect(sourceLibraryVisualSampleIndexes(8, 3)).toEqual([0, 4, 7]);
    expect(sourceLibraryVisualSampleIndexes(8, 2)).toEqual([0, 7]);
    expect(sourceLibraryVisualSampleIndexes(1, 3)).toEqual([0]);

    const { container } = render(
      <SourceLibraryVisualMap
        visualOverview={{
          ...visualOverview,
          navigationFrames: {
            ...visualOverview.navigationFrames,
            columns: 0,
          },
        }}
        sourceLabel="Broken map"
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});
