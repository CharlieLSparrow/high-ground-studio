import {
  copySourceSelectionDraft,
  emptySourceSelectionDraft,
  sourceSelectionDraftFor,
} from "./source-selection-drafts";

describe("source selection drafts", () => {
  it("keeps unfinished decisions isolated by canonical source key", () => {
    const first = emptySourceSelectionDraft({ preserve360: true });
    first.inPoint = 12.25;
    first.outPoint = 24.5;
    first.title = "Shoreline reaction";
    first.selectedTagIds.push("tag-episode-5");
    first.reframeKeyframes.push({
      sourceSeconds: 18,
      panDegrees: 30,
      tiltDegrees: -5,
      rollDegrees: 0,
      fieldOfViewDegrees: 72,
      interpolation: "ease",
    });
    const drafts = new Map([["source-set:segment-4", first]]);

    const restored = sourceSelectionDraftFor(drafts, "source-set:segment-4");
    const unrelated = sourceSelectionDraftFor(drafts, "source-set:segment-5", {
      preserve360: true,
    });

    expect(restored).toMatchObject({
      inPoint: 12.25,
      outPoint: 24.5,
      title: "Shoreline reaction",
      preserve360: true,
    });
    expect(unrelated).toMatchObject({
      inPoint: null,
      outPoint: null,
      title: "",
      preserve360: true,
    });

    restored.selectedTagIds.push("tag-local-change");
    restored.reframeKeyframes[0]!.panDegrees = 120;
    expect(first.selectedTagIds).toEqual(["tag-episode-5"]);
    expect(first.reframeKeyframes[0]!.panDegrees).toBe(30);
  });

  it("copies every mutable nested decision before retention", () => {
    const draft = emptySourceSelectionDraft();
    draft.spatialView.panDegrees = 45;
    const retained = copySourceSelectionDraft(draft);

    retained.spatialView.panDegrees = -90;
    expect(draft.spatialView.panDegrees).toBe(45);
  });
});
