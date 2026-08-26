import "server-only";

import { createHash, createHmac, timingSafeEqual } from "node:crypto";

import {
  DEFAULT_QUIPSLY_COACH_TRIAL_DAYS,
  QUIPSLY_COACH_PLAN_KEYS,
  quipslyStripeProducts,
} from "@/lib/server/subscription-entitlements";

const STRIPE_API_BASE = "https://api.stripe.com/v1";
const LIVE_STRIPE_GUARD = "QUIPSLY_ALLOW_LIVE_STRIPE_SAAS";

type StripeConfig = { secretKey: string; livemode: boolean };

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function record(value: unknown): Record<string, any> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, any>
    : {};
}

function stripeConfig(
  environment: Readonly<Record<string, string | undefined>> = process.env,
): StripeConfig {
  const secretKey = text(environment.STRIPE_SECRET_KEY);
  if (!secretKey) throw new Error("STRIPE_SECRET_KEY is not configured.");
  const livemode = secretKey.startsWith("sk_live_");
  if (livemode && environment[LIVE_STRIPE_GUARD] !== "true") {
    throw new Error(`Live Quipsly subscriptions are disabled. Set ${LIVE_STRIPE_GUARD}=true only for launch.`);
  }
  return { secretKey, livemode };
}

function appBaseUrl(environment: Readonly<Record<string, string | undefined>>) {
  return text(environment.NEXT_PUBLIC_NEST_BASE_URL)
    || text(environment.NEXT_PUBLIC_APP_URL)
    || text(environment.APP_URL)
    || "https://nest.quipsly.com";
}

function absoluteUrl(
  value: string | undefined,
  fallbackPath: string,
  environment: Readonly<Record<string, string | undefined>>,
) {
  if (value?.startsWith("http://") || value?.startsWith("https://")) return value;
  return new URL(value || fallbackPath, appBaseUrl(environment)).toString();
}

async function stripeRequest(
  config: StripeConfig,
  path: string,
  options: { params?: URLSearchParams; method?: "GET" | "POST" } = {},
) {
  const method = options.method || "POST";
  const response = await fetch(`${STRIPE_API_BASE}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${config.secretKey}`,
      ...(method === "POST" ? { "Content-Type": "application/x-www-form-urlencoded" } : {}),
    },
    body: method === "POST" ? options.params : undefined,
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(text(payload?.error?.message) || `Stripe request failed with HTTP ${response.status}.`);
  }
  return payload;
}

function unixDate(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? new Date(value * 1_000) : null;
}

function subscriptionPeriod(subscription: Record<string, any>) {
  const firstItem = record(subscription.items?.data?.[0]);
  return {
    start: unixDate(subscription.current_period_start ?? firstItem.current_period_start),
    end: unixDate(subscription.current_period_end ?? firstItem.current_period_end),
  };
}

function localStatus(stripeStatus: string) {
  if (stripeStatus === "trialing") return "TRIALING" as const;
  if (stripeStatus === "active") return "ACTIVE" as const;
  if (stripeStatus === "past_due") return "PAST_DUE" as const;
  if (stripeStatus === "canceled") return "CANCELED" as const;
  return "UNPAID" as const;
}

function priceIdFor(subscription: Record<string, any>) {
  return text(subscription.items?.data?.[0]?.price?.id);
}

function checkoutTrialDays(
  environment: Readonly<Record<string, string | undefined>>,
) {
  const configured = Number(environment.QUIPSLY_COACH_TRIAL_DAYS);
  if (!Number.isInteger(configured)) return DEFAULT_QUIPSLY_COACH_TRIAL_DAYS;
  return Math.min(60, Math.max(1, configured));
}

