import { prisma } from "@/lib/prisma";

export async function processPatreonWebhookEvent(providerEventId: string, payload: any) {
  const providerEvent = await prisma.worldHubProviderEvent.findUnique({
    where: { id: providerEventId },
  });

  if (!providerEvent) {
    return;
  }
  const eventType = providerEvent.eventType;

  // Patreon webhook event types generally include members:create, members:update, members:delete, members:pledge:create, etc.
  if (eventType.startsWith("members:") || eventType.startsWith("pledges:")) {
    const data = payload.data;
    const attributes = data?.attributes || {};
    const email = attributes.email;
    const patreonMemberId = data?.id;

    if (!email) {
      // Cannot reconcile without an email
      await prisma.worldHubProviderEvent.update({
        where: { id: providerEventId },
        data: {
          processingStatus: "ignored",
          processedAt: new Date(),
          errorMessage: "Missing email in Patreon payload",
        },
      });
      return;
    }

    // Try to find the user to reconcile access
    const user = await prisma.user.findFirst({
      where: {
        OR: [
          { primaryEmail: email },
          { aliases: { some: { email } } }
        ]
      }
    });

    if (user) {
      if (attributes.patron_status === "active_patron") {
        await prisma.userRole.upsert({
          where: {
            userId_role: {
              userId: user.id,
              role: "NETWORK_PASS",
            },
          },
          create: {
            userId: user.id,
            role: "NETWORK_PASS",
          },
          update: {},
        });
      } else {
        await prisma.userRole.deleteMany({
          where: {
            userId: user.id,
            role: "NETWORK_PASS",
          },
        });
      }
    }

    // Create a WorldHubOrder record to represent the ongoing pledge or subscription state
    // Patreon typically acts as a recurring subscription rather than discrete orders,
    // but mapping it to WorldHubOrder enables WorldHub metrics.
    await prisma.worldHubOrder.upsert({
      where: {
        orderNumber: `patreon_${patreonMemberId}`,
      },
      create: {
        orderNumber: `patreon_${patreonMemberId}`,
        ownerUserId: user?.id || null,
        email: email,
        status: attributes.patron_status === "active_patron" ? "paid" : "pending",
        currency: (attributes.pledge_relationship_currency || "USD").toUpperCase(),
        subtotalCents: attributes.currently_entitled_amount_cents || 0,
        totalCents: attributes.currently_entitled_amount_cents || 0,
        checkoutMode: "patreon_pledge",
        providerConnectionId: providerEvent.connectionId,
        providerRefsJson: {
          patreonMemberId,
          patreonStatus: attributes.patron_status,
          lifetimeSupportCents: attributes.lifetime_support_cents,
        },
        lineItemsJson: [],
        paidAt: attributes.patron_status === "active_patron" ? new Date() : null,
      },
      update: {
        ownerUserId: user?.id || undefined,
        status: attributes.patron_status === "active_patron" ? "paid" : "pending",
        subtotalCents: attributes.currently_entitled_amount_cents || undefined,
        totalCents: attributes.currently_entitled_amount_cents || undefined,
        providerRefsJson: {
          patreonMemberId,
          patreonStatus: attributes.patron_status,
          lifetimeSupportCents: attributes.lifetime_support_cents,
        },
        paidAt: attributes.patron_status === "active_patron" ? new Date() : null,
      },
    });

    await prisma.worldHubProviderEvent.update({
      where: { id: providerEventId },
      data: {
        processingStatus: "processed",
        processedAt: new Date(),
      },
    });
  } else {
    // Other event types get ignored
    await prisma.worldHubProviderEvent.update({
      where: { id: providerEventId },
      data: {
        processingStatus: "ignored",
        processedAt: new Date(),
      },
    });
  }
}
