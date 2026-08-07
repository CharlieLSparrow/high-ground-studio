import "server-only";

import { Prisma, type PrismaClient } from "@prisma/client";

import {
  type PortableNestTag,
  type ValidatedNestBundle,
} from "@/lib/nest-portability";
import { documentSha256, stableDocumentJson } from "@/lib/document-portability";

type RestoreClient = PrismaClient | Prisma.TransactionClient;

export type NestRestorePlan = {
  manifestSha256: string;
  sourceNestSlug: string;
  tagCreates: number;
  tagReuses: number;
  tagSlugCollisions: number;
  aliasCreates: number;
  aliasReuses: number;
  aliasesDeferred: number;
  mergeLinksPreservedAsHistory: number;
  noteCreates: number;
  noteReuses: number;
  blockCreates: number;
  spanCreates: number;
  documentTagLinkCreates: number;
  taskCreates: number;
  taskReuses: number;
  taskEvidenceReceiptCreates: number;
  goalCreates: number;
  goalReuses: number;
  progressReceiptCreates: number;
  goalTaskLinkCreates: number;
  planBlockCreates: number;
  planBlockReuses: number;
  sourceRevisionCreates: number;
  sourceRevisionReuses: number;
  sourceSetCreates: number;
  sourceSetReuses: number;
  sourceRangeCreates: number;
  sourceRangeReuses: number;
  storyCardCreates: number;
  storyCardReuses: number;
  storyBoardCreates: number;
  storyBoardReuses: number;
  storyBoardSlugCollisions: number;
  storySectionCreates: number;
  storyPlacementCreates: number;
  sourceReferencesRestoredUnavailable: number;
  remindersDeferred: number;
  recurrenceSeriesDeferred: number;
  planBlocksCanceledForSafety: number;
  overwrites: 0;
  sourceMutations: 0;
  externalSideEffects: 0;
};

export class NestRestorePlanChangedError extends Error {
  constructor() {
    super("The destination changed after this restore plan was reviewed.");
    this.name = "NestRestorePlanChangedError";
  }
}

type TagResolution = {
  originalId: string;
  existingId: string | null;
  targetSlug: string;
  create: boolean;
  collision: boolean;
  source: PortableNestTag;
};

function digest(value: unknown) {
  return documentSha256(stableDocumentJson(value));
}

export function nestRestorePlanSha256(plan: NestRestorePlan) {
  return digest(plan);
}

function toPrismaJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function portableId(
  prefix: string,
  projectId: string,
  bundle: ValidatedNestBundle,
  originalId: string,
  snapshot: unknown,
) {
  const value = `${projectId}:${bundle.sourceNest.id}:${originalId}:${digest(snapshot)}`;
  return `${prefix}-${documentSha256(value).slice(0, 52)}`;
}

function restoredTagId(
  projectId: string,
  bundle: ValidatedNestBundle,
  tag: PortableNestTag,
) {
  return portableId("portable-tag", projectId, bundle, tag.id, tag);
}

function restoredNoteStableId(
  projectId: string,
  bundle: ValidatedNestBundle,
  note: ValidatedNestBundle["notes"][number],
) {
  return portableId("portable-note", projectId, bundle, note.id, note);
}

function restoredBlockStableId(
  projectId: string,
  bundle: ValidatedNestBundle,
  noteId: string,
  block: ValidatedNestBundle["notes"][number]["blocks"][number],
) {
  return portableId(
    "portable-block",
    projectId,
    bundle,
    `${noteId}:${block.id}`,
    block,
  );
}

function restoredSourceLabel(sourceLabel: string | null) {
  return [sourceLabel, "origin:portable-nest-restore"]
    .filter(Boolean)
    .join(";")
    .slice(0, 2_000);
}

function restoredTaskId(
  projectId: string,
  bundle: ValidatedNestBundle,
  task: ValidatedNestBundle["tasks"][number],
) {
  return portableId("portable-task", projectId, bundle, task.id, task);
}

function restoredGoalId(
  projectId: string,
  bundle: ValidatedNestBundle,
  goal: ValidatedNestBundle["goals"][number],
) {
  return portableId("portable-goal", projectId, bundle, goal.id, goal);
}

function restoredTaskEvidenceId(
  projectId: string,
  bundle: ValidatedNestBundle,
  taskId: string,
  receipt: ValidatedNestBundle["tasks"][number]["evidenceReceipts"][number],
) {
  return portableId(
    "portable-task-evidence",
    projectId,
    bundle,
    `${taskId}:${receipt.id}`,
    receipt,
  );
}

function restoredProgressId(
  projectId: string,
  bundle: ValidatedNestBundle,
  goalId: string,
  receipt: ValidatedNestBundle["goals"][number]["progressReceipts"][number],
) {
  return portableId(
    "portable-progress",
    projectId,
    bundle,
    `${goalId}:${receipt.id}`,
    receipt,
  );
}

function restoredPlanBlockId(
  projectId: string,
  bundle: ValidatedNestBundle,
  block: ValidatedNestBundle["planBlocks"][number],
) {
  return portableId("portable-plan", projectId, bundle, block.id, block);
}

function restoredSourceRevisionId(
  projectId: string,
  bundle: ValidatedNestBundle,
  revision: ValidatedNestBundle["sourceStory"]["sourceRevisions"][number],
) {
  return portableId(
    "portable-source-revision",
    projectId,
    bundle,
    revision.id,
    revision,
  );
}

function restoredSourceExternalReferenceId(
  projectId: string,
  bundle: ValidatedNestBundle,
  revision: ValidatedNestBundle["sourceStory"]["sourceRevisions"][number],
) {
  return portableId(
    "portable-source-reference",
    projectId,
    bundle,
    revision.id,
    revision,
  );
}

function restoredSourceSetId(
  projectId: string,
  bundle: ValidatedNestBundle,
  set: ValidatedNestBundle["sourceStory"]["sourceSets"][number],
) {
  return portableId("portable-source-set", projectId, bundle, set.id, set);
}

function restoredSourceRangeId(
  projectId: string,
  bundle: ValidatedNestBundle,
  range: ValidatedNestBundle["sourceStory"]["sourceRanges"][number],
) {
  return portableId(
    "portable-source-range",
    projectId,
    bundle,
    range.id,
    range,
  );
}

function restoredStoryCardId(
  projectId: string,
  bundle: ValidatedNestBundle,
  card: ValidatedNestBundle["sourceStory"]["cards"][number],
) {
  return portableId("portable-story-card", projectId, bundle, card.id, card);
}

function restoredStoryCardStableId(
  projectId: string,
  bundle: ValidatedNestBundle,
  card: ValidatedNestBundle["sourceStory"]["cards"][number],
) {
  return portableId(
    "portable-story-stable",
    projectId,
    bundle,
    card.stableId,
    card,
  );
}

function restoredStoryBoardId(
  projectId: string,
  bundle: ValidatedNestBundle,
  board: ValidatedNestBundle["sourceStory"]["boards"][number],
) {
  return portableId("portable-story-board", projectId, bundle, board.id, board);
}

function restoredStorySectionId(
  projectId: string,
  bundle: ValidatedNestBundle,
  boardId: string,
  section: ValidatedNestBundle["sourceStory"]["boards"][number]["sections"][number],
) {
  return portableId(
    "portable-story-section",
    projectId,
    bundle,
    `${boardId}:${section.id}`,
    section,
  );
}

function restoredStoryPlacementId(
  projectId: string,
  bundle: ValidatedNestBundle,
  boardId: string,
  placement: ValidatedNestBundle["sourceStory"]["boards"][number]["placements"][number],
) {
  return portableId(
    "portable-story-placement",
    projectId,
    bundle,
    `${boardId}:${placement.id}`,
    placement,
  );
}

