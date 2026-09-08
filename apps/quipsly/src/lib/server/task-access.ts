import type { Prisma } from "@prisma/client";

import { coachingTaskCollaborationAccessWhere } from "@/lib/server/coaching-work-access";

/** Sharing follows current membership, independently of who owns the task. */
export function nestMemberProjectWhere(userId: string, access: "read" | "write" = "read"): Prisma.StudioProjectWhereInput {
  return { accessGrants: { some: {
    memberUserId: userId, status: "ACTIVE",
    role: { in: access === "write" ? ["OWNER", "EDITOR"] : ["OWNER", "EDITOR", "VIEWER"] },
  } } };
}

export function nestSharedTaskAccessWhere(userId: string, access: "read" | "write" = "read"): Prisma.ActionItemWhereInput {
  return { isNestShared: true, engagementId: null, project: nestMemberProjectWhere(userId, access) };
}

function withNestSharing(userId: string, access: "read" | "write", legacy: Prisma.ActionItemWhereInput[]) {
  return [nestSharedTaskAccessWhere(userId, access),
    ...legacy.map(where => ({ ...where, isNestShared: false }))];
}

function unassignedSessionAccess(userId: string): Prisma.ActionItemWhereInput[] {
  return [
    {
      assignedUserId: null,
      engagementId: null,
      room: { OR: [
        { createdByUserId: userId },
        { participants: { some: { userId, accessStatus: "ACTIVE" } } },
        { booking: { clientUserId: userId } },
        { booking: { coachUserId: userId } },
      ] },
    },
    {
      assignedUserId: null,
      engagementId: null,
      booking: { OR: [{ clientUserId: userId }, { coachUserId: userId }] },
    },
  ];
}

function unassignedSessionWriteAccess(userId: string): Prisma.ActionItemWhereInput[] {
  return [
    {
      assignedUserId: null,
      engagementId: null,
      room: { OR: [
        { createdByUserId: userId },
        {
          AND: [
            { coachingEngagementId: null },
            { participants: { some: { userId, accessStatus: "ACTIVE" } } },
          ],
        },
        { booking: { clientUserId: userId } },
        { booking: { coachUserId: userId } },
      ] },
    },
    {
      assignedUserId: null,
      engagementId: null,
      booking: { OR: [{ clientUserId: userId }, { coachUserId: userId }] },
    },
  ];
}

/**
 * Personal work stays private. Coaching work belongs to its explicit private
 * engagement/booking collaboration, while other Sessions share only
 * unassigned tasks.
 */
export function personalOrSharedSessionTaskAccessWhere(
  userId: string,
  access: "read" | "write" = "read",
): Prisma.ActionItemWhereInput[] {
  return withNestSharing(userId, access, [
    { assignedUserId: userId },
    ...coachingTaskCollaborationAccessWhere(userId, access),
    ...(access === "write" ? unassignedSessionWriteAccess(userId) : unassignedSessionAccess(userId)),
  ]);
}

/** Visible projects expose unassigned team work, never another person's assignment. */
export function personalOrSharedWorkspaceTaskAccessWhere(
  userId: string,
  projectIds: string[] = [],
): Prisma.ActionItemWhereInput[] {
  return withNestSharing(userId, "read", [
    { assignedUserId: userId },
    ...coachingTaskCollaborationAccessWhere(userId),
    ...(projectIds.length ? [{ assignedUserId: null, engagementId: null, projectId: { in: projectIds } }] : []),
    {
      assignedUserId: null,
      engagementId: null,
      room: { OR: [
        { createdByUserId: userId },
        { participants: { some: { userId, accessStatus: "ACTIVE" } } },
        { booking: { clientUserId: userId } },
        { booking: { coachUserId: userId } },
        ...(projectIds.length ? [{ projectId: { in: projectIds } }] : []),
      ] },
    },
    {
      assignedUserId: null,
      engagementId: null,
      booking: { OR: [{ clientUserId: userId }, { coachUserId: userId }] },
    },
  ]);
}
