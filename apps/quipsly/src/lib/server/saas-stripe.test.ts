import { createHmac } from "node:crypto";

import {
  createQuipslySubscriptionCheckout,
  recordQuipslySubscriptionWebhook,
  verifyQuipslyStripeSignature,
} from "./saas-stripe";

const environment = {
  STRIPE_SECRET_KEY: "sk_test_quipsly",
  STRIPE_SAAS_WEBHOOK_SECRET: "whsec_quipsly",
  QUIPSLY_STRIPE_COACH_MONTHLY_PRICE_ID: "price_monthly",
  QUIPSLY_STRIPE_COACH_ANNUAL_PRICE_ID: "price_annual",
  NEXT_PUBLIC_NEST_BASE_URL: "https://nest.quipsly.com",
};

function signature(rawBody: string, timestamp: number) {
  const digest = createHmac("sha256", environment.STRIPE_SAAS_WEBHOOK_SECRET)
    .update(`${timestamp}.${rawBody}`)
    .digest("hex");
  return `t=${timestamp},v1=${digest}`;
}

describe("Quipsly web subscriptions", () => {
  const fetchMock = jest.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    Object.defineProperty(globalThis, "fetch", { configurable: true, value: fetchMock });
  });

  afterEach(() => jest.restoreAllMocks());

  it("opens annual Stripe Checkout with the trial and durable account binding", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
      id: "cs_test_1",
      url: "https://checkout.stripe.com/c/pay/cs_test_1",
      livemode: false,
      }),
    });
    const prisma = {
      subscription: {
        findUnique: jest.fn().mockResolvedValue({
          id: "sub-1",
          organizationId: "org-1",
          status: "UNPAID",
          provider: "MANUAL",
          stripeCustomerId: null,
          verifiedAt: null,
          currentPeriodStart: null,
          trialEnd: null,
        }),
        update: jest.fn().mockResolvedValue({ id: "sub-1" }),
      },
      subscriptionProviderEvent: { upsert: jest.fn().mockResolvedValue({ id: "event-1" }) },
      $transaction: jest.fn().mockImplementation((operations) => Promise.all(operations)),
    };

    const result = await createQuipslySubscriptionCheckout({
      prisma,
      userId: "coach-1",
      email: "coach@example.com",
      planKey: "quipsly-coach-annual",
      environment,
    });

    expect(result).toMatchObject({ checkoutSessionId: "cs_test_1", planKey: "quipsly-coach-annual", trialDays: 14 });
    const request = fetchMock.mock.calls[0][1] as RequestInit;
    const params = request.body as URLSearchParams;
    expect(params.get("mode")).toBe("subscription");
    expect(params.get("line_items[0][price]")).toBe("price_annual");
    expect(params.get("subscription_data[trial_period_days]")).toBe("14");
    expect(params.get("subscription_data[metadata][quipslySubscriptionId]")).toBe("sub-1");
    expect(params.get("customer_email")).toBe("coach@example.com");
    expect(prisma.subscription.update).toHaveBeenCalledWith({
      where: { id: "sub-1" },
      data: { providerStatus: "STRIPE_CHECKOUT_CREATED" },
    });
  });

  it("rejects stale webhook signatures", () => {
    const rawBody = JSON.stringify({ id: "evt_1" });
    expect(() => verifyQuipslyStripeSignature(
      rawBody,
      signature(rawBody, 100),
      environment.STRIPE_SAAS_WEBHOOK_SECRET,
      401,
    )).toThrow("outside the allowed tolerance");
  });

  it("turns a verified Stripe trial into the same account entitlement", async () => {
    const now = new Date("2026-08-26T18:00:00.000Z");
    const timestamp = Math.floor(now.getTime() / 1_000);
    const rawBody = JSON.stringify({
      id: "evt_checkout_completed",
      type: "checkout.session.completed",
      created: timestamp,
      livemode: false,
      data: { object: { mode: "subscription", subscription: "sub_stripe_1" } },
    });
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
      id: "sub_stripe_1",
      customer: "cus_1",
      status: "trialing",
      trial_end: timestamp + 14 * 86_400,
      current_period_start: timestamp,
      current_period_end: timestamp + 14 * 86_400,
      cancel_at_period_end: false,
      metadata: {
        quipslySubscriptionId: "sub-local-1",
        billingOwnerUserId: "coach-1",
      },
      items: { data: [{ price: { id: "price_annual" } }] },
      }),
    });
    const providerEvent = { id: "provider-event-1", status: "RECEIVED" };
    const prisma = {
      subscriptionProviderEvent: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue(providerEvent),
        update: jest.fn().mockResolvedValue({}),
      },
      subscription: {
        findUnique: jest.fn().mockResolvedValue({
          id: "sub-local-1",
          organizationId: "org-1",
          billingOwnerUserId: "coach-1",
        }),
        findFirst: jest.fn(),
        update: jest.fn().mockResolvedValue({ id: "sub-local-1", organizationId: "org-1" }),
      },
      subscriptionPlan: {
        findUnique: jest.fn().mockResolvedValue({ id: "plan-annual" }),
      },
    };

    const result = await recordQuipslySubscriptionWebhook({
      prisma,
      rawBody,
      signature: signature(rawBody, timestamp),
      environment,
      now,
    });

    expect(result).toMatchObject({ applied: true, subscriptionId: "sub-local-1" });
    expect(prisma.subscription.update).toHaveBeenCalledWith({
      where: { id: "sub-local-1" },
      data: expect.objectContaining({
        planId: "plan-annual",
        provider: "STRIPE",
        status: "TRIALING",
        stripeCustomerId: "cus_1",
        stripeSubscriptionId: "sub_stripe_1",
        verifiedAt: now,
      }),
    });
    expect(prisma.subscriptionProviderEvent.update).toHaveBeenCalledWith({
      where: { id: "provider-event-1" },
      data: expect.objectContaining({ status: "PROCESSED", subscriptionId: "sub-local-1" }),
    });
  });
});
