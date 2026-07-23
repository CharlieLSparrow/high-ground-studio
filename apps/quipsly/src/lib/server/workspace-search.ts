import type { PrismaClient } from "@prisma/client";

import { isUnreviewedTranscriptActionItemSource } from "@high-ground/quipsly-domain/coaching-packet";

const RESULT_LIMIT = 10;

function taskAccessWhere(userId: string) {
  return [
    { assignedUserId: userId },
    { room: { OR: [
      { createdByUserId: userId },
      { participants: { some: { userId } } },
      { booking: { clientUserId: userId } },
      { booking: { coachUserId: userId } },
    ] } },
    { booking: { OR: [{ clientUserId: userId }, { coachUserId: userId }] } },
  ];
}

function roomAccessWhere(userId: string) {
  return [
    { createdByUserId: userId },
    { participants: { some: { userId } } },
    { booking: { clientUserId: userId } },
    { booking: { coachUserId: userId } },
  ];
}

export function normalizeWorkspaceSearchQuery(value: unknown) {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ").slice(0, 120) : "";
}

export async function searchWorkspace(
  prisma: PrismaClient,
  input: { actorUserId: string; query: string; visibleProjects: Array<{ id: string; slug: string; name: string }> },
) {
  const query = normalizeWorkspaceSearchQuery(input.query);
  if (query.length < 2) return { query, tasks: [], goals: [], sessions: [], sources: [], documents: [], annotations: [], tags: [], projectCount: 0, boundaries: { actorScoped: true, minimumQueryLength: 2, perKindLimit: RESULT_LIMIT, unreviewedTranscriptCandidatesExcluded: true, externalSideEffects: false } };
  const projects = input.visibleProjects;
  const projectIds = projects.map((project) => project.id);
  const [taskRows, goals, sessions, sources, documents, annotations, tags] = await Promise.all([
    prisma.actionItem.findMany({
      where: { AND: [{ OR: taskAccessWhere(input.actorUserId) }, { OR: [{ title: { contains: query, mode: "insensitive" } }, { detail: { contains: query, mode: "insensitive" } }] }] },
      orderBy: { updatedAt: "desc" }, take: RESULT_LIMIT + 10,
      select: { id: true, title: true, detail: true, status: true, dueAt: true, sourceJson: true, room: { select: { id: true, title: true } } },
    }),
    prisma.goal.findMany({
      where: { AND: [{ OR: [{ ownerUserId: input.actorUserId }, { room: { OR: roomAccessWhere(input.actorUserId) } }, { booking: { OR: [{ clientUserId: input.actorUserId }, { coachUserId: input.actorUserId }] } }] }, { OR: [{ title: { contains: query, mode: "insensitive" } }, { description: { contains: query, mode: "insensitive" } }] }] },
      orderBy: { updatedAt: "desc" }, take: RESULT_LIMIT,
      select: { id: true, title: true, description: true, status: true, project: { select: { name: true, slug: true } }, room: { select: { title: true } } },
    }),
    prisma.callRoom.findMany({
      where: { AND: [{ OR: roomAccessWhere(input.actorUserId) }, { OR: [{ title: { contains: query, mode: "insensitive" } }, { projectSlug: { contains: query, mode: "insensitive" } }, { nestSlug: { contains: query, mode: "insensitive" } }] }] },
      orderBy: { updatedAt: "desc" }, take: RESULT_LIMIT,
      select: { id: true, title: true, purpose: true, status: true, projectSlug: true, scheduledStart: true },
    }),
    projectIds.length ? prisma.studioSourceUnit.findMany({
      where: { projectId: { in: projectIds }, OR: [{ title: { contains: query, mode: "insensitive" } }, { author: { contains: query, mode: "insensitive" } }, { editableNotes: { contains: query, mode: "insensitive" } }] },
      orderBy: { updatedAt: "desc" }, take: RESULT_LIMIT,
      select: { id: true, title: true, kind: true, author: true, project: { select: { name: true, slug: true } } },
    }) : Promise.resolve([]),
    projectIds.length ? prisma.studioDocument.findMany({
      where: { projectId: { in: projectIds }, OR: [{ title: { contains: query, mode: "insensitive" } }, { sourceLabel: { contains: query, mode: "insensitive" } }] },
      orderBy: { updatedAt: "desc" }, take: RESULT_LIMIT,
      select: { id: true, title: true, projectionStatus: true, project: { select: { name: true, slug: true } } },
    }) : Promise.resolve([]),
    projectIds.length ? prisma.studioSourceAnnotation.findMany({
      where: { projectId: { in: projectIds }, status: "active", AND: [{ OR: [{ visibility: "project" }, { createdByUserId: input.actorUserId }] }, { OR: [{ body: { contains: query, mode: "insensitive" } }, { exactText: { contains: query, mode: "insensitive" } }] }] },
      orderBy: { updatedAt: "desc" }, take: RESULT_LIMIT,
      select: { id: true, kind: true, body: true, exactText: true, visibility: true, sourceUnit: { select: { title: true } }, project: { select: { name: true, slug: true } } },
    }) : Promise.resolve([]),
    projectIds.length ? prisma.studioTag.findMany({
      where: {
        projectId: { in: projectIds },
        isActive: true,
        OR: [
          { label: { contains: query, mode: "insensitive" } },
          { slug: { contains: query, mode: "insensitive" } },
          { description: { contains: query, mode: "insensitive" } },
        ],
      },
      orderBy: [{ label: "asc" }, { updatedAt: "desc" }],
      take: RESULT_LIMIT,
      select: { id: true, slug: true, label: true, description: true, category: true, isPrivate: true, project: { select: { name: true, slug: true } } },
    }) : Promise.resolve([]),
  ]);
  const tasks = taskRows.filter((task) => !isUnreviewedTranscriptActionItemSource(task.sourceJson)).slice(0, RESULT_LIMIT);
  return { query, tasks, goals, sessions, sources, documents, annotations, tags, projectCount: projects.length, boundaries: { actorScoped: true, minimumQueryLength: 2, perKindLimit: RESULT_LIMIT, unreviewedTranscriptCandidatesExcluded: true, externalSideEffects: false } };
}
