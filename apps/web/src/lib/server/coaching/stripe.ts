import Stripe from "stripe";
import type { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";

const LIVE_STRIPE_GUARD = "ALLOW_LIVE_COACHING_STRIPE";

function getStripeClient() {
  const secretKey = process.env.STRIPE_SECRET_KEY;

  if (!secretKey) {
    throw new Error("STRIPE_SECRET_KEY is not configured.");
  }

  const livemode = secretKey.startsWith("sk_live_");

  if (livemode && process.env[LIVE_STRIPE_GUARD] !== "true") {
    throw new Error(
      `Live coaching Stripe is disabled. Set ${LIVE_STRIPE_GUARD}=true only after an explicit launch approval.`,
    );
  }

  return {
    stripe: new Stripe(secretKey),
    livemode,
  };
}

function absoluteUrl(value: string | undefined, fallbackPath: string) {
  if (value?.startsWith("http://") || value?.startsWith("https://")) {
    return value;
  }

  const baseUrl =
    process.env.NEXT_PUBLIC_NEST_BASE_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.APP_URL ||
    "http://localhost:3012";

  return new URL(value || fallbackPath, baseUrl).toString();
}

function safeCents(value: unknown) {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return null;
  }

  return Math.round(value);
}

export type CreateCoachingCheckoutInput = {
  bookingId: string;
  successUrl?: string;
  cancelUrl?: string;
};

export type CreateCoachingCustomerPortalInput = {
  userId?: string;
  stripeCustomerId?: string;
  returnUrl?: string;
};

export async function createCoachingCheckoutSession(input: CreateCoachingCheckoutInput) {
  const { stripe, livemode } = getStripeClient();

  const booking = await prisma.coachingBooking.findUnique({
    where: { id: input.bookingId },
    include: {
      clientUser: true,
      offering: true,
      paymentRecord: true,
    },
  });

  if (!booking) {
    throw new Error("Coaching booking was not found.");
  }

  if (booking.paymentPolicy !== "PAID_ONE_TO_ONE") {
    throw new Error("This booking is not configured as paid one-to-one coaching.");
  }

  if (booking.paymentRecord?.status === "PAID") {
    throw new Error("This booking is already paid.");
  }

  const amountCents = safeCents(booking.offering?.priceCents);

  if (!booking.offering?.stripePriceId && !amountCents) {
    throw new Error("Paid coaching requires either a Stripe price ID or a positive priceCents value.");
  }

  const customerEmail = booking.clientUser.primaryEmail;

  if (!customerEmail) {
    throw new Error("Paid coaching checkout requires the client user to have a primary email.");
  }

  const paymentRecord =
    booking.paymentRecord ||
    (await prisma.paymentRecord.create({
      data: {
        userId: booking.clientUserId,
        amountCents: amountCents || 0,
        currency: booking.offering?.currency || "USD",
        description: booking.offering?.title || "Quipsly coaching session",
        metadataJson: {
          bookingId: booking.id,
          offeringId: booking.offeringId,
          source: "coaching-checkout",
        },
      },
    }));

  if (!booking.paymentRecordId) {
    await prisma.coachingBooking.update({
      where: { id: booking.id },
      data: {
        paymentRecordId: paymentRecord.id,
        status: "HOLDING_PAYMENT",
      },
    });
  }

  try {
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      customer_creation: "always",
      customer_email: customerEmail,
      line_items: [
        booking.offering?.stripePriceId
          ? {
              price: booking.offering.stripePriceId,
              quantity: 1,
            }
          : {
              quantity: 1,
              price_data: {
                currency: booking.offering?.currency || "USD",
                unit_amount: amountCents || 0,
                product_data: {
                  name: booking.offering?.title || "Quipsly coaching session",
                  description: booking.offering?.description || undefined,
                },
              },
            },
      ],
      success_url: absoluteUrl(input.successUrl, `/team/coaching/bookings/${booking.id}?checkout=success`),
      cancel_url: absoluteUrl(input.cancelUrl, `/team/coaching/bookings/${booking.id}?checkout=cancel`),
      metadata: {
        productSurface: "quipsly-coaching",
        bookingId: booking.id,
        paymentRecordId: paymentRecord.id,
        clientUserId: booking.clientUserId,
      },
    });

    await prisma.$transaction([
      prisma.paymentRecord.update({
        where: { id: paymentRecord.id },
        data: {
          providerCustomerId:
            typeof session.customer === "string" ? session.customer : session.customer?.id,
          providerCheckoutSessionId: session.id,
          status: "PENDING",
          metadataJson: {
            bookingId: booking.id,
            offeringId: booking.offeringId,
            checkoutSessionId: session.id,
            source: "coaching-checkout",
          },
        },
      }),
      prisma.stripeCheckoutSessionLedger.create({
        data: {
          bookingId: booking.id,
          paymentRecordId: paymentRecord.id,
          checkoutSessionId: session.id,
          mode: session.mode || "payment",
          status: session.status || "created",
          url: session.url,
          livemode,
          expiresAt: session.expires_at ? new Date(session.expires_at * 1000) : null,
          rawJson: session as unknown as Prisma.InputJsonValue,
          metadataJson: {
            bookingId: booking.id,
            offeringId: booking.offeringId,
            source: "coaching-checkout",
          },
        },
      }),
    ]);

    return {
      checkoutSessionId: session.id,
      url: session.url,
      livemode,
      bookingId: booking.id,
      paymentRecordId: paymentRecord.id,
    };
  } catch (error) {
    await prisma.paymentRecord.update({
      where: { id: paymentRecord.id },
      data: {
        status: "FAILED",
        metadataJson: {
          bookingId: booking.id,
          offeringId: booking.offeringId,
          source: "coaching-checkout",
          error: error instanceof Error ? error.message : "Unknown Stripe checkout error",
        },
      },
    });

    throw error;
  }
}

