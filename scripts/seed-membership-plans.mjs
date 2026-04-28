import { prisma } from "../apps/web/src/lib/prisma.ts";
import {
  membershipPlanCatalog,
  syncMembershipPlans,
} from "../apps/web/src/lib/server/membership-plan-catalog.js";

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
