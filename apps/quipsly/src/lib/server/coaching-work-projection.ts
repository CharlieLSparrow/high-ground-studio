import type { Prisma } from "@prisma/client";
import { conversationWorkSourceHref } from "@/lib/conversation-work-source";
import { sessionWorkSourceHref } from "@/lib/session-work-source-link";

export const WORK_TAG_LINKS_SELECT = { orderBy: { tagId: "asc" }, select: {
    tag: { select: { id: true, label: true, hexColor: true, isActive: true } },
  } } as const;

const commonSelect = {
  id: true, engagementId: true, roomId: true, title: true, sourceJson: true,
  createdAt: true, updatedAt: true,
  tagLinks: WORK_TAG_LINKS_SELECT,
} as const;

export const NOTE_SELECT = {
  ...commonSelect, authorUserId: true, body: true, visibility: true,
  authorUser: { select: { name: true, primaryEmail: true } },
} as const satisfies Prisma.CoachingNoteSelect;
export const TASK_SELECT = {
  ...commonSelect, assignedUserId: true, detail: true, status: true, dueAt: true,
  assignedUser: { select: { name: true, primaryEmail: true } },
} as const satisfies Prisma.ActionItemSelect;
export const GOAL_SELECT = {
  ...commonSelect, ownerUserId: true, description: true, status: true, targetAt: true,
  owner: { select: { name: true, primaryEmail: true } },
} as const satisfies Prisma.GoalSelect;

type NoteRow = Prisma.CoachingNoteGetPayload<{ select: typeof NOTE_SELECT }>;
type TaskRow = Prisma.ActionItemGetPayload<{ select: typeof TASK_SELECT }>;
type GoalRow = Prisma.GoalGetPayload<{ select: typeof GOAL_SELECT }>;

/** The page, refreshes, and mutation responses must show the same canonical work. */
function sharedPayload(row: NoteRow | TaskRow | GoalRow) {
  const conversationHref = conversationWorkSourceHref(row.engagementId, row.sourceJson);
  const recordingHref = sessionWorkSourceHref(row.roomId, row.sourceJson);
  return {
    id: row.id, title: row.title,
    sourceHref: conversationHref ?? recordingHref,
    sourceKind: conversationHref ? "conversation" as const : recordingHref ? "recording" as const : null,
    tags: (row.tagLinks ?? []).map(link => link.tag),
    createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString(),
  };
}

export function notePayload(row: NoteRow, actorUserId: string, canWrite = true) {
  const isAuthor = row.authorUserId === actorUserId;
  const isShared = row.visibility === "SESSION_SHARED" || row.visibility === "CLIENT_SAFE";
  return {
    ...sharedPayload(row), kind: "NOTE" as const, body: row.body, status: null,
    owner: row.authorUser && row.authorUserId ? { id: row.authorUserId, label: row.authorUser.name || row.authorUser.primaryEmail } : null,
    visibility: row.visibility === "AUTHOR_PRIVATE" ? "PRIVATE" as const : "SHARED" as const,
    dueAt: null, canEdit: canWrite && (isAuthor || isShared), canChangeVisibility: canWrite && isAuthor,
  };
}

export function taskPayload(row: TaskRow, canWrite = true) {
  return {
    ...sharedPayload(row), kind: "TASK" as const, body: row.detail, status: String(row.status),
    owner: row.assignedUser && row.assignedUserId ? { id: row.assignedUserId, label: row.assignedUser.name || row.assignedUser.primaryEmail } : null,
    visibility: "SHARED" as const, dueAt: row.dueAt?.toISOString() ?? null, canEdit: canWrite,
  };
}

export function goalPayload(row: GoalRow, canWrite = true) {
  return {
    ...sharedPayload(row), kind: "GOAL" as const, body: row.description, status: String(row.status),
    owner: { id: row.ownerUserId, label: row.owner.name || row.owner.primaryEmail },
    visibility: "SHARED" as const, dueAt: row.targetAt?.toISOString() ?? null, canEdit: canWrite,
  };
}
