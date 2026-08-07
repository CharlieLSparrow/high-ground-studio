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

export const mediaSourceSetMemberRoles = [
  "primary-original",
  "secondary-original",
  "browse-proxy",
  "audio-sidecar",
  "metadata-sidecar",
] as const;

export type MediaSourceSetMemberRole = (typeof mediaSourceSetMemberRoles)[number];

export type CreateMediaSourceSetInput = {
  projectId: string;
  clientRequestId: string;
  kind: "insta360-360" | "camera-package";
  captureKey: string;
  displayName: string;
  sourceClockRevisionId: string;
  members: Array<{
    sourceRevisionId: string;
    role: MediaSourceSetMemberRole;
    ordinal?: number;
    requiredForRender?: boolean;
  }>;
  metadata?: Record<string, unknown>;
};

export type CreateSourceStoryCardInput = {
  projectId: string;
  mediaAssetId?: string | null;
  sourceRevisionId?: string | null;
  sourceSetId?: string | null;
  externalReferenceId?: string | null;
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

export type RebindSourceStoryCardInput = {
  projectId: string;
  cardId: string;
  expectedRevision: number;
  expectedSourceRangeId: string;
  replacementMediaAssetId: string;
  clientRequestId: string;
  startSeconds: number;
  endSeconds: number;
  reason: string;
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

function normalizedRange(startValue: unknown, endValue: unknown) {
  const startSeconds = finiteSeconds(startValue, "startSeconds");
  const endSeconds = finiteSeconds(endValue, "endSeconds");
  if (endSeconds <= startSeconds) {
    throw new SourceStoryContractError("invalid-range", "The out point must be after the in point.");
  }
  if (endSeconds - startSeconds < 0.05) {
    throw new SourceStoryContractError("range-too-short", "Select at least 0.05 seconds of source media.");
  }
  return { startSeconds, endSeconds };
}

function orderedUniqueIds(value: unknown) {
  if (value === null || value === undefined) return [];
  if (!Array.isArray(value) || value.length > 100) {
    throw new SourceStoryContractError("invalid-tags", "A card may contain at most 100 tag identities.");
  }
  return [...new Set(value.map((item) => opaqueId(item, "tagId")))].sort();
}

export function normalizeCreateMediaSourceSetInput(value: CreateMediaSourceSetInput) {
  const projectId = opaqueId(value.projectId, "projectId");
  const requestId = clientRequestId(value.clientRequestId);
  const kind = value.kind;
  if (!(kind === "insta360-360" || kind === "camera-package")) {
    throw new SourceStoryContractError("invalid-source-set-kind", "The source-set kind is unsupported.");
  }
  const captureKey = boundedText(value.captureKey, "captureKey", 200, true);
  const displayName = boundedText(value.displayName, "displayName", 300, true);
  const sourceClockRevisionId = opaqueId(value.sourceClockRevisionId, "sourceClockRevisionId");
  if (!Array.isArray(value.members) || value.members.length < 2 || value.members.length > 32) {
    throw new SourceStoryContractError("invalid-source-set-members", "A source set requires between 2 and 32 exact members.");
  }
  const members = value.members.map((member, index) => {
    const role = member.role;
    if (!mediaSourceSetMemberRoles.includes(role)) {
      throw new SourceStoryContractError("invalid-source-set-role", `Source member ${index + 1} has an unsupported role.`);
    }
    const ordinal = member.ordinal ?? 0;
    if (!Number.isInteger(ordinal) || ordinal < 0 || ordinal > 31) {
      throw new SourceStoryContractError("invalid-source-set-ordinal", `Source member ${index + 1} has an invalid ordinal.`);
    }
    return {
      sourceRevisionId: opaqueId(member.sourceRevisionId, "sourceRevisionId"),
      role,
      ordinal,
      requiredForRender: member.requiredForRender ?? role !== "browse-proxy",
    };
  }).sort((left, right) => left.role.localeCompare(right.role) || left.ordinal - right.ordinal || left.sourceRevisionId.localeCompare(right.sourceRevisionId));
  if (new Set(members.map((member) => member.sourceRevisionId)).size !== members.length) {
    throw new SourceStoryContractError("duplicate-source-set-member", "A source revision cannot appear twice in one source set.");
  }
  if (new Set(members.map((member) => `${member.role}:${member.ordinal}`)).size !== members.length) {
    throw new SourceStoryContractError("duplicate-source-set-role", "Each source-set role and ordinal must be unique.");
  }
  if (!members.some((member) => member.sourceRevisionId === sourceClockRevisionId)) {
    throw new SourceStoryContractError("missing-source-clock-member", "The viewing clock revision must be a member of the source set.");
  }
  const metadata = value.metadata && typeof value.metadata === "object" && !Array.isArray(value.metadata)
    ? value.metadata
    : {};
  return { projectId, clientRequestId: requestId, kind, captureKey, displayName, sourceClockRevisionId, members, metadata };
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
  const { startSeconds, endSeconds } = normalizedRange(value.startSeconds, value.endSeconds);
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
  const mediaAssetId = value.mediaAssetId ? opaqueId(value.mediaAssetId, "mediaAssetId") : null;
  const sourceRevisionId = value.sourceRevisionId ? opaqueId(value.sourceRevisionId, "sourceRevisionId") : null;
  const sourceSetId = value.sourceSetId ? opaqueId(value.sourceSetId, "sourceSetId") : null;
  const externalReferenceId = value.externalReferenceId ? opaqueId(value.externalReferenceId, "externalReferenceId") : null;
  if (Boolean(mediaAssetId) === Boolean(sourceRevisionId)) {
    throw new SourceStoryContractError("invalid-source-binding", "Choose exactly one registered asset or external source revision.");
  }
  if (sourceRevisionId && !externalReferenceId) {
    throw new SourceStoryContractError("missing-external-reference", "An external source revision requires its retained vault reference.");
  }
  if (sourceSetId && !sourceRevisionId) {
    throw new SourceStoryContractError("orphan-source-set", "A multi-file source set requires its exact source-clock revision.");
  }
  if (mediaAssetId && externalReferenceId) {
    throw new SourceStoryContractError("unexpected-external-reference", "A registered asset cannot claim an external vault reference.");
  }
  return {
    schema: SOURCE_STORY_SCHEMA_VERSION,
    projectId: opaqueId(value.projectId, "projectId"),
    mediaAssetId,
    sourceRevisionId,
    sourceSetId,
    externalReferenceId,
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

export function normalizeRebindSourceStoryCardInput(value: RebindSourceStoryCardInput) {
  const { startSeconds, endSeconds } = normalizedRange(value.startSeconds, value.endSeconds);
  const expectedRevision = Number(value.expectedRevision);
  if (!Number.isInteger(expectedRevision) || expectedRevision < 1) {
    throw new SourceStoryContractError("invalid-revision", "The current card revision is required.");
  }
  return {
    schema: SOURCE_STORY_SCHEMA_VERSION,
    projectId: opaqueId(value.projectId, "projectId"),
    cardId: opaqueId(value.cardId, "cardId"),
    expectedRevision,
    expectedSourceRangeId: opaqueId(value.expectedSourceRangeId, "expectedSourceRangeId"),
    replacementMediaAssetId: opaqueId(value.replacementMediaAssetId, "replacementMediaAssetId"),
    clientRequestId: clientRequestId(value.clientRequestId),
    startSeconds,
    endSeconds,
    reason: boundedText(value.reason, "Reason", 2_000, true),
    reframeRecipe: normalizeStoryReframeRecipe(value.reframeRecipe, { startSeconds, endSeconds }),
  };
}

export function stableSourceStoryJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableSourceStoryJson).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stableSourceStoryJson(record[key])}`).join(",")}}`;
}
