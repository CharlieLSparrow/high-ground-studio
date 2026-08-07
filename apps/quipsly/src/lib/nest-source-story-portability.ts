import {
  storyCardPurposes,
  storyCardStatuses,
} from "@/lib/source-story-contract";

export const MAX_PORTABLE_SOURCE_REVISIONS = 20_000;
export const MAX_PORTABLE_SOURCE_SETS = 10_000;
export const MAX_PORTABLE_SOURCE_SET_MEMBERS = 50_000;
export const MAX_PORTABLE_SOURCE_RANGES = 50_000;
export const MAX_PORTABLE_STORY_CARDS = 50_000;
export const MAX_PORTABLE_STORY_CARD_REVISIONS = 100_000;
export const MAX_PORTABLE_STORY_BOARDS = 10_000;
export const MAX_PORTABLE_STORY_SECTIONS = 50_000;
export const MAX_PORTABLE_STORY_PLACEMENTS = 100_000;
export const MAX_PORTABLE_STORY_OPERATIONS = 100_000;

export type PortableNestSourceRevision = {
  id: string;
  revisionKey: string;
  identitySha256: string;
  contentSha256: string | null;
  sizeBytes: string | null;
  durationSeconds: number | null;
  widthPixels: number | null;
  heightPixels: number | null;
  framesPerSecond: number | null;
  mediaProjection: string;
  sourceState: string;
  providerModifiedAt: string | null;
  verifiedAt: string | null;
  createdAt: string;
};

export type PortableNestSourceSet = {
  id: string;
  kind: string;
  captureKey: string;
  displayName: string;
  identitySha256: string;
  sourceClockRevisionId: string;
  completeness: string;
  members: Array<{
    id: string;
    sourceRevisionId: string;
    role: string;
    ordinal: number;
    requiredForRender: boolean;
    memberIdentitySha256: string;
    createdAt: string;
  }>;
  createdAt: string;
};

export type PortableNestSourceRange = {
  id: string;
  sourceRevisionId: string;
  sourceSetId: string | null;
  selectorSha256: string;
  startSeconds: number;
  endSeconds: number;
  selectorJson: Record<string, unknown>;
  reframeRecipeJson: Record<string, unknown> | null;
  createdAt: string;
};

export type PortableNestStoryCard = {
  id: string;
  stableId: string;
  sourceRangeId: string | null;
  title: string;
  synopsis: string;
  notes: string;
  purpose: string;
  status: string;
  visibility: string;
  revision: number;
  archivedAt: string | null;
  tagIds: string[];
  revisions: Array<{
    id: string;
    revision: number;
    operation: string;
    snapshotJson: Record<string, unknown>;
    createdAt: string;
  }>;
  createdAt: string;
  updatedAt: string;
};

export type PortableNestStoryBoard = {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  kind: string;
  layout: string;
  revision: number;
  archivedAt: string | null;
  sections: Array<{
    id: string;
    key: string;
    title: string;
    synopsis: string;
    sortOrder: number;
    documentId: string | null;
    revision: number;
    archivedAt: string | null;
    operations: Array<{
      id: string;
      revision: number;
      previousRevision: number;
      operation: string;
      requestSha256: string;
      snapshotJson: Record<string, unknown>;
      createdAt: string;
    }>;
    createdAt: string;
    updatedAt: string;
  }>;
  placements: Array<{
    id: string;
    cardId: string;
    groupKey: string;
    laneKey: string;
    sortOrder: number;
    createdAt: string;
    updatedAt: string;
  }>;
  operations: Array<{
    id: string;
    revision: number;
    previousRevision: number;
    operation: string;
    snapshotJson: Record<string, unknown>;
    createdAt: string;
  }>;
  createdAt: string;
  updatedAt: string;
};

export type PortableNestSourceStory = {
  sourceRevisions: PortableNestSourceRevision[];
  sourceSets: PortableNestSourceSet[];
  sourceRanges: PortableNestSourceRange[];
  cards: PortableNestStoryCard[];
  boards: PortableNestStoryBoard[];
};

export type PortableNestSourceStoryCounts = {
  sourceRevisionCount: number;
  sourceSetCount: number;
  sourceSetMemberCount: number;
  sourceRangeCount: number;
  storyCardCount: number;
  storyCardRevisionCount: number;
  storyBoardCount: number;
  storySectionCount: number;
  storyPlacementCount: number;
  storyOperationCount: number;
};

