import type { Prisma } from "@prisma/client";

import { coachingTaskCollaborationAccessWhere } from "@/lib/server/coaching-work-access";

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
  return [
    { assignedUserId: userId },
    ...coachingTaskCollaborationAccessWhere(userId, access),
    ...(access === "write" ? unassignedSessionWriteAccess(userId) : unassignedSessionAccess(userId)),
  ];
}

/** Visible projects expose unassigned team work, never another person's assignment. */
export function personalOrSharedWorkspaceTaskAccessWhere(
  userId: string,
  projectIds: string[] = [],
): Prisma.ActionItemWhereInput[] {
  return [
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
  ];
}
