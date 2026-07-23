import "server-only";

import type { PrismaClient } from "@prisma/client";

import { getPrismaClient } from "@/lib/prisma";
import { ensureHomeNestForEmail } from "@/lib/server/home-nest";

export const QUIPSLY_FREE_PLAN_SLUG = "quipsly-free";

export type QuipslyStarterStateReceipt = {
  homeNest: Awaited<ReturnType<typeof ensureHomeNestForEmail>>;
  freePlanSlug: typeof QUIPSLY_FREE_PLAN_SLUG;
  freeMembershipStatus: "ACTIVE";
  freeMembershipCreated: boolean;
};

export async function ensureQuipslyStarterStateForUser(input: {
  userId: string;
  email: string;
  prisma?: PrismaClient;
}): Promise<QuipslyStarterStateReceipt> {
  const prisma = input.prisma ?? getPrismaClient();

  const freePlan = await prisma.membershipPlan.upsert({
    where: { slug: QUIPSLY_FREE_PLAN_SLUG },
    create: {
      slug: QUIPSLY_FREE_PLAN_SLUG,
      name: "Quipsly Free",
      description: "Free starter access for writing, notes, Home Nest intake, and beta exploration.",
      priceCents: 0,
      billingIntervalMonths: null,
      isActive: true,
    },
    update: {
      name: "Quipsly Free",
      description: "Free starter access for writing, notes, Home Nest intake, and beta exploration.",
      priceCents: 0,
      isActive: true,
    },
    select: { id: true },
  });

  const activeMembership = await prisma.membership.findFirst({
    where: {
      userId: input.userId,
      planId: freePlan.id,
      status: "ACTIVE",
      OR: [{ endsAt: null }, { endsAt: { gt: new Date() } }],
    },
    select: { id: true },
  });

  if (!activeMembership) {
    await prisma.membership.create({
      data: {
        userId: input.userId,
        planId: freePlan.id,
        status: "ACTIVE",
        notes: "Automatically granted by Quipsly starter onboarding.",
      },
    });
  }

  const homeNest = await ensureHomeNestForEmail(input.email, prisma);

  return {
    homeNest,
    freePlanSlug: QUIPSLY_FREE_PLAN_SLUG,
    freeMembershipStatus: "ACTIVE",
    freeMembershipCreated: !activeMembership,
  };
}