export const EMPTY_PORTABLE_NEST_SOURCE_STORY: PortableNestSourceStory = {
  sourceRevisions: [],
  sourceSets: [],
  sourceRanges: [],
  cards: [],
  boards: [],
};

type ValidationResult =
  | {
      ok: true;
      sourceStory: PortableNestSourceStory;
      counts: PortableNestSourceStoryCounts;
      textBytes: number;
    }
  | { ok: false; error: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function text(value: unknown, max: number, allowEmpty = false) {
  return typeof value === "string" &&
    value.length <= max &&
    (allowEmpty || value.trim().length > 0)
    ? value
    : null;
}

function nullableText(value: unknown, max: number) {
  if (value == null) return null;
  return text(value, max, true) ?? undefined;
}

function date(value: unknown, nullable = false) {
  if (nullable && value == null) return null;
  return typeof value === "string" && Number.isFinite(new Date(value).getTime())
    ? value
    : undefined;
}

function integer(value: unknown, minimum = 0) {
  return typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value >= minimum
    ? value
    : null;
}

function finite(value: unknown, minimum = 0) {
  return typeof value === "number" && Number.isFinite(value) && value >= minimum
    ? value
    : null;
}

function nullableFinite(value: unknown, minimum = 0) {
  if (value == null) return null;
  return finite(value, minimum) ?? undefined;
}

function nullableInteger(value: unknown, minimum = 0) {
  if (value == null) return null;
  return integer(value, minimum) ?? undefined;
}

function json(value: unknown) {
  return isRecord(value) ? value : {};
}

function nullableJson(value: unknown) {
  if (value == null) return null;
  return isRecord(value) ? value : undefined;
}

function sha256(value: unknown) {
  const parsed = text(value, 64);
  return parsed && /^[a-f0-9]{64}$/.test(parsed) ? parsed : null;
}

function decimalBytes(value: unknown) {
  if (value == null) return null;
  return typeof value === "string" && /^(0|[1-9][0-9]{0,24})$/.test(value)
    ? value
    : undefined;
}

function addTextBytes(total: number, ...values: Array<string | null>) {
  return values.reduce(
    (next, value) =>
      next + (value == null ? 0 : Buffer.byteLength(value, "utf8")),
    total,
  );
}

export function portableNestSourceStoryCounts(
  sourceStory: PortableNestSourceStory,
): PortableNestSourceStoryCounts {
  return {
    sourceRevisionCount: sourceStory.sourceRevisions.length,
    sourceSetCount: sourceStory.sourceSets.length,
    sourceSetMemberCount: sourceStory.sourceSets.reduce(
      (count, set) => count + set.members.length,
      0,
    ),
    sourceRangeCount: sourceStory.sourceRanges.length,
    storyCardCount: sourceStory.cards.length,
    storyCardRevisionCount: sourceStory.cards.reduce(
      (count, card) => count + card.revisions.length,
      0,
    ),
    storyBoardCount: sourceStory.boards.length,
    storySectionCount: sourceStory.boards.reduce(
      (count, board) => count + board.sections.length,
      0,
    ),
    storyPlacementCount: sourceStory.boards.reduce(
      (count, board) => count + board.placements.length,
      0,
    ),
    storyOperationCount: sourceStory.boards.reduce(
      (count, board) =>
        count +
        board.operations.length +
        board.sections.reduce(
          (sectionCount, section) => sectionCount + section.operations.length,
          0,
        ),
      0,
    ),
  };
}

export function validatePortableNestSourceStory(input: {
  value: unknown;
  tagIds: ReadonlySet<string>;
  documentIds: ReadonlySet<string>;
}): ValidationResult {
  if (!isRecord(input.value)) {
    return { ok: false, error: "The Nest source-story package is invalid." };
  }
  const rawRevisions = input.value.sourceRevisions;
  const rawSets = input.value.sourceSets;
  const rawRanges = input.value.sourceRanges;
  const rawCards = input.value.cards;
  const rawBoards = input.value.boards;
  if (
    !Array.isArray(rawRevisions) ||
    rawRevisions.length > MAX_PORTABLE_SOURCE_REVISIONS ||
    !Array.isArray(rawSets) ||
    rawSets.length > MAX_PORTABLE_SOURCE_SETS ||
    !Array.isArray(rawRanges) ||
    rawRanges.length > MAX_PORTABLE_SOURCE_RANGES ||
    !Array.isArray(rawCards) ||
    rawCards.length > MAX_PORTABLE_STORY_CARDS ||
    !Array.isArray(rawBoards) ||
    rawBoards.length > MAX_PORTABLE_STORY_BOARDS
  ) {
    return {
      ok: false,
      error:
        "The Nest source-story package has invalid or unsafe record counts.",
    };
  }

  let textBytes = 0;
  const sourceRevisions: PortableNestSourceRevision[] = [];
  for (const raw of rawRevisions) {
    if (!isRecord(raw))
      return {
        ok: false,
        error: "A source revision in the Nest bundle is invalid.",
      };
    const id = text(raw.id, 200);
    const revisionKey = text(raw.revisionKey, 1_000);
    const identitySha256 = sha256(raw.identitySha256);
    const contentSha256 =
      raw.contentSha256 == null ? null : sha256(raw.contentSha256);
    const sizeBytes = decimalBytes(raw.sizeBytes);
    const durationSeconds = nullableFinite(raw.durationSeconds);
    const widthPixels = nullableInteger(raw.widthPixels, 1);
    const heightPixels = nullableInteger(raw.heightPixels, 1);
    const framesPerSecond = nullableFinite(raw.framesPerSecond, 0.001);
    const mediaProjection = text(raw.mediaProjection, 100);
    const sourceState = text(raw.sourceState, 100);
    const providerModifiedAt = date(raw.providerModifiedAt, true);
    const verifiedAt = date(raw.verifiedAt, true);
    const createdAt = date(raw.createdAt);
    if (
      !id ||
      !revisionKey ||
      !identitySha256 ||
      (raw.contentSha256 != null && !contentSha256) ||
      sizeBytes === undefined ||
      durationSeconds === undefined ||
      widthPixels === undefined ||
      heightPixels === undefined ||
      framesPerSecond === undefined ||
      !mediaProjection ||
      !sourceState ||
      providerModifiedAt === undefined ||
      verifiedAt === undefined ||
      !createdAt
    )
      return {
        ok: false,
        error: "A source revision in the Nest bundle is incomplete.",
      };
    sourceRevisions.push({
      id,
      revisionKey,
      identitySha256,
      contentSha256,
      sizeBytes,
      durationSeconds,
      widthPixels,
      heightPixels,
      framesPerSecond,
      mediaProjection,
      sourceState,
      providerModifiedAt,
      verifiedAt,
      createdAt,
    });
  }
  const sourceRevisionIds = new Set(
    sourceRevisions.map((revision) => revision.id),
  );
  if (
    sourceRevisionIds.size !== sourceRevisions.length ||
    new Set(sourceRevisions.map((revision) => revision.identitySha256)).size !==
      sourceRevisions.length
  )
    return {
      ok: false,
      error: "The Nest bundle repeats a source-revision identity.",
    };

  let sourceSetMemberCount = 0;
  const sourceSets: PortableNestSourceSet[] = [];
  const memberIds = new Set<string>();
  for (const raw of rawSets) {
    if (!isRecord(raw) || !Array.isArray(raw.members)) {
      return {
        ok: false,
        error: "A source set in the Nest bundle is invalid.",
      };
    }
    const id = text(raw.id, 200);
    const kind = text(raw.kind, 100);
    const captureKey = text(raw.captureKey, 500);
    const displayName = text(raw.displayName, 500);
    const identitySha256 = sha256(raw.identitySha256);
    const sourceClockRevisionId = text(raw.sourceClockRevisionId, 200);
    const completeness = text(raw.completeness, 100);
    const createdAt = date(raw.createdAt);
    if (
      !id ||
      !kind ||
      !captureKey ||
      !displayName ||
      !identitySha256 ||
      !sourceClockRevisionId ||
      !sourceRevisionIds.has(sourceClockRevisionId) ||
      !completeness ||
      !createdAt
    )
      return {
        ok: false,
        error: "A source set in the Nest bundle is incomplete.",
      };
    const members: PortableNestSourceSet["members"] = [];
    const roles = new Set<string>();
    const memberRevisionIds = new Set<string>();
    for (const rawMember of raw.members) {
      if (!isRecord(rawMember))
        return { ok: false, error: "A source-set member is invalid." };
      const memberId = text(rawMember.id, 200);
      const sourceRevisionId = text(rawMember.sourceRevisionId, 200);
      const role = text(rawMember.role, 100);
      const ordinal = integer(rawMember.ordinal);
      const memberIdentitySha256 = sha256(rawMember.memberIdentitySha256);
      const memberCreatedAt = date(rawMember.createdAt);
      if (
        !memberId ||
        !sourceRevisionId ||
        !sourceRevisionIds.has(sourceRevisionId) ||
        !role ||
        ordinal == null ||
        typeof rawMember.requiredForRender !== "boolean" ||
        !memberIdentitySha256 ||
        !memberCreatedAt
      )
        return { ok: false, error: "A source-set member is incomplete." };
      const roleKey = `${role}:${ordinal}`;
      if (
        memberIds.has(memberId) ||
        roles.has(roleKey) ||
        memberRevisionIds.has(sourceRevisionId)
      ) {
        return {
          ok: false,
          error:
            "The Nest bundle repeats a source-set member identity, role, or source revision.",
        };
      }
      memberIds.add(memberId);
      roles.add(roleKey);
      memberRevisionIds.add(sourceRevisionId);
      members.push({
        id: memberId,
        sourceRevisionId,
        role,
        ordinal,
        requiredForRender: rawMember.requiredForRender,
        memberIdentitySha256,
        createdAt: memberCreatedAt,
      });
    }
    sourceSetMemberCount += members.length;
    if (sourceSetMemberCount > MAX_PORTABLE_SOURCE_SET_MEMBERS) {
      return {
        ok: false,
        error: "The Nest bundle contains too many source-set members.",
      };
    }
    if (!memberRevisionIds.has(sourceClockRevisionId)) {
      return {
        ok: false,
        error: "A source set does not contain its declared source clock.",
      };
    }
    sourceSets.push({
      id,
      kind,
      captureKey,
      displayName,
      identitySha256,
      sourceClockRevisionId,
      completeness,
      members,
      createdAt,
    });
  }
  const sourceSetIds = new Set(sourceSets.map((set) => set.id));
  if (
    sourceSetIds.size !== sourceSets.length ||
    new Set(sourceSets.map((set) => set.identitySha256)).size !==
      sourceSets.length
  )
    return {
      ok: false,
      error: "The Nest bundle repeats a source-set identity.",
    };

  const sourceRanges: PortableNestSourceRange[] = [];
  for (const raw of rawRanges) {
    if (!isRecord(raw))
      return {
        ok: false,
        error: "A source range in the Nest bundle is invalid.",
      };
    const id = text(raw.id, 200);
    const sourceRevisionId = text(raw.sourceRevisionId, 200);
    const sourceSetId = nullableText(raw.sourceSetId, 200);
    const selectorSha256 = sha256(raw.selectorSha256);
    const startSeconds = finite(raw.startSeconds);
    const endSeconds = finite(raw.endSeconds);
    const reframeRecipeJson = nullableJson(raw.reframeRecipeJson);
    const createdAt = date(raw.createdAt);
    if (
      !id ||
      !sourceRevisionId ||
      !sourceRevisionIds.has(sourceRevisionId) ||
      sourceSetId === undefined ||
      (sourceSetId && !sourceSetIds.has(sourceSetId)) ||
      !selectorSha256 ||
      startSeconds == null ||
      endSeconds == null ||
      endSeconds <= startSeconds ||
      reframeRecipeJson === undefined ||
      !createdAt
    )
      return {
        ok: false,
        error:
          "A source range in the Nest bundle is incomplete or points outside its source graph.",
      };
    if (sourceSetId) {
      const set = sourceSets.find((candidate) => candidate.id === sourceSetId);
      if (
        !set ||
        (set.sourceClockRevisionId !== sourceRevisionId &&
          !set.members.some(
            (member) => member.sourceRevisionId === sourceRevisionId,
          ))
      ) {
        return {
          ok: false,
          error: "A source range points to a revision outside its source set.",
        };
      }
    }
    sourceRanges.push({
      id,
      sourceRevisionId,
      sourceSetId,
      selectorSha256,
      startSeconds,
      endSeconds,
      selectorJson: json(raw.selectorJson),
      reframeRecipeJson,
      createdAt,
    });
  }
  const sourceRangeIds = new Set(sourceRanges.map((range) => range.id));
  if (
    sourceRangeIds.size !== sourceRanges.length ||
    new Set(
      sourceRanges.map(
        (range) => `${range.sourceRevisionId}:${range.selectorSha256}`,
      ),
    ).size !== sourceRanges.length
  )
    return {
      ok: false,
      error: "The Nest bundle repeats a source-range identity or selector.",
    };

  let storyCardRevisionCount = 0;
  const cards: PortableNestStoryCard[] = [];
  const cardRevisionIds = new Set<string>();
  for (const raw of rawCards) {
    if (
      !isRecord(raw) ||
      !Array.isArray(raw.tagIds) ||
      !Array.isArray(raw.revisions)
    ) {
      return {
        ok: false,
        error: "A Source Story card in the Nest bundle is invalid.",
      };
    }
    const id = text(raw.id, 200);
    const stableId = text(raw.stableId, 500);
    const sourceRangeId = nullableText(raw.sourceRangeId, 200);
    const title = text(raw.title, 500);
    const synopsis = text(raw.synopsis, 100_000, true);
    const notes = text(raw.notes, 100_000, true);
    const purpose = text(raw.purpose, 100);
    const status = text(raw.status, 100);
    const visibility = text(raw.visibility, 100);
    const revision = integer(raw.revision, 1);
    const archivedAt = date(raw.archivedAt, true);
    const createdAt = date(raw.createdAt);
    const updatedAt = date(raw.updatedAt);
    const tagIds = raw.tagIds.every((tagId) => typeof tagId === "string")
      ? (raw.tagIds as string[])
      : null;
    if (
      !id ||
      !stableId ||
      sourceRangeId === undefined ||
      (sourceRangeId && !sourceRangeIds.has(sourceRangeId)) ||
      !title ||
      synopsis == null ||
      notes == null ||
      !purpose ||
      !storyCardPurposes.includes(purpose as never) ||
      !status ||
      !storyCardStatuses.includes(status as never) ||
      !visibility ||
      revision == null ||
      archivedAt === undefined ||
      !createdAt ||
      !updatedAt ||
      !tagIds ||
      tagIds.some((tagId) => !input.tagIds.has(tagId)) ||
      new Set(tagIds).size !== tagIds.length
    )
      return {
        ok: false,
        error:
          "A Source Story card is incomplete or points outside the exported graph.",
      };
    const revisions: PortableNestStoryCard["revisions"] = [];
    const revisionNumbers = new Set<number>();
    for (const rawRevision of raw.revisions) {
      if (!isRecord(rawRevision))
        return { ok: false, error: "A Source Story card revision is invalid." };
      const revisionId = text(rawRevision.id, 200);
      const revisionNumber = integer(rawRevision.revision, 1);
      const operation = text(rawRevision.operation, 200);
      const revisionCreatedAt = date(rawRevision.createdAt);
      if (
        !revisionId ||
        revisionNumber == null ||
        !operation ||
        !revisionCreatedAt
      ) {
        return {
          ok: false,
          error: "A Source Story card revision is incomplete.",
        };
      }
      if (
        cardRevisionIds.has(revisionId) ||
        revisionNumbers.has(revisionNumber)
      ) {
        return {
          ok: false,
          error: "The Nest bundle repeats a Source Story card revision.",
        };
      }
      cardRevisionIds.add(revisionId);
      revisionNumbers.add(revisionNumber);
      revisions.push({
        id: revisionId,
        revision: revisionNumber,
        operation,
        snapshotJson: json(rawRevision.snapshotJson),
        createdAt: revisionCreatedAt,
      });
    }
    storyCardRevisionCount += revisions.length;
    if (storyCardRevisionCount > MAX_PORTABLE_STORY_CARD_REVISIONS) {
      return {
        ok: false,
        error: "The Nest bundle contains too many Source Story card revisions.",
      };
    }
    textBytes = addTextBytes(textBytes, title, synopsis, notes);
    cards.push({
      id,
      stableId,
      sourceRangeId,
      title,
      synopsis,
      notes,
      purpose,
      status,
      visibility,
      revision,
      archivedAt,
      tagIds,
      revisions,
      createdAt,
      updatedAt,
    });
  }
  const cardIds = new Set(cards.map((card) => card.id));
  if (
    cardIds.size !== cards.length ||
    new Set(cards.map((card) => card.stableId)).size !== cards.length
  )
    return {
      ok: false,
      error: "The Nest bundle repeats a Source Story card identity.",
    };

  let storySectionCount = 0;
  let storyPlacementCount = 0;
  let storyOperationCount = 0;
  const boards: PortableNestStoryBoard[] = [];
  const sectionIds = new Set<string>();
  const placementIds = new Set<string>();
  const operationIds = new Set<string>();
  for (const raw of rawBoards) {
    if (
      !isRecord(raw) ||
      !Array.isArray(raw.sections) ||
      !Array.isArray(raw.placements) ||
      !Array.isArray(raw.operations)
    ) {
      return {
        ok: false,
        error: "A Source Story board in the Nest bundle is invalid.",
      };
    }
    const id = text(raw.id, 200);
    const slug = text(raw.slug, 200);
    const title = text(raw.title, 500);
    const description = nullableText(raw.description, 100_000);
    const kind = text(raw.kind, 100);
    const layout = text(raw.layout, 100);
    const revision = integer(raw.revision);
    const archivedAt = date(raw.archivedAt, true);
    const createdAt = date(raw.createdAt);
    const updatedAt = date(raw.updatedAt);
    if (
      !id ||
      !slug ||
      !title ||
      description === undefined ||
      !kind ||
      !layout ||
      revision == null ||
      archivedAt === undefined ||
      !createdAt ||
      !updatedAt
    ) {
      return {
        ok: false,
        error: "A Source Story board in the Nest bundle is incomplete.",
      };
    }
    const sections: PortableNestStoryBoard["sections"] = [];
    const sectionKeys = new Set<string>();
    for (const rawSection of raw.sections) {
      if (!isRecord(rawSection) || !Array.isArray(rawSection.operations)) {
        return { ok: false, error: "A Source Story section is invalid." };
      }
      const sectionId = text(rawSection.id, 200);
      const key = text(rawSection.key, 200);
      const sectionTitle = text(rawSection.title, 500);
      const synopsis = text(rawSection.synopsis, 100_000, true);
      const sortOrder = integer(rawSection.sortOrder);
      const documentId = nullableText(rawSection.documentId, 200);
      const sectionRevision = integer(rawSection.revision, 1);
      const sectionArchivedAt = date(rawSection.archivedAt, true);
      const sectionCreatedAt = date(rawSection.createdAt);
      const sectionUpdatedAt = date(rawSection.updatedAt);
      if (
        !sectionId ||
        !key ||
        !sectionTitle ||
        synopsis == null ||
        sortOrder == null ||
        documentId === undefined ||
        (documentId && !input.documentIds.has(documentId)) ||
        sectionRevision == null ||
        sectionArchivedAt === undefined ||
        !sectionCreatedAt ||
        !sectionUpdatedAt ||
        sectionIds.has(sectionId) ||
        sectionKeys.has(key)
      )
        return {
          ok: false,
          error:
            "A Source Story section is incomplete, repeated, or points to missing writing.",
        };
      sectionIds.add(sectionId);
      sectionKeys.add(key);
      const operations: PortableNestStoryBoard["sections"][number]["operations"] =
        [];
      const revisions = new Set<number>();
      for (const rawOperation of rawSection.operations) {
        if (!isRecord(rawOperation))
          return {
            ok: false,
            error: "A Source Story section operation is invalid.",
          };
        const operationId = text(rawOperation.id, 200);
        const operationRevision = integer(rawOperation.revision, 1);
        const previousRevision = integer(rawOperation.previousRevision);
        const operation = text(rawOperation.operation, 200);
        const requestSha256 = sha256(rawOperation.requestSha256);
        const operationCreatedAt = date(rawOperation.createdAt);
        if (
          !operationId ||
          operationRevision == null ||
          previousRevision == null ||
          previousRevision >= operationRevision ||
          !operation ||
          !requestSha256 ||
          !operationCreatedAt ||
          operationIds.has(operationId) ||
          revisions.has(operationRevision)
        ) {
          return {
            ok: false,
            error:
              "A Source Story section operation is incomplete or repeated.",
          };
        }
        operationIds.add(operationId);
        revisions.add(operationRevision);
        operations.push({
          id: operationId,
          revision: operationRevision,
          previousRevision,
          operation,
          requestSha256,
          snapshotJson: json(rawOperation.snapshotJson),
          createdAt: operationCreatedAt,
        });
      }
      storyOperationCount += operations.length;
      textBytes = addTextBytes(textBytes, sectionTitle, synopsis);
      sections.push({
        id: sectionId,
        key,
        title: sectionTitle,
        synopsis,
        sortOrder,
        documentId,
        revision: sectionRevision,
        archivedAt: sectionArchivedAt,
        operations,
        createdAt: sectionCreatedAt,
        updatedAt: sectionUpdatedAt,
      });
    }
    const placements: PortableNestStoryBoard["placements"] = [];
    const placedCards = new Set<string>();
    for (const rawPlacement of raw.placements) {
      if (!isRecord(rawPlacement))
        return { ok: false, error: "A Source Story placement is invalid." };
      const placementId = text(rawPlacement.id, 200);
      const cardId = text(rawPlacement.cardId, 200);
      const groupKey = text(rawPlacement.groupKey, 200);
      const laneKey = text(rawPlacement.laneKey, 100);
      const sortOrder = integer(rawPlacement.sortOrder);
      const placementCreatedAt = date(rawPlacement.createdAt);
      const placementUpdatedAt = date(rawPlacement.updatedAt);
      if (
        !placementId ||
        !cardId ||
        !cardIds.has(cardId) ||
        !groupKey ||
        !sectionKeys.has(groupKey) ||
        !laneKey ||
        sortOrder == null ||
        !placementCreatedAt ||
        !placementUpdatedAt ||
        placementIds.has(placementId) ||
        placedCards.has(cardId)
      ) {
        return {
          ok: false,
          error:
            "A Source Story placement is incomplete, repeated, or points outside its board.",
        };
      }
      placementIds.add(placementId);
      placedCards.add(cardId);
      placements.push({
        id: placementId,
        cardId,
        groupKey,
        laneKey,
        sortOrder,
        createdAt: placementCreatedAt,
        updatedAt: placementUpdatedAt,
      });
    }
    const operations: PortableNestStoryBoard["operations"] = [];
    const boardRevisions = new Set<number>();
    for (const rawOperation of raw.operations) {
      if (!isRecord(rawOperation))
        return {
          ok: false,
          error: "A Source Story board operation is invalid.",
        };
      const operationId = text(rawOperation.id, 200);
      const operationRevision = integer(rawOperation.revision);
      const previousRevision = integer(rawOperation.previousRevision);
      const operation = text(rawOperation.operation, 200);
      const operationCreatedAt = date(rawOperation.createdAt);
      if (
        !operationId ||
        operationRevision == null ||
        previousRevision == null ||
        previousRevision > operationRevision ||
        !operation ||
        !operationCreatedAt ||
        operationIds.has(operationId) ||
        boardRevisions.has(operationRevision)
      ) {
        return {
          ok: false,
          error: "A Source Story board operation is incomplete or repeated.",
        };
      }
      operationIds.add(operationId);
      boardRevisions.add(operationRevision);
      operations.push({
        id: operationId,
        revision: operationRevision,
        previousRevision,
        operation,
        snapshotJson: json(rawOperation.snapshotJson),
        createdAt: operationCreatedAt,
      });
    }
    storySectionCount += sections.length;
    storyPlacementCount += placements.length;
    storyOperationCount += operations.length;
    if (
      storySectionCount > MAX_PORTABLE_STORY_SECTIONS ||
      storyPlacementCount > MAX_PORTABLE_STORY_PLACEMENTS ||
      storyOperationCount > MAX_PORTABLE_STORY_OPERATIONS
    ) {
      return {
        ok: false,
        error:
          "The Nest bundle contains too many Source Story sections, placements, or operations.",
      };
    }
    textBytes = addTextBytes(textBytes, title, description);
    boards.push({
      id,
      slug,
      title,
      description,
      kind,
      layout,
      revision,
      archivedAt,
      sections,
      placements,
      operations,
      createdAt,
      updatedAt,
    });
  }
  if (
    new Set(boards.map((board) => board.id)).size !== boards.length ||
    new Set(boards.map((board) => board.slug)).size !== boards.length
  )
    return {
      ok: false,
      error: "The Nest bundle repeats a Source Story board identity or slug.",
    };

  const sourceStory = {
    sourceRevisions,
    sourceSets,
    sourceRanges,
    cards,
    boards,
  };
  return {
    ok: true,
    sourceStory,
    counts: portableNestSourceStoryCounts(sourceStory),
    textBytes,
  };
}
