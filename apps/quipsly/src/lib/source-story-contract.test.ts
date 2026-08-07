import {
  SourceStoryContractError,
  normalizeCreateSourceStoryCardInput,
  normalizeRebindSourceStoryCardInput,
  stableSourceStoryJson,
} from "./source-story-contract";

function validInput() {
  return {
    projectId: "project_01",
    mediaAssetId: "asset_01",
    boardId: "board_01",
    expectedBoardRevision: 4,
    clientRequestId: "2c55e4c6-82e4-4c98-a95f-28f9895fe7ad",
    title: "  Homer finds the reveal  ",
    synopsis: "  The turn that changes the section. ",
    notes: " Keep the reaction after the line. ",
    purpose: "payoff" as const,
    startSeconds: 14.12345649,
    endSeconds: 28.75,
    groupKey: "Act 2",
    laneKey: "Story",
    tagIds: ["tag_b", "tag_a", "tag_b"],
  };
}

describe("source-story contract", () => {
  it("normalizes one immutable source range and card intent", () => {
    expect(normalizeCreateSourceStoryCardInput(validInput())).toEqual({
      schema: "quipsly-source-story-v1",
      projectId: "project_01",
      mediaAssetId: "asset_01",
      boardId: "board_01",
      expectedBoardRevision: 4,
      clientRequestId: "2c55e4c6-82e4-4c98-a95f-28f9895fe7ad",
      title: "Homer finds the reveal",
      synopsis: "The turn that changes the section.",
      notes: "Keep the reaction after the line.",
      purpose: "payoff",
      startSeconds: 14.123456,
      endSeconds: 28.75,
      groupKey: "act-2",
      laneKey: "story",
      tagIds: ["tag_a", "tag_b"],
      reframeRecipe: null,
    });
  });

  it("requires optimistic board authority before placement", () => {
    expect(() => normalizeCreateSourceStoryCardInput({
      ...validInput(),
      expectedBoardRevision: null,
    })).toThrow("current board revision");
  });

  it("rejects reversed, tiny, non-finite, and out-of-bound source ranges", () => {
    for (const [startSeconds, endSeconds] of [
      [8, 7],
      [8, 8.01],
      [Number.NaN, 9],
      [0, 8 * 24 * 60 * 60],
    ]) {
      expect(() => normalizeCreateSourceStoryCardInput({ ...validInput(), startSeconds, endSeconds })).toThrow(SourceStoryContractError);
    }
  });

  it("preserves a bounded, ordered 360 reframe recipe separately from source time", () => {
    const normalized = normalizeCreateSourceStoryCardInput({
      ...validInput(),
      reframeRecipe: {
        schema: "quipsly-360-reframe-v1",
        projection: "equirectangular",
        aspectRatio: "16:9",
        stabilization: "flowstate",
        horizonLock: true,
        keyframes: [
          { sourceSeconds: 15, panDegrees: -30, tiltDegrees: 4, rollDegrees: 0, fieldOfViewDegrees: 90, interpolation: "ease" },
          { sourceSeconds: 27, panDegrees: 70, tiltDegrees: 0, rollDegrees: 0, fieldOfViewDegrees: 65, interpolation: "linear" },
        ],
      },
    });
    expect(normalized.reframeRecipe?.keyframes).toHaveLength(2);
    expect(normalized.reframeRecipe?.stabilization).toBe("flowstate");
  });

  it("normalizes an explicit source rebind without accepting an implicit current range", () => {
    expect(normalizeRebindSourceStoryCardInput({
      projectId: "project_01",
      cardId: "card_01",
      expectedRevision: 3,
      expectedSourceRangeId: "range_old",
      replacementMediaAssetId: "asset_exact",
      clientRequestId: "2c55e4c6-82e4-4c98-a95f-28f9895fe7ad",
      startSeconds: 1.12345649,
      endSeconds: 9.5,
      reason: "  Rebind after exact bytes were registered.  ",
    })).toEqual({
      schema: "quipsly-source-story-v1",
      projectId: "project_01",
      cardId: "card_01",
      expectedRevision: 3,
      expectedSourceRangeId: "range_old",
      replacementMediaAssetId: "asset_exact",
      clientRequestId: "2c55e4c6-82e4-4c98-a95f-28f9895fe7ad",
      startSeconds: 1.123456,
      endSeconds: 9.5,
      reason: "Rebind after exact bytes were registered.",
      reframeRecipe: null,
    });
    expect(() => normalizeRebindSourceStoryCardInput({
      projectId: "project_01",
      cardId: "card_01",
      expectedRevision: 3,
      expectedSourceRangeId: "",
      replacementMediaAssetId: "asset_exact",
      clientRequestId: "2c55e4c6-82e4-4c98-a95f-28f9895fe7ad",
      startSeconds: 1,
      endSeconds: 2,
      reason: "repair",
    })).toThrow("expectedSourceRangeId is required");
  });

  it("rejects 360 keyframes outside the selected range or view envelope", () => {
    const recipe = {
      schema: "quipsly-360-reframe-v1" as const,
      projection: "equirectangular" as const,
      aspectRatio: "16:9" as const,
      stabilization: "source" as const,
      horizonLock: false,
      keyframes: [
        { sourceSeconds: 10, panDegrees: 0, tiltDegrees: 0, rollDegrees: 0, fieldOfViewDegrees: 90, interpolation: "linear" as const },
      ],
    };
    expect(() => normalizeCreateSourceStoryCardInput({ ...validInput(), reframeRecipe: recipe })).toThrow("inside the selected source range");
    expect(() => normalizeCreateSourceStoryCardInput({
      ...validInput(),
      reframeRecipe: { ...recipe, keyframes: [{ ...recipe.keyframes[0], sourceSeconds: 20, fieldOfViewDegrees: 190 }] },
    })).toThrow("unsupported view values");
  });

  it("canonicalizes object keys while retaining array order", () => {
    expect(stableSourceStoryJson({ b: 2, a: { d: [2, 1], c: true } }))
      .toBe('{"a":{"c":true,"d":[2,1]},"b":2}');
  });
});
