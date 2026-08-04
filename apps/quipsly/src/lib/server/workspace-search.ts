import type { Prisma, PrismaClient } from "@prisma/client";

import { isUnreviewedTranscriptActionItemSource } from "@high-ground/quipsly-domain/coaching-packet";
import {
  SESSION_NOTE_VISIBLE_KINDS,
  workspaceNoteVisibilityWhere,
} from "@/lib/server/session-note-access";
import { personalWritingDocumentVisibilityWhere } from "@/lib/server/personal-writing-documents";

const RESULT_LIMIT = 10;
const TAG_RESULT_SELECT = {
  id: true,
  projectId: true,
  slug: true,
  label: true,
  description: true,
  category: true,
  isPrivate: true,
  isActive: true,
  mergedIntoTagId: true,
  aliases: {
    orderBy: { createdAt: "asc" as const },
    select: { label: true, slug: true },
  },
  project: { select: { id: true, name: true, slug: true } },
} satisfies Prisma.StudioTagSelect;

function taskAccessWhere(userId: string, projectIds: string[] = []) {
  return [
    { assignedUserId: userId },
    ...(projectIds.length ? [{ projectId: { in: projectIds } }] : []),
    { room: { OR: [
      { createdByUserId: userId },
      { participants: { some: { userId, accessStatus: "ACTIVE" as const } } },
      { booking: { clientUserId: userId } },
      { booking: { coachUserId: userId } },
      ...(projectIds.length ? [{ projectId: { in: projectIds } }] : []),
    ] } },
    { booking: { OR: [{ clientUserId: userId }, { coachUserId: userId }] } },
  ];
}

function roomAccessWhere(userId: string, projectIds: string[] = []) {
  return [
    { createdByUserId: userId },
    { participants: { some: { userId, accessStatus: "ACTIVE" as const } } },
    { booking: { clientUserId: userId } },
    { booking: { coachUserId: userId } },
    ...(projectIds.length ? [{ projectId: { in: projectIds } }] : []),
  ];
}

function tagTextWhere(query: string): Prisma.StudioTagWhereInput {
  return {
    OR: [
      { label: { contains: query, mode: "insensitive" } },
      { slug: { contains: query, mode: "insensitive" } },
      { description: { contains: query, mode: "insensitive" } },
      { aliases: { some: { OR: [
        { label: { contains: query, mode: "insensitive" } },
        { slug: { contains: query, mode: "insensitive" } },
      ] } } },
    ],
  };
}

export function normalizeWorkspaceSearchQuery(value: unknown) {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ").slice(0, 120) : "";
}

export function normalizeWorkspaceTagId(value: unknown) {
  return typeof value === "string" ? value.trim().slice(0, 128) : "";
}

function emptyWorkspaceResult({
  query,
  projectCount,
  exactTagId,
}: {
  query: string;
  projectCount: number;
  exactTagId?: string;
}) {
  return {
    query,
    tasks: [],
    goals: [],
    sessions: [],
    notes: [],
    sources: [],
    documents: [],
    annotations: [],
    mediaClips: [],
    tags: [],
    projectCount,
    tagFocus: exactTagId
      ? {
          status: "not-found" as const,
          requestedTagId: exactTagId,
          resolvedTagId: null,
          redirected: false,
          requestedLabel: null,
          resolvedLabel: null,
          project: null,
        }
      : null,
    boundaries: {
      actorScoped: true,
      exactTagIdentity: Boolean(exactTagId),
      minimumQueryLength: 2,
      perKindLimit: RESULT_LIMIT,
      unreviewedTranscriptCandidatesExcluded: true,
      mediaClipAssetAccessRechecked: true,
      externalSideEffects: false,
    },
  };
}

