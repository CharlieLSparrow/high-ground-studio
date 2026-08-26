import type { Prisma } from "@prisma/client";

/**
 * A coaching engagement is the durable private collaboration boundary. Primary
 * participants and active members may work with engagement-scoped notes,
 * tasks, and goals; project membership alone never grants this access.
 */
export function activeCoachingEngagementParticipantWhere(
  userId: string,
  access: "read" | "write" = "read",
): Prisma.CoachingEngagementWhereInput {
  return {
    status: "ACTIVE",
    members: { some: {
      userId,
      status: "ACTIVE",
      ...(access === "write" ? { role: { in: ["CLIENT", "COACH", "SUPPORT"] } } : {}),
    } },
  };
}

/** Booking access keeps pre-engagement coaching Sessions collaborative. */
function coachingBookingParticipantWhere(userId: string): Prisma.CoachingBookingWhereInput {
  return { OR: [{ clientUserId: userId }, { coachUserId: userId }] };
}

export function coachingTaskCollaborationAccessWhere(
  userId: string,
  access: "read" | "write" = "read",
): Prisma.ActionItemWhereInput[] {
  return [
    { engagement: { is: activeCoachingEngagementParticipantWhere(userId, access) } },
    { engagementId: null, booking: { is: coachingBookingParticipantWhere(userId) } },
  ];
}

export function personalOrSharedCoachingGoalAccessWhere(
  userId: string,
  access: "read" | "write" = "read",
): Prisma.GoalWhereInput[] {
  return [
    { ownerUserId: userId },
    { engagement: { is: activeCoachingEngagementParticipantWhere(userId, access) } },
    { engagementId: null, booking: { is: coachingBookingParticipantWhere(userId) } },
  ];
}
