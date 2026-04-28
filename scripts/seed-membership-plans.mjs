import { PrismaClient } from "@prisma/client";

import {
  membershipPlanCatalog,
  syncMembershipPlans,
} from "../apps/web/src/lib/server/membership-plan-catalog.js";

const prisma = new PrismaClient();

async function main() {
  await syncMembershipPlans(prisma);

  console.log("Membership plans synced:");
  for (const plan of membershipPlanCatalog) {
    console.log(`- ${plan.slug}: ${plan.name}`);
  }
}

main()
  .catch((error) => {
    console.error("Failed to sync membership plans.");
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
