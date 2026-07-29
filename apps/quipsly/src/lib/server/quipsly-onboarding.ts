import "server-only";

import type { PrismaClient } from "@prisma/client";

import { getPrismaClient } from "@/lib/prisma";
import {
  ensureHomeNestForEmail,
  ensureHomeNestForEmailInTransaction,
} from "@/lib/server/home-nest";
import { acquirePrismaAdvisoryTransactionLock } from "@/lib/server/prisma-advisory-lock";

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

  return prisma.$transaction(async (transaction) => {
    // Make initial provisioning exactly-once for this Quipsly person even when
    // multiple browser tabs or native clients complete sign-in together.
    await acquirePrismaAdvisoryTransactionLock(
      transaction,
      `quipsly:starter:${input.userId}`,
    );

    const freePlan = await transaction.membershipPlan.upsert({
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

    const activeMembership = await transaction.membership.findFirst({
      where: {
        userId: input.userId,
        planId: freePlan.id,
        status: "ACTIVE",
        OR: [{ endsAt: null }, { endsAt: { gt: new Date() } }],
      },
      select: { id: true },
    });

    if (!activeMembership) {
      await transaction.membership.create({
        data: {
          userId: input.userId,
          planId: freePlan.id,
          status: "ACTIVE",
          notes: "Automatically granted by Quipsly starter onboarding.",
        },
      });
    }

    const homeNest = await ensureHomeNestForEmailInTransaction(
      input.email,
      transaction,
    );

    return {
      homeNest,
      freePlanSlug: QUIPSLY_FREE_PLAN_SLUG,
      freeMembershipStatus: "ACTIVE",
      freeMembershipCreated: !activeMembership,
    };
  });
}
