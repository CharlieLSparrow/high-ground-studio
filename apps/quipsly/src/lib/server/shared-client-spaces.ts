import "server-only";
import type { PrismaClient } from "@prisma/client";
import { coachingEngagementActorAccessWhere } from "./coaching-engagement";

/** A personal navigation projection, not a new access or workspace model.
 * Support/admin visibility never populates somebody's ordinary work list.
 */
export async function listSharedClientSpaces(prisma: Pick<PrismaClient, "coachingEngagement">, userId: string) {
  if (!userId.trim()) return { spaces: [], hasMore: false };
  const rows = await prisma.coachingEngagement.findMany({
    where: { status: "ACTIVE", AND: [coachingEngagementActorAccessWhere({ id: userId }, "read")] },
    orderBy: [{ updatedAt: "desc" }, { id: "asc" }], take: 7,
    select: {
      id: true, title: true,
      members: { where: { status: "ACTIVE", userId: { not: userId } }, orderBy: { joinedAt: "asc" }, take: 3,
        select: { role: true, user: { select: { name: true } } } },
    },
  });
  return {
    spaces: rows.slice(0, 6).map(row => ({
      id: row.id, title: row.title,
      people: row.members.map(member => member.user.name?.trim()
        || (member.role === "COACH" ? "Your coach" : member.role === "CLIENT" ? "Your client" : "Collaborator")),
      href: `/coaching/engagements/${encodeURIComponent(row.id)}`,
    })),
    hasMore: rows.length > 6,
  };
}

export type SharedClientSpaceList = Awaited<ReturnType<typeof listSharedClientSpaces>>;