export async function createQuipslySubscriptionCheckout(input: {
  prisma: any;
  userId: string;
  email: string;
  planKey: string;
  successUrl?: string;
  cancelUrl?: string;
  environment?: Readonly<Record<string, string | undefined>>;
}) {
  const environment = input.environment ?? process.env;
  const config = stripeConfig(environment);
  const product = quipslyStripeProducts(environment).find((candidate) => candidate.planKey === input.planKey);
  if (!product || !product.priceId) throw new Error("This Quipsly web subscription plan is not configured.");
  const subscription = await input.prisma.subscription.findUnique({
    where: { billingOwnerUserId: input.userId },
    include: { plan: true },
  });
  if (!subscription) throw new Error("Prepare your Quipsly account before starting checkout.");
  if (["ACTIVE", "TRIALING"].includes(subscription.status) && subscription.provider !== "MANUAL") {
    throw new Error("This Quipsly account already has an active subscription.");
  }

  const params = new URLSearchParams();
  params.set("mode", "subscription");
  params.set("line_items[0][price]", product.priceId);
  params.set("line_items[0][quantity]", "1");
  params.set("client_reference_id", input.userId);
  params.set("success_url", absoluteUrl(input.successUrl, "/settings?subscription=success#subscription", environment));
  params.set("cancel_url", absoluteUrl(input.cancelUrl, "/settings?subscription=canceled#subscription", environment));
  params.set("allow_promotion_codes", "true");
  if (subscription.stripeCustomerId) params.set("customer", subscription.stripeCustomerId);
  else params.set("customer_email", input.email);
  const metadata = {
    productSurface: "quipsly-saas",
    quipslySubscriptionId: subscription.id,
    billingOwnerUserId: input.userId,
    planKey: product.planKey,
  };
  for (const [key, value] of Object.entries(metadata)) {
    params.set(`metadata[${key}]`, value);
    params.set(`subscription_data[metadata][${key}]`, value);
  }
  const eligibleForTrial = !subscription.verifiedAt
    && !subscription.currentPeriodStart
    && !subscription.trialEnd;
  if (eligibleForTrial) {
    params.set("subscription_data[trial_period_days]", String(checkoutTrialDays(environment)));
  }

  const checkout = await stripeRequest(config, "/checkout/sessions", { params });
  const checkoutId = text(checkout.id);
  if (!checkoutId || !text(checkout.url)) throw new Error("Stripe did not return a usable Checkout session.");
  await input.prisma.$transaction([
    input.prisma.subscription.update({
      where: { id: subscription.id },
      data: { providerStatus: "STRIPE_CHECKOUT_CREATED" },
    }),
    input.prisma.subscriptionProviderEvent.upsert({
      where: { provider_externalEventId: { provider: "STRIPE", externalEventId: checkoutId } },
      update: {},
      create: {
        provider: "STRIPE",
        externalEventId: checkoutId,
        eventType: "CHECKOUT_CREATED",
        status: "RECEIVED",
        payloadSha256: createHash("sha256").update(JSON.stringify(checkout)).digest("hex"),
        organizationId: subscription.organizationId,
        subscriptionId: subscription.id,
      },
    }),
  ]);
  return {
    checkoutSessionId: checkoutId,
    url: text(checkout.url),
    livemode: Boolean(checkout.livemode ?? config.livemode),
    planKey: product.planKey,
    trialDays: eligibleForTrial ? checkoutTrialDays(environment) : 0,
  };
}

export async function createQuipslySubscriptionPortal(input: {
  prisma: any;
  userId: string;
  returnUrl?: string;
  environment?: Readonly<Record<string, string | undefined>>;
}) {
  const environment = input.environment ?? process.env;
  const config = stripeConfig(environment);
  const subscription = await input.prisma.subscription.findUnique({
    where: { billingOwnerUserId: input.userId },
  });
  if (!subscription?.stripeCustomerId || subscription.provider !== "STRIPE") {
    throw new Error("No web subscription is connected to this Quipsly account.");
  }
  const params = new URLSearchParams();
  params.set("customer", subscription.stripeCustomerId);
  params.set("return_url", absoluteUrl(input.returnUrl, "/settings#subscription", environment));
  const portal = await stripeRequest(config, "/billing_portal/sessions", { params });
  if (!text(portal.url)) throw new Error("Stripe did not return a billing portal URL.");
  return { url: text(portal.url), portalSessionId: text(portal.id) };
}

export function verifyQuipslyStripeSignature(
  rawBody: string,
  signature: string | null,
  secret: string,
  nowSeconds = Math.floor(Date.now() / 1_000),
) {
  if (!signature) throw new Error("Missing Stripe signature header.");
  const values = signature.split(",").reduce<Record<string, string[]>>((result, part) => {
    const [key, value] = part.split("=");
    if (key && value) result[key] = [...(result[key] || []), value];
    return result;
  }, {});
  const timestamp = Number(values.t?.[0]);
  const signatures = values.v1 || [];
  if (!Number.isFinite(timestamp) || signatures.length === 0) throw new Error("Stripe signature header is malformed.");
  if (Math.abs(nowSeconds - timestamp) > 300) throw new Error("Stripe webhook timestamp is outside the allowed tolerance.");
  const expected = createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest("hex");
  const expectedBuffer = Buffer.from(expected, "hex");
  const verified = signatures.some((candidate) => {
    if (!/^[0-9a-f]+$/i.test(candidate)) return false;
    const candidateBuffer = Buffer.from(candidate, "hex");
    return candidateBuffer.length === expectedBuffer.length && timingSafeEqual(candidateBuffer, expectedBuffer);
  });
  if (!verified) throw new Error("Stripe webhook signature verification failed.");
}

