import "server-only";

import { Prisma, type PrismaClient } from "@prisma/client";

import {
  nestManifestSha256,
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
  goalCreates: number;
  goalReuses: number;
  progressReceiptCreates: number;
  goalTaskLinkCreates: number;
  planBlockCreates: number;
  planBlockReuses: number;
  remindersDeferred: number;
  recurrenceSeriesDeferred: number;
  planBlocksCanceledForSafety: number;
  overwrites: 0;
  sourceMutations: 0;
  externalSideEffects: 0;
};

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

function toPrismaJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
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

function restoredTagId(projectId: string, bundle: ValidatedNestBundle, tag: PortableNestTag) {
  return portableId("portable-tag", projectId, bundle, tag.id, tag);
}

function restoredNoteStableId(projectId: string, bundle: ValidatedNestBundle, note: ValidatedNestBundle["notes"][number]) {
  return portableId("portable-note", projectId, bundle, note.id, note);
}

function restoredBlockStableId(
  projectId: string,
  bundle: ValidatedNestBundle,
  noteId: string,
  block: ValidatedNestBundle["notes"][number]["blocks"][number],
) {
  return portableId("portable-block", projectId, bundle, `${noteId}:${block.id}`, block);
}

function restoredSourceLabel(sourceLabel: string | null) {
  return [sourceLabel, "origin:portable-nest-restore"]
    .filter(Boolean)
    .join(";")
    .slice(0, 2_000);
}

function restoredTaskId(projectId: string, bundle: ValidatedNestBundle, task: ValidatedNestBundle["tasks"][number]) {
  return portableId("portable-task", projectId, bundle, task.id, task);
}

function restoredGoalId(projectId: string, bundle: ValidatedNestBundle, goal: ValidatedNestBundle["goals"][number]) {
  return portableId("portable-goal", projectId, bundle, goal.id, goal);
}

function restoredProgressId(
  projectId: string,
  bundle: ValidatedNestBundle,
  goalId: string,
  receipt: ValidatedNestBundle["goals"][number]["progressReceipts"][number],
) {
  return portableId("portable-progress", projectId, bundle, `${goalId}:${receipt.id}`, receipt);
}

