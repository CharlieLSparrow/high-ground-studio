import type { Prisma } from "@prisma/client";

import { activeCoachingEngagementParticipantWhere, coachingBookingParticipantWhere, coachingTaskCollaborationAccessWhere } from "@/lib/server/coaching-work-access";
import { sessionActorAccessWhere, sessionMutationActorAccessWhere } from "./session-access";

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

function unassignedSessionAccess(userId: string, access: "read" | "write" = "read"): Prisma.ActionItemWhereInput[] {
  return [
    {
      assignedUserId: null,
      engagementId: null,
      room: access === "read" ? sessionActorAccessWhere({ id: userId }) : { OR: [
        // Session-only guests can read shared client-session tasks, but only
        // current client-space collaborators can change that shared work.
        { coachingEngagementId: null, AND: [sessionMutationActorAccessWhere({ id: userId })] },
        { coachingEngagement: { is: activeCoachingEngagementParticipantWhere(userId, "write") } },
      ] },
    },
    {
      assignedUserId: null,
      engagementId: null,
      booking: { is: coachingBookingParticipantWhere(userId, access) },
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
    ...unassignedSessionAccess(userId, access),
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
    ...(projectIds.length ? [{ assignedUserId: null, engagementId: null, AND: [
      { OR: [{ projectId: { in: projectIds } }, { room: { projectId: { in: projectIds } } }] },
      // A task's own engagement ID may be absent on manually created Session
      // work. Never treat its Nest ID as permission to enter the client space.
      { OR: [{ roomId: null }, { room: { coachingEngagementId: null,
        OR: [{ bookingId: null }, { booking: { engagementId: null } }] } }] },
      { OR: [{ bookingId: null }, { booking: { engagementId: null } }] },
    ] } satisfies Prisma.ActionItemWhereInput] : []),
    ...unassignedSessionAccess(userId),
  ]);
}
