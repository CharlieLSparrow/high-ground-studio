import "server-only";

import type { Prisma } from "@prisma/client";
import { coachingEngagementActorAccessWhere } from "./coaching-engagement";
import { sessionActorAccessWhere, type SessionAccessActor } from "./session-access";

/** Scheduling history is not a grant: current space and room access still apply. */
export function coachingBookingActorAccessWhere(
  actor: SessionAccessActor,
  options: { includeRoomCreator?: boolean } = {},
): Prisma.CoachingBookingWhereInput {
  if (typeof actor.id !== "string" || !actor.id.trim()) return { id: { in: [] } };
  if (actor.isStaff) return {};
  return {
    OR: [
      { clientUserId: actor.id },
      { coachUserId: actor.id },
      ...(options.includeRoomCreator ? [{ callRoom: { createdByUserId: actor.id } }] : []),
    ],
    AND: [
      { OR: [
        { engagementId: null },
        { engagement: coachingEngagementActorAccessWhere(actor) },
      ] },
      { OR: [
        { callRoom: null },
        { callRoom: coachingScheduleRoomActorAccessWhere(actor) },
      ] },
    ],
  };
}

export function coachingScheduleRoomActorAccessWhere(actor: SessionAccessActor): Prisma.CallRoomWhereInput {
  if (typeof actor.id !== "string" || !actor.id.trim()) return { id: { in: [] } };
  if (actor.isStaff) return {};
  return {
    AND: [
      sessionActorAccessWhere(actor),
      { participants: { none: { userId: actor.id, accessStatus: "REMOVED" } } },
    ],
  };
}
