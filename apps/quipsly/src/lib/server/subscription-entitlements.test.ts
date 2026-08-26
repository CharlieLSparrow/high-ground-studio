jest.mock("server-only", () => ({}));
jest.mock("@/lib/server/prisma-advisory-lock", () => ({
  acquirePrismaAdvisoryTransactionLock: jest.fn().mockResolvedValue(undefined),
}));

import {
  QUIPSLY_COACH_CAPABILITIES,
  ensureQuipslyBillingContext,
  quipslyAppStoreProducts,
  readQuipslyEntitlement,
} from "./subscription-entitlements";

describe("Quipsly SaaS entitlement projection", () => {
  it("keeps early coaches unlocked while enforcement is deliberately off", async () => {
    const entitlement = await readQuipslyEntitlement({
      prisma: {
        subscription: { findFirst: jest.fn().mockResolvedValue(null) },
      },
      userId: "coach-1",
      environment: {},
      now: new Date("2026-08-26T12:00:00.000Z"),
    });

    expect(entitlement).toMatchObject({
      entitled: true,
      enforcementEnabled: false,
      accessMode: "EARLY_ACCESS",
      status: "ACTIVE",
      appAccountToken: null,
    });
    expect(entitlement.capabilities).toEqual(QUIPSLY_COACH_CAPABILITIES);
  });

  it("fails closed to free access after enforcement is enabled without a verified grant", async () => {
    const entitlement = await readQuipslyEntitlement({
      prisma: {
        subscription: { findFirst: jest.fn().mockResolvedValue(null) },
      },
      userId: "coach-1",
      environment: { QUIPSLY_SAAS_ENTITLEMENT_ENFORCEMENT: "true" },
    });

    expect(entitlement).toMatchObject({
      entitled: false,
      enforcementEnabled: true,
      accessMode: "FREE",
      status: "INACTIVE",
      capabilities: [],
    });
  });

  it("projects one verified App Store plan across the account", async () => {
    const entitlement = await readQuipslyEntitlement({
      prisma: {
        subscription: {
          findFirst: jest.fn().mockResolvedValue({
            id: "sub-1",
            organizationId: "org-1",
            billingOwnerUserId: "coach-1",
            provider: "APP_STORE",
            providerStatus: "ACTIVE:PRODUCTION",
            status: "ACTIVE",
            currentPeriodEnd: new Date("2026-09-26T12:00:00.000Z"),
            cancelAtPeriodEnd: false,
            verifiedAt: new Date("2026-08-26T12:00:00.000Z"),
            appAccountToken: "760af700-b296-4b3f-b0fe-3f5648c299b4",
            plan: {
              stableKey: "quipsly-coach-monthly",
              name: "Quipsly Coach monthly",
              displayOrder: 100,
              capabilitiesJson: ["coaching.call", "coaching.transcription"],
            },
          }),
        },
      },
      userId: "coach-1",
      environment: { QUIPSLY_SAAS_ENTITLEMENT_ENFORCEMENT: "true" },
      now: new Date("2026-08-26T12:00:00.000Z"),
    });

    expect(entitlement).toMatchObject({
      entitled: true,
      accessMode: "SUBSCRIBED",
      provider: "APP_STORE",
      planKey: "quipsly-coach-monthly",
      subscriptionId: "sub-1",
      organizationId: "org-1",
      capabilities: ["coaching.call", "coaching.transcription"],
    });
  });

  it("uses stable App Store product identifiers without inventing prices", () => {
    expect(quipslyAppStoreProducts({})).toEqual([
      {
        planKey: "quipsly-coach-monthly",
        productId: "com.quipsly.capture.coach.monthly",
        billingPeriod: "P1M",
      },
      {
        planKey: "quipsly-coach-annual",
        productId: "com.quipsly.capture.coach.annual",
        billingPeriod: "P1Y",
      },
    ]);
  });

  it("prepares account linking without granting new early access after enforcement", async () => {
    const tx = {
      subscriptionPlan: {
        upsert: jest.fn()
          .mockResolvedValueOnce({ id: "plan-early" })
          .mockResolvedValue({ id: "plan-paid" }),
      },
      subscription: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ id: "sub-new" }),
      },
      organizationMember: {
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn().mockResolvedValue({
          organizationId: "org-new",
          organization: { subscription: null },
        }),
      },
      organization: {
        create: jest.fn().mockResolvedValue({ id: "org-new" }),
      },
    };
    const prisma = {
      $transaction: jest.fn().mockImplementation((callback) => callback(tx)),
      subscription: { findFirst: jest.fn().mockResolvedValue(null) },
    };

    await ensureQuipslyBillingContext({
      prisma,
      user: { id: "coach-new", name: "New Coach" },
      environment: { QUIPSLY_SAAS_ENTITLEMENT_ENFORCEMENT: "true" },
    });

    expect(tx.subscription.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        billingOwnerUserId: "coach-new",
        providerStatus: "AWAITING_PURCHASE",
        status: "INCOMPLETE",
        verifiedAt: null,
      }),
    });
  });
});
