import { getPrismaClient } from "@/lib/prisma";
import { QUIPSLY_BETA_PATREON_PLAN_SLUG } from "@/lib/patreon/betaAccess";

const prisma = getPrismaClient();

/**
 * Sweeps pending EntitlementLedger records and applies them to the canonical
 * Membership table. Uses atomic transactions to prevent desync on failure.
 */
export async function grantPendingReconciliations() {
  const pendingReconciliations = await prisma.entitlementLedger.findMany({
    where: { status: "pending" },
    include: {
      membership: true,
      event: true
    }
  });

  if (pendingReconciliations.length === 0) return 0;

  let successCount = 0;

  for (const reconciliation of pendingReconciliations) {
    try {
      let targetUserId: string | null = null;
      let targetMembershipId = reconciliation.membershipId;

      if (!targetMembershipId) {
        if (!reconciliation.providerEmail) continue;
        const user = await prisma.user.findUnique({
          where: { primaryEmail: reconciliation.providerEmail.toLowerCase() }
        });
        
        if (user) {
          targetUserId = user.id;

          // Find the proper plan ID for the beta patreon plan
          const betaPlan = await prisma.membershipPlan.findUnique({
            where: { slug: QUIPSLY_BETA_PATREON_PLAN_SLUG }
          });

          if (!betaPlan) {
            throw new Error(`Critical: MembershipPlan with slug '${QUIPSLY_BETA_PATREON_PLAN_SLUG}' not found.`);
          }

          const newMembership = await prisma.membership.create({
            data: {
              userId: user.id,
              planId: betaPlan.id, 
              status: "ACTIVE"
            }
          });
          targetMembershipId = newMembership.id;
        } else {
          continue; // Leave pending
        }
      }

      if (!targetMembershipId) continue;

      // ATOMIC TRANSACTION: Ensure membership update and reconciliation status update happen together
      await prisma.$transaction(async (tx: any) => {
        if (reconciliation.action === "revoke") {
          await tx.membership.update({
            where: { id: targetMembershipId! },
            // In a real app with strict plans, we might pause or switch to a free plan ID here
            data: { status: "CANCELED" } 
          });
        } else {
          // Grant or Modify (Stubbed data modification)
          await tx.membership.update({
            where: { id: targetMembershipId! },
            data: { status: "ACTIVE" }
          });
        }

        await tx.entitlementLedger.update({
          where: { id: reconciliation.id },
          data: { 
            status: "applied",
            membershipId: targetMembershipId
          }
        });
      });

      successCount++;
    } catch (err) {
      console.error(`[Membership Granter] Failed to apply reconciliation ${reconciliation.id}:`, err);
      await prisma.entitlementLedger.update({
        where: { id: reconciliation.id },
        data: { 
          status: "failed",
          note: `Transaction failed: ${err instanceof Error ? err.message : "Unknown error"}`
        }
      });
    }
  }

  return successCount;
}
