import { NextResponse } from "next/server";
import { getPrismaClient } from "@/lib/prisma";
import {
  evaluatePatreonBetaAccess,
  QUIPSLY_BETA_PATREON_PLAN_SLUG,
} from "@/lib/patreon/betaAccess";

export async function POST(req: Request) {
  try {
    const authHeader = req.headers.get("authorization");
    const secret = process.env.PATREON_RECONCILE_SECRET;

    if (secret && authHeader !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

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
      where: { slug: QUIPSLY_BETA_PATREON_PLAN_SLUG },
      update: {
        description: "Granted to active paid Patreon supporters",
        isActive: true,
      },
      create: {
        name: "Quipsly Beta Access (Patreon)",
        slug: QUIPSLY_BETA_PATREON_PLAN_SLUG,
        description: "Granted to active paid Patreon supporters",
      },
    });

    for (const event of unprocessedEvents) {
      try {
        const payload = event.payloadSummaryJson as any;
        const email = payload?.data?.attributes?.email;
        const patronStatus = payload?.data?.attributes?.patron_status;
        const lastChargeStatus = payload?.data?.attributes?.last_charge_status;
        const currentlyEntitledAmountCents = payload?.data?.attributes?.currently_entitled_amount_cents;
        const willPayAmountCents = payload?.data?.attributes?.will_pay_amount_cents;
        const tierIds = (
          payload?.data?.relationships?.currently_entitled_tiers?.data || []
        )
          .map((tier: { id?: unknown }) => (typeof tier.id === "string" ? tier.id : null))
          .filter(Boolean) as string[];

        if (!email) {
          await prisma.worldHubProviderEvent.update({
            where: { id: event.id },
            data: { processingStatus: "NEEDS_REVIEW", errorMessage: "No email in payload" },
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

        const decision = evaluatePatreonBetaAccess({
          patronStatus,
          lastChargeStatus,
          currentlyEntitledAmountCents,
          willPayAmountCents,
          tierIds,
        });

        if (decision.eligible) {
          const existingMembership = await prisma.membership.findFirst({
            where: { userId: user.id, planId: betaPlan.id },
          });

          if (!existingMembership) {
            await prisma.membership.create({
              data: {
                userId: user.id,
                planId: betaPlan.id,
                status: "ACTIVE",
                notes: `Auto-granted via Patreon Event ${event.id}: ${decision.reasonCode}`,
              },
            });
          } else if (existingMembership.status !== "ACTIVE") {
            await prisma.membership.update({
              where: { id: existingMembership.id },
              data: {
                status: "ACTIVE",
                notes: `Restored via Patreon Event ${event.id}: ${decision.reasonCode}`,
              },
            });
          }
        } else if (decision.status === "EXPIRED") {
          // Revoke if they have an active membership
          const existingMembership = await prisma.membership.findFirst({
            where: { userId: user.id, planId: betaPlan.id, status: "ACTIVE" },
          });

          if (existingMembership) {
            await prisma.membership.update({
              where: { id: existingMembership.id },
              data: {
                status: "EXPIRED",
                notes: `Revoked via Patreon Event ${event.id}: ${decision.reasonCode}`,
              },
            });
          }
        }

        await prisma.worldHubProviderEvent.update({
          where: { id: event.id },
          data: {
            processingStatus: "PROCESSED",
            processedAt: new Date(),
            errorMessage: decision.eligible ? null : decision.reasonMessage,
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
