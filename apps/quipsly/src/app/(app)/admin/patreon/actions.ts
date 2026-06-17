"use server";

import { getPrismaClient } from "@/lib/prisma";
import { requireQuipslyAdminActor } from "@/lib/server/user-management";

function emptyStats() {
  return {
    inbox: { unprocessed: 0, processed: 0, failed: 0 },
    reconciliations: { pending: 0, applied: 0 },
  };
}

export async function getAdminInboxStats() {
  await requireQuipslyAdminActor();

  if (!process.env.DATABASE_URL) return emptyStats();

  try {
    const prisma = getPrismaClient();
    const [unprocessedCount, processedCount, failedCount] = await Promise.all([
      prisma.worldHubProviderEvent.count({ where: { processingStatus: "UNPROCESSED" } }),
      prisma.worldHubProviderEvent.count({ where: { processingStatus: "PROCESSED" } }),
      prisma.worldHubProviderEvent.count({ where: { processingStatus: "FAILED" } }),
    ]);

    const [pendingReconciliations, appliedReconciliations] = await Promise.all([
      prisma.entitlementLedger.count({ where: { status: "pending" } }),
      prisma.entitlementLedger.count({ where: { status: "applied" } }),
    ]);

    return {
      inbox: { unprocessed: unprocessedCount, processed: processedCount, failed: failedCount },
      reconciliations: { pending: pendingReconciliations, applied: appliedReconciliations },
    };
  } catch (error) {
    console.error("[patreon-admin] could not load stats", error);
    return emptyStats();
  }
}

export async function getRecentInboxEvents() {
  await requireQuipslyAdminActor();

  if (!process.env.DATABASE_URL) return [];

  try {
    const prisma = getPrismaClient();
    return await prisma.worldHubProviderEvent.findMany({
      take: 10,
      orderBy: { createdAt: "desc" },
    });
  } catch (error) {
    console.error("[patreon-admin] could not load provider events", error);
    return [];
  }
}

export async function getRecentReconciliations() {
  await requireQuipslyAdminActor();

  if (!process.env.DATABASE_URL) return [];

  try {
    const prisma = getPrismaClient();
    return await prisma.entitlementLedger.findMany({
      take: 10,
      orderBy: { createdAt: "desc" },
      include: {
        membership: { include: { user: true } },
      },
    });
  } catch (error) {
    console.error("[patreon-admin] could not load reconciliations", error);
    return [];
  }
}

export async function getPendingBetaRequests() {
  await requireQuipslyAdminActor();

  if (!process.env.DATABASE_URL) return [];

  try {
    const prisma = getPrismaClient();
    
    // We only want unresolved requests. Since we don't have a status field, 
    // we fetch recent requests and filter out those that already have an ACTIVE beta membership.
    const requests = await prisma.companySupportRequest.findMany({
      where: { supportType: "beta_access_review" },
      orderBy: { createdAt: "desc" },
      take: 20,
    });

    // Simple heuristic: if the user now has an active membership, we don't show the request.
    const activeMemberships = await prisma.membership.findMany({
      where: {
        user: { primaryEmail: { in: requests.map(r => r.email) } },
        status: "ACTIVE"
      },
      include: { user: true }
    });

    const activeEmails = new Set(activeMemberships.map(m => m.user.primaryEmail.toLowerCase()));
    
    return requests.filter(r => !activeEmails.has(r.email.toLowerCase()));
  } catch (error) {
    console.error("[patreon-admin] could not load beta requests", error);
    return [];
  }
}

export async function grantManualOverride(email: string, eventId: string) {
  await requireQuipslyAdminActor();

  try {
    const prisma = getPrismaClient();
    
    // Create a pending reconciliation. The membershipGranter cron job will pick this up.
    await prisma.entitlementLedger.create({
      data: {
        provider: "admin_override",
        providerEmail: email,
        proposedTier: "manual-override",
        action: "grant",
        status: "pending",
        providerStatus: "manual_override",
        eventId: eventId, // Pass the request ID as the event ID for tracing
        note: `Manual override granted by admin`,
      }
    });

    return { success: true };
  } catch (error) {
    console.error("[patreon-admin] could not grant override", error);
    return { error: "Failed to grant override" };
  }
}
