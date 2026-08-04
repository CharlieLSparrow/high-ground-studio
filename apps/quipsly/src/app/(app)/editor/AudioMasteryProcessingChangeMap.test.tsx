import { fireEvent, render, screen } from "@testing-library/react";

import { AudioMasteryAudition } from "./AudioMasteryAudition";
import type { AudioMasteryMeasurement } from "./AudioMasteryAudition";
import {
  audioProcessingAdjacentMoment,
  audioProcessingAttentionMoments,
  audioProcessingDeltaSeries,
} from "./AudioProcessingChangeMap";

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
    const source = measurement(-24, [-30, -26, -22, -18]);
    const mastered = measurement(-16, [-21, -18, -14, -11]);
    const moments = audioProcessingAttentionMoments(audioProcessingDeltaSeries(source, mastered), [{ kind: "near-silence", severity: "attention", startSeconds: 2.5, endSeconds: 3, detail: "Listen to the source interval." }]);
    expect(moments.some((moment) => moment.category === "dynamic-shape")).toBe(true);
    expect(moments.some((moment) => moment.category === "source-signal")).toBe(true);
    expect(audioProcessingAdjacentMoment(moments, 0, "next")).toEqual(expect.objectContaining({ timeSeconds: expect.any(Number) }));

    render(<AudioMasteryAudition
      sourceUrl="/source.wav"
      masteredUrl="/master.wav"
      source={source}
      mastered={mastered}
      targetLufs={-16}
      maximumTruePeakDbtp={-1}
      diagnosis={null}
    />);

    fireEvent.click(screen.getByRole("button", { name: /open full audition desk/i }));
    expect(screen.getByText("Processing change map")).toBeInTheDocument();
    expect(screen.getByText(/not compressor gain reduction/i)).toBeInTheDocument();
    expect(screen.getByText(/Level delta includes overall level change/i)).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Processing change map review navigator" })).toHaveTextContent(/bounded source-clock comparison points/i);
    expect(screen.getByRole("img", { name: /processing change map over the source clock/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /select a position to move synchronized audition playback/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "15 sec" }));
    expect(screen.getByRole("button", { name: "15 sec" })).toHaveAttribute("aria-pressed", "true");

    fireEvent.click(screen.getByRole("button", { name: /Next change/i }));
    expect(screen.getByRole("button", { name: "15 sec" })).toHaveAttribute("aria-pressed", "true");
  });
});
