export const SOURCE_STORY_SCHEMA_VERSION = "quipsly-source-story-v1" as const;

export const storyCardPurposes = [
  "select",
  "opening",
  "evidence",
  "quote",
  "b-roll",
  "transition",
  "chapter",
  "lesson",
  "payoff",
] as const;

export type StoryCardPurpose = (typeof storyCardPurposes)[number];

export const storyCardStatuses = [
  "candidate",
  "needs-review",
  "selected",
  "used",
  "rejected",
] as const;

export type StoryCardStatus = (typeof storyCardStatuses)[number];

export type StoryReframeKeyframe = {
  sourceSeconds: number;
  panDegrees: number;
  tiltDegrees: number;
  rollDegrees: number;
  fieldOfViewDegrees: number;
  interpolation: "hold" | "linear" | "ease";
};

export type StoryReframeRecipe = {
  schema: "quipsly-360-reframe-v1";
  projection: "equirectangular";
  aspectRatio: "16:9" | "9:16" | "1:1" | "4:5";
  stabilization: "source" | "flowstate" | "off";
  horizonLock: boolean;
  keyframes: StoryReframeKeyframe[];
};

export type CreateSourceStoryCardInput = {
  projectId: string;
  mediaAssetId: string;
  boardId?: string | null;
  expectedBoardRevision?: number | null;
  clientRequestId: string;
  title: string;
  synopsis?: string;
  notes?: string;
  purpose?: StoryCardPurpose;
  startSeconds: number;
  endSeconds: number;
  groupKey?: string;
  laneKey?: string;
  tagIds?: string[];
  reframeRecipe?: StoryReframeRecipe | null;
};

export class SourceStoryContractError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "SourceStoryContractError";
    this.code = code;
  }
}

function boundedText(value: unknown, field: string, maxLength: number, required = false) {
  if (typeof value !== "string") {
    if (!required && (value === null || value === undefined)) return "";
    throw new SourceStoryContractError("invalid-text", `${field} must be text.`);
  }
  const normalized = value.trim();
  if (required && !normalized) {
    throw new SourceStoryContractError("required-text", `${field} is required.`);
  }
  if (normalized.length > maxLength) {
    throw new SourceStoryContractError("text-too-long", `${field} must be ${maxLength.toLocaleString()} characters or fewer.`);
  }
  return normalized;
}

function opaqueId(value: unknown, field: string) {
  const normalized = boundedText(value, field, 200, true);
  if (!/^[a-zA-Z0-9:_-]+$/.test(normalized)) {
    throw new SourceStoryContractError("invalid-id", `${field} is malformed.`);
  }
  return normalized;
}

function clientRequestId(value: unknown) {
  const normalized = boundedText(value, "clientRequestId", 64, true).toLowerCase();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(normalized)) {
    throw new SourceStoryContractError("invalid-request-id", "The request identity must be a UUID.");
  }
  return normalized;
}

function finiteSeconds(value: unknown, field: string) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 7 * 24 * 60 * 60) {
    throw new SourceStoryContractError("invalid-time", `${field} must be a finite source time between zero and seven days.`);
  }
  return Math.round(value * 1_000_000) / 1_000_000;
}

function orderedUniqueIds(value: unknown) {
  if (value === null || value === undefined) return [];
  if (!Array.isArray(value) || value.length > 100) {
    throw new SourceStoryContractError("invalid-tags", "A card may contain at most 100 tag identities.");
  }
  return [...new Set(value.map((item) => opaqueId(item, "tagId")))].sort();
}

function boardKey(value: unknown, field: string, fallback: string) {
  const normalized = typeof value === "string" ? value.trim().toLowerCase() : "";
  const key = (normalized || fallback)
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  if (!/^[a-z0-9][a-z0-9_-]{0,59}$/.test(key)) {
    throw new SourceStoryContractError("invalid-board-key", `${field} must use letters, numbers, dashes, or underscores.`);
  }
  return key;
}

