/** @jest-environment node */

import { computeProgramRenderSegments, computeRenderSegments } from "./RemotionComposition";

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

  it("renders the same persisted speaker-camera decisions used by the edit monitor", () => {
    const segments = computeProgramRenderSegments({
      editorMode: "play-edit",
      transcript: [],
      clips: [
        { id: "charlie", assetId: "charlie.mp4", kind: "video", startIn: 0, duration: 10, sourceStart: 0, sourceEnd: 10, name: "Charlie", color: "#111", trackId: "V1" },
        { id: "homer", assetId: "homer.mp4", kind: "video", startIn: 0, duration: 10, sourceStart: 0, sourceEnd: 10, name: "Homer", color: "#222", trackId: "V2" },
        { id: "mix", assetId: "mix.wav", kind: "audio", startIn: 0, duration: 10, sourceStart: 0, sourceEnd: 10, name: "Mix", color: "#333", trackId: "A1" },
      ],
      cameraSwitchDecisions: [
        { id: "camera-switch:charlie:0", startSeconds: 0, durationSeconds: 5, speakerKey: "charlie", speakerLabel: "Charlie", targetClipId: "charlie", targetAssetId: "charlie.mp4", mappingId: "map-charlie", source: "deterministic-speaker", status: "draft", createdAt: "2026-08-03T00:00:00.000Z", evidence: { transcriptBlockIds: ["b1"] } },
        { id: "camera-switch:homer:5000", startSeconds: 5, durationSeconds: 5, speakerKey: "homer", speakerLabel: "Homer", targetClipId: "homer", targetAssetId: "homer.mp4", mappingId: "map-homer", source: "deterministic-speaker", status: "draft", createdAt: "2026-08-03T00:00:00.000Z", evidence: { transcriptBlockIds: ["b2"] } },
      ],
    });

    expect(segments.filter((segment) => segment.kind === "video")).toEqual([
      expect.objectContaining({ sourceClipId: "charlie", renderStartIn: 0, renderDuration: 5 }),
      expect.objectContaining({ sourceClipId: "homer", renderStartIn: 5, renderDuration: 5 }),
    ]);
    expect(segments.filter((segment) => segment.kind === "audio")).toHaveLength(1);
  });
});
