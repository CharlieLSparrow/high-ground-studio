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
      prisma.membershipReconciliation.count({ where: { status: "pending" } }),
      prisma.membershipReconciliation.count({ where: { status: "applied" } }),
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
    return await prisma.membershipReconciliation.findMany({
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