export async function searchWorkspace(
  prisma: PrismaClient,
  input: {
    actorUserId: string;
    query?: string;
    exactTagId?: string;
    visibleProjects: Array<{
      id: string;
      slug: string;
      name: string;
      role?: "OWNER" | "EDITOR" | "VIEWER";
    }>;
  },
) {
  let query = normalizeWorkspaceSearchQuery(input.query);
  const requestedTagId = normalizeWorkspaceTagId(input.exactTagId);
  if (!requestedTagId && query.length < 2) {
    return emptyWorkspaceResult({ query, projectCount: 0 });
  }
  const projects = input.visibleProjects;
  const projectIds = projects.map((project) => project.id);
  const projectTeamProjectIds = projects
    .filter((project) => project.role === "OWNER" || project.role === "EDITOR")
    .map((project) => project.id);
  const requestedTag = requestedTagId && projectIds.length
    ? await prisma.studioTag.findFirst({
        where: { id: requestedTagId, projectId: { in: projectIds } },
        select: TAG_RESULT_SELECT,
      })
    : null;
  let resolvedTag = requestedTag;
  if (requestedTag?.mergedIntoTagId) {
    resolvedTag = await prisma.studioTag.findFirst({
      where: {
        id: requestedTag.mergedIntoTagId,
        projectId: requestedTag.projectId,
      },
      select: TAG_RESULT_SELECT,
    });
  }
  if (requestedTagId && (!requestedTag || !resolvedTag)) {
    return emptyWorkspaceResult({
      query: "",
      projectCount: projects.length,
      exactTagId: requestedTagId,
    });
  }
  const focusedTagId = resolvedTag?.id ?? null;
  const tagFocus = requestedTag && resolvedTag
    ? {
        status: "resolved" as const,
        requestedTagId: requestedTag.id,
        resolvedTagId: resolvedTag.id,
        redirected: requestedTag.id !== resolvedTag.id,
        requestedLabel: requestedTag.label,
        resolvedLabel: resolvedTag.label,
        project: resolvedTag.project,
      }
    : null;
  if (resolvedTag) query = resolvedTag.label;
  const visibleTagMatch: Prisma.StudioTagWhereInput = {
    projectId: { in: projectIds },
    ...tagTextWhere(query),
  };
  const exactTaskTagMatch = focusedTagId
    ? [{ tagLinks: { some: { tagId: focusedTagId } } } satisfies Prisma.ActionItemWhereInput]
    : null;
  const taskContentMatches: Prisma.ActionItemWhereInput[] = exactTaskTagMatch ?? [
    { title: { contains: query, mode: "insensitive" } },
    { detail: { contains: query, mode: "insensitive" } },
    ...(projectIds.length ? [{ tagLinks: { some: { tag: visibleTagMatch } } } satisfies Prisma.ActionItemWhereInput] : []),
  ];
  const goalContentMatches: Prisma.GoalWhereInput[] = focusedTagId ? [
    { tagLinks: { some: { tagId: focusedTagId } } },
  ] : [
    { title: { contains: query, mode: "insensitive" } },
    { description: { contains: query, mode: "insensitive" } },
    ...(projectIds.length ? [{ tagLinks: { some: { tag: visibleTagMatch } } } satisfies Prisma.GoalWhereInput] : []),
  ];
  const sessionContentMatches: Prisma.CallRoomWhereInput[] = focusedTagId ? [
    { tagLinks: { some: { tagId: focusedTagId } } },
  ] : [
    { title: { contains: query, mode: "insensitive" } },
    { projectSlug: { contains: query, mode: "insensitive" } },
    { nestSlug: { contains: query, mode: "insensitive" } },
    ...(projectIds.length ? [{ tagLinks: { some: { tag: visibleTagMatch } } } satisfies Prisma.CallRoomWhereInput] : []),
  ];
  const noteContentMatches: Prisma.CoachingNoteWhereInput[] = focusedTagId ? [
    { tagLinks: { some: { tagId: focusedTagId } } },
  ] : [
    { title: { contains: query, mode: "insensitive" } },
    { body: { contains: query, mode: "insensitive" } },
    ...(projectIds.length ? [{ tagLinks: { some: { tag: visibleTagMatch } } } satisfies Prisma.CoachingNoteWhereInput] : []),
  ];
  const documentBlockMatches: Prisma.StudioDocumentBlockWhereInput[] = focusedTagId ? [
    { taggedSpans: { some: { tagId: focusedTagId } } },
  ] : [
    { title: { contains: query, mode: "insensitive" } },
    { body: { contains: query, mode: "insensitive" } },
    ...(projectIds.length ? [{ taggedSpans: { some: { tag: visibleTagMatch } } } satisfies Prisma.StudioDocumentBlockWhereInput] : []),
  ];
  const documentContentMatches: Prisma.StudioDocumentWhereInput[] = focusedTagId ? [
    { tagLinks: { some: { tagId: focusedTagId } } },
    { taggedSpans: { some: { tagId: focusedTagId } } },
  ] : [
    { title: { contains: query, mode: "insensitive" } },
    { sourceLabel: { contains: query, mode: "insensitive" } },
    { blocks: { some: { archivedAt: null, OR: documentBlockMatches } } },
    ...(projectIds.length ? [{ tagLinks: { some: { tag: visibleTagMatch } } } satisfies Prisma.StudioDocumentWhereInput] : []),
    ...(projectIds.length ? [{ taggedSpans: { some: { tag: visibleTagMatch } } } satisfies Prisma.StudioDocumentWhereInput] : []),
  ];
  const visibleAssignedTags = {
    where: { tag: { projectId: { in: projectIds } } },
    orderBy: { createdAt: "asc" as const },
    take: 12,
    select: { tag: { select: { id: true, slug: true, label: true, isActive: true } } },
  };
  const [taskRows, goals, sessions, noteRows, sources, documents, annotations, mediaClips, tags] = await Promise.all([
    prisma.actionItem.findMany({
      where: { AND: [{ OR: taskAccessWhere(input.actorUserId, projectIds) }, { OR: taskContentMatches }] },
      orderBy: { updatedAt: "desc" }, take: RESULT_LIMIT + 10,
      select: {
        id: true, title: true, detail: true, status: true, dueAt: true, sourceJson: true,
        room: { select: { id: true, title: true } },
        project: { select: { id: true, name: true, slug: true } },
        tagLinks: visibleAssignedTags,
      },
    }),
    prisma.goal.findMany({
      where: { AND: [{ OR: [{ ownerUserId: input.actorUserId }, { room: { OR: roomAccessWhere(input.actorUserId, projectIds) } }, { booking: { OR: [{ clientUserId: input.actorUserId }, { coachUserId: input.actorUserId }] } }] }, { OR: goalContentMatches }] },
      orderBy: { updatedAt: "desc" }, take: RESULT_LIMIT,
      select: {
        id: true, title: true, description: true, status: true,
        project: { select: { id: true, name: true, slug: true } },
        room: { select: { title: true } },
        tagLinks: visibleAssignedTags,
      },
    }),
    prisma.callRoom.findMany({
      where: { AND: [{ OR: roomAccessWhere(input.actorUserId, projectIds) }, { OR: sessionContentMatches }] },
      orderBy: { updatedAt: "desc" }, take: RESULT_LIMIT,
      select: {
        id: true, title: true, purpose: true, status: true, projectSlug: true, scheduledStart: true,
        project: { select: { id: true, name: true, slug: true } },
        tagLinks: visibleAssignedTags,
      },
    }),
    prisma.coachingNote.findMany({
      where: {
        AND: [
          { room: { OR: roomAccessWhere(input.actorUserId, projectIds) } },
          { kind: { in: [...SESSION_NOTE_VISIBLE_KINDS] } },
          workspaceNoteVisibilityWhere({
            actorUserId: input.actorUserId,
            projectTeamProjectIds,
          }),
          { OR: noteContentMatches },
        ],
      },
      orderBy: { updatedAt: "desc" }, take: RESULT_LIMIT,
      select: {
        id: true, title: true, body: true, kind: true, visibility: true, updatedAt: true,
        room: { select: { id: true, title: true } },
        tagLinks: visibleAssignedTags,
      },
    }),
    projectIds.length ? prisma.studioSourceUnit.findMany({
      where: {
        projectId: { in: projectIds },
        OR: focusedTagId
          ? [{
              annotations: {
                some: {
                  status: "active",
                  tags: { some: { tagId: focusedTagId } },
                  OR: [
                    { visibility: "project" },
                    { createdByUserId: input.actorUserId },
                  ],
                },
              },
            }]
          : [
              { title: { contains: query, mode: "insensitive" } },
              { author: { contains: query, mode: "insensitive" } },
              { editableNotes: { contains: query, mode: "insensitive" } },
            ],
      },
      orderBy: { updatedAt: "desc" }, take: RESULT_LIMIT,
      select: { id: true, title: true, kind: true, author: true, project: { select: { name: true, slug: true } } },
    }) : Promise.resolve([]),
    projectIds.length ? prisma.studioDocument.findMany({
      where: {
        AND: [
          { projectId: { in: projectIds } },
          personalWritingDocumentVisibilityWhere(input.actorUserId),
          { OR: documentContentMatches },
        ],
      },
      orderBy: { updatedAt: "desc" }, take: RESULT_LIMIT,
      select: {
        id: true, title: true, sourceLabel: true, projectionStatus: true,
        project: { select: { name: true, slug: true } },
        tagLinks: visibleAssignedTags,
        blocks: {
          where: { archivedAt: null, OR: documentBlockMatches },
          orderBy: { order: "asc" },
          take: 1,
          select: { id: true, title: true, body: true },
        },
      },
    }) : Promise.resolve([]),
    projectIds.length ? prisma.studioSourceAnnotation.findMany({
      where: {
        projectId: { in: projectIds },
        status: "active",
        AND: [
          {
            OR: [
              { visibility: "project" },
              { createdByUserId: input.actorUserId },
            ],
          },
          focusedTagId
            ? { tags: { some: { tagId: focusedTagId } } }
            : {
                OR: [
                  { body: { contains: query, mode: "insensitive" } },
                  { exactText: { contains: query, mode: "insensitive" } },
                ],
              },
        ],
      },
      orderBy: { updatedAt: "desc" }, take: RESULT_LIMIT,
      select: { id: true, kind: true, body: true, exactText: true, visibility: true, sourceUnit: { select: { title: true } }, project: { select: { name: true, slug: true } } },
    }) : Promise.resolve([]),
    focusedTagId && resolvedTag ? prisma.mediaClip.findMany({
      where: {
        tags: { some: { id: focusedTagId } },
        mediaAsset: {
          OR: [
            { isGlobal: true },
            { projects: { some: { id: resolvedTag.project.id } } },
            { mediaBin: { projectId: resolvedTag.project.id } },
            { assetAttachments: { some: { projectId: resolvedTag.project.id } } },
          ],
        },
      },
      orderBy: { updatedAt: "desc" },
      take: RESULT_LIMIT,
      select: {
        id: true,
        title: true,
        description: true,
        inTimecode: true,
        outTimecode: true,
        mediaAsset: {
          select: {
            id: true,
            filename: true,
            duration: true,
            isGlobal: true,
          },
        },
      },
    }) : Promise.resolve([]),
    resolvedTag ? Promise.resolve([resolvedTag]) : projectIds.length ? prisma.studioTag.findMany({
      where: {
        projectId: { in: projectIds },
        isActive: true,
        ...tagTextWhere(query),
      },
      orderBy: [{ label: "asc" }, { updatedAt: "desc" }],
      take: RESULT_LIMIT,
      select: TAG_RESULT_SELECT,
    }) : Promise.resolve([]),
  ]);
  const tasks = taskRows.filter((task) => !isUnreviewedTranscriptActionItemSource(task.sourceJson)).slice(0, RESULT_LIMIT);
  const notes = noteRows.filter((note): note is typeof note & { room: NonNullable<typeof note.room> } => Boolean(note.room));
  return {
    query,
    tasks,
    goals,
    sessions,
    notes,
    sources,
    documents,
    annotations,
    mediaClips,
    tags,
    projectCount: projects.length,
    tagFocus,
    boundaries: {
      actorScoped: true,
      exactTagIdentity: Boolean(focusedTagId),
      minimumQueryLength: 2,
      perKindLimit: RESULT_LIMIT,
      unreviewedTranscriptCandidatesExcluded: true,
      mediaClipAssetAccessRechecked: true,
      externalSideEffects: false,
    },
  };
}
