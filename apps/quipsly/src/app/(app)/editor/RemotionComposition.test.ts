/** @jest-environment node */

import { computeRenderSegments } from "./RemotionComposition";

describe("active edit render projection", () => {
  it("splits and ripples media around a reversible exact range", () => {
    const segments = computeRenderSegments({
      editorMode: "play-edit",
      transcript: [],
      deactivatedRanges: [{
        id: "range-1",
        startSeconds: 2,
        durationSeconds: 2,
        reason: "Measured low energy.",
        source: "deterministic-signal",
      }],
      clips: [{
        id: "audio",
        assetId: "episode.wav",
        kind: "audio",
        startIn: 0,
        duration: 10,
        sourceStart: 0,
        sourceEnd: 10,
        name: "Episode audio",
        color: "#000",
        trackId: "A1",
      }],
    });

    expect(segments).toEqual([
      expect.objectContaining({ renderStartIn: 0, renderDuration: 2, renderSourceStart: 0, renderSourceEnd: 2 }),
      expect.objectContaining({ renderStartIn: 2, renderDuration: 6, renderSourceStart: 4, renderSourceEnd: 10 }),
    ]);
  });

  it("keeps the complete source in source-review mode", () => {
    const segments = computeRenderSegments({
      editorMode: "play-all",
      transcript: [],
      deactivatedRanges: [{ id: "range-1", startSeconds: 2, durationSeconds: 2, reason: "Review", source: "manual" }],
      clips: [{
        id: "audio",
        assetId: "episode.wav",
        kind: "audio",
        startIn: 0,
        duration: 10,
        sourceStart: 0,
        sourceEnd: 10,
        name: "Episode audio",
        color: "#000",
        trackId: "A1",
      }],
    });
    expect(segments).toEqual([expect.objectContaining({ renderStartIn: 0, renderDuration: 10 })]);
  });
});
