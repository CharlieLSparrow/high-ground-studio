import "server-only";

import { createHash, createHmac, timingSafeEqual } from "crypto";

const LIVE_STRIPE_GUARD = "QUIPSLY_ALLOW_LIVE_STRIPE";
const STRIPE_API_BASE = "https://api.stripe.com/v1";

type StripeClientConfig = {
  secretKey: string;
  livemode: boolean;
};

type CreateCoachingCheckoutInput = {
  prisma: any;
  bookingId: string;
  actorUserId: string;
  actorIsStaff?: boolean;
  successUrl?: string;
  cancelUrl?: string;
};

type CreateCoachingCustomerPortalInput = {
  prisma: any;
  actorUserId: string;
  actorIsStaff: boolean;
  userId?: string;
  stripeCustomerId?: string;
  returnUrl?: string;
};

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function safeJson(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function getStripeConfig(): StripeClientConfig {
  const secretKey = text(process.env["STRIPE_SECRET_KEY"]);
  if (!secretKey) {
    throw new Error("STRIPE_SECRET_KEY is not configured.");
  }

  const livemode = secretKey.startsWith("sk_live_");
  if (livemode && process.env[LIVE_STRIPE_GUARD] !== "true") {
    throw new Error(
      `Live coaching Stripe is disabled. Set ${LIVE_STRIPE_GUARD}=true only after explicit launch approval.`,
    );
  }

  return { secretKey, livemode };
}

function appBaseUrl() {
  return (
    text(process.env.NEXT_PUBLIC_NEST_BASE_URL) ||
    text(process.env.NEXT_PUBLIC_APP_URL) ||
    text(process.env.APP_URL) ||
    "https://nest.quipsly.com"
  );
}

function absoluteUrl(value: string | undefined, fallbackPath: string) {
  if (value?.startsWith("http://") || value?.startsWith("https://")) return value;
  return new URL(value || fallbackPath, appBaseUrl()).toString();
}

function amountCents(value: unknown) {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return null;
  return Math.round(value);
}

function stripeAuthHeader(secretKey: string) {
  return `Bearer ${secretKey}`;
}

async function stripePost(config: StripeClientConfig, path: string, params: URLSearchParams) {
  const response = await fetch(`${STRIPE_API_BASE}${path}`, {
    method: "POST",
    headers: {
      Authorization: stripeAuthHeader(config.secretKey),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: params,
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const message = text(payload?.error?.message) || `Stripe request failed with HTTP ${response.status}.`;
    throw new Error(message);
  }

  return payload;
}

function appendMetadata(params: URLSearchParams, metadata: Record<string, string | null | undefined>) {
  for (const [key, value] of Object.entries(metadata)) {
    if (value) params.set(`metadata[${key}]`, value);
  }
}

function payloadHash(rawBody: string) {
  return createHash("sha256").update(rawBody).digest("hex");
}

export async function createQuipslyCoachingCheckoutSession(input: CreateCoachingCheckoutInput) {
  const config = getStripeConfig();
  const booking = await input.prisma.coachingBooking.findUnique({
    where: { id: input.bookingId },
    include: {
      clientUser: true,
      coachUser: true,
      offering: true,
      paymentRecord: true,
    },
  });

  if (!booking) throw new Error("Coaching booking was not found.");
  if (!input.actorIsStaff && ![booking.clientUserId, booking.coachUserId].includes(input.actorUserId)) {
    throw new Error("You can only create coaching checkout for sessions you are part of.");
  }
  if (booking.paymentPolicy !== "PAID_ONE_TO_ONE") {
    throw new Error("Stripe checkout is only allowed for paid one-to-one coaching bookings.");
  }
  if (booking.offering?.kind && booking.offering.kind !== "ONE_TO_ONE_COACHING") {
    throw new Error("This Stripe checkout path is limited to one-to-one coaching, not groups, courses, libraries, or SaaS.");
  }
  if (booking.paymentRecord?.status === "PAID") {
    throw new Error("This coaching booking already has paid Stripe evidence.");
  }

  const cents = amountCents(booking.paymentRecord?.amountCents) || amountCents(booking.offering?.priceCents);
  if (!booking.offering?.stripePriceId && !cents) {
    throw new Error("Paid coaching checkout requires a Stripe price ID or a positive amount.");
  }
  if (!booking.clientUser?.primaryEmail) {
    throw new Error("Paid coaching checkout requires a client email.");
  }

  const paymentRecord =
    booking.paymentRecord ||
    (await input.prisma.paymentRecord.create({
      data: {
        userId: booking.clientUserId,
        provider: "stripe",
        status: "PENDING",
        amountCents: cents || 0,
        currency: booking.offering?.currency || "USD",
        description: booking.offering?.title || "Quipsly coaching session",
        metadataJson: {
          source: "quipsly-coaching-checkout",
          bookingId: booking.id,
          offeringId: booking.offeringId,
          actorUserId: input.actorUserId,
        },
      },
    }));

  if (!booking.paymentRecordId) {
    await input.prisma.coachingBooking.update({
      where: { id: booking.id },
      data: {
        paymentRecordId: paymentRecord.id,
        status: "HOLDING_PAYMENT",
      },
    });
  }

  const params = new URLSearchParams();
  params.set("mode", "payment");
  params.set("customer_creation", "always");
  params.set("customer_email", booking.clientUser.primaryEmail);
  params.set("success_url", absoluteUrl(input.successUrl, `/coaching?checkout=success&bookingId=${booking.id}`));
  params.set("cancel_url", absoluteUrl(input.cancelUrl, `/coaching?checkout=cancel&bookingId=${booking.id}`));

  if (booking.offering?.stripePriceId) {
    params.set("line_items[0][price]", booking.offering.stripePriceId);
    params.set("line_items[0][quantity]", "1");
  } else {
    params.set("line_items[0][quantity]", "1");
    params.set("line_items[0][price_data][currency]", booking.offering?.currency || paymentRecord.currency || "USD");
    params.set("line_items[0][price_data][unit_amount]", String(cents));
    params.set("line_items[0][price_data][product_data][name]", booking.offering?.title || "Quipsly one-to-one coaching");
    if (booking.offering?.description) {
      params.set("line_items[0][price_data][product_data][description]", booking.offering.description);
    }
  }

  appendMetadata(params, {
    productSurface: "quipsly-coaching",
    bookingId: booking.id,
    paymentRecordId: paymentRecord.id,
    clientUserId: booking.clientUserId,
    coachUserId: booking.coachUserId,
    source: "quipsly-coaching-checkout",
  });

  try {
    const checkout = await stripePost(config, "/checkout/sessions", params);
    const stripeCustomerId = text(checkout.customer);

    await input.prisma.$transaction([
      input.prisma.paymentRecord.update({
        where: { id: paymentRecord.id },
        data: {
          providerCustomerId: stripeCustomerId || paymentRecord.providerCustomerId || null,
          providerCheckoutSessionId: checkout.id,
          status: "PENDING",
          metadataJson: {
            ...safeJson(paymentRecord.metadataJson),
            source: "quipsly-coaching-checkout",
            bookingId: booking.id,
            offeringId: booking.offeringId,
            checkoutSessionId: checkout.id,
            actorUserId: input.actorUserId,
          },
        },
      }),
      input.prisma.stripeCheckoutSessionLedger.create({
        data: {
          bookingId: booking.id,
          paymentRecordId: paymentRecord.id,
          checkoutSessionId: checkout.id,
          mode: checkout.mode || "payment",
          status: checkout.status || "created",
          url: checkout.url || null,
          livemode: Boolean(checkout.livemode ?? config.livemode),
          expiresAt: checkout.expires_at ? new Date(checkout.expires_at * 1000) : null,
          rawJson: checkout,
          metadataJson: {
            source: "quipsly-coaching-checkout",
            bookingId: booking.id,
            offeringId: booking.offeringId,
            actorUserId: input.actorUserId,
          },
        },
      }),
    ]);

    return {
      checkoutSessionId: checkout.id,
      url: checkout.url || null,
      livemode: Boolean(checkout.livemode ?? config.livemode),
      bookingId: booking.id,
      paymentRecordId: paymentRecord.id,
      nextAction: "Send or open the Stripe Checkout URL. Payment remains pending until webhook evidence arrives.",
    };
  } catch (error) {
    await input.prisma.paymentRecord.update({
      where: { id: paymentRecord.id },
      data: {
        status: "FAILED",
        metadataJson: {
          ...safeJson(paymentRecord.metadataJson),
          source: "quipsly-coaching-checkout",
          bookingId: booking.id,
          offeringId: booking.offeringId,
          actorUserId: input.actorUserId,
          error: error instanceof Error ? error.message : "Unknown Stripe checkout error",
        },
      },
    });
    throw error;
  }
}

export async function createQuipslyCoachingCustomerPortalSession(input: CreateCoachingCustomerPortalInput) {
  if (process.env["COACHING_CUSTOMER_PORTAL_ENABLED"] !== "true") {
    throw new Error("Coaching customer portal is disabled. Set COACHING_CUSTOMER_PORTAL_ENABLED=true for controlled test/internal flows.");
  }

  const config = getStripeConfig();
  const requestedUserId = input.userId || input.actorUserId;
  if (!input.actorIsStaff && requestedUserId !== input.actorUserId) {
    throw new Error("You can only open your own coaching customer portal.");
  }

  let stripeCustomerId = input.stripeCustomerId || null;
  const user = await input.prisma.user.findUnique({
    where: { id: requestedUserId },
    select: { id: true, primaryEmail: true },
  });
  if (!user) throw new Error("The requested Quipsly user was not found.");

  if (!stripeCustomerId) {
    const link = await input.prisma.stripeCustomerLink.findFirst({
      where: { userId: user.id, livemode: config.livemode },
      orderBy: { updatedAt: "desc" },
    });
    stripeCustomerId = link?.stripeCustomerId || null;
  }

  if (!stripeCustomerId) {
    const paymentEvidence = await input.prisma.paymentRecord.findFirst({
      where: {
        userId: user.id,
        provider: "stripe",
        providerCustomerId: { not: null },
      },
      orderBy: { updatedAt: "desc" },
      select: { providerCustomerId: true },
    });
    stripeCustomerId = paymentEvidence?.providerCustomerId || null;
  }

  if (!stripeCustomerId) {
    throw new Error("Stripe Customer Portal requires existing Stripe customer evidence from checkout or webhook reconciliation.");
  }

  const params = new URLSearchParams();
  params.set("customer", stripeCustomerId);
  params.set("return_url", absoluteUrl(input.returnUrl, "/coaching?portal=returned"));

  const portal = await stripePost(config, "/billing_portal/sessions", params);

  await input.prisma.stripeCustomerLink.upsert({
    where: { stripeCustomerId },
    update: {
      userId: user.id,
      livemode: config.livemode,
      metadataJson: {
        source: "quipsly-coaching-customer-portal",
        lastPortalSessionId: portal.id,
        actorUserId: input.actorUserId,
      },
    },
    create: {
      userId: user.id,
      stripeCustomerId,
      livemode: config.livemode,
      metadataJson: {
        source: "quipsly-coaching-customer-portal",
        firstPortalSessionId: portal.id,
        actorUserId: input.actorUserId,
      },
    },
  });

  return {
    portalSessionId: portal.id,
    url: portal.url || null,
    stripeCustomerId,
    livemode: config.livemode,
  };
}

function verifyStripeSignature(rawBody: string, signature: string | null, secret: string) {
  if (!signature) throw new Error("Missing Stripe signature header.");
  const parts = signature.split(",").reduce<Record<string, string[]>>((acc, item) => {
    const [key, value] = item.split("=");
    if (!key || !value) return acc;
    acc[key] = [...(acc[key] || []), value];
    return acc;
  }, {});
  const timestamp = parts.t?.[0];
  const signatures = parts.v1 || [];
  if (!timestamp || signatures.length === 0) throw new Error("Stripe signature header is malformed.");

  const signedPayload = `${timestamp}.${rawBody}`;
  const expected = createHmac("sha256", secret).update(signedPayload).digest("hex");
  const expectedBuffer = Buffer.from(expected, "hex");
  const verified = signatures.some((candidate) => {
    if (!/^[0-9a-f]+$/i.test(candidate)) return false;
    const candidateBuffer = Buffer.from(candidate, "hex");
    return candidateBuffer.length === expectedBuffer.length && timingSafeEqual(candidateBuffer, expectedBuffer);
  });

  if (!verified) throw new Error("Stripe webhook signature verification failed.");
}

export async function recordQuipslyCoachingStripeWebhook(input: {
  prisma: any;
  rawBody: string;
  signature: string | null;
}) {
  const config = getStripeConfig();
  const webhookSecret = text(process.env["STRIPE_COACHING_WEBHOOK_SECRET"]) || text(process.env["STRIPE_WEBHOOK_SECRET"]);
  if (!webhookSecret) throw new Error("STRIPE_COACHING_WEBHOOK_SECRET is not configured.");

  verifyStripeSignature(input.rawBody, input.signature, webhookSecret);

  const event = JSON.parse(input.rawBody);
  const hash = payloadHash(input.rawBody);
  const externalEventId = text(event.id) || `unidentified:${hash}`;
  const webhookRecord = await input.prisma.stripeWebhookEvent.upsert({
    where: { externalEventId },
    update: {
      eventType: event.type || "unknown",
      livemode: Boolean(event.livemode ?? config.livemode),
      verificationStatus: "verified",
      processingStatus: "received",
      payloadHash: hash,
      payloadJson: event,
      occurredAt: event.created ? new Date(event.created * 1000) : null,
      errorMessage: null,
      retryCount: { increment: 1 },
    },
    create: {
      externalEventId,
      eventType: event.type || "unknown",
      livemode: Boolean(event.livemode ?? config.livemode),
      verificationStatus: "verified",
      processingStatus: "received",
      payloadHash: hash,
      payloadJson: event,
      occurredAt: event.created ? new Date(event.created * 1000) : null,
    },
  });

  try {
    if (event.type === "checkout.session.completed" || event.type === "checkout.session.expired") {
      const checkout = event.data?.object || {};
      const checkoutSessionId = text(checkout.id);
      if (!checkoutSessionId) throw new Error("Stripe checkout webhook did not include a session ID.");

      const ledger = await input.prisma.stripeCheckoutSessionLedger.findUnique({
        where: { checkoutSessionId },
      });
      if (!ledger) {
        await input.prisma.stripeWebhookEvent.update({
          where: { id: webhookRecord.id },
          data: {
            processingStatus: "processed_unmatched",
            processedAt: new Date(),
            errorMessage: `No Quipsly checkout ledger matched Stripe session ${checkoutSessionId}.`,
          },
        });
        return {
          eventId: externalEventId,
          eventType: event.type,
          webhookRecordId: webhookRecord.id,
          matched: false,
        };
      }

      const stripeCustomerId = text(checkout.customer);
      const stripePaymentIntentId = text(checkout.payment_intent);

      if (ledger.paymentRecordId) {
        await input.prisma.paymentRecord.update({
          where: { id: ledger.paymentRecordId },
          data: {
            status: event.type === "checkout.session.completed" ? "PAID" : "CANCELED",
            providerCustomerId: stripeCustomerId || null,
            providerPaymentIntentId: stripePaymentIntentId || null,
            paidAt: event.type === "checkout.session.completed" ? new Date() : null,
          },
        });
      }

      if (ledger.bookingId) {
        const booking = await input.prisma.coachingBooking.update({
          where: { id: ledger.bookingId },
          data: {
            status: event.type === "checkout.session.completed" ? "CONFIRMED" : "CANCELED",
          },
          select: { clientUserId: true, offeringId: true },
        });

        if (event.type === "checkout.session.completed" && stripeCustomerId) {
          await input.prisma.stripeCustomerLink.upsert({
            where: { stripeCustomerId },
            update: {
              userId: booking.clientUserId,
              livemode: Boolean(event.livemode ?? config.livemode),
              metadataJson: {
                source: "quipsly-coaching-checkout-webhook",
                bookingId: ledger.bookingId,
                offeringId: booking.offeringId,
                checkoutSessionId,
                paymentRecordId: ledger.paymentRecordId,
              },
            },
            create: {
              userId: booking.clientUserId,
              stripeCustomerId,
              livemode: Boolean(event.livemode ?? config.livemode),
              metadataJson: {
                source: "quipsly-coaching-checkout-webhook",
                bookingId: ledger.bookingId,
                offeringId: booking.offeringId,
                checkoutSessionId,
                paymentRecordId: ledger.paymentRecordId,
              },
            },
          });
        }
      }

      await input.prisma.stripeCheckoutSessionLedger.update({
        where: { checkoutSessionId },
        data: {
          status: event.type === "checkout.session.completed" ? "completed" : "expired",
          rawJson: checkout,
        },
      });
    }

    await input.prisma.stripeWebhookEvent.update({
      where: { id: webhookRecord.id },
      data: {
        processingStatus: "processed",
        processedAt: new Date(),
        errorMessage: null,
      },
    });
  } catch (error) {
    await input.prisma.stripeWebhookEvent.update({
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
    matched: true,
  };
}
