import Stripe from "stripe";
import { prisma } from "@/lib/prisma";
import { ensureWorldHubProviderConnection } from "@/lib/server/worldhub-integrations";

// We use an empty string fallback so it doesn't crash at build time if env is missing
export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "", {
  apiVersion: "2026-05-27.dahlia" as any,
  appInfo: {
    name: "High Ground Odyssey WorldHub",
  },
});

export async function createStripeCheckoutSession({
  offerId,
  userEmail,
  userId,
  successUrl,
  cancelUrl,
}: {
  offerId: string;
  userEmail?: string | null;
  userId?: string | null;
  successUrl: string;
  cancelUrl: string;
}) {
  const offer = await prisma.worldHubOffer.findUnique({
    where: { id: offerId },
  });

  if (!offer) {
    throw new Error("Offer not found.");
  }

  // Assuming priceRefsJson has a default Stripe price ID, or we use standard pricing format
  // For now, if priceRefsJson has a string 'stripePriceId', we use it, otherwise we create an ad-hoc price.
  // In a robust implementation, WorldHubOffer would map to Stripe Products/Prices.
  const priceRefs = offer.priceRefsJson as any;
  const stripePriceId = priceRefs?.stripePriceId;

  if (!stripePriceId) {
    throw new Error("Offer does not have a configured Stripe price ID.");
  }

  const session = await stripe.checkout.sessions.create({
    payment_method_types: ["card"],
    mode: "payment",
    customer_email: userEmail || undefined,
    client_reference_id: userId || undefined,
    metadata: {
      offerId: offer.id,
      userId: userId || "",
    },
    line_items: [
      {
        price: stripePriceId,
        quantity: 1,
      },
    ],
    success_url: successUrl,
    cancel_url: cancelUrl,
  });

  return {
    checkoutUrl: session.url,
    sessionId: session.id,
  };
}

export async function processStripeWebhookEvent(providerEventId: string, payload: Stripe.Event) {
  const providerEvent = await prisma.worldHubProviderEvent.findUnique({
    where: { id: providerEventId },
  });

  if (!providerEvent) {
    return;
  }

  if (payload.type === "checkout.session.completed") {
    const session = payload.data.object as Stripe.Checkout.Session;
    
    const offerId = session.metadata?.offerId;
    const userId = session.metadata?.userId || session.client_reference_id || null;
    const email = session.customer_details?.email || session.customer_email || null;
    
    // Upsert the order based on the stripe session ID
    await prisma.worldHubOrder.upsert({
      where: {
        orderNumber: `stripe_${session.id}`,
      },
      create: {
        orderNumber: `stripe_${session.id}`,
        ownerUserId: userId,
        email: email,
        status: session.payment_status === "paid" ? "paid" : "pending",
        currency: (session.currency || "USD").toUpperCase(),
        subtotalCents: session.amount_subtotal || 0,
        totalCents: session.amount_total || 0,
        checkoutMode: "stripe_hosted",
        providerConnectionId: providerEvent.connectionId,
        providerRefsJson: {
          stripeSessionId: session.id,
          stripePaymentIntentId: session.payment_intent as string | null,
          stripeCustomerId: session.customer as string | null,
          offerId: offerId,
        },
        lineItemsJson: offerId ? [{ offerId, quantity: 1 }] : [],
        paidAt: session.payment_status === "paid" ? new Date() : null,
      },
      update: {
        status: session.payment_status === "paid" ? "paid" : "pending",
        paidAt: session.payment_status === "paid" ? new Date() : undefined,
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
    // Other event types get ignored for now
    await prisma.worldHubProviderEvent.update({
      where: { id: providerEventId },
      data: {
        processingStatus: "ignored",
        processedAt: new Date(),
      },
    });
  }
}