export async function createCoachingCustomerPortalSession(input: CreateCoachingCustomerPortalInput) {
  if (process.env.COACHING_CUSTOMER_PORTAL_ENABLED !== "true") {
    throw new Error(
      "Coaching customer portal is disabled. Set COACHING_CUSTOMER_PORTAL_ENABLED=true only for controlled test-mode/internal flows.",
    );
  }

  const { stripe, livemode } = getStripeClient();
  let stripeCustomerId = input.stripeCustomerId || null;

  const user = input.userId
    ? await prisma.user.findUnique({
        where: { id: input.userId },
        select: { id: true, primaryEmail: true },
      })
    : null;

  if (input.userId && !user) {
    throw new Error("The requested Quipsly user was not found for Stripe portal access.");
  }

  if (!stripeCustomerId && input.userId) {
    const existingLink = await prisma.stripeCustomerLink.findFirst({
      where: {
        userId: input.userId,
        livemode,
      },
      orderBy: { updatedAt: "desc" },
    });

    stripeCustomerId = existingLink?.stripeCustomerId || null;
  }

  if (!stripeCustomerId && input.userId) {
    const paymentEvidence = await prisma.paymentRecord.findFirst({
      where: {
        userId: input.userId,
        provider: "stripe",
        providerCustomerId: { not: null },
      },
      orderBy: { updatedAt: "desc" },
      select: { providerCustomerId: true },
    });

    stripeCustomerId = paymentEvidence?.providerCustomerId || null;
  }

  if (!stripeCustomerId) {
    throw new Error(
      "Stripe Customer Portal requires an existing Stripe customer from completed checkout or reconciled payment evidence.",
    );
  }

  const session = await stripe.billingPortal.sessions.create({
    customer: stripeCustomerId,
    return_url: absoluteUrl(input.returnUrl, "/team/coaching-capture?portal=returned"),
  });

  if (user) {
    await prisma.stripeCustomerLink.upsert({
      where: { stripeCustomerId },
      update: {
        userId: user.id,
        livemode,
        metadataJson: {
          source: "coaching-customer-portal",
          lastPortalSessionId: session.id,
        },
      },
      create: {
        userId: user.id,
        stripeCustomerId,
        livemode,
        metadataJson: {
          source: "coaching-customer-portal",
          firstPortalSessionId: session.id,
        },
      },
    });
  }

  return {
    portalSessionId: session.id,
    url: session.url,
    stripeCustomerId,
    livemode,
  };
}

