import type { Prisma, PrismaClient } from "@prisma/client";
import { readTranscriptDerivedTaskSource } from "@high-ground/quipsly-domain/transcript-derived-task";

import { isUnreviewedTranscriptActionItemSource } from "@high-ground/quipsly-domain/coaching-packet";
import { personalOrSharedSessionTaskAccessWhere } from "@/lib/server/task-access";
import { readEditableWorkQueueTaskIds } from "./work-queue-task-access";
import { conversationWorkSourceHref } from "../conversation-work-source";

export function nestProjectGoalWhere(projectId: string, actorUserId: string): Prisma.GoalWhereInput {
  return { projectId, ownerUserId: actorUserId };
}

export function nestProjectTaskWhere(projectId: string, projectSlug: string, actorUserId: string): Prisma.ActionItemWhereInput {
  return {
    AND: [
      { OR: [
        { projectId },
        { room: { projectId } },
        { room: { OR: [{ nestSlug: projectSlug }, { projectSlug }] } },
        { goalLinks: { some: { goal: { projectId, ownerUserId: actorUserId } } } },
      ] },
      { OR: personalOrSharedSessionTaskAccessWhere(actorUserId) },
    ],
  };
}

export async function readNestProjectFollowThrough(
  prisma: Pick<PrismaClient, "goal" | "actionItem">,
  input: { projectId: string; projectSlug: string; actorUserId: string },
) {
  const [goals, taskRows] = await Promise.all([
    prisma.goal.findMany({
      where: nestProjectGoalWhere(input.projectId, input.actorUserId),
      orderBy: [{ status: "asc" }, { updatedAt: "desc" }],
      take: 8,
      select: {
        id: true,
        title: true,
        status: true,
        targetAt: true,
        progressReceipts: { orderBy: { occurredAt: "desc" }, take: 1, select: { progressPercent: true } },
      },
    }),
    prisma.actionItem.findMany({
      where: nestProjectTaskWhere(input.projectId, input.projectSlug, input.actorUserId),
      // Recent human work must remain visible after capture. Due-date-first ordering
      // let a handful of stale recurring items permanently hide a newly created task.
      orderBy: [{ status: "asc" }, { updatedAt: "desc" }, { dueAt: "asc" }],
      take: 64,
      select: {
        id: true,
        title: true,
        detail: true,
        status: true,
        dueAt: true,
        updatedAt: true,
        engagementId: true,
        isNestShared: true,
        project: { select: { id: true, slug: true } },
        recurrenceOccurrence: { select: { id: true } },
        tagLinks: { where: { tag: { projectId: input.projectId } }, orderBy: { createdAt: "asc" },
          select: { tag: { select: { id: true, label: true, hexColor: true, isActive: true } } } },
        sourceJson: true,
        room: { select: { id: true, title: true } },
      },
    }),
  ]);

  const editableIds = await readEditableWorkQueueTaskIds(prisma, input.actorUserId, taskRows.map(task => task.id));
  const tasks = taskRows
    .filter((task) => !isUnreviewedTranscriptActionItemSource(task.sourceJson))
    .slice(0, 32)
    .map((task) => {
      const parsedSource = readTranscriptDerivedTaskSource(task.sourceJson);
      return { ...task, canEdit: editableIds.has(task.id), tags: task.tagLinks.map(link => link.tag),
        conversationSourceHref: conversationWorkSourceHref(task.engagementId, task.sourceJson, task.project),
        sourceAnchor: parsedSource?.roomId === task.room?.id ? parsedSource : null };
    });

  return {
    goals,
    tasks,
    boundaries: {
      actorScoped: true,
      assignedTasksOwnerOnly: true,
      unassignedSessionTasksShared: true,
      ownedGoalsOnly: true,
      unreviewedTranscriptCandidatesExcluded: true,
      sourceMutated: false,
      canonicalProjectPreferredWithLegacySlugFallback: true,
      externalSideEffects: false,
    },
  };
}
