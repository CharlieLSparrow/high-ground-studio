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
      const [profile, coachMembership] = await Promise.all([
        prisma.coachProfile.findFirst({
          where: { userId: session.user.id, isActive: true },
          select: { id: true },
        }),
        prisma.coachingEngagementMember.findFirst({
          where: {
            userId: session.user.id,
            status: "ACTIVE",
            role: "COACH",
          },
          select: { id: true },
        }),
      ]);
      canSchedule = Boolean(profile || coachMembership);
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
