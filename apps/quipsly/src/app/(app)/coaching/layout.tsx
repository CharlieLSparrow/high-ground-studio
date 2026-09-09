import type { ReactNode } from "react";

import { CoachingSuiteNav } from "@/components/coaching-suite-nav";
import { getPrismaClient } from "@/lib/prisma";
import { getQuipslySession } from "@/lib/server/quipsly-session";

export default async function CoachingLayout({
  children,
}: {
  children: ReactNode;
}) {
  const session = await getQuipslySession();
  let canSchedule = session?.user?.isStaff === true;
  if (session?.user && !canSchedule) {
    try {
      const prisma = getPrismaClient();
      const [profile, memberships] = await Promise.all([
        prisma.coachProfile.findFirst({
          where: { userId: session.user.id, isActive: true },
          select: { id: true },
        }),
        prisma.coachingEngagementMember.findMany({
          where: {
            userId: session.user.id,
            status: "ACTIVE",
          },
          select: { role: true },
          distinct: ["role"],
        }),
      ]);
      // A first-time coach has no profile or client relationship yet. Do not
      // hide the entry to creating one behind the very setup it begins.
      canSchedule = Boolean(profile || memberships.length === 0 || memberships.some(member => member.role === "COACH"));
    } catch {
      // Navigation remains usable when database readiness is temporarily held.
      // The coaching runway owns the visible retry/error state.
    }
  }
  return (
    <div className="min-h-full bg-[#f5efe4]">
      <CoachingSuiteNav canSchedule={canSchedule} />
      {children}
    </div>
  );
}
