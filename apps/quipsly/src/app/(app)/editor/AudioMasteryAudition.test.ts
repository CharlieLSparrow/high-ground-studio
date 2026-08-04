import {
  audioMasteryAuditionGains,
  audioMasteryReviewMoments,
} from "./AudioMasteryAudition";
import { audioMasteryReviewCoverage, parseAudioMasteryPlaybackReviewEvidence } from "@high-ground/quipsly-media-processing";
import type { AudioMasteryMeasurement } from "./AudioMasteryAudition";
import {
  audioProcessingDeltaSeries,
  audioProcessingPointAt,
  audioProcessingSummary,
  audioProcessingViewSpan,
} from "./AudioProcessingChangeMap";

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

describe("audio mastery playback decision evidence", () => {
  it("requires the recommended neighborhoods in both versions and both monitor modes for approval", () => {
    const source = measurement([
      { timeMs: 1_000, momentaryLufs: -20, shortTermLufs: -22, integratedLufs: -22, truePeakDbtp: -5 },
      { timeMs: 5_000, momentaryLufs: -31, shortTermLufs: -34, integratedLufs: -25, truePeakDbtp: -8 },
      { timeMs: 9_000, momentaryLufs: -12, shortTermLufs: -16, integratedLufs: -20, truePeakDbtp: -0.7 },
    ]);
    const mastered = measurement([
      { timeMs: 1_000, momentaryLufs: -17, shortTermLufs: -18, integratedLufs: -18, truePeakDbtp: -3 },
      { timeMs: 5_000, momentaryLufs: -21, shortTermLufs: -22, integratedLufs: -17, truePeakDbtp: -2 },
      { timeMs: 9_000, momentaryLufs: -14, shortTermLufs: -15, integratedLufs: -16, truePeakDbtp: -1.5 },
    ]);
    const incomplete = audioMasteryReviewCoverage(source, mastered, { sourceListenedSecondBins: [0, 1, 2], masteredListenedSecondBins: [0, 1, 2], monitorModes: ["matched"] });
    expect(incomplete.approvalReady).toBe(false);
    const completeBins = [0, 1, 2, 4, 5, 6, 8, 9, 10];
    const complete = audioMasteryReviewCoverage(source, mastered, { sourceListenedSecondBins: completeBins, masteredListenedSecondBins: completeBins, monitorModes: ["matched", "delivery"] });
    expect(complete).toMatchObject({ sourceComplete: true, masteredComplete: true, matchedMonitorObserved: true, deliveryMonitorObserved: true, approvalReady: true });
  });

  it("rejects out-of-range or unbounded playback bins", () => {
    expect(() => parseAudioMasteryPlaybackReviewEvidence({ schema: "quipsly-audio-mastery-playback-review-v1", sourceListenedSecondBins: [99], masteredListenedSecondBins: [], monitorModes: [], completedAt: "2026-08-04T19:00:00.000Z" }, 12, 12)).toThrow(/invalid or unbounded/i);
  });

  it("requires a recent, bounded client completion time", () => {
    const evidence = { schema: "quipsly-audio-mastery-playback-review-v1", sourceListenedSecondBins: [], masteredListenedSecondBins: [], monitorModes: [] };
    expect(() => parseAudioMasteryPlaybackReviewEvidence({ ...evidence, completedAt: new Date(Date.now() - 25 * 60 * 60_000).toISOString() }, 12, 12)).toThrow(/recent completion time/i);
    expect(() => parseAudioMasteryPlaybackReviewEvidence({ ...evidence, completedAt: new Date(Date.now() + 6 * 60_000).toISOString() }, 12, 12)).toThrow(/recent completion time/i);
    expect(parseAudioMasteryPlaybackReviewEvidence({ ...evidence, completedAt: new Date().toISOString() }, 12, 12).completedAt).toMatch(/Z$/);
  });
});

describe("audio mastery processing-change evidence", () => {
  it("separates uniform program loudness shift from dynamic-shape change", () => {
    const source = { ...measurement([
      { timeMs: 1_000, momentaryLufs: -30, shortTermLufs: -30, integratedLufs: -30, truePeakDbtp: -8 },
      { timeMs: 5_000, momentaryLufs: -24, shortTermLufs: -24, integratedLufs: -27, truePeakDbtp: -4 },
      { timeMs: 9_000, momentaryLufs: -18, shortTermLufs: -18, integratedLufs: -24, truePeakDbtp: -1 },
    ]), integratedLufs: -24 };
    const mastered = { ...measurement([
      { timeMs: 1_050, momentaryLufs: -20, shortTermLufs: -20, integratedLufs: -20, truePeakDbtp: -5 },
      { timeMs: 5_050, momentaryLufs: -16, shortTermLufs: -16, integratedLufs: -18, truePeakDbtp: -2 },
      { timeMs: 9_050, momentaryLufs: -10, shortTermLufs: -10, integratedLufs: -16, truePeakDbtp: -1 },
    ]), integratedLufs: -16 };

    const points = audioProcessingDeltaSeries(source, mastered);
    expect(points).toEqual([
      expect.objectContaining({ timeSeconds: 1, levelDeltaLu: 10, shapeDeltaLu: 2 }),
      expect.objectContaining({ timeSeconds: 5, levelDeltaLu: 8, shapeDeltaLu: 0 }),
      expect.objectContaining({ timeSeconds: 9, levelDeltaLu: 8, shapeDeltaLu: 0 }),
    ]);
    expect(audioProcessingPointAt(points, 1.4)).toEqual(expect.objectContaining({ timeSeconds: 1 }));
    expect(audioProcessingSummary(points)).toEqual({
      pointCount: 3,
      meanAbsoluteShapeDeltaLu: 2 / 3,
      largestShapeDelta: expect.objectContaining({ timeSeconds: 1, shapeDeltaLu: 2 }),
    });
  });

  it("bounds whole, minute, and detail views on the shared source clock", () => {
    expect(audioProcessingViewSpan(180, 7, "minute")).toEqual({ startSeconds: 0, endSeconds: 60, durationSeconds: 60 });
    expect(audioProcessingViewSpan(180, 176, "detail")).toEqual({ startSeconds: 165, endSeconds: 180, durationSeconds: 15 });
    expect(audioProcessingViewSpan(12, 6, "minute")).toEqual({ startSeconds: 0, endSeconds: 12, durationSeconds: 12 });
  });

  it("does not invent processing evidence when aligned short-term measurements are absent", () => {
    const empty = measurement([{ timeMs: 1_000, momentaryLufs: null, shortTermLufs: null, integratedLufs: null, truePeakDbtp: null }]);
    expect(audioProcessingDeltaSeries(empty, empty)).toEqual([]);
    expect(audioProcessingPointAt([], 5)).toBeNull();
    expect(audioProcessingSummary([])).toEqual({ pointCount: 0, meanAbsoluteShapeDeltaLu: null, largestShapeDelta: null });
  });
});
