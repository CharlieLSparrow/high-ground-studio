import type { Prisma } from "@prisma/client";

import { isUnreviewedTranscriptActionItemSource } from "@high-ground/quipsly-domain/coaching-packet";
import {
  SESSION_NOTE_VISIBLE_KINDS,
  workspaceNoteVisibilityWhere,
} from "@/lib/server/session-note-access";
import { personalWritingDocumentVisibilityWhere } from "@/lib/server/personal-writing-documents";
import { personalOrSharedWorkspaceTaskAccessWhere } from "@/lib/server/task-access";
import { sessionActorAccessWhere } from "./session-access";
import { personalOrSharedCoachingGoalAccessWhere } from "./coaching-work-access";

const RESULT_LIMIT = 10;
const TAG_MATCH_ID_LIMIT = 500;
const TAG_RESULT_SELECT = {
  id: true,
  projectId: true,
  slug: true,
  label: true,
  hexColor: true,
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
      assignedTasksOwnerOnly: true,
      unassignedSessionTasksShared: true,
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
  prisma: Prisma.TransactionClient,
  input: {
    actorUserId: string;
    actorEmail?: string;
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
  const sessionAccess = sessionActorAccessWhere({ id: input.actorUserId, primaryEmail: input.actorEmail });
  const projectIds = projects.map((project) => project.id);
  const projectTeamProjectIds = projects
    .filter((project) => project.role === "OWNER" || project.role === "EDITOR")
    .map((project) => project.id);
  const taskAccess: Prisma.ActionItemWhereInput = { OR: personalOrSharedWorkspaceTaskAccessWhere(input.actorUserId, projectIds) };
  const goalAccess: Prisma.GoalWhereInput = { OR: [
    ...personalOrSharedCoachingGoalAccessWhere(input.actorUserId),
    { AND: [{ sourceJson: { path: ["visibility"], equals: "SESSION_SHARED" } }, { room: sessionAccess }] },
  ] };
  // A client can follow a label on authorized work without being admitted to
  // the coach's entire Nest. Every result still has its own access predicate.
  const visibleTagAccess: Prisma.StudioTagWhereInput = { OR: [
    { projectId: { in: projectIds } },
    { actionItems: { some: { actionItem: taskAccess } } },
    { goals: { some: { goal: goalAccess } } },
  ] };
  const requestedTag = requestedTagId
    ? await prisma.studioTag.findFirst({
        where: { id: requestedTagId, ...visibleTagAccess },
        select: TAG_RESULT_SELECT,
      })
    : null;
  let resolvedTag = requestedTag;
  if (requestedTag?.mergedIntoTagId) {
    resolvedTag = await prisma.studioTag.findFirst({
      where: {
        id: requestedTag.mergedIntoTagId,
        projectId: requestedTag.projectId,
        ...visibleTagAccess,
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
        project: projectIds.includes(resolvedTag.projectId) ? resolvedTag.project : null,
      }
    : null;
  if (resolvedTag) query = resolvedTag.label;
  const visibleTagTextMatch: Prisma.StudioTagWhereInput = {
    OR: [
      { AND: [{ projectId: { in: projectIds } }, tagTextWhere(query)] },
      { AND: [visibleTagAccess, { OR: [
        { label: { contains: query, mode: "insensitive" } },
        { slug: { contains: query, mode: "insensitive" } },
      ] }] },
    ],
  };
  // Resolve this independent predicate once, instead of expanding the same
  // membership joins inside every record's text/tag OR. Bound the ID list;
  // broad searches fall back to the predicate, never a truncated set of tags.
  const matchingTags = focusedTagId ? null : await prisma.studioTag.findMany({
    where: visibleTagTextMatch,
    select: { id: true },
    take: TAG_MATCH_ID_LIMIT + 1,
  });
  const visibleTagMatch: Prisma.StudioTagWhereInput = matchingTags && matchingTags.length <= TAG_MATCH_ID_LIMIT
    ? { id: { in: matchingTags.map(tag => tag.id) } }
    : visibleTagTextMatch;
  // For a task/goal that already passed its own access check, an attached tag
  // is visible by definition. Do not recursively re-run task and goal access
  // through that same tag. Catalog-only metadata still requires Nest access.
  const assignedWorkTagMatch: Prisma.StudioTagWhereInput = {
    OR: [
      { AND: [{ projectId: { in: projectIds } }, tagTextWhere(query)] },
      { label: { contains: query, mode: "insensitive" } },
      { slug: { contains: query, mode: "insensitive" } },
    ],
  };
  const exactTaskTagMatch = focusedTagId
    ? [{ tagLinks: { some: { tagId: focusedTagId } } } satisfies Prisma.ActionItemWhereInput]
    : null;
  const taskContentMatches: Prisma.ActionItemWhereInput[] = exactTaskTagMatch ?? [
    { title: { contains: query, mode: "insensitive" } },
    { detail: { contains: query, mode: "insensitive" } },
    { tagLinks: { some: { tag: assignedWorkTagMatch } } },
  ];
  const goalContentMatches: Prisma.GoalWhereInput[] = focusedTagId ? [
    { tagLinks: { some: { tagId: focusedTagId } } },
  ] : [
    { title: { contains: query, mode: "insensitive" } },
    { description: { contains: query, mode: "insensitive" } },
    { tagLinks: { some: { tag: assignedWorkTagMatch } } },
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
  const assignedWorkTags = {
    orderBy: { createdAt: "asc" as const },
    take: 12,
    select: { tag: { select: { id: true, slug: true, label: true, hexColor: true, isActive: true } } },
  };
  const visibleAssignedTags = { ...assignedWorkTags, where: { tag: visibleTagAccess } };
  const [taskRows, goalRows, sessionRows, noteRows, sources, documents, annotations, mediaClips, tagRows] = await Promise.all([
    prisma.actionItem.findMany({
      where: { AND: [taskAccess, { OR: taskContentMatches }] },
      orderBy: { updatedAt: "desc" }, take: RESULT_LIMIT + 10,
      select: {
        id: true, title: true, detail: true, status: true, dueAt: true, sourceJson: true,
        room: { select: { id: true, title: true } },
        project: { select: { id: true, name: true, slug: true } },
        tagLinks: assignedWorkTags,
      },
    }),
    prisma.goal.findMany({
      where: { AND: [goalAccess, { OR: goalContentMatches }] },
      orderBy: { updatedAt: "desc" }, take: RESULT_LIMIT,
      select: {
        id: true, title: true, description: true, status: true,
        project: { select: { id: true, name: true, slug: true } },
        room: { select: { title: true } },
        tagLinks: assignedWorkTags,
      },
    }),
    prisma.callRoom.findMany({
      where: { AND: [sessionAccess, { OR: sessionContentMatches }] },
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
          { room: sessionAccess },
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
    focusedTagId && resolvedTag && projectIds.includes(resolvedTag.projectId) ? prisma.mediaClip.findMany({
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
    resolvedTag ? Promise.resolve([resolvedTag]) : prisma.studioTag.findMany({
      where: {
        isActive: true,
        AND: [visibleTagMatch],
      },
      orderBy: [{ label: "asc" }, { updatedAt: "desc" }],
      take: RESULT_LIMIT,
      select: TAG_RESULT_SELECT,
    }),
  ]);
  const redactNest = <T extends { project: { id: string } | null }>(row: T) => ({
    ...row, project: row.project && projectIds.includes(row.project.id) ? row.project : null,
  });
  const tasks = taskRows.filter((task) => !isUnreviewedTranscriptActionItemSource(task.sourceJson)).slice(0, RESULT_LIMIT).map(redactNest);
  const goals = goalRows.map(redactNest);
  const sessions = sessionRows.map(redactNest);
  const tags = tagRows.map(tag => projectIds.includes(tag.projectId) ? tag : {
    ...tag, project: null, description: null, aliases: [],
  });
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
      assignedTasksOwnerOnly: true,
      unassignedSessionTasksShared: true,
      exactTagIdentity: Boolean(focusedTagId),
      minimumQueryLength: 2,
      perKindLimit: RESULT_LIMIT,
      unreviewedTranscriptCandidatesExcluded: true,
      mediaClipAssetAccessRechecked: true,
      externalSideEffects: false,
    },
  };
}