export function normalizeStoryReframeRecipe(
  value: StoryReframeRecipe | null | undefined,
  range: { startSeconds: number; endSeconds: number },
): StoryReframeRecipe | null {
  if (value === null || value === undefined) return null;
  if (
    value.schema !== "quipsly-360-reframe-v1"
    || value.projection !== "equirectangular"
    || !(["16:9", "9:16", "1:1", "4:5"] as const).includes(value.aspectRatio)
    || !(["source", "flowstate", "off"] as const).includes(value.stabilization)
    || typeof value.horizonLock !== "boolean"
    || !Array.isArray(value.keyframes)
    || value.keyframes.length > 500
  ) {
    throw new SourceStoryContractError("invalid-reframe", "The 360 reframe recipe is malformed.");
  }

  let previous = Number.NEGATIVE_INFINITY;
  const keyframes = value.keyframes.map((keyframe) => {
    const sourceSeconds = finiteSeconds(keyframe.sourceSeconds, "reframe sourceSeconds");
    if (sourceSeconds < range.startSeconds || sourceSeconds > range.endSeconds || sourceSeconds < previous) {
      throw new SourceStoryContractError("invalid-reframe-time", "360 keyframes must be ordered inside the selected source range.");
    }
    previous = sourceSeconds;
    if (
      !Number.isFinite(keyframe.panDegrees)
      || !Number.isFinite(keyframe.tiltDegrees)
      || !Number.isFinite(keyframe.rollDegrees)
      || !Number.isFinite(keyframe.fieldOfViewDegrees)
      || keyframe.panDegrees < -180
      || keyframe.panDegrees > 180
      || keyframe.tiltDegrees < -90
      || keyframe.tiltDegrees > 90
      || keyframe.rollDegrees < -180
      || keyframe.rollDegrees > 180
      || keyframe.fieldOfViewDegrees < 20
      || keyframe.fieldOfViewDegrees > 160
      || !(["hold", "linear", "ease"] as const).includes(keyframe.interpolation)
    ) {
      throw new SourceStoryContractError("invalid-reframe-keyframe", "A 360 keyframe contains unsupported view values.");
    }
    return {
      sourceSeconds,
      panDegrees: keyframe.panDegrees,
      tiltDegrees: keyframe.tiltDegrees,
      rollDegrees: keyframe.rollDegrees,
      fieldOfViewDegrees: keyframe.fieldOfViewDegrees,
      interpolation: keyframe.interpolation,
    };
  });

  return { ...value, keyframes };
}

export function normalizeCreateSourceStoryCardInput(value: CreateSourceStoryCardInput) {
  const startSeconds = finiteSeconds(value.startSeconds, "startSeconds");
  const endSeconds = finiteSeconds(value.endSeconds, "endSeconds");
  if (endSeconds <= startSeconds) {
    throw new SourceStoryContractError("invalid-range", "The out point must be after the in point.");
  }
  if (endSeconds - startSeconds < 0.05) {
    throw new SourceStoryContractError("range-too-short", "Select at least 0.05 seconds of source media.");
  }
  const purpose = value.purpose ?? "select";
  if (!storyCardPurposes.includes(purpose)) {
    throw new SourceStoryContractError("invalid-purpose", "The story purpose is unsupported.");
  }
  const boardId = value.boardId ? opaqueId(value.boardId, "boardId") : null;
  const expectedBoardRevision = value.expectedBoardRevision ?? null;
  if (boardId && (!Number.isInteger(expectedBoardRevision) || Number(expectedBoardRevision) < 0)) {
    throw new SourceStoryContractError("missing-board-revision", "The current board revision is required before placing a card.");
  }
  if (!boardId && expectedBoardRevision !== null) {
    throw new SourceStoryContractError("orphan-board-revision", "A board revision cannot be supplied without a board.");
  }
  return {
    schema: SOURCE_STORY_SCHEMA_VERSION,
    projectId: opaqueId(value.projectId, "projectId"),
    mediaAssetId: opaqueId(value.mediaAssetId, "mediaAssetId"),
    boardId,
    expectedBoardRevision,
    clientRequestId: clientRequestId(value.clientRequestId),
    title: boundedText(value.title, "Title", 200, true),
    synopsis: boundedText(value.synopsis ?? "", "Synopsis", 10_000),
    notes: boundedText(value.notes ?? "", "Notes", 50_000),
    purpose,
    startSeconds,
    endSeconds,
    groupKey: boardKey(value.groupKey, "groupKey", "unassigned"),
    laneKey: boardKey(value.laneKey, "laneKey", "story"),
    tagIds: orderedUniqueIds(value.tagIds),
    reframeRecipe: normalizeStoryReframeRecipe(value.reframeRecipe, { startSeconds, endSeconds }),
  };
}

export function stableSourceStoryJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableSourceStoryJson).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stableSourceStoryJson(record[key])}`).join(",")}}`;
}
