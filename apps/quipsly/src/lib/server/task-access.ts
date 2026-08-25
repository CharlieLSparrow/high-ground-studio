import type { Prisma } from "@prisma/client";

function unassignedSessionAccess(userId: string): Prisma.ActionItemWhereInput[] {
  return [
    {
      assignedUserId: null,
      room: { OR: [
        { createdByUserId: userId },
        { participants: { some: { userId, accessStatus: "ACTIVE" } } },
        { booking: { clientUserId: userId } },
        { booking: { coachUserId: userId } },
      ] },
    },
    {
      assignedUserId: null,
      booking: { OR: [{ clientUserId: userId }, { coachUserId: userId }] },
    },
  ];
}

/** Assigned work is personal; session participants share only unassigned work. */
export function personalOrSharedSessionTaskAccessWhere(userId: string): Prisma.ActionItemWhereInput[] {
  return [{ assignedUserId: userId }, ...unassignedSessionAccess(userId)];
}

/** Visible projects expose unassigned team work, never another person's assignment. */
export function personalOrSharedWorkspaceTaskAccessWhere(
  userId: string,
  projectIds: string[] = [],
): Prisma.ActionItemWhereInput[] {
  return [
    { assignedUserId: userId },
    ...(projectIds.length ? [{ assignedUserId: null, projectId: { in: projectIds } }] : []),
    {
      assignedUserId: null,
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
      booking: { OR: [{ clientUserId: userId }, { coachUserId: userId }] },
    },
  ];
}