function restoredPlanBlockId(
  projectId: string,
  bundle: ValidatedNestBundle,
  block: ValidatedNestBundle["planBlocks"][number],
) {
  return portableId("portable-plan", projectId, bundle, block.id, block);
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
  return row.label === tag.label
    && row.description === tag.description
    && row.category === tag.category
    && row.nodeType === tag.nodeType
    && row.isPrivate === tag.isPrivate
    && row.isActive === tag.isActive;
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
    const suffix = documentSha256(`${bundle.sourceNest.id}:${tag.id}:${digest(tag)}`).slice(0, 12);
    const targetSlug = `${tag.slug.slice(0, 170)}-restored-${suffix}`;
    const versioned = bySlug.get(targetSlug);
    if (versioned && !equivalentTag(versioned, tag)) {
      throw new Error(`A versioned portable tag slug already exists with different content (${targetSlug}).`);
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
    client.studioTag.findMany({ where: { projectId }, select: { slug: true, id: true } }),
    client.studioTagAlias.findMany({ where: { projectId }, select: { slug: true, tagId: true } }),
  ]);
  const canonical = new Map<string, string>(canonicalRows.map((row) => [row.slug, row.id]));
  const aliases = new Map(aliasRows.map((row) => [row.slug, row.tagId]));
  const targetKeys = new Map(resolutions.map((resolution) => [
    resolution.originalId,
    resolution.existingId ?? `planned:${resolution.originalId}`,
  ]));
  for (const resolution of resolutions) {
    canonical.set(resolution.targetSlug, targetKeys.get(resolution.originalId)!);
  }
  let creates = 0;
  let reuses = 0;
  let deferred = 0;
  for (const resolution of resolutions) {
    const targetTagKey = targetKeys.get(resolution.originalId)!;
    for (const alias of resolution.source.aliases) {
      const canonicalOwner = canonical.get(alias.slug);
      const aliasOwner = aliases.get(alias.slug);
      if (canonicalOwner === targetTagKey || aliasOwner === targetTagKey) reuses += 1;
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
  const tagResolutions = await resolveTags(client, input.projectId, input.bundle);
  const aliases = await aliasPlan(client, input.projectId, tagResolutions);
  const noteStableIds = input.bundle.notes.map((note) => restoredNoteStableId(input.projectId, input.bundle, note));
  const taskIds = input.bundle.tasks.map((task) => restoredTaskId(input.projectId, input.bundle, task));
  const goalIds = input.bundle.goals.map((goal) => restoredGoalId(input.projectId, input.bundle, goal));
  const planBlockIds = input.bundle.planBlocks.map((block) => restoredPlanBlockId(input.projectId, input.bundle, block));
  const [existingNotes, existingTasks, existingGoals, existingProgress, existingGoalTaskLinks, existingPlanBlocks] = await Promise.all([
    noteStableIds.length
      ? client.studioDocument.findMany({
          where: { projectId: input.projectId, stableId: { in: noteStableIds } },
          select: { stableId: true },
        })
      : Promise.resolve([]),
    taskIds.length
      ? client.actionItem.findMany({
          where: { projectId: input.projectId, assignedUserId: input.actorUserId, id: { in: taskIds } },
          select: { id: true },
        })
      : Promise.resolve([]),
    goalIds.length
      ? client.goal.findMany({
          where: { projectId: input.projectId, ownerUserId: input.actorUserId, id: { in: goalIds } },
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
  const existingGoalIds = new Set(existingGoals.map((goal) => goal.id));
  const existingProgressIds = new Set(existingProgress.map((receipt) => receipt.id));
  const existingLinkIds = new Set(existingGoalTaskLinks.map((link) => `${link.goalId}:${link.actionItemId}`));
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
    mergeLinksPreservedAsHistory: input.bundle.tags.filter((tag) => tag.mergedIntoTagId).length,
    noteCreates: input.bundle.notes.filter((note) => !existingNoteIds.has(restoredNoteStableId(input.projectId, input.bundle, note))).length,
    noteReuses: input.bundle.notes.filter((note) => existingNoteIds.has(restoredNoteStableId(input.projectId, input.bundle, note))).length,
    blockCreates: input.bundle.notes
      .filter((note) => !existingNoteIds.has(restoredNoteStableId(input.projectId, input.bundle, note)))
      .reduce((count, note) => count + note.blocks.length, 0),
    spanCreates: input.bundle.notes
      .filter((note) => !existingNoteIds.has(restoredNoteStableId(input.projectId, input.bundle, note)))
      .reduce((count, note) => count + note.blocks.reduce((blockCount, block) => blockCount + block.spans.length, 0), 0),
    documentTagLinkCreates: input.bundle.notes
      .filter((note) => !existingNoteIds.has(restoredNoteStableId(input.projectId, input.bundle, note)))
      .reduce((count, note) => count + note.tagIds.length, 0),
    taskCreates: taskIds.filter((id) => !existingTaskIds.has(id)).length,
    taskReuses: taskIds.filter((id) => existingTaskIds.has(id)).length,
    goalCreates: goalIds.filter((id) => !existingGoalIds.has(id)).length,
    goalReuses: goalIds.filter((id) => existingGoalIds.has(id)).length,
    progressReceiptCreates: input.bundle.goals.reduce(
      (count, goal) => count + goal.progressReceipts.filter((receipt) => (
        !existingProgressIds.has(restoredProgressId(input.projectId, input.bundle, goal.id, receipt))
      )).length,
      0,
    ),
    goalTaskLinkCreates: input.bundle.goalTaskLinks.filter((link) => {
      const goal = input.bundle.goals.find((candidate) => candidate.id === link.goalId);
      const task = input.bundle.tasks.find((candidate) => candidate.id === link.taskId);
      if (!goal || !task) return false;
      return !existingLinkIds.has(`${restoredGoalId(input.projectId, input.bundle, goal)}:${restoredTaskId(input.projectId, input.bundle, task)}`);
    }).length,
    planBlockCreates: planBlockIds.filter((id) => !existingPlanIds.has(id)).length,
    planBlockReuses: planBlockIds.filter((id) => existingPlanIds.has(id)).length,
    remindersDeferred: input.bundle.tasks.filter((task) => task.reminderSnapshot).length,
    recurrenceSeriesDeferred: input.bundle.tasks.filter((task) => task.recurrenceSnapshot).length,
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
  },
) {
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw(Prisma.sql`
      SELECT 1 AS "locked"
      FROM pg_advisory_xact_lock(
        hashtextextended(${`${input.projectId}:${input.actorUserId}:${input.bundle.manifestSha256}`}, 0)
      )
    `);
    const plan = await buildNestRestorePlan(tx, input);
    const tagResolutions = await resolveTags(tx, input.projectId, input.bundle);
    const tagIds = new Map<string, string>();
    const newlyCreatedTagIds = new Set<string>();
    for (const resolution of tagResolutions) {
      let id = resolution.existingId;
      if (!id) {
        const created = await tx.studioTag.create({
          data: {
            id: restoredTagId(input.projectId, input.bundle, resolution.source),
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
    const canonicalBySlug = new Map(canonicalRows.map((row) => [row.slug, row.id]));
    const aliasBySlug = new Map(aliasRows.map((row) => [row.slug, row.tagId]));
    for (const resolution of tagResolutions) {
      const tagId = tagIds.get(resolution.originalId);
      if (!tagId) throw new Error(`Portable tag mapping is missing for ${resolution.originalId}.`);
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
      const stableId = restoredNoteStableId(input.projectId, input.bundle, note);
      let document = await tx.studioDocument.findUnique({
        where: { stableId },
        select: { id: true, projectId: true, personalOwnerUserId: true },
      });
      if (document && document.projectId !== input.projectId) {
        throw new Error("A portable note identity belongs to another destination Nest.");
      }
      if (
        document &&
        document.personalOwnerUserId !==
          (note.personal ? input.actorUserId : null)
      ) {
        throw new Error("A portable note identity has a different personal ownership boundary.");
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
              if (!tagId) throw new Error(`Portable document tag mapping is missing for ${originalTagId}.`);
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
          const blockStableId = restoredBlockStableId(input.projectId, input.bundle, note.id, block);
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
              archivedAt: block.archivedAt ? new Date(block.archivedAt) : null,
              archivedByLabel: block.archivedAt ? "Restored portable snapshot" : null,
            },
            select: { id: true },
          });
          blockIds.set(`${note.id}:${block.id}`, createdBlock.id);
          if (block.spans.length) {
            await tx.studioTaggedSpan.createMany({
              data: block.spans.map((span) => {
                const tagId = tagIds.get(span.tagId);
                if (!tagId) throw new Error(`Portable span tag mapping is missing for ${span.tagId}.`);
                return {
                  id: portableId("portable-span", input.projectId, input.bundle, `${note.id}:${block.id}:${span.id}`, span),
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
        const byStableId = new Map(existingBlocks.map((block) => [block.stableId, block.id]));
        for (const block of note.blocks) {
          const stableBlockId = restoredBlockStableId(input.projectId, input.bundle, note.id, block);
          const id = byStableId.get(stableBlockId);
          if (!id) throw new Error("A restored note exists without its verified block snapshot.");
          blockIds.set(`${note.id}:${block.id}`, id);
        }
      }
      documentIds.set(note.id, document.id);
    }

    const taskIds = new Map<string, string>();
    for (const task of input.bundle.tasks) {
      const id = restoredTaskId(input.projectId, input.bundle, task);
      const existing = await tx.actionItem.findUnique({ where: { id }, select: { id: true, projectId: true, assignedUserId: true } });
      if (existing && (existing.projectId !== input.projectId || existing.assignedUserId !== input.actorUserId)) {
        throw new Error("A portable task identity belongs to another actor or destination Nest.");
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
            sourceJson: toPrismaJson({
              schema: "quipsly-portable-task-restore-v1",
              manifestSha256: input.bundle.manifestSha256,
              originalNestId: input.bundle.sourceNest.id,
              originalTaskId: task.id,
              originalCreatedAt: task.createdAt,
              originalUpdatedAt: task.updatedAt,
              originalSourceJson: task.sourceJson,
              reminderSnapshot: task.reminderSnapshot,
              recurrenceSnapshot: task.recurrenceSnapshot,
              reminderRestoredActive: false,
              recurrenceRestoredActive: false,
              overwroteExisting: false,
              externalSideEffects: false,
            }),
          },
        });
        if (task.tagIds.length) {
          await tx.actionItemTagLink.createMany({
            data: task.tagIds.map((originalTagId) => {
              const tagId = tagIds.get(originalTagId);
              if (!tagId) throw new Error(`Portable task tag mapping is missing for ${originalTagId}.`);
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

    const goalIds = new Map<string, string>();
    for (const goal of input.bundle.goals) {
      const id = restoredGoalId(input.projectId, input.bundle, goal);
      const existing = await tx.goal.findUnique({ where: { id }, select: { id: true, projectId: true, ownerUserId: true } });
      if (existing && (existing.projectId !== input.projectId || existing.ownerUserId !== input.actorUserId)) {
        throw new Error("A portable goal identity belongs to another actor or destination Nest.");
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
              if (!tagId) throw new Error(`Portable goal tag mapping is missing for ${originalTagId}.`);
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
      if (!goalId) throw new Error(`Portable goal mapping is missing for ${goal.id}.`);
      if (goal.parentGoalId) {
        const parentGoalId = goalIds.get(goal.parentGoalId);
        if (!parentGoalId) throw new Error(`Portable parent goal mapping is missing for ${goal.parentGoalId}.`);
        await tx.goal.updateMany({
          where: { id: goalId, projectId: input.projectId, ownerUserId: input.actorUserId, parentGoalId: null },
          data: { parentGoalId },
        });
      }
      if (goal.progressReceipts.length) {
        await tx.goalProgressReceipt.createMany({
          data: goal.progressReceipts.map((receipt) => ({
            id: restoredProgressId(input.projectId, input.bundle, goal.id, receipt),
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
          if (!goalId || !actionItemId) throw new Error("Portable goal-task mapping is incomplete.");
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
      const existing = await tx.workPlanBlock.findUnique({ where: { id }, select: { id: true, ownerUserId: true } });
      if (existing && existing.ownerUserId !== input.actorUserId) {
        throw new Error("A portable focus-block identity belongs to another actor.");
      }
      if (!existing) {
        const actionItemId = block.taskId ? taskIds.get(block.taskId) ?? null : null;
        const goalId = block.goalId ? goalIds.get(block.goalId) ?? null : null;
        if (Boolean(actionItemId) === Boolean(goalId)) throw new Error("Portable focus-block target mapping is incomplete.");
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
      restoredTagIds: Object.fromEntries(tagIds),
      restoredNoteDocumentIds: Object.fromEntries(documentIds),
      restoredNoteBlockIds: Object.fromEntries(blockIds),
      restoredTaskIds: Object.fromEntries(taskIds),
      restoredGoalIds: Object.fromEntries(goalIds),
      restoredPlanBlockIds: Object.fromEntries(planBlockIds),
      boundaries: {
        sourceMutated: false,
        overwroteExisting: false,
        restoredPrivate: true,
        collaboratorAssignmentsRestored: false,
        remindersRestoredActive: false,
        recurrenceRestoredActive: false,
        planBlocksRestoredCanceled: true,
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
        integrityRecomputed: (() => {
          const { manifestSha256: _manifestSha256, ...payload } = input.bundle;
          return nestManifestSha256(payload) === input.bundle.manifestSha256;
        })(),
        newlyCreatedTagCount: newlyCreatedTagIds.size,
      },
    };
  }, { isolationLevel: "Serializable", maxWait: 10_000, timeout: 120_000 });
}