async function applyStripeSubscription(input: {
  prisma: any;
  stripeSubscription: Record<string, any>;
  expectedLivemode: boolean;
  now: Date;
}) {
  const source = input.stripeSubscription;
  const providerSubscriptionId = text(source.id);
  const customerId = text(source.customer);
  const metadata = record(source.metadata);
  const localId = text(metadata.quipslySubscriptionId);
  let local = localId
    ? await input.prisma.subscription.findUnique({ where: { id: localId } })
    : null;
  if (!local && providerSubscriptionId) {
    local = await input.prisma.subscription.findFirst({
      where: { OR: [{ providerSubscriptionId }, { stripeSubscriptionId: providerSubscriptionId }] },
    });
  }
  if (!local && customerId) {
    local = await input.prisma.subscription.findFirst({ where: { stripeCustomerId: customerId } });
  }
  if (!local) throw new Error("Stripe subscription is not linked to a Quipsly billing account.");
  if (metadata.billingOwnerUserId && metadata.billingOwnerUserId !== local.billingOwnerUserId) {
    throw new Error("Stripe subscription metadata belongs to a different Quipsly account.");
  }
  const planPriceId = priceIdFor(source);
  const plan = planPriceId
    ? await input.prisma.subscriptionPlan.findUnique({ where: { stripePriceId: planPriceId } })
    : null;
  if (!plan) throw new Error("Stripe subscription uses an unknown Quipsly price.");
  const status = text(source.status);
  const period = subscriptionPeriod(source);
  return input.prisma.subscription.update({
    where: { id: local.id },
    data: {
      planId: plan.id,
      provider: "STRIPE",
      providerStatus: `${status.toUpperCase()}:${input.expectedLivemode ? "LIVE" : "TEST"}`,
      status: localStatus(status),
      stripeCustomerId: customerId || null,
      providerCustomerId: customerId || null,
      stripeSubscriptionId: providerSubscriptionId,
      providerSubscriptionId,
      currentPeriodStart: period.start,
      currentPeriodEnd: period.end,
      trialEnd: unixDate(source.trial_end),
      cancelAtPeriodEnd: source.cancel_at_period_end === true,
      verifiedAt: input.now,
    },
  });
}

export async function recordQuipslySubscriptionWebhook(input: {
  prisma: any;
  rawBody: string;
  signature: string | null;
  environment?: Readonly<Record<string, string | undefined>>;
  now?: Date;
}) {
  const environment = input.environment ?? process.env;
  const config = stripeConfig(environment);
  const webhookSecret = text(environment.STRIPE_SAAS_WEBHOOK_SECRET);
  if (!webhookSecret) throw new Error("STRIPE_SAAS_WEBHOOK_SECRET is not configured.");
  const now = input.now ?? new Date();
  verifyQuipslyStripeSignature(input.rawBody, input.signature, webhookSecret, Math.floor(now.getTime() / 1_000));
  const event = record(JSON.parse(input.rawBody));
  const eventId = text(event.id);
  if (!eventId) throw new Error("Stripe webhook is missing an event ID.");
  if (Boolean(event.livemode) !== config.livemode) throw new Error("Stripe webhook mode does not match the configured account.");
  const existing = await input.prisma.subscriptionProviderEvent.findUnique({
    where: { provider_externalEventId: { provider: "STRIPE", externalEventId: eventId } },
  });
  if (existing?.status === "PROCESSED" || existing?.status === "IGNORED") {
    return { eventId, eventType: text(event.type), duplicate: true, applied: existing.status === "PROCESSED" };
  }
  const eventRecord = existing || await input.prisma.subscriptionProviderEvent.create({
    data: {
      provider: "STRIPE",
      externalEventId: eventId,
      eventType: text(event.type) || "unknown",
      status: "RECEIVED",
      payloadSha256: createHash("sha256").update(input.rawBody).digest("hex"),
      occurredAt: unixDate(event.created),
    },
  });

  try {
    const eventType = text(event.type);
    const object = record(event.data?.object);
    let stripeSubscription: Record<string, any> | null = null;
    if (eventType.startsWith("customer.subscription.")) stripeSubscription = object;
    else if (eventType === "checkout.session.completed" && object.mode === "subscription" && text(object.subscription)) {
      stripeSubscription = record(await stripeRequest(config, `/subscriptions/${encodeURIComponent(text(object.subscription))}`, { method: "GET" }));
    } else if (eventType.startsWith("invoice.") && text(object.subscription)) {
      stripeSubscription = record(await stripeRequest(config, `/subscriptions/${encodeURIComponent(text(object.subscription))}`, { method: "GET" }));
    }
    if (!stripeSubscription) {
      await input.prisma.subscriptionProviderEvent.update({
        where: { id: eventRecord.id },
        data: { status: "IGNORED", processedAt: now },
      });
      return { eventId, eventType, duplicate: false, applied: false };
    }
    const local = await applyStripeSubscription({
      prisma: input.prisma,
      stripeSubscription,
      expectedLivemode: config.livemode,
      now,
    });
    await input.prisma.subscriptionProviderEvent.update({
      where: { id: eventRecord.id },
      data: {
        status: "PROCESSED",
        organizationId: local.organizationId,
        subscriptionId: local.id,
        processedAt: now,
        errorCode: null,
      },
    });
    return { eventId, eventType, duplicate: false, applied: true, subscriptionId: local.id };
  } catch (error) {
    await input.prisma.subscriptionProviderEvent.update({
      where: { id: eventRecord.id },
      data: { status: "FAILED", processedAt: now, errorCode: "STRIPE_SUBSCRIPTION_RECONCILIATION_FAILED" },
    });
    throw error;
  }
}

export const QUIPSLY_WEB_SUBSCRIPTION_PLAN_KEYS = [
  QUIPSLY_COACH_PLAN_KEYS.monthly,
  QUIPSLY_COACH_PLAN_KEYS.annual,
] as const;
