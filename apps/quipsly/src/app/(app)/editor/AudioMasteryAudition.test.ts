import { audioMasteryAuditionGains, audioMasteryReviewMoments, type AudioMasteryMeasurement } from "./AudioMasteryAudition";

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

describe("audio mastery audition monitor gain", () => {
  it("attenuates only the louder preview for a level-matched comparison", () => {
    const gains = audioMasteryAuditionGains(-46.56, -15.97, "matched");
    expect(gains.sourceGain).toBe(1);
    expect(gains.masteredGain).toBeCloseTo(0.0295, 3);
    expect(gains.sourceAdjustmentDb).toBe(0);
    expect(gains.masteredAdjustmentDb).toBeCloseTo(-30.59, 2);
    expect(gains.referenceLufs).toBe(-46.56);
  });

  it("attenuates the source when it is the louder version", () => {
    const gains = audioMasteryAuditionGains(-12, -18, "matched");
    expect(gains.sourceGain).toBeCloseTo(0.5012, 3);
    expect(gains.masteredGain).toBe(1);
    expect(gains.sourceAdjustmentDb).toBe(-6);
    expect(gains.masteredAdjustmentDb).toBe(0);
  });

  it("uses unity monitor gain for delivery-level review", () => {
    expect(audioMasteryAuditionGains(-46.56, -15.97, "delivery")).toEqual({
      sourceGain: 1,
      masteredGain: 1,
      sourceAdjustmentDb: 0,
      masteredAdjustmentDb: 0,
      referenceLufs: null,
    });
  });
});