export async function recordCoachingStripeWebhook(rawBody: string, signature: string | null) {
  const webhookSecret = process.env.STRIPE_COACHING_WEBHOOK_SECRET || process.env.STRIPE_WEBHOOK_SECRET;
  const { stripe, livemode } = getStripeClient();

  if (!signature) {
    throw new Error("Missing Stripe signature header.");
  }

  if (!webhookSecret) {
    throw new Error("STRIPE_COACHING_WEBHOOK_SECRET is not configured.");
  }

  const event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);

  const webhookRecord = await prisma.stripeWebhookEvent.upsert({
    where: { externalEventId: event.id },
    update: {
      eventType: event.type,
      livemode: event.livemode ?? livemode,
      verificationStatus: "verified",
      processingStatus: "received",
      payloadJson: event as unknown as Prisma.InputJsonValue,
      occurredAt: event.created ? new Date(event.created * 1000) : null,
      errorMessage: null,
      retryCount: { increment: 1 },
    },
    create: {
      externalEventId: event.id,
      eventType: event.type,
      livemode: event.livemode ?? livemode,
      verificationStatus: "verified",
      processingStatus: "received",
      payloadJson: event as unknown as Prisma.InputJsonValue,
      occurredAt: event.created ? new Date(event.created * 1000) : null,
    },
  });

  try {
    if (event.type === "checkout.session.completed" || event.type === "checkout.session.expired") {
      const session = event.data.object as Stripe.Checkout.Session;
      const ledger = await prisma.stripeCheckoutSessionLedger.findUnique({
        where: { checkoutSessionId: session.id },
      });
      const stripeCustomerId =
        typeof session.customer === "string" ? session.customer : session.customer?.id;
      const stripePaymentIntentId =
        typeof session.payment_intent === "string"
          ? session.payment_intent
          : session.payment_intent?.id;

      if (ledger?.paymentRecordId) {
        await prisma.paymentRecord.update({
          where: { id: ledger.paymentRecordId },
          data: {
            status: event.type === "checkout.session.completed" ? "PAID" : "CANCELED",
            providerCustomerId: stripeCustomerId,
            providerPaymentIntentId: stripePaymentIntentId,
            paidAt: event.type === "checkout.session.completed" ? new Date() : null,
          },
        });
      }

      if (ledger?.bookingId) {
        const booking = await prisma.coachingBooking.update({
          where: { id: ledger.bookingId },
          data: {
            status: event.type === "checkout.session.completed" ? "CONFIRMED" : "CANCELED",
          },
          select: { clientUserId: true, offeringId: true },
        });

        if (event.type === "checkout.session.completed" && stripeCustomerId) {
          await prisma.stripeCustomerLink.upsert({
            where: { stripeCustomerId },
            update: {
              userId: booking.clientUserId,
              livemode: event.livemode ?? livemode,
              metadataJson: {
                source: "coaching-checkout-webhook",
                bookingId: ledger.bookingId,
                offeringId: booking.offeringId,
                checkoutSessionId: session.id,
                paymentRecordId: ledger.paymentRecordId,
              },
            },
            create: {
              userId: booking.clientUserId,
              stripeCustomerId,
              livemode: event.livemode ?? livemode,
              metadataJson: {
                source: "coaching-checkout-webhook",
                bookingId: ledger.bookingId,
                offeringId: booking.offeringId,
                checkoutSessionId: session.id,
                paymentRecordId: ledger.paymentRecordId,
              },
            },
          });
        }
      }

      await prisma.stripeCheckoutSessionLedger.update({
        where: { checkoutSessionId: session.id },
        data: {
          status: event.type === "checkout.session.completed" ? "completed" : "expired",
          rawJson: session as unknown as Prisma.InputJsonValue,
        },
      });
    }

    await prisma.stripeWebhookEvent.update({
      where: { id: webhookRecord.id },
      data: {
        processingStatus: "processed",
        processedAt: new Date(),
        errorMessage: null,
      },
    });
  } catch (error) {
    await prisma.stripeWebhookEvent.update({
      where: { id: webhookRecord.id },
      data: {
        processingStatus: "failed",
        errorMessage: error instanceof Error ? error.message : "Unknown webhook processing error",
      },
    });

    throw error;
  }

  return {
    eventId: event.id,
    eventType: event.type,
    webhookRecordId: webhookRecord.id,
  };
}
