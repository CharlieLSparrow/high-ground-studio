import { NextResponse } from "next/server";
import { getPrismaClient } from "@/lib/prisma";

export async function POST() {
  try {
    const prisma = getPrismaClient();

    const unprocessedEvents = await prisma.worldHubProviderEvent.findMany({
      where: {
        processingStatus: "UNPROCESSED",
        connection: {
          providerKey: "patreon_main",
        },
      },
      take: 50,
      orderBy: { receivedAt: "asc" },
    });

    if (unprocessedEvents.length === 0) {
      return NextResponse.json({ ok: true, processed: 0 });
    }

    // Ensure the Quipsly Beta plan exists in the catalog
    const betaPlan = await prisma.membershipPlan.upsert({
      where: { slug: "quipsly-beta-patreon" },
      update: {},
      create: {
        name: "Quipsly Beta Access (Patreon)",
        slug: "quipsly-beta-patreon",
        description: "Granted via Patreon Webhooks",
      },
    });

    for (const event of unprocessedEvents) {
      try {
        const payload = event.payloadSummaryJson as any;
        const email = payload?.data?.attributes?.email;
        const patronStatus = payload?.data?.attributes?.patron_status;

        if (!email) {
          await prisma.worldHubProviderEvent.update({
            where: { id: event.id },
            data: { processingStatus: "SKIPPED", errorMessage: "No email in payload" },
          });
          continue;
        }

        const normalizedEmail = email.trim().toLowerCase();

        // 1. Ensure user exists
        let user = await prisma.user.findFirst({
          where: {
            OR: [
              { primaryEmail: normalizedEmail },
              { aliases: { some: { email: normalizedEmail } } },
            ],
          },
        });

        if (!user) {
          user = await prisma.user.create({
            data: {
              primaryEmail: normalizedEmail,
              name: payload?.data?.attributes?.full_name || null,
            },
          });
        }

        // 2. Grant or Revoke based on status
        // Usually, 'active_patron' means they are currently paying
        const isEligible = patronStatus === "active_patron";

        if (isEligible) {
          const existingMembership = await prisma.membership.findFirst({
            where: { userId: user.id, planId: betaPlan.id },
          });

          if (!existingMembership) {
            await prisma.membership.create({
              data: {
                userId: user.id,
                planId: betaPlan.id,
                status: "ACTIVE",
                notes: `Auto-granted via Patreon Event ${event.id}`,
              },
            });
          } else if (existingMembership.status !== "ACTIVE") {
            await prisma.membership.update({
              where: { id: existingMembership.id },
              data: { status: "ACTIVE" },
            });
          }
        } else {
          // Revoke if they have an active membership
          const existingMembership = await prisma.membership.findFirst({
            where: { userId: user.id, planId: betaPlan.id, status: "ACTIVE" },
          });
          
          if (existingMembership) {
            await prisma.membership.update({
              where: { id: existingMembership.id },
              data: { status: "EXPIRED", notes: `Revoked via Patreon Event ${event.id}` },
            });
          }
        }

        await prisma.worldHubProviderEvent.update({
          where: { id: event.id },
          data: {
            processingStatus: "PROCESSED",
            processedAt: new Date(),
          },
        });
      } catch (err: any) {
        console.error(`[Patreon Reconcile] Failed on event ${event.id}:`, err);
        await prisma.worldHubProviderEvent.update({
          where: { id: event.id },
          data: {
            processingStatus: "ERROR",
            errorMessage: err.message || "Unknown error",
            retryCount: { increment: 1 },
          },
        });
      }
    }

    return NextResponse.json({ ok: true, processed: unprocessedEvents.length });
  } catch (error) {
    console.error("[Patreon Reconcile] Fatal error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
