import "server-only";
import type { Prisma } from "@prisma/client";
import { sessionMutationAccessWhere, type SessionAccessActor } from "./session-access";
import { coachingEngagementAccessWhere } from "./coaching-engagement";
import type { SessionWorkAssignmentContext } from "../session-work-assignment";

/** Assignment uses the existing client-space collaboration boundary, not a
 * new room roster or a search across unrelated customer accounts. Call inside
 * the write transaction too: the rendered roster is not authorization. */
export async function loadSessionWorkAssignmentContext(input: {
  prisma: Pick<Prisma.TransactionClient, "callRoom" | "coachingEngagement">; roomId: string; actor: SessionAccessActor;
}): Promise<SessionWorkAssignmentContext | null> {
  const room = await input.prisma.callRoom.findFirst({
    where: sessionMutationAccessWhere(input.roomId, input.actor),
    select: {coachingEngagementId: true},
  });
  if (!room?.coachingEngagementId) return null;
  const engagement = await input.prisma.coachingEngagement.findFirst({
    where: coachingEngagementAccessWhere(room.coachingEngagementId, input.actor, "write"),
    select: {id: true, members: {
      where: {status: "ACTIVE", role: {in: ["COACH", "CLIENT", "SUPPORT"]}},
      orderBy: {createdAt: "asc"},
      select: {userId: true, role: true, user: {select: {name: true, primaryEmail: true}}},
    }},
  });
  if (!engagement || !engagement.members.some(member => member.userId === input.actor.id)) return null;
  return {engagementId: engagement.id, currentUserId: input.actor.id,
    members: engagement.members.map(member => ({id: member.userId,
      label: member.user?.name || member.user?.primaryEmail || "Collaborator", role: member.role}))};
}