function restoredTaskSourceJson(input: {
  task: ValidatedNestBundle["tasks"][number];
  bundle: ValidatedNestBundle;
  projectId: string;
  projectSlug: string;
  sourceStory: SourceStoryRestoreResolution;
}) {
  const originalSourceJson = input.task.sourceJson;
  const originalAnchor = record(originalSourceJson.sourceCardAnchor);
  const originalCardId =
    typeof originalAnchor.storyCardId === "string"
      ? originalAnchor.storyCardId
      : "";
  const originalRangeId =
    typeof originalAnchor.sourceRangeId === "string"
      ? originalAnchor.sourceRangeId
      : "";
  const originalRevisionId =
    typeof originalAnchor.sourceRevisionId === "string"
      ? originalAnchor.sourceRevisionId
      : "";
  const originalSetId =
    typeof originalAnchor.sourceSetId === "string"
      ? originalAnchor.sourceSetId
      : "";
  const originalBoardId =
    typeof originalAnchor.boardId === "string" ? originalAnchor.boardId : "";
  const restoredCardId = input.sourceStory.cardIds.get(originalCardId);
  const restoredRangeId = input.sourceStory.rangeIds.get(originalRangeId);
  const restoredRevisionId =
    input.sourceStory.revisionIds.get(originalRevisionId);
  const restoredSetId = originalSetId
    ? input.sourceStory.setIds.get(originalSetId)
    : null;
  const restoredBoardId = originalBoardId
    ? input.sourceStory.boardIds.get(originalBoardId)
    : null;
  const sourceCardAnchor =
    originalAnchor.schema === "quipsly-source-card-action-anchor-v1" &&
    restoredCardId &&
    restoredRangeId &&
    restoredRevisionId
      ? {
          ...originalAnchor,
          projectSlug: input.projectSlug,
          storyCardId: restoredCardId,
          storyCardStableId: restoredStoryCardStableId(
            input.projectId,
            input.bundle,
            input.bundle.sourceStory.cards.find(
              (card) => card.id === originalCardId,
            )!,
          ),
          storyCardRevision: 1,
          sourceRangeId: restoredRangeId,
          sourceRevisionId: restoredRevisionId,
          sourceSetId: restoredSetId,
          boardId: restoredBoardId,
          restoredPortableReference: true,
          sourceAvailable: false,
        }
      : null;
  return {
    schema: "quipsly-portable-task-restore-v1",
    manifestSha256: input.bundle.manifestSha256,
    originalNestId: input.bundle.sourceNest.id,
    originalTaskId: input.task.id,
    originalCreatedAt: input.task.createdAt,
    originalUpdatedAt: input.task.updatedAt,
    originalSourceJson,
    ...(sourceCardAnchor ? { sourceCardAnchor } : {}),
    reminderSnapshot: input.task.reminderSnapshot,
    recurrenceSnapshot: input.task.recurrenceSnapshot,
    reminderRestoredActive: false,
    recurrenceRestoredActive: false,
    overwroteExisting: false,
    externalSideEffects: false,
  };
}

type SourceStoryRestoreResolution = {
  revisionIds: Map<string, string>;
  revisionCreates: Set<string>;
  setIds: Map<string, string>;
  setCreates: Set<string>;
  rangeIds: Map<string, string>;
  rangeCreates: Set<string>;
  cardIds: Map<string, string>;
  cardCreates: Set<string>;
  boardIds: Map<string, string>;
  boardCreates: Set<string>;
  boardSlugs: Map<string, string>;
  boardSlugCollisions: Set<string>;
};

async function resolveSourceStory(
  client: RestoreClient,
  projectId: string,
  bundle: ValidatedNestBundle,
): Promise<SourceStoryRestoreResolution> {
  const revisions = bundle.sourceStory.sourceRevisions;
  const existingRevisions = revisions.length
    ? await client.studioMediaSourceRevision.findMany({
        where: {
          projectId,
          identitySha256: {
            in: revisions.map((revision) => revision.identitySha256),
          },
        },
        select: { id: true, identitySha256: true },
      })
    : [];
  const existingRevisionByIdentity = new Map(
    existingRevisions.map((revision) => [revision.identitySha256, revision.id]),
  );
  const revisionIds = new Map<string, string>();
  const revisionCreates = new Set<string>();
  for (const revision of revisions) {
    const existingId = existingRevisionByIdentity.get(revision.identitySha256);
    const targetId =
      existingId ?? restoredSourceRevisionId(projectId, bundle, revision);
    revisionIds.set(revision.id, targetId);
    if (!existingId) revisionCreates.add(revision.id);
  }

  const sets = bundle.sourceStory.sourceSets;
  const existingSets = sets.length
    ? await client.studioMediaSourceSet.findMany({
        where: {
          projectId,
          identitySha256: { in: sets.map((set) => set.identitySha256) },
        },
        select: { id: true, identitySha256: true },
      })
    : [];
  const existingSetByIdentity = new Map(
    existingSets.map((set) => [set.identitySha256, set.id]),
  );
  const setIds = new Map<string, string>();
  const setCreates = new Set<string>();
  for (const set of sets) {
    const existingId = existingSetByIdentity.get(set.identitySha256);
    const targetId = existingId ?? restoredSourceSetId(projectId, bundle, set);
    setIds.set(set.id, targetId);
    if (!existingId) setCreates.add(set.id);
  }

  const ranges = bundle.sourceStory.sourceRanges;
  const revisionTargetIds = [...new Set(revisionIds.values())];
  const existingRanges =
    revisionTargetIds.length && ranges.length
      ? await client.studioSourceRange.findMany({
          where: {
            projectId,
            sourceRevisionId: { in: revisionTargetIds },
            selectorSha256: { in: ranges.map((range) => range.selectorSha256) },
          },
          select: { id: true, sourceRevisionId: true, selectorSha256: true },
        })
      : [];
  const existingRangeByKey = new Map(
    existingRanges.map((range) => [
      `${range.sourceRevisionId}:${range.selectorSha256}`,
      range.id,
    ]),
  );
  const rangeIds = new Map<string, string>();
  const rangeCreates = new Set<string>();
  for (const range of ranges) {
    const sourceRevisionId = revisionIds.get(range.sourceRevisionId);
    if (!sourceRevisionId)
      throw new Error(
        "A portable source range has no restored source revision.",
      );
    const existingId = existingRangeByKey.get(
      `${sourceRevisionId}:${range.selectorSha256}`,
    );
    const targetId =
      existingId ?? restoredSourceRangeId(projectId, bundle, range);
    rangeIds.set(range.id, targetId);
    if (!existingId) rangeCreates.add(range.id);
  }

  const cards = bundle.sourceStory.cards;
  const targetCardIds = cards.map((card) =>
    restoredStoryCardId(projectId, bundle, card),
  );
  const targetCardStableIds = cards.map((card) =>
    restoredStoryCardStableId(projectId, bundle, card),
  );
  const existingCards = cards.length
    ? await client.studioStoryCard.findMany({
        where: {
          projectId,
          OR: [
            { id: { in: targetCardIds } },
            { stableId: { in: targetCardStableIds } },
          ],
        },
        select: { id: true, stableId: true },
      })
    : [];
  const existingCardById = new Map(
    existingCards.map((card) => [card.id, card]),
  );
  const existingCardByStableId = new Map(
    existingCards.map((card) => [card.stableId, card]),
  );
  const cardIds = new Map<string, string>();
  const cardCreates = new Set<string>();
  for (const card of cards) {
    const targetId = restoredStoryCardId(projectId, bundle, card);
    const targetStableId = restoredStoryCardStableId(projectId, bundle, card);
    const existing =
      existingCardById.get(targetId) ??
      existingCardByStableId.get(targetStableId);
    cardIds.set(card.id, existing?.id ?? targetId);
    if (!existing) cardCreates.add(card.id);
  }

  const boards = bundle.sourceStory.boards;
  const targetBoardIds = boards.map((board) =>
    restoredStoryBoardId(projectId, bundle, board),
  );
  const existingBoards = boards.length
    ? await client.studioStoryBoard.findMany({
        where: {
          projectId,
          OR: [
            { id: { in: targetBoardIds } },
            { slug: { in: boards.map((board) => board.slug) } },
          ],
        },
        select: { id: true, slug: true },
      })
    : [];
  const existingBoardById = new Map(
    existingBoards.map((board) => [board.id, board]),
  );
  const reservedSlugs = new Map(
    existingBoards.map((board) => [board.slug, board.id]),
  );
  const boardIds = new Map<string, string>();
  const boardCreates = new Set<string>();
  const boardSlugs = new Map<string, string>();
  const boardSlugCollisions = new Set<string>();
  for (const board of boards) {
    const targetId = restoredStoryBoardId(projectId, bundle, board);
    const existing = existingBoardById.get(targetId);
    if (existing) {
      boardIds.set(board.id, existing.id);
      boardSlugs.set(board.id, existing.slug);
      if (existing.slug !== board.slug) boardSlugCollisions.add(board.id);
      continue;
    }
    let targetSlug = board.slug;
    if (reservedSlugs.has(targetSlug)) {
      targetSlug = `${board.slug.slice(0, 165)}-restored-${digest({ sourceNestId: bundle.sourceNest.id, boardId: board.id, board }).slice(0, 12)}`;
      boardSlugCollisions.add(board.id);
    }
    const targetSlugOwner = reservedSlugs.get(targetSlug);
    if (targetSlugOwner && targetSlugOwner !== targetId) {
      throw new Error(
        `A portable Source Story board slug is already reserved (${targetSlug}).`,
      );
    }
    reservedSlugs.set(targetSlug, targetId);
    boardIds.set(board.id, targetId);
    boardSlugs.set(board.id, targetSlug);
    boardCreates.add(board.id);
  }

  return {
    revisionIds,
    revisionCreates,
    setIds,
    setCreates,
    rangeIds,
    rangeCreates,
    cardIds,
    cardCreates,
    boardIds,
    boardCreates,
    boardSlugs,
    boardSlugCollisions,
  };
}

