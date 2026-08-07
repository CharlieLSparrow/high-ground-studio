import "server-only";

import type { PrismaClient } from "@prisma/client";

import { isUnreviewedTranscriptActionItemSource } from "@high-ground/quipsly-domain/coaching-packet";
import {
  createPortableNestBundle,
  NEST_EXPORT_SCHEMA_VERSION,
  type PortableNestBundle,
  type PortableNestBundlePayload,
} from "@/lib/nest-portability";
import { personalWritingDocumentVisibilityWhere } from "@/lib/server/personal-writing-documents";

function date(value: Date | null) {
  return value?.toISOString() ?? null;
}

export async function buildPortableNestExport(
  prisma: PrismaClient,
  input: {
    projectId: string;
    actorUserId: string;
    exportedAt?: Date;
  },
): Promise<PortableNestBundle> {
  const project = await prisma.studioProject.findUnique({
    where: { id: input.projectId },
    select: {
      id: true,
      slug: true,
      name: true,
      description: true,
      sourceLabel: true,
      updatedAt: true,
    },
  });
  if (!project) throw new Error("The source Nest no longer exists.");

  const [tags, notes, rawTasks, goals, sourceRanges, storyCards, storyBoards] =
    await Promise.all([
      prisma.studioTag.findMany({
        where: { projectId: project.id },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        select: {
          id: true,
          slug: true,
          label: true,
          description: true,
          category: true,
          nodeType: true,
          isPrivate: true,
          isActive: true,
          archivedAt: true,
          mergedIntoTagId: true,
          createdAt: true,
          updatedAt: true,
          aliases: {
            orderBy: [{ createdAt: "asc" }, { id: "asc" }],
            select: {
              id: true,
              slug: true,
              label: true,
              provenanceJson: true,
              createdAt: true,
            },
          },
          revisions: {
            orderBy: [{ revision: "asc" }, { id: "asc" }],
            take: 10_000,
            select: {
              revision: true,
              operation: true,
              snapshotJson: true,
              createdAt: true,
            },
          },
        },
      }),
      prisma.studioDocument.findMany({
        where: {
          projectId: project.id,
          AND: [
            {
              OR: [
                {
                  sourceLabel: {
                    contains: "document-kind:note",
                    mode: "insensitive",
                  },
                },
                { personalOwnerUserId: input.actorUserId },
                {
                  storyBoardSections: {
                    some: { board: { projectId: project.id } },
                  },
                },
              ],
            },
            personalWritingDocumentVisibilityWhere(input.actorUserId),
          ],
        },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        select: {
          id: true,
          stableId: true,
          title: true,
          sourceLabel: true,
          sourcePath: true,
          projectionStatus: true,
          isPrivate: true,
          personalOwnerUserId: true,
          createdAt: true,
          updatedAt: true,
          tagLinks: {
            where: { tag: { projectId: project.id } },
            orderBy: [{ createdAt: "asc" }, { tagId: "asc" }],
            select: { tagId: true },
          },
          blocks: {
            orderBy: [{ order: "asc" }, { id: "asc" }],
            select: {
              id: true,
              stableId: true,
              order: true,
              title: true,
              body: true,
              sourceLabel: true,
              sourcePath: true,
              externalId: true,
              projectionStatus: true,
              isPrivate: true,
              archivedAt: true,
              createdAt: true,
              updatedAt: true,
              taggedSpans: {
                orderBy: [{ startOffset: "asc" }, { id: "asc" }],
                select: {
                  id: true,
                  tagId: true,
                  startOffset: true,
                  endOffset: true,
                  selectedText: true,
                  noteBody: true,
                  createdAt: true,
                },
              },
            },
          },
        },
      }),
      prisma.actionItem.findMany({
        where: {
          projectId: project.id,
          assignedUserId: input.actorUserId,
        },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        select: {
          id: true,
          title: true,
          detail: true,
          status: true,
          dueAt: true,
          completedAt: true,
          sourceJson: true,
          createdAt: true,
          updatedAt: true,
          tagLinks: {
            where: { tag: { projectId: project.id } },
            orderBy: { createdAt: "asc" },
            select: { tagId: true },
          },
          reminder: {
            select: {
              id: true,
              remindAt: true,
              status: true,
              sourceJson: true,
              updatedAt: true,
            },
          },
          recurrenceOccurrence: {
            select: {
              occurrenceKey: true,
              scheduledLocalDate: true,
              scheduledFor: true,
              status: true,
              series: {
                select: {
                  id: true,
                  title: true,
                  detail: true,
                  cadence: true,
                  frequency: true,
                  interval: true,
                  timezone: true,
                  localTimeMinutes: true,
                  anchorLocalDate: true,
                  anchorDayOfMonth: true,
                  status: true,
                  endedAt: true,
                  sourceJson: true,
                  createdAt: true,
                  updatedAt: true,
                },
              },
            },
          },
          evidenceReceipts: {
            where: { actorUserId: input.actorUserId },
            orderBy: [{ occurredAt: "asc" }, { id: "asc" }],
            take: 10_000,
            select: {
              id: true,
              kind: true,
              note: true,
              evidenceJson: true,
              occurredAt: true,
              createdAt: true,
            },
          },
        },
      }),
      prisma.goal.findMany({
        where: {
          projectId: project.id,
          ownerUserId: input.actorUserId,
        },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        select: {
          id: true,
          parentGoalId: true,
          title: true,
          description: true,
          status: true,
          targetAt: true,
          achievedAt: true,
          sourceJson: true,
          createdAt: true,
          updatedAt: true,
          tagLinks: {
            where: { tag: { projectId: project.id } },
            orderBy: { createdAt: "asc" },
            select: { tagId: true },
          },
          progressReceipts: {
            orderBy: [{ occurredAt: "asc" }, { id: "asc" }],
            take: 10_000,
            select: {
              id: true,
              kind: true,
              progressPercent: true,
              note: true,
              evidenceJson: true,
              occurredAt: true,
              createdAt: true,
            },
          },
        },
      }),
      prisma.studioSourceRange.findMany({
        where: {
          projectId: project.id,
          storyCards: { some: { projectId: project.id } },
        },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        select: {
          id: true,
          sourceRevisionId: true,
          sourceSetId: true,
          selectorSha256: true,
          startSeconds: true,
          endSeconds: true,
          selectorJson: true,
          reframeRecipeJson: true,
          createdAt: true,
          sourceRevision: {
            select: {
              id: true,
              revisionKey: true,
              identitySha256: true,
              contentSha256: true,
              sizeBytes: true,
              durationSeconds: true,
              widthPixels: true,
              heightPixels: true,
              framesPerSecond: true,
              mediaProjection: true,
              sourceState: true,
              providerModifiedAt: true,
              verifiedAt: true,
              createdAt: true,
            },
          },
          sourceSet: {
            select: {
              id: true,
              kind: true,
              captureKey: true,
              displayName: true,
              identitySha256: true,
              sourceClockRevisionId: true,
              completeness: true,
              createdAt: true,
              sourceClockRevision: {
                select: {
                  id: true,
                  revisionKey: true,
                  identitySha256: true,
                  contentSha256: true,
                  sizeBytes: true,
                  durationSeconds: true,
                  widthPixels: true,
                  heightPixels: true,
                  framesPerSecond: true,
                  mediaProjection: true,
                  sourceState: true,
                  providerModifiedAt: true,
                  verifiedAt: true,
                  createdAt: true,
                },
              },
              members: {
                orderBy: [{ ordinal: "asc" }, { role: "asc" }, { id: "asc" }],
                select: {
                  id: true,
                  sourceRevisionId: true,
                  role: true,
                  ordinal: true,
                  requiredForRender: true,
                  memberIdentitySha256: true,
                  createdAt: true,
                  sourceRevision: {
                    select: {
                      id: true,
                      revisionKey: true,
                      identitySha256: true,
                      contentSha256: true,
                      sizeBytes: true,
                      durationSeconds: true,
                      widthPixels: true,
                      heightPixels: true,
                      framesPerSecond: true,
                      mediaProjection: true,
                      sourceState: true,
                      providerModifiedAt: true,
                      verifiedAt: true,
                      createdAt: true,
                    },
                  },
                },
              },
            },
          },
        },
      }),
      prisma.studioStoryCard.findMany({
        where: { projectId: project.id },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        select: {
          id: true,
          stableId: true,
          sourceRangeId: true,
          title: true,
          synopsis: true,
          notes: true,
          purpose: true,
          status: true,
          visibility: true,
          revision: true,
          archivedAt: true,
          createdAt: true,
          updatedAt: true,
          tags: {
            where: { tag: { projectId: project.id } },
            orderBy: [{ createdAt: "asc" }, { tagId: "asc" }],
            select: { tagId: true },
          },
          revisions: {
            orderBy: [{ revision: "asc" }, { id: "asc" }],
            take: 100_000,
            select: {
              id: true,
              revision: true,
              operation: true,
              snapshotJson: true,
              createdAt: true,
            },
          },
        },
      }),
      prisma.studioStoryBoard.findMany({
        where: { projectId: project.id },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        select: {
          id: true,
          slug: true,
          title: true,
          description: true,
          kind: true,
          layout: true,
          revision: true,
          archivedAt: true,
          createdAt: true,
          updatedAt: true,
          sections: {
            orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
            select: {
              id: true,
              key: true,
              title: true,
              synopsis: true,
              sortOrder: true,
              documentId: true,
              revision: true,
              archivedAt: true,
              createdAt: true,
              updatedAt: true,
              operations: {
                orderBy: [{ revision: "asc" }, { id: "asc" }],
                take: 100_000,
                select: {
                  id: true,
                  revision: true,
                  previousRevision: true,
                  operation: true,
                  requestSha256: true,
                  snapshotJson: true,
                  createdAt: true,
                },
              },
            },
          },
          placements: {
            orderBy: [{ groupKey: "asc" }, { sortOrder: "asc" }, { id: "asc" }],
            select: {
              id: true,
              cardId: true,
              groupKey: true,
              laneKey: true,
              sortOrder: true,
              createdAt: true,
              updatedAt: true,
            },
          },
          operations: {
            orderBy: [{ revision: "asc" }, { id: "asc" }],
            take: 100_000,
            select: {
              id: true,
              revision: true,
              previousRevision: true,
              operation: true,
              snapshotJson: true,
              createdAt: true,
            },
          },
        },
      }),
    ]);

  const tasks = rawTasks.filter(
    (task) => !isUnreviewedTranscriptActionItemSource(task.sourceJson),
  );
  const taskIds = tasks.map((task) => task.id);
  const goalIds = goals.map((goal) => goal.id);
  const exportedNoteIds = new Set(notes.map((note) => note.id));
  const portableSourceRevisions = new Map<
    string,
    {
      id: string;
      revisionKey: string;
      identitySha256: string;
      contentSha256: string | null;
      sizeBytes: bigint | null;
      durationSeconds: number | null;
      widthPixels: number | null;
      heightPixels: number | null;
      framesPerSecond: number | null;
      mediaProjection: string;
      sourceState: string;
      providerModifiedAt: Date | null;
      verifiedAt: Date | null;
      createdAt: Date;
    }
  >();
  const portableSourceSets = new Map<
    string,
    NonNullable<(typeof sourceRanges)[number]["sourceSet"]>
  >();
  for (const range of sourceRanges) {
    portableSourceRevisions.set(range.sourceRevision.id, range.sourceRevision);
    if (range.sourceSet) {
      portableSourceSets.set(range.sourceSet.id, range.sourceSet);
      portableSourceRevisions.set(
        range.sourceSet.sourceClockRevision.id,
        range.sourceSet.sourceClockRevision,
      );
      for (const member of range.sourceSet.members) {
        portableSourceRevisions.set(
          member.sourceRevision.id,
          member.sourceRevision,
        );
      }
    }
  }
  const [goalTaskLinks, planBlocks] = await Promise.all([
    taskIds.length && goalIds.length
      ? prisma.goalTaskLink.findMany({
          where: {
            goalId: { in: goalIds },
            actionItemId: { in: taskIds },
          },
          orderBy: [
            { createdAt: "asc" },
            { goalId: "asc" },
            { actionItemId: "asc" },
          ],
          select: {
            goalId: true,
            actionItemId: true,
            relationship: true,
            sourceJson: true,
            createdAt: true,
          },
        })
      : Promise.resolve([]),
    taskIds.length || goalIds.length
      ? prisma.workPlanBlock.findMany({
          where: {
            ownerUserId: input.actorUserId,
            OR: [
              ...(taskIds.length ? [{ actionItemId: { in: taskIds } }] : []),
              ...(goalIds.length ? [{ goalId: { in: goalIds } }] : []),
            ],
          },
          orderBy: [{ startsAt: "asc" }, { id: "asc" }],
          select: {
            id: true,
            actionItemId: true,
            goalId: true,
            startsAt: true,
            endsAt: true,
            timezone: true,
            status: true,
            completedAt: true,
            actualMinutes: true,
            sourceJson: true,
            createdAt: true,
            updatedAt: true,
          },
        })
      : Promise.resolve([]),
  ]);

  const payload: PortableNestBundlePayload = {
    schemaVersion: NEST_EXPORT_SCHEMA_VERSION,
    exportedAt: (input.exportedAt ?? new Date()).toISOString(),
    sourceNest: {
      id: project.id,
      slug: project.slug,
      name: project.name,
      description: project.description,
      sourceLabel: project.sourceLabel,
      updatedAt: project.updatedAt.toISOString(),
    },
    tags: tags.map((tag) => ({
      id: tag.id,
      slug: tag.slug,
      label: tag.label,
      description: tag.description,
      category: tag.category,
      nodeType: tag.nodeType,
      isPrivate: tag.isPrivate,
      isActive: tag.isActive,
      archivedAt: date(tag.archivedAt),
      mergedIntoTagId: tag.mergedIntoTagId,
      aliases: tag.aliases.map((alias) => ({
        id: alias.id,
        slug: alias.slug,
        label: alias.label,
        provenanceJson: alias.provenanceJson as Record<string, unknown>,
        createdAt: alias.createdAt.toISOString(),
      })),
      revisions: tag.revisions.map((revision) => ({
        revision: revision.revision,
        operation: revision.operation,
        snapshotJson: revision.snapshotJson as Record<string, unknown>,
        createdAt: revision.createdAt.toISOString(),
      })),
      createdAt: tag.createdAt.toISOString(),
      updatedAt: tag.updatedAt.toISOString(),
    })),
    notes: notes.map((note) => ({
      id: note.id,
      stableId: note.stableId,
      title: note.title,
      sourceLabel: note.sourceLabel,
      sourcePath: note.sourcePath,
      projectionStatus: note.projectionStatus,
      isPrivate: note.isPrivate,
      personal: note.personalOwnerUserId === input.actorUserId,
      tagIds: note.tagLinks.map((link) => link.tagId),
      blocks: note.blocks.map((block) => ({
        id: block.id,
        stableId: block.stableId,
        order: block.order,
        title: block.title,
        body: block.body,
        sourceLabel: block.sourceLabel,
        sourcePath: block.sourcePath,
        externalId: block.externalId,
        projectionStatus: block.projectionStatus,
        isPrivate: block.isPrivate,
        archivedAt: date(block.archivedAt),
        spans: block.taggedSpans.map((span) => ({
          id: span.id,
          tagId: span.tagId,
          startOffset: span.startOffset,
          endOffset: span.endOffset,
          selectedText: span.selectedText,
          noteBody: span.noteBody,
          createdAt: span.createdAt.toISOString(),
        })),
        createdAt: block.createdAt.toISOString(),
        updatedAt: block.updatedAt.toISOString(),
      })),
      createdAt: note.createdAt.toISOString(),
      updatedAt: note.updatedAt.toISOString(),
    })),
    tasks: tasks.map((task) => ({
      id: task.id,
      title: task.title,
      detail: task.detail,
      status: task.status,
      dueAt: date(task.dueAt),
      completedAt: date(task.completedAt),
      sourceJson: task.sourceJson as Record<string, unknown>,
      tagIds: task.tagLinks.map((link) => link.tagId),
      reminderSnapshot: task.reminder
        ? {
            id: task.reminder.id,
            remindAt: task.reminder.remindAt.toISOString(),
            status: task.reminder.status,
            sourceJson: task.reminder.sourceJson as Record<string, unknown>,
            updatedAt: task.reminder.updatedAt.toISOString(),
          }
        : null,
      recurrenceSnapshot: task.recurrenceOccurrence
        ? {
            seriesId: task.recurrenceOccurrence.series.id,
            occurrenceKey: task.recurrenceOccurrence.occurrenceKey,
            scheduledLocalDate: task.recurrenceOccurrence.scheduledLocalDate,
            scheduledFor: task.recurrenceOccurrence.scheduledFor.toISOString(),
            status: task.recurrenceOccurrence.status,
            series: JSON.parse(
              JSON.stringify(task.recurrenceOccurrence.series),
            ) as Record<string, unknown>,
          }
        : null,
      evidenceReceipts: task.evidenceReceipts.map((receipt) => ({
        id: receipt.id,
        kind: receipt.kind,
        note: receipt.note,
        evidenceJson: receipt.evidenceJson as Record<string, unknown>,
        occurredAt: receipt.occurredAt.toISOString(),
        createdAt: receipt.createdAt.toISOString(),
      })),
      createdAt: task.createdAt.toISOString(),
      updatedAt: task.updatedAt.toISOString(),
    })),
    goals: goals.map((goal) => ({
      id: goal.id,
      parentGoalId:
        goal.parentGoalId && goalIds.includes(goal.parentGoalId)
          ? goal.parentGoalId
          : null,
      title: goal.title,
      description: goal.description,
      status: goal.status,
      targetAt: date(goal.targetAt),
      achievedAt: date(goal.achievedAt),
      sourceJson: goal.sourceJson as Record<string, unknown>,
      tagIds: goal.tagLinks.map((link) => link.tagId),
      progressReceipts: goal.progressReceipts.map((receipt) => ({
        id: receipt.id,
        kind: receipt.kind,
        progressPercent: receipt.progressPercent,
        note: receipt.note,
        evidenceJson: receipt.evidenceJson as Record<string, unknown>,
        occurredAt: receipt.occurredAt.toISOString(),
        createdAt: receipt.createdAt.toISOString(),
      })),
      createdAt: goal.createdAt.toISOString(),
      updatedAt: goal.updatedAt.toISOString(),
    })),
    goalTaskLinks: goalTaskLinks.map((link) => ({
      goalId: link.goalId,
      taskId: link.actionItemId,
      relationship: link.relationship,
      sourceJson: link.sourceJson as Record<string, unknown>,
      createdAt: link.createdAt.toISOString(),
    })),
    planBlocks: planBlocks.map((block) => ({
      id: block.id,
      taskId: block.actionItemId,
      goalId: block.goalId,
      startsAt: block.startsAt.toISOString(),
      endsAt: block.endsAt.toISOString(),
      timezone: block.timezone,
      status: block.status,
      completedAt: date(block.completedAt),
      actualMinutes: block.actualMinutes,
      sourceJson: block.sourceJson as Record<string, unknown>,
      createdAt: block.createdAt.toISOString(),
      updatedAt: block.updatedAt.toISOString(),
    })),
    sourceStory: {
      sourceRevisions: [...portableSourceRevisions.values()]
        .sort(
          (left, right) =>
            left.createdAt.getTime() - right.createdAt.getTime() ||
            left.id.localeCompare(right.id),
        )
        .map((revision) => ({
          id: revision.id,
          revisionKey: revision.revisionKey,
          identitySha256: revision.identitySha256,
          contentSha256: revision.contentSha256,
          sizeBytes: revision.sizeBytes?.toString() ?? null,
          durationSeconds: revision.durationSeconds,
          widthPixels: revision.widthPixels,
          heightPixels: revision.heightPixels,
          framesPerSecond: revision.framesPerSecond,
          mediaProjection: revision.mediaProjection,
          sourceState: revision.sourceState,
          providerModifiedAt: date(revision.providerModifiedAt),
          verifiedAt: date(revision.verifiedAt),
          createdAt: revision.createdAt.toISOString(),
        })),
      sourceSets: [...portableSourceSets.values()]
        .sort(
          (left, right) =>
            left.createdAt.getTime() - right.createdAt.getTime() ||
            left.id.localeCompare(right.id),
        )
        .map((set) => ({
          id: set.id,
          kind: set.kind,
          captureKey: set.captureKey,
          displayName: set.displayName,
          identitySha256: set.identitySha256,
          sourceClockRevisionId: set.sourceClockRevisionId,
          completeness: set.completeness,
          members: set.members.map((member) => ({
            id: member.id,
            sourceRevisionId: member.sourceRevisionId,
            role: member.role,
            ordinal: member.ordinal,
            requiredForRender: member.requiredForRender,
            memberIdentitySha256: member.memberIdentitySha256,
            createdAt: member.createdAt.toISOString(),
          })),
          createdAt: set.createdAt.toISOString(),
        })),
      sourceRanges: sourceRanges.map((range) => ({
        id: range.id,
        sourceRevisionId: range.sourceRevisionId,
        sourceSetId: range.sourceSetId,
        selectorSha256: range.selectorSha256,
        startSeconds: range.startSeconds,
        endSeconds: range.endSeconds,
        selectorJson: range.selectorJson as Record<string, unknown>,
        reframeRecipeJson: range.reframeRecipeJson as Record<
          string,
          unknown
        > | null,
        createdAt: range.createdAt.toISOString(),
      })),
      cards: storyCards.map((card) => ({
        id: card.id,
        stableId: card.stableId,
        sourceRangeId: card.sourceRangeId,
        title: card.title,
        synopsis: card.synopsis,
        notes: card.notes,
        purpose: card.purpose,
        status: card.status,
        visibility: card.visibility,
        revision: card.revision,
        archivedAt: date(card.archivedAt),
        tagIds: card.tags.map((link) => link.tagId),
        revisions: card.revisions.map((revision) => ({
          id: revision.id,
          revision: revision.revision,
          operation: revision.operation,
          snapshotJson: revision.snapshotJson as Record<string, unknown>,
          createdAt: revision.createdAt.toISOString(),
        })),
        createdAt: card.createdAt.toISOString(),
        updatedAt: card.updatedAt.toISOString(),
      })),
      boards: storyBoards.map((board) => ({
        id: board.id,
        slug: board.slug,
        title: board.title,
        description: board.description,
        kind: board.kind,
        layout: board.layout,
        revision: board.revision,
        archivedAt: date(board.archivedAt),
        sections: board.sections.map((section) => ({
          id: section.id,
          key: section.key,
          title: section.title,
          synopsis: section.synopsis,
          sortOrder: section.sortOrder,
          documentId:
            section.documentId && exportedNoteIds.has(section.documentId)
              ? section.documentId
              : null,
          revision: section.revision,
          archivedAt: date(section.archivedAt),
          operations: section.operations.map((operation) => ({
            id: operation.id,
            revision: operation.revision,
            previousRevision: operation.previousRevision,
            operation: operation.operation,
            requestSha256: operation.requestSha256,
            snapshotJson: operation.snapshotJson as Record<string, unknown>,
            createdAt: operation.createdAt.toISOString(),
          })),
          createdAt: section.createdAt.toISOString(),
          updatedAt: section.updatedAt.toISOString(),
        })),
        placements: board.placements.map((placement) => ({
          id: placement.id,
          cardId: placement.cardId,
          groupKey: placement.groupKey,
          laneKey: placement.laneKey,
          sortOrder: placement.sortOrder,
          createdAt: placement.createdAt.toISOString(),
          updatedAt: placement.updatedAt.toISOString(),
        })),
        operations: board.operations.map((operation) => ({
          id: operation.id,
          revision: operation.revision,
          previousRevision: operation.previousRevision,
          operation: operation.operation,
          snapshotJson: operation.snapshotJson as Record<string, unknown>,
          createdAt: operation.createdAt.toISOString(),
        })),
        createdAt: board.createdAt.toISOString(),
        updatedAt: board.updatedAt.toISOString(),
      })),
    },
    boundaries: {
      ownerAuthorized: true,
      actorScopedWork: true,
      noteDocumentsIncluded: true,
      mediaBytesIncluded: false,
      sessionsIncluded: false,
      collaboratorAssignmentsIncluded: false,
      remindersRestoredActive: false,
      recurrenceRestoredActive: false,
      planBlocksRestoreAsCanceled: true,
      sourceStoryIncluded: true,
      sourceReferenceMetadataIncluded: true,
      restoredSourceReferencesAvailable: false,
      providerCredentialsIncluded: false,
      providerLocatorsIncluded: false,
      externalResourcesFetched: false,
      externalSideEffects: false,
    },
  };

  return createPortableNestBundle(payload);
}
