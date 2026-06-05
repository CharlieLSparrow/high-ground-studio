import { getPrismaClient } from "@/lib/prisma";

const prisma = getPrismaClient();

/**
 * Sweeps pending MembershipReconciliation records and applies them to the canonical
 * Membership table. Uses atomic transactions to prevent desync on failure.
 */
export async function grantPendingReconciliations() {
  const pendingReconciliations = await prisma.membershipReconciliation.findMany({
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
        const user = await prisma.user.findUnique({
          where: { primaryEmail: reconciliation.providerEmail.toLowerCase() }
        });
        
        if (user) {
          targetUserId = user.id;
          const newMembership = await prisma.membership.create({
            data: {
              userId: user.id,
              // Note: Assumes a MembershipPlan with slug 'free' exists. 
              // Hardcoding planId is a placeholder. Real code would query the catalog.
              planId: "cls_fallback_plan_id", 
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

        await tx.membershipReconciliation.update({
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
      await prisma.membershipReconciliation.update({
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
