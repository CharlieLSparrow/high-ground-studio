export const membershipPlanCatalog = [
  {
    slug: "single-session",
    name: "Single Session",
    description:
      "Internal/manual-only one-off coaching session. Keep off the public landing page.",
    priceCents: 6500,
    billingIntervalMonths: null,
    isActive: true,
  },
  {
    slug: "coaching-monthly-1",
    name: "1 Session / Month",
    description:
      "Public recurring coaching offer with one session each month.",
    priceCents: 5700,
    billingIntervalMonths: 1,
    isActive: true,
  },
  {
    slug: "coaching-monthly-2",
    name: "2 Sessions / Month",
    description:
      "Public recurring coaching offer with two sessions each month.",
    priceCents: 9700,
    billingIntervalMonths: 1,
    isActive: true,
  },
];

/**
 * @param {import("@prisma/client").PrismaClient} prisma
 */
export async function syncMembershipPlans(prisma) {
  for (const plan of membershipPlanCatalog) {
    await prisma.membershipPlan.upsert({
      where: {
        slug: plan.slug,
      },
      update: {
        name: plan.name,
        description: plan.description,
        priceCents: plan.priceCents,
        billingIntervalMonths: plan.billingIntervalMonths,
        isActive: plan.isActive,
      },
      create: plan,
    });
  }
}
