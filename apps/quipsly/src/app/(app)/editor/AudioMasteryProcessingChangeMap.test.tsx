import { fireEvent, render, screen } from "@testing-library/react";

import { AudioMasteryAudition } from "./AudioMasteryAudition";
import type { AudioMasteryMeasurement } from "./AudioMasteryAudition";

function measurement(integratedLufs: number, shortTermLufs: number[]): AudioMasteryMeasurement {
  return {
    measuredAt: "2026-08-04T12:00:00.000Z",
    durationSeconds: shortTermLufs.length,
    integratedLufs,
    truePeakDbtp: -2,
    loudnessRangeLu: 4,
    thresholdLufs: -40,
    seriesResolutionMs: 1_000,
    series: shortTermLufs.map((value, index) => ({
      timeMs: index * 1_000,
      momentaryLufs: value,
      shortTermLufs: value,
      integratedLufs,
      truePeakDbtp: -3,
    })),
  };
}

describe("AudioMasteryAudition processing transparency", () => {
  it("renders an honest interactive change map on the synchronized audition clock", () => {
    render(<AudioMasteryAudition
      sourceUrl="/source.wav"
      masteredUrl="/master.wav"
      source={measurement(-24, [-30, -26, -22, -18])}
      mastered={measurement(-16, [-21, -18, -14, -11])}
      targetLufs={-16}
      maximumTruePeakDbtp={-1}
      diagnosis={null}
    />);

    fireEvent.click(screen.getByRole("button", { name: /open full audition desk/i }));
    expect(screen.getByText("Processing change map")).toBeInTheDocument();
    expect(screen.getByText(/not compressor gain reduction/i)).toBeInTheDocument();
    expect(screen.getByText(/Level delta includes overall level change/i)).toBeInTheDocument();
    expect(screen.getByRole("img", { name: /processing change map over the source clock/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /select a position to move synchronized audition playback/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "15 sec" }));
    expect(screen.getByRole("button", { name: "15 sec" })).toHaveAttribute("aria-pressed", "true");
  });
});
