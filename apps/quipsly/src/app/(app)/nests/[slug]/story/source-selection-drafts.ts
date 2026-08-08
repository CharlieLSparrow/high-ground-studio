import type { StoryReframeKeyframe } from "@/lib/source-story-contract";

export type SourceSelectionDraft = {
  inPoint: number | null;
  outPoint: number | null;
  title: string;
  synopsis: string;
  notes: string;
  purpose: string;
  groupKey: string;
  selectedTagIds: string[];
  preserve360: boolean;
  spatialView: {
    panDegrees: number;
    tiltDegrees: number;
    fieldOfViewDegrees: number;
  };
  reframeKeyframes: StoryReframeKeyframe[];
  reframeAspectRatio: "16:9" | "9:16" | "1:1" | "4:5";
};

export function emptySourceSelectionDraft({
  preserve360 = false,
}: { preserve360?: boolean } = {}): SourceSelectionDraft {
  return {
    inPoint: null,
    outPoint: null,
    title: "",
    synopsis: "",
    notes: "",
    purpose: "select",
    groupKey: "unassigned",
    selectedTagIds: [],
    preserve360,
    spatialView: {
      panDegrees: 0,
      tiltDegrees: 0,
      fieldOfViewDegrees: 75,
    },
    reframeKeyframes: [],
    reframeAspectRatio: "16:9",
  };
}

export function copySourceSelectionDraft(
  draft: SourceSelectionDraft,
): SourceSelectionDraft {
  return {
    ...draft,
    selectedTagIds: [...draft.selectedTagIds],
    spatialView: { ...draft.spatialView },
    reframeKeyframes: draft.reframeKeyframes.map((keyframe) => ({
      ...keyframe,
    })),
  };
}

export function sourceSelectionDraftFor(
  drafts: ReadonlyMap<string, SourceSelectionDraft>,
  sourceKey: string,
  defaults: { preserve360?: boolean } = {},
) {
  const retained = drafts.get(sourceKey);
  return retained
    ? copySourceSelectionDraft(retained)
    : emptySourceSelectionDraft(defaults);
}