function equivalentTag(
  row: {
    label: string;
    description: string | null;
    category: string;
    nodeType: string;
    isPrivate: boolean;
    isActive: boolean;
  },
  tag: PortableNestTag,
) {
  return (
    row.label === tag.label &&
    row.description === tag.description &&
    row.category === tag.category &&
    row.nodeType === tag.nodeType &&
    row.isPrivate === tag.isPrivate &&
    row.isActive === tag.isActive
  );
}

async function resolveTags(
  client: RestoreClient,
  projectId: string,
  bundle: ValidatedNestBundle,
): Promise<TagResolution[]> {
  const existing = await client.studioTag.findMany({
    where: { projectId },
    select: {
      id: true,
      slug: true,
      label: true,
      description: true,
      category: true,
      nodeType: true,
      isPrivate: true,
      isActive: true,
    },
  });
  const bySlug = new Map(existing.map((tag) => [tag.slug, tag]));
  const byId = new Map(existing.map((tag) => [tag.id, tag]));
  const reserved = new Set(existing.map((tag) => tag.slug));
  const results: TagResolution[] = [];

  for (const tag of bundle.tags) {
    const deterministic = byId.get(restoredTagId(projectId, bundle, tag));
    if (deterministic) {
      results.push({
        originalId: tag.id,
        existingId: deterministic.id,
        targetSlug: deterministic.slug,
        create: false,
        collision: deterministic.slug !== tag.slug,
        source: tag,
      });
      continue;
    }
    const sameSlug = bySlug.get(tag.slug);
    if (sameSlug && equivalentTag(sameSlug, tag)) {
      results.push({
        originalId: tag.id,
        existingId: sameSlug.id,
        targetSlug: tag.slug,
        create: false,
        collision: false,
        source: tag,
      });
      continue;
    }
    if (!sameSlug && !reserved.has(tag.slug)) {
      reserved.add(tag.slug);
      results.push({
        originalId: tag.id,
        existingId: null,
        targetSlug: tag.slug,
        create: true,
        collision: false,
        source: tag,
      });
      continue;
    }
    const suffix = documentSha256(
      `${bundle.sourceNest.id}:${tag.id}:${digest(tag)}`,
    ).slice(0, 12);
    const targetSlug = `${tag.slug.slice(0, 170)}-restored-${suffix}`;
    const versioned = bySlug.get(targetSlug);
    if (versioned && !equivalentTag(versioned, tag)) {
      throw new Error(
        `A versioned portable tag slug already exists with different content (${targetSlug}).`,
      );
    }
    reserved.add(targetSlug);
    results.push({
      originalId: tag.id,
      existingId: versioned?.id ?? null,
      targetSlug,
      create: !versioned,
      collision: true,
      source: tag,
    });
  }
  return results;
}

async function aliasPlan(
  client: RestoreClient,
  projectId: string,
  resolutions: TagResolution[],
) {
  const [canonicalRows, aliasRows] = await Promise.all([
    client.studioTag.findMany({
      where: { projectId },
      select: { slug: true, id: true },
    }),
    client.studioTagAlias.findMany({
      where: { projectId },
      select: { slug: true, tagId: true },
    }),
  ]);
  const canonical = new Map<string, string>(
    canonicalRows.map((row) => [row.slug, row.id]),
  );
  const aliases = new Map(aliasRows.map((row) => [row.slug, row.tagId]));
  const targetKeys = new Map(
    resolutions.map((resolution) => [
      resolution.originalId,
      resolution.existingId ?? `planned:${resolution.originalId}`,
    ]),
  );
  for (const resolution of resolutions) {
    canonical.set(
      resolution.targetSlug,
      targetKeys.get(resolution.originalId)!,
    );
  }
  let creates = 0;
  let reuses = 0;
  let deferred = 0;
  for (const resolution of resolutions) {
    const targetTagKey = targetKeys.get(resolution.originalId)!;
    for (const alias of resolution.source.aliases) {
      const canonicalOwner = canonical.get(alias.slug);
      const aliasOwner = aliases.get(alias.slug);
      if (canonicalOwner === targetTagKey || aliasOwner === targetTagKey)
        reuses += 1;
      else if (canonicalOwner || aliasOwner) deferred += 1;
      else {
        creates += 1;
        aliases.set(alias.slug, targetTagKey);
      }
    }
  }
  return { creates, reuses, deferred };
}

