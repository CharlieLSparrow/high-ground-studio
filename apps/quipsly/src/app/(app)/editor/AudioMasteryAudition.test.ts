import { audioMasteryReviewMoments, type AudioMasteryMeasurement } from "./AudioMasteryAudition";

function measurement(series: AudioMasteryMeasurement["series"]): AudioMasteryMeasurement {
  return {
    measuredAt: "2026-08-03T20:00:00.000Z",
    durationSeconds: 12,
    integratedLufs: -20,
    truePeakDbtp: -2,
    loudnessRangeLu: 4,
    thresholdLufs: -30,
    seriesResolutionMs: 1_000,
    series,
  };
}

describe("audio mastery review moments", () => {
  it("points to evidence-bearing source extremes and the largest aligned processing shift", () => {
    const source = measurement([
      { timeMs: 1_000, momentaryLufs: -20, shortTermLufs: -22, integratedLufs: -22, truePeakDbtp: -5 },
      { timeMs: 5_000, momentaryLufs: -31, shortTermLufs: -34, integratedLufs: -25, truePeakDbtp: -8 },
      { timeMs: 9_000, momentaryLufs: -12, shortTermLufs: -16, integratedLufs: -20, truePeakDbtp: -0.7 },
    ]);
    const mastered = measurement([
      { timeMs: 1_100, momentaryLufs: -17, shortTermLufs: -18, integratedLufs: -18, truePeakDbtp: -3 },
      { timeMs: 5_100, momentaryLufs: -21, shortTermLufs: -22, integratedLufs: -17, truePeakDbtp: -2 },
      { timeMs: 9_100, momentaryLufs: -14, shortTermLufs: -15, integratedLufs: -16, truePeakDbtp: -1.5 },
    ]);

    expect(audioMasteryReviewMoments(source, mastered)).toEqual([
      expect.objectContaining({ id: "loudest-source", timeSeconds: 9 }),
      expect.objectContaining({ id: "quietest-sustained", timeSeconds: 5 }),
      expect.objectContaining({ id: "largest-shift", timeSeconds: 5, detail: "+12.0 LU at the same decoded moment" }),
    ]);
  });

  it("does not invent review moments when the decoded series lacks the required evidence", () => {
    const empty = measurement([{ timeMs: 1_000, momentaryLufs: null, shortTermLufs: null, integratedLufs: null, truePeakDbtp: null }]);
    expect(audioMasteryReviewMoments(empty, empty)).toEqual([]);
  });
});
