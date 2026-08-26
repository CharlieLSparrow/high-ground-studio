jest.mock("server-only", () => ({}));
jest.mock("@/lib/server/prisma-advisory-lock", () => ({
  acquirePrismaAdvisoryTransactionLock: jest.fn().mockResolvedValue(undefined),
}));

import {
  QUIPSLY_COACH_CAPABILITIES,
  DEFAULT_QUIPSLY_COACH_TRIAL_DAYS,
  ensureQuipslyBillingContext,
  quipslyCoachCapabilityAccess,
  quipslyAppStoreProducts,
  readQuipslyEntitlement,
} from "./subscription-entitlements";

describe("Quipsly SaaS entitlement projection", () => {
  it("keeps staff and early-access development unblocked without a subscription query", async () => {
    const prisma = {
      subscription: { findFirst: jest.fn() },
    };

    await expect(quipslyCoachCapabilityAccess({
      prisma,
      userId: "staff-1",
      capability: "coaching.schedule",
      isStaff: true,
      environment: { QUIPSLY_SAAS_ENTITLEMENT_ENFORCEMENT: "true" },
    })).resolves.toMatchObject({ allowed: true, accessMode: "STAFF" });
    await expect(quipslyCoachCapabilityAccess({
      prisma,
      userId: "coach-early",
      capability: "coaching.schedule",
      environment: {},
    })).resolves.toMatchObject({ allowed: true, accessMode: "EARLY_ACCESS" });
    expect(prisma.subscription.findFirst).not.toHaveBeenCalled();
  });

  it("authorizes a paid capability and rejects a missing one when enforcement is live", async () => {
    const activeSubscription = {
      id: "sub-capability",
      organizationId: "org-capability",
      provider: "APP_STORE",
      status: "ACTIVE",
      currentPeriodEnd: new Date("2026-09-26T12:00:00.000Z"),
      plan: {
        stableKey: "quipsly-coach-monthly",
        name: "Quipsly Coach monthly",
        displayOrder: 100,
        capabilitiesJson: ["coaching.schedule"],
      },
    };
    const prisma = {
      subscription: {
        findFirst: jest.fn().mockResolvedValue(activeSubscription),
      },
    };
    const environment = { QUIPSLY_SAAS_ENTITLEMENT_ENFORCEMENT: "true" };

    await expect(quipslyCoachCapabilityAccess({
      prisma,
      userId: "coach-paid",
      capability: "coaching.schedule",
      environment,
      now: new Date("2026-08-26T12:00:00.000Z"),
    })).resolves.toMatchObject({ allowed: true, accessMode: "SUBSCRIBED" });
    await expect(quipslyCoachCapabilityAccess({
      prisma,
      userId: "coach-paid",
      capability: "coaching.transcription",
      environment,
      now: new Date("2026-08-26T12:00:00.000Z"),
    })).resolves.toMatchObject({ allowed: false, accessMode: "SUBSCRIBED" });
  });

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
      trialDays: DEFAULT_QUIPSLY_COACH_TRIAL_DAYS,
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

  it("prepares purchase identity without activating access before Apple verifies a transaction", async () => {
    const tx = {
      subscriptionPlan: {
        upsert: jest.fn()
          .mockResolvedValueOnce({ id: "plan-early" })
          .mockResolvedValueOnce({ id: "plan-trial" })
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
      subscription: {
        findFirst: jest.fn().mockResolvedValue(null),
        findUnique: jest.fn().mockResolvedValue({
          id: "sub-new",
          organizationId: "org-new",
          appAccountToken: "760af700-b296-4b3f-b0fe-3f5648c299b4",
          plan: { stableKey: "quipsly-early-access", name: "Quipsly early access" },
        }),
      },
    };

    await ensureQuipslyBillingContext({
      prisma,
      user: { id: "coach-new", name: "New Coach" },
      environment: { QUIPSLY_SAAS_ENTITLEMENT_ENFORCEMENT: "true" },
    });

    expect(tx.subscription.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        billingOwnerUserId: "coach-new",
        planId: "plan-early",
        providerStatus: "AWAITING_APP_STORE_PURCHASE",
        status: "UNPAID",
        verifiedAt: null,
        currentPeriodStart: null,
        currentPeriodEnd: null,
        trialEnd: null,
      }),
    });
  });

  it("projects an active coach trial separately from permanent early access", async () => {
    const entitlement = await readQuipslyEntitlement({
      prisma: {
        subscription: {
          findFirst: jest.fn().mockResolvedValue({
            id: "sub-trial",
            organizationId: "org-trial",
            provider: "MANUAL",
            status: "TRIALING",
            currentPeriodEnd: new Date("2026-09-09T12:00:00.000Z"),
            trialEnd: new Date("2026-09-09T12:00:00.000Z"),
            cancelAtPeriodEnd: false,
            verifiedAt: new Date("2026-08-26T12:00:00.000Z"),
            appAccountToken: "760af700-b296-4b3f-b0fe-3f5648c299b4",
            plan: {
              stableKey: "quipsly-coach-trial",
              name: "Quipsly Coach trial",
              displayOrder: 20,
              capabilitiesJson: [...QUIPSLY_COACH_CAPABILITIES],
            },
          }),
        },
      },
      userId: "coach-trial",
      environment: { QUIPSLY_SAAS_ENTITLEMENT_ENFORCEMENT: "true" },
      now: new Date("2026-08-26T12:00:00.000Z"),
    });

    expect(entitlement).toMatchObject({
      entitled: true,
      accessMode: "TRIAL",
      planKey: "quipsly-coach-trial",
      trialEnd: "2026-09-09T12:00:00.000Z",
      trialDays: DEFAULT_QUIPSLY_COACH_TRIAL_DAYS,
    });
  });

  it("treats an expired trial as free without hiding the account or its work", async () => {
    const findFirst = jest.fn().mockResolvedValue(null);
    const now = new Date("2026-09-10T12:00:00.000Z");

    const entitlement = await readQuipslyEntitlement({
      prisma: { subscription: { findFirst } },
      userId: "coach-expired",
      environment: { QUIPSLY_SAAS_ENTITLEMENT_ENFORCEMENT: "true" },
      now,
    });

    expect(findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        billingOwnerUserId: "coach-expired",
        status: { in: ["ACTIVE", "TRIALING"] },
        OR: [{ currentPeriodEnd: null }, { currentPeriodEnd: { gt: now } }],
      }),
    }));
    expect(entitlement).toMatchObject({
      entitled: false,
      accessMode: "FREE",
      capabilities: [],
      management: {
        appStoreURL: "https://apps.apple.com/account/subscriptions",
        webURL: "/settings#subscription",
      },
    });
  });

  it("never replaces an existing subscription to restart a trial", async () => {
    const subscription = {
      id: "sub-existing",
      organizationId: "org-existing",
      billingOwnerUserId: "coach-existing",
      appAccountToken: "760af700-b296-4b3f-b0fe-3f5648c299b4",
      organization: { id: "org-existing" },
    };
    const membership = {
      organizationId: "org-existing",
      organization: { subscription },
    };
    const tx = {
      subscriptionPlan: {
        upsert: jest.fn()
          .mockResolvedValueOnce({ id: "plan-early" })
          .mockResolvedValueOnce({ id: "plan-trial" })
          .mockResolvedValue({ id: "plan-paid" }),
      },
      subscription: {
        findUnique: jest.fn().mockResolvedValue(subscription),
        update: jest.fn(),
        create: jest.fn(),
      },
      organizationMember: {
        findFirst: jest.fn().mockResolvedValue(membership),
        findMany: jest.fn(),
        create: jest.fn(),
      },
      organization: { create: jest.fn() },
    };
    const prisma = {
      $transaction: jest.fn().mockImplementation((callback) => callback(tx)),
      subscription: { findFirst: jest.fn().mockResolvedValue(null) },
    };

    await ensureQuipslyBillingContext({
      prisma,
      user: { id: "coach-existing", name: "Existing Coach" },
      environment: { QUIPSLY_SAAS_ENTITLEMENT_ENFORCEMENT: "true" },
    });

    expect(tx.subscription.create).not.toHaveBeenCalled();
    expect(tx.subscription.update).not.toHaveBeenCalled();
    expect(tx.organization.create).not.toHaveBeenCalled();
  });

  it("continues permanent early access when commercial enforcement is off", async () => {
    const tx = {
      subscriptionPlan: {
        upsert: jest.fn()
          .mockResolvedValueOnce({ id: "plan-early" })
          .mockResolvedValueOnce({ id: "plan-trial" })
          .mockResolvedValue({ id: "plan-paid" }),
      },
      subscription: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn(),
      },
      organizationMember: {
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn().mockResolvedValue({
          organizationId: "org-early",
          organization: { subscription: null },
        }),
      },
      organization: {
        create: jest.fn().mockResolvedValue({ id: "org-early" }),
      },
    };
    const prisma = {
      $transaction: jest.fn().mockImplementation((callback) => callback(tx)),
      subscription: { findFirst: jest.fn().mockResolvedValue(null) },
    };

    await ensureQuipslyBillingContext({
      prisma,
      user: { id: "coach-early", name: "Early Coach" },
      environment: {},
    });

    expect(tx.subscription.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        planId: "plan-early",
        providerStatus: "EARLY_ACCESS",
        status: "ACTIVE",
        currentPeriodEnd: null,
        trialEnd: null,
      }),
    });
  });
});