export async function buildNestRestorePlan(
  client: RestoreClient,
  input: {
    projectId: string;
    actorUserId: string;
    bundle: ValidatedNestBundle;
  },
): Promise<NestRestorePlan> {
  const tagResolutions = await resolveTags(
    client,
    input.projectId,
    input.bundle,
  );
  const aliases = await aliasPlan(client, input.projectId, tagResolutions);
  const sourceStory = await resolveSourceStory(
    client,
    input.projectId,
    input.bundle,
  );
  const noteStableIds = input.bundle.notes.map((note) =>
    restoredNoteStableId(input.projectId, input.bundle, note),
  );
  const taskIds = input.bundle.tasks.map((task) =>
    restoredTaskId(input.projectId, input.bundle, task),
  );
  const taskEvidenceIds = input.bundle.tasks.flatMap((task) =>
    task.evidenceReceipts.map((receipt) =>
      restoredTaskEvidenceId(input.projectId, input.bundle, task.id, receipt),
    ),
  );
  const goalIds = input.bundle.goals.map((goal) =>
    restoredGoalId(input.projectId, input.bundle, goal),
  );
  const planBlockIds = input.bundle.planBlocks.map((block) =>
    restoredPlanBlockId(input.projectId, input.bundle, block),
  );
  const [
    existingNotes,
    existingTasks,
    existingTaskEvidence,
    existingGoals,
    existingProgress,
    existingGoalTaskLinks,
    existingPlanBlocks,
  ] = await Promise.all([
    noteStableIds.length
      ? client.studioDocument.findMany({
          where: {
            projectId: input.projectId,
            stableId: { in: noteStableIds },
          },
          select: { stableId: true },
        })
      : Promise.resolve([]),
    taskIds.length
      ? client.actionItem.findMany({
          where: {
            projectId: input.projectId,
            assignedUserId: input.actorUserId,
            id: { in: taskIds },
          },
          select: { id: true },
        })
      : Promise.resolve([]),
    taskEvidenceIds.length
      ? client.actionItemEvidenceReceipt.findMany({
          where: {
            actorUserId: input.actorUserId,
            id: { in: taskEvidenceIds },
          },
          select: { id: true },
        })
      : Promise.resolve([]),
    goalIds.length
      ? client.goal.findMany({
          where: {
            projectId: input.projectId,
            ownerUserId: input.actorUserId,
            id: { in: goalIds },
          },
          select: { id: true },
        })
      : Promise.resolve([]),
    goalIds.length
      ? client.goalProgressReceipt.findMany({
          where: { goalId: { in: goalIds } },
          select: { id: true },
        })
      : Promise.resolve([]),
    goalIds.length && taskIds.length
      ? client.goalTaskLink.findMany({
          where: { goalId: { in: goalIds }, actionItemId: { in: taskIds } },
          select: { goalId: true, actionItemId: true },
        })
      : Promise.resolve([]),
    planBlockIds.length
      ? client.workPlanBlock.findMany({
          where: { ownerUserId: input.actorUserId, id: { in: planBlockIds } },
          select: { id: true },
        })
      : Promise.resolve([]),
  ]);
  const existingNoteIds = new Set(existingNotes.map((note) => note.stableId));
  const existingTaskIds = new Set(existingTasks.map((task) => task.id));
  const existingTaskEvidenceIds = new Set(
    existingTaskEvidence.map((receipt) => receipt.id),
  );
  const existingGoalIds = new Set(existingGoals.map((goal) => goal.id));
  const existingProgressIds = new Set(
    existingProgress.map((receipt) => receipt.id),
  );
  const existingLinkIds = new Set(
    existingGoalTaskLinks.map((link) => `${link.goalId}:${link.actionItemId}`),
  );
  const existingPlanIds = new Set(existingPlanBlocks.map((block) => block.id));

  return {
    manifestSha256: input.bundle.manifestSha256,
    sourceNestSlug: input.bundle.sourceNest.slug,
    tagCreates: tagResolutions.filter((tag) => tag.create).length,
    tagReuses: tagResolutions.filter((tag) => !tag.create).length,
    tagSlugCollisions: tagResolutions.filter((tag) => tag.collision).length,
    aliasCreates: aliases.creates,
    aliasReuses: aliases.reuses,
    aliasesDeferred: aliases.deferred,
    mergeLinksPreservedAsHistory: input.bundle.tags.filter(
      (tag) => tag.mergedIntoTagId,
    ).length,
    noteCreates: input.bundle.notes.filter(
      (note) =>
        !existingNoteIds.has(
          restoredNoteStableId(input.projectId, input.bundle, note),
        ),
    ).length,
    noteReuses: input.bundle.notes.filter((note) =>
      existingNoteIds.has(
        restoredNoteStableId(input.projectId, input.bundle, note),
      ),
    ).length,
    blockCreates: input.bundle.notes
      .filter(
        (note) =>
          !existingNoteIds.has(
            restoredNoteStableId(input.projectId, input.bundle, note),
          ),
      )
      .reduce((count, note) => count + note.blocks.length, 0),
    spanCreates: input.bundle.notes
      .filter(
        (note) =>
          !existingNoteIds.has(
            restoredNoteStableId(input.projectId, input.bundle, note),
          ),
      )
      .reduce(
        (count, note) =>
          count +
          note.blocks.reduce(
            (blockCount, block) => blockCount + block.spans.length,
            0,
          ),
        0,
      ),
    documentTagLinkCreates: input.bundle.notes
      .filter(
        (note) =>
          !existingNoteIds.has(
            restoredNoteStableId(input.projectId, input.bundle, note),
          ),
      )
      .reduce((count, note) => count + note.tagIds.length, 0),
    taskCreates: taskIds.filter((id) => !existingTaskIds.has(id)).length,
    taskReuses: taskIds.filter((id) => existingTaskIds.has(id)).length,
    taskEvidenceReceiptCreates: input.bundle.tasks.reduce(
      (count, task) =>
        count +
        task.evidenceReceipts.filter(
          (receipt) =>
            !existingTaskEvidenceIds.has(
              restoredTaskEvidenceId(
                input.projectId,
                input.bundle,
                task.id,
                receipt,
              ),
            ),
        ).length,
      0,
    ),
    goalCreates: goalIds.filter((id) => !existingGoalIds.has(id)).length,
    goalReuses: goalIds.filter((id) => existingGoalIds.has(id)).length,
    progressReceiptCreates: input.bundle.goals.reduce(
      (count, goal) =>
        count +
        goal.progressReceipts.filter(
          (receipt) =>
            !existingProgressIds.has(
              restoredProgressId(
                input.projectId,
                input.bundle,
                goal.id,
                receipt,
              ),
            ),
        ).length,
      0,
    ),
    goalTaskLinkCreates: input.bundle.goalTaskLinks.filter((link) => {
      const goal = input.bundle.goals.find(
        (candidate) => candidate.id === link.goalId,
      );
      const task = input.bundle.tasks.find(
        (candidate) => candidate.id === link.taskId,
      );
      if (!goal || !task) return false;
      return !existingLinkIds.has(
        `${restoredGoalId(input.projectId, input.bundle, goal)}:${restoredTaskId(input.projectId, input.bundle, task)}`,
      );
    }).length,
    planBlockCreates: planBlockIds.filter((id) => !existingPlanIds.has(id))
      .length,
    planBlockReuses: planBlockIds.filter((id) => existingPlanIds.has(id))
      .length,
    sourceRevisionCreates: sourceStory.revisionCreates.size,
    sourceRevisionReuses:
      input.bundle.sourceStory.sourceRevisions.length -
      sourceStory.revisionCreates.size,
    sourceSetCreates: sourceStory.setCreates.size,
    sourceSetReuses:
      input.bundle.sourceStory.sourceSets.length - sourceStory.setCreates.size,
    sourceRangeCreates: sourceStory.rangeCreates.size,
    sourceRangeReuses:
      input.bundle.sourceStory.sourceRanges.length -
      sourceStory.rangeCreates.size,
    storyCardCreates: sourceStory.cardCreates.size,
    storyCardReuses:
      input.bundle.sourceStory.cards.length - sourceStory.cardCreates.size,
    storyBoardCreates: sourceStory.boardCreates.size,
    storyBoardReuses:
      input.bundle.sourceStory.boards.length - sourceStory.boardCreates.size,
    storyBoardSlugCollisions: sourceStory.boardSlugCollisions.size,
    storySectionCreates: input.bundle.sourceStory.boards
      .filter((board) => sourceStory.boardCreates.has(board.id))
      .reduce((count, board) => count + board.sections.length, 0),
    storyPlacementCreates: input.bundle.sourceStory.boards
      .filter((board) => sourceStory.boardCreates.has(board.id))
      .reduce((count, board) => count + board.placements.length, 0),
    sourceReferencesRestoredUnavailable: sourceStory.revisionCreates.size,
    remindersDeferred: input.bundle.tasks.filter(
      (task) => task.reminderSnapshot,
    ).length,
    recurrenceSeriesDeferred: input.bundle.tasks.filter(
      (task) => task.recurrenceSnapshot,
    ).length,
    planBlocksCanceledForSafety: input.bundle.planBlocks.length,
    overwrites: 0,
    sourceMutations: 0,
    externalSideEffects: 0,
  };
}

