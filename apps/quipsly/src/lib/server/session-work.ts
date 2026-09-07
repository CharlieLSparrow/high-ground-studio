import "server-only";

import { isUnreviewedTranscriptActionItemSource } from "@high-ground/quipsly-domain/coaching-packet";
import { sessionActorAccessWhere, type SessionAccessActor } from "./session-access";
import { coachingTaskCollaborationAccessWhere, personalOrSharedCoachingGoalAccessWhere } from "./coaching-work-access";
import { personalOrSharedSessionTaskAccessWhere } from "./task-access";

function object(value: unknown): Record<string, any> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, any> : {};
}

/** One room-scoped projection for ordinary work, regardless of its creator. */
export async function loadSessionWork(input: {
  prisma: any;
  roomId: string;
  actor: SessionAccessActor;
}) {
  const { prisma, roomId, actor } = input;
  const room = await prisma.callRoom.findFirst({
    where: { AND: [{ id: roomId }, sessionActorAccessWhere(actor)] },
    select: { id: true, projectId: true },
  });
  if (!room) return [];
  const shared = { sourceJson: { path: ["visibility"], equals: "SESSION_SHARED" } };
  const relationship = { sourceJson: { path: ["visibility"], equals: "engagement-shared" } };
  const taskWhere = { roomId, OR: [
    { assignedUserId: actor.id }, shared,
    { AND: [relationship, { OR: coachingTaskCollaborationAccessWhere(actor.id) }] },
  ] };
  const goalWhere = { roomId, OR: [
    { ownerUserId: actor.id }, shared,
    { AND: [relationship, { OR: personalOrSharedCoachingGoalAccessWhere(actor.id) }] },
  ] };
  const common = {
    id: true, title: true, status: true, sourceJson: true, createdAt: true, updatedAt: true,
    tagLinks: { select: { tag: { select: { id: true, label: true, slug: true, isActive: true, projectId: true } } } },
  };
  const [tasks, goals, writableTasks, writableGoals] = await Promise.all([
    prisma.actionItem.findMany({ where: taskWhere, orderBy: { createdAt: "desc" }, take: 100,
      select: { ...common, detail: true, dueAt: true, assignedUserId: true,
        assignedUser: { select: { name: true, primaryEmail: true } } } }),
    prisma.goal.findMany({ where: goalWhere, orderBy: { createdAt: "desc" }, take: 100,
      select: { ...common, description: true, targetAt: true, ownerUserId: true,
        owner: { select: { name: true, primaryEmail: true } } } }),
    prisma.actionItem.findMany({ where: { AND: [taskWhere, { OR: personalOrSharedSessionTaskAccessWhere(actor.id, "write") }] }, select: { id: true } }),
    prisma.goal.findMany({ where: { AND: [goalWhere, { OR: personalOrSharedCoachingGoalAccessWhere(actor.id, "write") }] }, select: { id: true } }),
  ]);
  const writable = new Set([...writableTasks, ...writableGoals].map((row: any) => row.id));
  return [
    ...tasks.map((row: any) => ({ ...row, kind: "TASK" as const, body: row.detail, userId: row.assignedUserId, user: row.assignedUser })),
    ...goals.map((row: any) => ({ ...row, kind: "GOAL" as const, body: row.description, userId: row.ownerUserId, user: row.owner, dueAt: row.targetAt })),
  ].filter((row) => !object(object(row.sourceJson).relationshipWorkRemoval).active &&
    !isUnreviewedTranscriptActionItemSource(row.sourceJson))
    .map((row) => {
      const source = object(row.sourceJson);
      const fromTranscript = source.origin === "quipsly-session-follow-through";
      const visibility = source.visibility === "engagement-shared"
        ? "ENGAGEMENT_SHARED" as const
        : source.visibility === "SESSION_SHARED" ? "SESSION_SHARED" as const : "AUTHOR_PRIVATE" as const;
      // Selecting a recording seeks within that source, not the assembled session clock.
      const at = typeof source.sourceStartSeconds === "number" ? source.sourceStartSeconds : source.startSeconds;
      const sourceQuery = new URLSearchParams({ mode: "transcript" });
      if (typeof source.recordingAssetId === "string") sourceQuery.set("source", source.recordingAssetId);
      if (typeof at === "number" && Number.isFinite(at) && at >= 0) sourceQuery.set("at", String(at));
      return {
        id: row.id, kind: row.kind, title: row.title, body: row.body ?? null, status: String(row.status),
        createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString(),
        dueAt: row.dueAt?.toISOString() ?? null, visibility,
        ownedByCurrentActor: row.userId === actor.id,
        ownerLabel: row.user?.name || row.user?.primaryEmail || "Unassigned",
        canEdit: writable.has(row.id), fromTranscript,
        sourceHref: fromTranscript && source.roomId === roomId ? `/sessions/${encodeURIComponent(roomId)}?${sourceQuery}` : null,
        tags: (row.tagLinks || []).map((link: any) => link.tag)
          .filter((tag: any) => tag.isActive && tag.projectId === room.projectId)
          .map(({ id, label, slug }: any) => ({ id, label, slug })),
      };
    }).sort((left, right) => right.createdAt.localeCompare(left.createdAt));
}
