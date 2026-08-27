jest.mock("server-only", () => ({}));
jest.mock("@/lib/server/prisma-advisory-lock", () => ({
  acquirePrismaAdvisoryTransactionLock: jest.fn().mockResolvedValue(undefined),
}));
jest.mock("@/lib/server/subscription-entitlements", () => ({
  ensureAppStorePlan: jest.fn().mockResolvedValue({ id: "plan-coach" }),
  quipslyAppStoreProducts: jest.fn().mockReturnValue([
    { planKey: "quipsly-coach-monthly", productId: "com.quipsly.capture.coach.monthly", billingPeriod: "P1M" },
  ]),
  readQuipslyEntitlement: jest.fn(),
}));

import {
  appStoreServerVerificationReadiness,
  applyVerifiedAppStoreNotification,
  applyVerifiedAppStoreTransaction,
} from "./app-store-subscriptions";

describe("App Store subscription verification boundary", () => {
  it("reports verification readiness without exposing certificate bytes", () => {
    const readiness = appStoreServerVerificationReadiness({
      APP_STORE_ROOT_CERTIFICATES_BASE64: JSON.stringify([
        Buffer.from("public-root-one").toString("base64"),
        Buffer.from("public-root-two").toString("base64"),
      ]),
      APP_STORE_APP_APPLE_ID: "6780995957",
    });

    expect(readiness).toMatchObject({
      configured: true,
      rootCertificateCount: 2,
      productionAppAppleIdConfigured: true,
      bundleId: "com.highgroundodyssey.HighGroundCapture",
    });
    expect(JSON.stringify(readiness)).not.toMatch(/public-root/);
  });

  it("ships Apple's public trust anchors so production verification is not secret-dependent", () => {
    expect(appStoreServerVerificationReadiness({})).toMatchObject({
      configured: true,
      rootCertificateCount: 3,
    });
  });

  it("acknowledges Apple's verified TEST notification without inventing a transaction", async () => {
    const result = await applyVerifiedAppStoreNotification({
      prisma: {},
      notification: {
        notificationType: "TEST",
        notificationUUID: "server-notification-test-1",
      },
      signedPayload: "verified-test-notification",
      verificationEnvironment: "Sandbox",
    });

    expect(result).toEqual({ ignored: true, reason: "NO_TRANSACTION" });
  });

  it("applies a verified transaction idempotently to the linked Quipsly account", async () => {
    const subscription = {
      id: "sub-1",
      organizationId: "org-1",
      billingOwnerUserId: "coach-1",
      appAccountToken: "760af700-b296-4b3f-b0fe-3f5648c299b4",
      originalTransactionId: null,
    };
    const tx = {
      subscriptionProviderEvent: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ id: "event-1" }),
      },
      subscription: {
        findUnique: jest.fn().mockResolvedValue(subscription),
        update: jest.fn().mockImplementation(({ data }) => Promise.resolve({ ...subscription, ...data })),
      },
    };
    const prisma = {
      $transaction: jest.fn().mockImplementation((callback) => callback(tx)),
    };

    const result = await applyVerifiedAppStoreTransaction({
      prisma,
      transaction: {
        transactionId: "200000000000001",
        originalTransactionId: "100000000000001",
        productId: "com.quipsly.capture.coach.monthly",
        appAccountToken: "760af700-b296-4b3f-b0fe-3f5648c299b4",
        purchaseDate: Date.parse("2026-08-26T12:00:00.000Z"),
        expiresDate: Date.parse("2026-09-26T12:00:00.000Z"),
        signedDate: Date.parse("2026-08-26T12:00:01.000Z"),
      },
      signedPayload: "verified-jws-payload",
      verificationEnvironment: "Production",
      expectedUserId: "coach-1",
      now: new Date("2026-08-26T12:00:02.000Z"),
    });

    expect(result).toMatchObject({
      duplicate: false,
      productId: "com.quipsly.capture.coach.monthly",
      originalTransactionId: "100000000000001",
    });
    expect(tx.subscription.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "sub-1" },
      data: expect.objectContaining({
        provider: "APP_STORE",
        planId: "plan-coach",
        status: "ACTIVE",
        providerStatus: "ACTIVE:PRODUCTION",
        originalTransactionId: "100000000000001",
      }),
    }));
    expect(tx.subscriptionProviderEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        provider: "APP_STORE",
        externalEventId: "200000000000001",
        status: "PROCESSED",
        payloadSha256: expect.stringMatching(/^[a-f0-9]{64}$/),
      }),
    });
  });

  it("refuses to attach another Quipsly user's verified purchase", async () => {
    const subscription = {
      id: "sub-other",
      organizationId: "org-other",
      billingOwnerUserId: "coach-other",
      appAccountToken: "760af700-b296-4b3f-b0fe-3f5648c299b4",
      originalTransactionId: null,
    };
    const tx = {
      subscriptionProviderEvent: {
        findUnique: jest.fn().mockResolvedValue(null),
      },
      subscription: {
        findUnique: jest.fn().mockResolvedValue(subscription),
        update: jest.fn(),
      },
    };
    const prisma = {
      $transaction: jest.fn().mockImplementation((callback) => callback(tx)),
    };

    await expect(applyVerifiedAppStoreTransaction({
      prisma,
      transaction: {
        transactionId: "200000000000002",
        originalTransactionId: "100000000000002",
        productId: "com.quipsly.capture.coach.monthly",
        appAccountToken: "760af700-b296-4b3f-b0fe-3f5648c299b4",
      },
      signedPayload: "verified-jws-payload",
      verificationEnvironment: "Production",
      expectedUserId: "coach-1",
    })).rejects.toThrow("different Quipsly account");
    expect(tx.subscription.update).not.toHaveBeenCalled();
  });
});
