import { Prisma } from "@prisma/client";
import { coachingEngagementAccessWhere } from "./coaching-engagement";
import type { SessionAccessActor } from "./session-access";

/** Membership is not permission to read or change explicitly personal work. */
export function sharedCoachingWorkVisibilityWhere() {
  return { OR: [
    ...["engagement-shared", "SESSION_SHARED", "SHARED"].map((visibility) => ({
      sourceJson: { path: ["visibility"], equals: visibility },
    })),
    // Older engagement-owned records predate per-item visibility.
    { sourceJson: { path: ["visibility"], equals: Prisma.AnyNull } },
  ] };
}

/** Show authorized shared tasks and the viewer's personal tasks from this
 * space's sessions. Context is not sharing: never rewrite engagementId
 * or infer access to another person's assigned work from room membership. */
export function coachingSpaceTaskWhere(engagementId: string, actor: SessionAccessActor,
  access: "read" | "write" = "read"): Prisma.ActionItemWhereInput {
  const engagement = { is: coachingEngagementAccessWhere(engagementId, actor, access) };
  return { OR: [
    { engagementId, engagement, ...sharedCoachingWorkVisibilityWhere() },
    {
      engagementId: null, bookingId: null, isNestShared: false,
      assignedUserId: actor.id,
      room: { is: { coachingEngagement: engagement } },
    },
  ] };
}

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

/** A booking inside a client space inherits its current membership. Only
 * bookings without a client space use their original coach/client pair. */
export function coachingBookingParticipantWhere(
  userId: string,
  access: "read" | "write" = "read",
): Prisma.CoachingBookingWhereInput {
  return { OR: [
    { engagement: { is: activeCoachingEngagementParticipantWhere(userId, access) } },
    { engagementId: null, OR: [{ clientUserId: userId }, { coachUserId: userId }] },
  ] };
}

export function coachingTaskCollaborationAccessWhere(
  userId: string,
  access: "read" | "write" = "read",
): Prisma.ActionItemWhereInput[] {
  return [
    { AND: [sharedCoachingWorkVisibilityWhere(), { engagement: { is: activeCoachingEngagementParticipantWhere(userId, access) } }] },
    { AND: [sharedCoachingWorkVisibilityWhere(), { engagementId: null, booking: { is: coachingBookingParticipantWhere(userId, access) } }] },
  ];
}

export function personalOrSharedCoachingGoalAccessWhere(
  userId: string,
  access: "read" | "write" = "read",
): Prisma.GoalWhereInput[] {
  return [
    { ownerUserId: userId },
    { AND: [sharedCoachingWorkVisibilityWhere(), { engagement: { is: activeCoachingEngagementParticipantWhere(userId, access) } }] },
    { AND: [sharedCoachingWorkVisibilityWhere(), { engagementId: null, booking: { is: coachingBookingParticipantWhere(userId, access) } }] },
  ];
}

/** Render edit controls from the same current policy used by mutations. */
export async function readEditableCoachingGoalIds(
  prisma: Pick<Prisma.TransactionClient, "goal">,
  userId: string,
  goalIds: string[],
): Promise<Set<string>> {
  if (!goalIds.length) return new Set();
  const rows = await prisma.goal.findMany({
    where: { id: { in: goalIds }, OR: personalOrSharedCoachingGoalAccessWhere(userId, "write") },
    select: { id: true },
  });
  return new Set(rows.map(row => row.id));
}