export async function applyNestRestore(
  prisma: PrismaClient,
  input: {
    projectId: string;
    actorUserId: string;
    actorEmail: string;
    bundle: ValidatedNestBundle;
    expectedPlanSha256: string;
  },
) {
  return prisma.$transaction(
    async (tx) => {
      await tx.$queryRaw(Prisma.sql`
      SELECT 1 AS "locked"
      FROM pg_advisory_xact_lock(
        hashtextextended(${`${input.projectId}:${input.actorUserId}:${input.bundle.manifestSha256}`}, 0)
      )
    `);
      const plan = await buildNestRestorePlan(tx, input);
      const planSha256 = nestRestorePlanSha256(plan);
      if (planSha256 !== input.expectedPlanSha256) {
        throw new NestRestorePlanChangedError();
      }
      const destinationProject = await tx.studioProject.findUnique({
        where: { id: input.projectId },
        select: { slug: true },
      });
      if (!destinationProject)
        throw new Error("The destination Nest no longer exists.");
      const tagResolutions = await resolveTags(
        tx,
        input.projectId,
        input.bundle,
      );
      const tagIds = new Map<string, string>();
      const newlyCreatedTagIds = new Set<string>();
      for (const resolution of tagResolutions) {
        let id = resolution.existingId;
        if (!id) {
          const created = await tx.studioTag.create({
            data: {
              id: restoredTagId(
                input.projectId,
                input.bundle,
                resolution.source,
              ),
              projectId: input.projectId,
              slug: resolution.targetSlug,
              label: resolution.source.label,
              description: resolution.source.description,
              category: resolution.source.category as never,
              nodeType: resolution.source.nodeType as never,
              isPrivate: resolution.source.isPrivate,
              isActive: resolution.source.isActive,
              archivedAt: resolution.source.isActive ? null : new Date(),
            },
            select: { id: true },
          });
          id = created.id;
          newlyCreatedTagIds.add(id);
          await tx.studioTagRevision.create({
            data: {
              tagId: id,
              revision: 1,
              operation: "restored-from-portable-nest",
              actorUserId: input.actorUserId,
              snapshotJson: toPrismaJson({
                schema: "quipsly-portable-tag-restore-v1",
                manifestSha256: input.bundle.manifestSha256,
                originalNestId: input.bundle.sourceNest.id,
                originalTagId: resolution.source.id,
                originalSlug: resolution.source.slug,
                targetSlug: resolution.targetSlug,
                originalMergedIntoTagId: resolution.source.mergedIntoTagId,
                exportedRevisions: resolution.source.revisions,
                overwroteExisting: false,
              }),
            },
          });
        }
        tagIds.set(resolution.originalId, id);
      }

      const canonicalRows = await tx.studioTag.findMany({
        where: { projectId: input.projectId },
        select: { id: true, slug: true },
      });
      const aliasRows = await tx.studioTagAlias.findMany({
        where: { projectId: input.projectId },
        select: { tagId: true, slug: true },
      });
      const canonicalBySlug = new Map(
        canonicalRows.map((row) => [row.slug, row.id]),
      );
      const aliasBySlug = new Map(
        aliasRows.map((row) => [row.slug, row.tagId]),
      );
      for (const resolution of tagResolutions) {
        const tagId = tagIds.get(resolution.originalId);
        if (!tagId)
          throw new Error(
            `Portable tag mapping is missing for ${resolution.originalId}.`,
          );
        for (const alias of resolution.source.aliases) {
          const canonicalOwner = canonicalBySlug.get(alias.slug);
          const aliasOwner = aliasBySlug.get(alias.slug);
          if (aliasOwner === tagId || canonicalOwner || aliasOwner) continue;
          await tx.studioTagAlias.create({
            data: {
              projectId: input.projectId,
              tagId,
              slug: alias.slug,
              label: alias.label,
              provenanceJson: toPrismaJson({
                ...alias.provenanceJson,
                restore: {
                  schema: "quipsly-portable-tag-alias-restore-v1",
                  manifestSha256: input.bundle.manifestSha256,
                  originalAliasId: alias.id,
                  originalTagId: resolution.originalId,
                  overwroteExisting: false,
                },
              }),
              createdByUserId: input.actorUserId,
            },
          });
          aliasBySlug.set(alias.slug, tagId);
        }
      }

      const documentIds = new Map<string, string>();
      const blockIds = new Map<string, string>();
      for (const note of input.bundle.notes) {
        const stableId = restoredNoteStableId(
          input.projectId,
          input.bundle,
          note,
        );
        let document = await tx.studioDocument.findUnique({
          where: { stableId },
          select: { id: true, projectId: true, personalOwnerUserId: true },
        });
        if (document && document.projectId !== input.projectId) {
          throw new Error(
            "A portable note identity belongs to another destination Nest.",
          );
        }
        if (
          document &&
          document.personalOwnerUserId !==
            (note.personal ? input.actorUserId : null)
        ) {
          throw new Error(
            "A portable note identity has a different personal ownership boundary.",
          );
        }
        if (!document) {
          document = await tx.studioDocument.create({
            data: {
              projectId: input.projectId,
              personalOwnerUserId: note.personal ? input.actorUserId : null,
              stableId,
              title: note.title,
              sourceLabel: restoredSourceLabel(note.sourceLabel),
              sourcePath: note.sourcePath,
              projectionStatus: "private",
              isPrivate: true,
              tagRevision: note.tagIds.length > 0 ? 1 : 0,
            },
            select: { id: true, projectId: true, personalOwnerUserId: true },
          });
          if (note.tagIds.length) {
            await tx.studioDocumentTagLink.createMany({
              data: note.tagIds.map((originalTagId) => {
                const tagId = tagIds.get(originalTagId);
                if (!tagId)
                  throw new Error(
                    `Portable document tag mapping is missing for ${originalTagId}.`,
                  );
                return {
                  documentId: document!.id,
                  tagId,
                  createdByUserId: input.actorUserId,
                  sourceJson: toPrismaJson({
                    source: "quipsly-portable-document-tags-v1",
                    manifestSha256: input.bundle.manifestSha256,
                    originalDocumentId: note.id,
                    originalTagId,
                    externalSideEffects: false,
                  }),
                };
              }),
            });
          }
          const createdBlockStableIds: string[] = [];
          for (const block of note.blocks) {
            const blockStableId = restoredBlockStableId(
              input.projectId,
              input.bundle,
              note.id,
              block,
            );
            createdBlockStableIds.push(blockStableId);
            const createdBlock = await tx.studioDocumentBlock.create({
              data: {
                documentId: document.id,
                stableId: blockStableId,
                order: block.order,
                title: block.title,
                body: block.body,
                sourceLabel: restoredSourceLabel(block.sourceLabel),
                sourcePath: block.sourcePath,
                externalId: block.externalId,
                projectionStatus: "private",
                isPrivate: true,
                archivedAt: block.archivedAt
                  ? new Date(block.archivedAt)
                  : null,
                archivedByLabel: block.archivedAt
                  ? "Restored portable snapshot"
                  : null,
              },
              select: { id: true },
            });
            blockIds.set(`${note.id}:${block.id}`, createdBlock.id);
            if (block.spans.length) {
              await tx.studioTaggedSpan.createMany({
                data: block.spans.map((span) => {
                  const tagId = tagIds.get(span.tagId);
                  if (!tagId)
                    throw new Error(
                      `Portable span tag mapping is missing for ${span.tagId}.`,
                    );
                  return {
                    id: portableId(
                      "portable-span",
                      input.projectId,
                      input.bundle,
                      `${note.id}:${block.id}:${span.id}`,
                      span,
                    ),
                    documentId: document!.id,
                    blockId: createdBlock.id,
                    tagId,
                    startOffset: span.startOffset,
                    endOffset: span.endOffset,
                    selectedText: span.selectedText,
                    noteBody: span.noteBody,
                    documentStableId: stableId,
                    documentTitleSnapshot: note.title,
                    blockStableId,
                    blockTitleSnapshot: block.title,
                    sourceLabel: "Portable Nest note snapshot",
                    sourcePath: block.sourcePath,
                    sourceExternalId: block.externalId,
                    projectionStatus: "private" as const,
                    isPrivate: true,
                    createdByLabel: input.actorEmail,
                  };
                }),
                skipDuplicates: true,
              });
            }
          }
          await tx.studioDocumentOperation.create({
            data: {
              projectId: input.projectId,
              documentId: document.id,
              actorEmail: input.actorEmail,
              origin: "import",
              operationType: "restore-portable-nest-note",
              status: "applied",
              afterJson: toPrismaJson({
                documentStableId: stableId,
                blockStableIds: createdBlockStableIds,
              }),
              payloadJson: toPrismaJson({
                schema: "quipsly-portable-nest-note-restore-v1",
                manifestSha256: input.bundle.manifestSha256,
                originalNestId: input.bundle.sourceNest.id,
                originalDocumentId: note.id,
                originalDocumentStableId: note.stableId,
                originalSourceLabel: note.sourceLabel,
                restoredPrivate: true,
                overwroteExisting: false,
                externalSideEffects: false,
              }),
              reversible: true,
            },
          });
        } else {
          const existingBlocks = await tx.studioDocumentBlock.findMany({
            where: { documentId: document.id },
            select: { id: true, stableId: true },
          });
          const byStableId = new Map(
            existingBlocks.map((block) => [block.stableId, block.id]),
          );
          for (const block of note.blocks) {
            const stableBlockId = restoredBlockStableId(
              input.projectId,
              input.bundle,
              note.id,
              block,
            );
            const id = byStableId.get(stableBlockId);
            if (!id)
              throw new Error(
                "A restored note exists without its verified block snapshot.",
              );
            blockIds.set(`${note.id}:${block.id}`, id);
          }
        }
        documentIds.set(note.id, document.id);
      }

      const sourceStory = await resolveSourceStory(
        tx,
        input.projectId,
        input.bundle,
      );
      for (const revision of input.bundle.sourceStory.sourceRevisions) {
        if (!sourceStory.revisionCreates.has(revision.id)) continue;
        const id = sourceStory.revisionIds.get(revision.id);
        if (!id)
          throw new Error(
            `Portable source-revision mapping is missing for ${revision.id}.`,
          );
        const externalReferenceId = restoredSourceExternalReferenceId(
          input.projectId,
          input.bundle,
          revision,
        );
        const referenceRequestId = portableId(
          "portable-source-reference-request",
          input.projectId,
          input.bundle,
          revision.id,
          revision,
        );
        await tx.studioExternalMediaReference.create({
          data: {
            id: externalReferenceId,
            projectId: input.projectId,
            provider: "portable",
            externalFileId: `${input.bundle.sourceNest.id}:${revision.id}`,
            fileName: `Portable source reference ${revision.id}`.slice(0, 500),
            sizeBytes:
              revision.sizeBytes == null ? null : BigInt(revision.sizeBytes),
            checksumSha256: revision.contentSha256,
            accessState: "unavailable",
            capabilityState: "relink-required",
            providerLocatorJson: toPrismaJson({}),
            capabilitySnapshotJson: toPrismaJson({
              schema: "quipsly-portable-source-capability-v1",
              manifestSha256: input.bundle.manifestSha256,
              originalRevisionId: revision.id,
              originalRevisionKey: revision.revisionKey,
              originalSourceState: revision.sourceState,
              mediaBytesPresent: false,
              providerCapabilityPresent: false,
              requiresExplicitRelink: true,
            }),
            importedByUserId: input.actorUserId,
            importedByEmail: input.actorEmail,
            clientRequestId: referenceRequestId,
            revision: 1,
          },
        });
        await tx.studioExternalMediaReferenceOperation.create({
          data: {
            referenceId: externalReferenceId,
            revision: 1,
            previousRevision: 0,
            operation: "restored-portable-reference",
            actorUserId: input.actorUserId,
            clientRequestId: referenceRequestId,
            requestSha256: digest({
              schema: "quipsly-portable-source-reference-restore-v1",
              manifestSha256: input.bundle.manifestSha256,
              originalRevisionId: revision.id,
            }),
            snapshotJson: toPrismaJson({
              schema: "quipsly-portable-source-reference-restore-v1",
              manifestSha256: input.bundle.manifestSha256,
              originalNestId: input.bundle.sourceNest.id,
              originalRevisionId: revision.id,
              providerLocatorRestored: false,
              credentialRestored: false,
              externalSideEffects: false,
            }),
          },
        });
        await tx.studioMediaSourceRevision.create({
          data: {
            id,
            projectId: input.projectId,
            externalReferenceId,
            revisionKey: `portable:${input.bundle.manifestSha256}:${revision.id}`,
            identitySha256: revision.identitySha256,
            contentSha256: revision.contentSha256,
            sizeBytes:
              revision.sizeBytes == null ? null : BigInt(revision.sizeBytes),
            durationSeconds: revision.durationSeconds,
            widthPixels: revision.widthPixels,
            heightPixels: revision.heightPixels,
            framesPerSecond: revision.framesPerSecond,
            mediaProjection: revision.mediaProjection,
            projectionJson: toPrismaJson({
              schema: "quipsly-portable-source-projection-v1",
              originalSourceState: revision.sourceState,
            }),
            sourceState: "portable-reference",
            providerModifiedAt: revision.providerModifiedAt
              ? new Date(revision.providerModifiedAt)
              : null,
            verifiedAt: null,
            verificationJson: toPrismaJson({
              schema: "quipsly-portable-source-verification-v1",
              manifestSha256: input.bundle.manifestSha256,
              originalRevisionId: revision.id,
              originalVerifiedAt: revision.verifiedAt,
              metadataIntegrityVerified: true,
              mediaBytesPresent: false,
              providerCapabilityPresent: false,
              requiresExplicitRelink: true,
            }),
            provenanceJson: toPrismaJson({
              schema: "quipsly-portable-source-revision-restore-v1",
              originalNestId: input.bundle.sourceNest.id,
              originalRevisionId: revision.id,
              originalRevisionKey: revision.revisionKey,
              originalCreatedAt: revision.createdAt,
              providerLocatorRestored: false,
              credentialRestored: false,
              externalSideEffects: false,
            }),
            createdByUserId: input.actorUserId,
          },
        });
      }

      for (const set of input.bundle.sourceStory.sourceSets) {
        if (!sourceStory.setCreates.has(set.id)) continue;
        const id = sourceStory.setIds.get(set.id);
        const sourceClockRevisionId = sourceStory.revisionIds.get(
          set.sourceClockRevisionId,
        );
        if (!id || !sourceClockRevisionId)
          throw new Error(
            `Portable source-set mapping is missing for ${set.id}.`,
          );
        await tx.studioMediaSourceSet.create({
          data: {
            id,
            projectId: input.projectId,
            kind: set.kind,
            captureKey: set.captureKey,
            displayName: set.displayName,
            identitySha256: set.identitySha256,
            sourceClockRevisionId,
            completeness: set.completeness,
            metadataJson: toPrismaJson({
              schema: "quipsly-portable-source-set-restore-v1",
              manifestSha256: input.bundle.manifestSha256,
              originalSourceSetId: set.id,
              originalCreatedAt: set.createdAt,
              membersUnavailableUntilRelink: true,
              externalSideEffects: false,
            }),
            clientRequestId: portableId(
              "portable-source-set-request",
              input.projectId,
              input.bundle,
              set.id,
              set,
            ),
            createdByUserId: input.actorUserId,
          },
        });
        if (set.members.length) {
          await tx.studioMediaSourceSetMember.createMany({
            data: set.members.map((member) => {
              const sourceRevisionId = sourceStory.revisionIds.get(
                member.sourceRevisionId,
              );
              if (!sourceRevisionId)
                throw new Error(
                  `Portable source-set member mapping is missing for ${member.id}.`,
                );
              return {
                id: portableId(
                  "portable-source-member",
                  input.projectId,
                  input.bundle,
                  `${set.id}:${member.id}`,
                  member,
                ),
                sourceSetId: id,
                sourceRevisionId,
                role: member.role,
                ordinal: member.ordinal,
                requiredForRender: member.requiredForRender,
                memberIdentitySha256: member.memberIdentitySha256,
                metadataJson: toPrismaJson({
                  schema: "quipsly-portable-source-member-restore-v1",
                  originalMemberId: member.id,
                  originalCreatedAt: member.createdAt,
                  mediaBytesPresent: false,
                }),
              };
            }),
          });
        }
      }

      for (const range of input.bundle.sourceStory.sourceRanges) {
        if (!sourceStory.rangeCreates.has(range.id)) continue;
        const id = sourceStory.rangeIds.get(range.id);
        const sourceRevisionId = sourceStory.revisionIds.get(
          range.sourceRevisionId,
        );
        const sourceSetId = range.sourceSetId
          ? sourceStory.setIds.get(range.sourceSetId)
          : null;
        if (!id || !sourceRevisionId || (range.sourceSetId && !sourceSetId)) {
          throw new Error(
            `Portable source-range mapping is missing for ${range.id}.`,
          );
        }
        await tx.studioSourceRange.create({
          data: {
            id,
            projectId: input.projectId,
            sourceRevisionId,
            sourceSetId,
            selectorSha256: range.selectorSha256,
            startSeconds: range.startSeconds,
            endSeconds: range.endSeconds,
            selectorJson: toPrismaJson({
              ...range.selectorJson,
              portableRestore: {
                schema: "quipsly-portable-source-range-restore-v1",
                manifestSha256: input.bundle.manifestSha256,
                originalRangeId: range.id,
                originalCreatedAt: range.createdAt,
                immutableSourceRange: true,
                mediaBytesPresent: false,
              },
            }),
            reframeRecipeJson: range.reframeRecipeJson
              ? toPrismaJson(range.reframeRecipeJson)
              : undefined,
            createdByUserId: input.actorUserId,
          },
        });
      }

      for (const card of input.bundle.sourceStory.cards) {
        if (!sourceStory.cardCreates.has(card.id)) continue;
        const id = sourceStory.cardIds.get(card.id);
        const sourceRangeId = card.sourceRangeId
          ? sourceStory.rangeIds.get(card.sourceRangeId)
          : null;
        if (!id || (card.sourceRangeId && !sourceRangeId))
          throw new Error(
            `Portable story-card mapping is missing for ${card.id}.`,
          );
        await tx.studioStoryCard.create({
          data: {
            id,
            projectId: input.projectId,
            sourceRangeId,
            stableId: restoredStoryCardStableId(
              input.projectId,
              input.bundle,
              card,
            ),
            title: card.title,
            synopsis: card.synopsis,
            notes: card.notes,
            purpose: card.purpose,
            status: card.status,
            visibility: "project",
            revision: 1,
            clientRequestId: portableId(
              "portable-story-card-request",
              input.projectId,
              input.bundle,
              card.id,
              card,
            ),
            createdByUserId: input.actorUserId,
            updatedByUserId: input.actorUserId,
            archivedAt: card.archivedAt ? new Date(card.archivedAt) : null,
          },
        });
        await tx.studioStoryCardRevision.create({
          data: {
            cardId: id,
            revision: 1,
            operation: "restored-from-portable-nest",
            actorUserId: input.actorUserId,
            clientRequestId: portableId(
              "portable-story-card-revision",
              input.projectId,
              input.bundle,
              card.id,
              card,
            ),
            snapshotJson: toPrismaJson({
              schema: "quipsly-portable-story-card-restore-v1",
              manifestSha256: input.bundle.manifestSha256,
              originalCardId: card.id,
              originalStableId: card.stableId,
              originalRevision: card.revision,
              originalVisibility: card.visibility,
              originalCreatedAt: card.createdAt,
              originalUpdatedAt: card.updatedAt,
              exportedRevisions: card.revisions,
              sourceAvailable: false,
              overwroteExisting: false,
            }),
          },
        });
        if (card.tagIds.length) {
          await tx.studioStoryCardTagLink.createMany({
            data: card.tagIds.map((originalTagId) => {
              const tagId = tagIds.get(originalTagId);
              if (!tagId)
                throw new Error(
                  `Portable story-card tag mapping is missing for ${originalTagId}.`,
                );
              return {
                cardId: id,
                tagId,
                createdByUserId: input.actorUserId,
                sourceJson: toPrismaJson({
                  schema: "quipsly-portable-story-card-tag-restore-v1",
                  manifestSha256: input.bundle.manifestSha256,
                  originalCardId: card.id,
                  originalTagId,
                }),
              };
            }),
          });
        }
      }

      for (const board of input.bundle.sourceStory.boards) {
        if (!sourceStory.boardCreates.has(board.id)) continue;
        const id = sourceStory.boardIds.get(board.id);
        const slug = sourceStory.boardSlugs.get(board.id);
        if (!id || !slug)
          throw new Error(
            `Portable story-board mapping is missing for ${board.id}.`,
          );
        await tx.studioStoryBoard.create({
          data: {
            id,
            projectId: input.projectId,
            clientRequestId: portableId(
              "portable-story-board-request",
              input.projectId,
              input.bundle,
              board.id,
              board,
            ),
            slug,
            title: board.title,
            description: board.description,
            kind: board.kind,
            layout: board.layout,
            revision: 1,
            createdByUserId: input.actorUserId,
            updatedByUserId: input.actorUserId,
            archivedAt: board.archivedAt ? new Date(board.archivedAt) : null,
          },
        });
        await tx.studioStoryBoardOperation.create({
          data: {
            boardId: id,
            revision: 1,
            previousRevision: 0,
            operation: "restored-from-portable-nest",
            actorUserId: input.actorUserId,
            clientRequestId: portableId(
              "portable-story-board-operation",
              input.projectId,
              input.bundle,
              board.id,
              board,
            ),
            snapshotJson: toPrismaJson({
              schema: "quipsly-portable-story-board-restore-v1",
              manifestSha256: input.bundle.manifestSha256,
              originalBoardId: board.id,
              originalSlug: board.slug,
              restoredSlug: slug,
              originalRevision: board.revision,
              originalCreatedAt: board.createdAt,
              originalUpdatedAt: board.updatedAt,
              exportedOperations: board.operations,
              overwroteExisting: false,
            }),
          },
        });
        for (const section of board.sections) {
          const sectionId = restoredStorySectionId(
            input.projectId,
            input.bundle,
            board.id,
            section,
          );
          const documentId = section.documentId
            ? (documentIds.get(section.documentId) ?? null)
            : null;
          if (section.documentId && !documentId)
            throw new Error(
              `Portable story-section writing mapping is missing for ${section.id}.`,
            );
          await tx.studioStoryBoardSection.create({
            data: {
              id: sectionId,
              boardId: id,
              key: section.key,
              title: section.title,
              synopsis: section.synopsis,
              sortOrder: section.sortOrder,
              documentId,
              revision: 1,
              createdByUserId: input.actorUserId,
              updatedByUserId: input.actorUserId,
              archivedAt: section.archivedAt
                ? new Date(section.archivedAt)
                : null,
            },
          });
          await tx.studioStoryBoardSectionOperation.create({
            data: {
              sectionId,
              revision: 1,
              previousRevision: 0,
              operation: "create-section",
              actorUserId: input.actorUserId,
              clientRequestId: portableId(
                "portable-story-section-operation",
                input.projectId,
                input.bundle,
                `${board.id}:${section.id}`,
                section,
              ),
              requestSha256: digest({
                schema: "quipsly-portable-story-section-restore-v1",
                manifestSha256: input.bundle.manifestSha256,
                originalBoardId: board.id,
                originalSectionId: section.id,
                section,
              }),
              snapshotJson: toPrismaJson({
                schema: "quipsly-portable-story-section-restore-v1",
                manifestSha256: input.bundle.manifestSha256,
                originalBoardId: board.id,
                originalSectionId: section.id,
                originalRevision: section.revision,
                originalDocumentId: section.documentId,
                restoredDocumentId: documentId,
                exportedOperations: section.operations,
                overwroteExisting: false,
              }),
            },
          });
        }
        if (board.placements.length) {
          await tx.studioStoryBoardPlacement.createMany({
            data: board.placements.map((placement) => {
              const cardId = sourceStory.cardIds.get(placement.cardId);
              if (!cardId)
                throw new Error(
                  `Portable story-placement card mapping is missing for ${placement.id}.`,
                );
              return {
                id: restoredStoryPlacementId(
                  input.projectId,
                  input.bundle,
                  board.id,
                  placement,
                ),
                boardId: id,
                cardId,
                groupKey: placement.groupKey,
                laneKey: placement.laneKey,
                sortOrder: placement.sortOrder,
                createdByUserId: input.actorUserId,
              };
            }),
          });
        }
      }

      const taskIds = new Map<string, string>();
      for (const task of input.bundle.tasks) {
        const id = restoredTaskId(input.projectId, input.bundle, task);
        const existing = await tx.actionItem.findUnique({
          where: { id },
          select: { id: true, projectId: true, assignedUserId: true },
        });
        if (
          existing &&
          (existing.projectId !== input.projectId ||
            existing.assignedUserId !== input.actorUserId)
        ) {
          throw new Error(
            "A portable task identity belongs to another actor or destination Nest.",
          );
        }
        if (!existing) {
          await tx.actionItem.create({
            data: {
              id,
              projectId: input.projectId,
              assignedUserId: input.actorUserId,
              title: task.title,
              detail: task.detail,
              status: task.status as never,
              dueAt: task.dueAt ? new Date(task.dueAt) : null,
              completedAt: task.completedAt ? new Date(task.completedAt) : null,
              sourceJson: toPrismaJson(
                restoredTaskSourceJson({
                  task,
                  bundle: input.bundle,
                  projectId: input.projectId,
                  projectSlug: destinationProject.slug,
                  sourceStory,
                }),
              ),
            },
          });
          if (task.tagIds.length) {
            await tx.actionItemTagLink.createMany({
              data: task.tagIds.map((originalTagId) => {
                const tagId = tagIds.get(originalTagId);
                if (!tagId)
                  throw new Error(
                    `Portable task tag mapping is missing for ${originalTagId}.`,
                  );
                return {
                  actionItemId: id,
                  tagId,
                  createdByUserId: input.actorUserId,
                  sourceJson: toPrismaJson({
                    schema: "quipsly-portable-task-tag-restore-v1",
                    manifestSha256: input.bundle.manifestSha256,
                    originalTaskId: task.id,
                    originalTagId,
                  }),
                };
              }),
              skipDuplicates: true,
            });
          }
        }
        taskIds.set(task.id, id);
      }

      for (const task of input.bundle.tasks) {
        const actionItemId = taskIds.get(task.id);
        if (!actionItemId)
          throw new Error(`Portable task mapping is missing for ${task.id}.`);
        if (task.evidenceReceipts.length) {
          await tx.actionItemEvidenceReceipt.createMany({
            data: task.evidenceReceipts.map((receipt) => ({
              id: restoredTaskEvidenceId(
                input.projectId,
                input.bundle,
                task.id,
                receipt,
              ),
              actionItemId,
              actorUserId: input.actorUserId,
              kind: receipt.kind,
              note: receipt.note,
              evidenceJson: toPrismaJson({
                ...receipt.evidenceJson,
                portableRestore: {
                  schema: "quipsly-portable-task-evidence-restore-v1",
                  manifestSha256: input.bundle.manifestSha256,
                  originalReceiptId: receipt.id,
                  originalCreatedAt: receipt.createdAt,
                },
              }),
              occurredAt: new Date(receipt.occurredAt),
            })),
            skipDuplicates: true,
          });
        }
      }

      const goalIds = new Map<string, string>();
      for (const goal of input.bundle.goals) {
        const id = restoredGoalId(input.projectId, input.bundle, goal);
        const existing = await tx.goal.findUnique({
          where: { id },
          select: { id: true, projectId: true, ownerUserId: true },
        });
        if (
          existing &&
          (existing.projectId !== input.projectId ||
            existing.ownerUserId !== input.actorUserId)
        ) {
          throw new Error(
            "A portable goal identity belongs to another actor or destination Nest.",
          );
        }
        if (!existing) {
          await tx.goal.create({
            data: {
              id,
              projectId: input.projectId,
              ownerUserId: input.actorUserId,
              title: goal.title,
              description: goal.description,
              status: goal.status as never,
              targetAt: goal.targetAt ? new Date(goal.targetAt) : null,
              achievedAt: goal.achievedAt ? new Date(goal.achievedAt) : null,
              sourceJson: toPrismaJson({
                schema: "quipsly-portable-goal-restore-v1",
                manifestSha256: input.bundle.manifestSha256,
                originalNestId: input.bundle.sourceNest.id,
                originalGoalId: goal.id,
                originalParentGoalId: goal.parentGoalId,
                originalCreatedAt: goal.createdAt,
                originalUpdatedAt: goal.updatedAt,
                originalSourceJson: goal.sourceJson,
                overwroteExisting: false,
                externalSideEffects: false,
              }),
            },
          });
          if (goal.tagIds.length) {
            await tx.goalTagLink.createMany({
              data: goal.tagIds.map((originalTagId) => {
                const tagId = tagIds.get(originalTagId);
                if (!tagId)
                  throw new Error(
                    `Portable goal tag mapping is missing for ${originalTagId}.`,
                  );
                return {
                  goalId: id,
                  tagId,
                  createdByUserId: input.actorUserId,
                  sourceJson: toPrismaJson({
                    schema: "quipsly-portable-goal-tag-restore-v1",
                    manifestSha256: input.bundle.manifestSha256,
                    originalGoalId: goal.id,
                    originalTagId,
                  }),
                };
              }),
              skipDuplicates: true,
            });
          }
        }
        goalIds.set(goal.id, id);
      }

      for (const goal of input.bundle.goals) {
        const goalId = goalIds.get(goal.id);
        if (!goalId)
          throw new Error(`Portable goal mapping is missing for ${goal.id}.`);
        if (goal.parentGoalId) {
          const parentGoalId = goalIds.get(goal.parentGoalId);
          if (!parentGoalId)
            throw new Error(
              `Portable parent goal mapping is missing for ${goal.parentGoalId}.`,
            );
          await tx.goal.updateMany({
            where: {
              id: goalId,
              projectId: input.projectId,
              ownerUserId: input.actorUserId,
              parentGoalId: null,
            },
            data: { parentGoalId },
          });
        }
        if (goal.progressReceipts.length) {
          await tx.goalProgressReceipt.createMany({
            data: goal.progressReceipts.map((receipt) => ({
              id: restoredProgressId(
                input.projectId,
                input.bundle,
                goal.id,
                receipt,
              ),
              goalId,
              actorUserId: input.actorUserId,
              kind: `restored:${receipt.kind}`.slice(0, 200),
              progressPercent: receipt.progressPercent,
              note: receipt.note,
              evidenceJson: toPrismaJson({
                ...receipt.evidenceJson,
                portableRestore: {
                  schema: "quipsly-portable-goal-progress-restore-v1",
                  manifestSha256: input.bundle.manifestSha256,
                  originalReceiptId: receipt.id,
                  originalCreatedAt: receipt.createdAt,
                },
              }),
              occurredAt: new Date(receipt.occurredAt),
            })),
            skipDuplicates: true,
          });
        }
      }

      if (input.bundle.goalTaskLinks.length) {
        await tx.goalTaskLink.createMany({
          data: input.bundle.goalTaskLinks.map((link) => {
            const goalId = goalIds.get(link.goalId);
            const actionItemId = taskIds.get(link.taskId);
            if (!goalId || !actionItemId)
              throw new Error("Portable goal-task mapping is incomplete.");
            return {
              goalId,
              actionItemId,
              relationship: link.relationship as never,
              createdByUserId: input.actorUserId,
              sourceJson: toPrismaJson({
                ...link.sourceJson,
                portableRestore: {
                  schema: "quipsly-portable-goal-task-link-restore-v1",
                  manifestSha256: input.bundle.manifestSha256,
                  originalGoalId: link.goalId,
                  originalTaskId: link.taskId,
                  originalCreatedAt: link.createdAt,
                },
              }),
            };
          }),
          skipDuplicates: true,
        });
      }

      const planBlockIds = new Map<string, string>();
      for (const block of input.bundle.planBlocks) {
        const id = restoredPlanBlockId(input.projectId, input.bundle, block);
        const existing = await tx.workPlanBlock.findUnique({
          where: { id },
          select: { id: true, ownerUserId: true },
        });
        if (existing && existing.ownerUserId !== input.actorUserId) {
          throw new Error(
            "A portable focus-block identity belongs to another actor.",
          );
        }
        if (!existing) {
          const actionItemId = block.taskId
            ? (taskIds.get(block.taskId) ?? null)
            : null;
          const goalId = block.goalId
            ? (goalIds.get(block.goalId) ?? null)
            : null;
          if (Boolean(actionItemId) === Boolean(goalId))
            throw new Error(
              "Portable focus-block target mapping is incomplete.",
            );
          await tx.workPlanBlock.create({
            data: {
              id,
              ownerUserId: input.actorUserId,
              actionItemId,
              goalId,
              startsAt: new Date(block.startsAt),
              endsAt: new Date(block.endsAt),
              timezone: block.timezone,
              status: "CANCELED",
              completedAt: null,
              actualMinutes: null,
              sourceJson: toPrismaJson({
                schema: "quipsly-portable-plan-block-restore-v1",
                manifestSha256: input.bundle.manifestSha256,
                originalPlanBlockId: block.id,
                originalStatus: block.status,
                originalCompletedAt: block.completedAt,
                originalActualMinutes: block.actualMinutes,
                originalCreatedAt: block.createdAt,
                originalUpdatedAt: block.updatedAt,
                originalSourceJson: block.sourceJson,
                restoredCanceledForSafety: true,
                externalCalendarMutated: false,
                notificationScheduled: false,
                overwroteExisting: false,
              }),
            },
          });
        }
        planBlockIds.set(block.id, id);
      }

      return {
        plan,
        planSha256,
        restoredTagIds: Object.fromEntries(tagIds),
        restoredNoteDocumentIds: Object.fromEntries(documentIds),
        restoredNoteBlockIds: Object.fromEntries(blockIds),
        restoredTaskIds: Object.fromEntries(taskIds),
        restoredGoalIds: Object.fromEntries(goalIds),
        restoredPlanBlockIds: Object.fromEntries(planBlockIds),
        restoredSourceRevisionIds: Object.fromEntries(sourceStory.revisionIds),
        restoredSourceSetIds: Object.fromEntries(sourceStory.setIds),
        restoredSourceRangeIds: Object.fromEntries(sourceStory.rangeIds),
        restoredStoryCardIds: Object.fromEntries(sourceStory.cardIds),
        restoredStoryBoardIds: Object.fromEntries(sourceStory.boardIds),
        boundaries: {
          sourceMutated: false,
          overwroteExisting: false,
          restoredPrivate: true,
          collaboratorAssignmentsRestored: false,
          remindersRestoredActive: false,
          recurrenceRestoredActive: false,
          planBlocksRestoredCanceled: true,
          sourceStoryRestored: true,
          restoredSourceReferencesAvailable: false,
          providerCredentialsRestored: false,
          providerLocatorsRestored: false,
          mediaBytesRestored: false,
          externalResourcesFetched: false,
          externalSideEffects: false,
        },
        receipt: {
          schema: "quipsly-nest-restore-receipt-v1",
          manifestSha256: input.bundle.manifestSha256,
          destinationProjectId: input.projectId,
          sourceNestId: input.bundle.sourceNest.id,
          sourceNestSlug: input.bundle.sourceNest.slug,
          appliedAt: new Date().toISOString(),
          integrityRecomputed: input.bundle.manifestVerified,
          newlyCreatedTagCount: newlyCreatedTagIds.size,
          restoredSourceReferenceCount: sourceStory.revisionIds.size,
          restoredStoryCardCount: sourceStory.cardIds.size,
          restoredStoryBoardCount: sourceStory.boardIds.size,
        },
      };
    },
    { isolationLevel: "Serializable", maxWait: 10_000, timeout: 120_000 },
  );
}
