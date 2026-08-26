import "server-only";

import { createHash } from "node:crypto";

import {
  Environment,
  SignedDataVerifier,
  type JWSRenewalInfoDecodedPayload,
  type JWSTransactionDecodedPayload,
  type ResponseBodyV2DecodedPayload,
} from "@apple/app-store-server-library";

import { acquirePrismaAdvisoryTransactionLock } from "@/lib/server/prisma-advisory-lock";
import { APPLE_ROOT_CERTIFICATES_DER_BASE64 } from "@/lib/server/apple-root-certificates";
import {
  ensureAppStorePlan,
  quipslyAppStoreProducts,
  readQuipslyEntitlement,
} from "@/lib/server/subscription-entitlements";

type AppStoreEnvironment = "Production" | "Sandbox";

function parseRootCertificates(value: string | undefined) {
  if (!value?.trim()) {
    return APPLE_ROOT_CERTIFICATES_DER_BASE64.map((item) => Buffer.from(item, "base64"));
  }
  let encoded: string[];
  try {
    const parsed = JSON.parse(value);
    encoded = Array.isArray(parsed) ? parsed : [value];
  } catch {
    encoded = value.split(",");
  }
  return encoded
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => Buffer.from(item, "base64"));
}

export function appStoreServerVerificationReadiness(
  environment: Readonly<Record<string, string | undefined>> = process.env,
) {
  const rootCertificates = parseRootCertificates(environment.APP_STORE_ROOT_CERTIFICATES_BASE64);
  const appAppleId = Number(environment.APP_STORE_APP_APPLE_ID || "");
  return {
    configured: rootCertificates.length > 0,
    bundleId: environment.APP_STORE_BUNDLE_ID || "com.highgroundodyssey.HighGroundCapture",
    rootCertificateCount: rootCertificates.length,
    productionAppAppleIdConfigured: Number.isSafeInteger(appAppleId) && appAppleId > 0,
    onlineRevocationChecks: environment.APP_STORE_ENABLE_ONLINE_CHECKS !== "false",
    productIds: quipslyAppStoreProducts(environment).map((product) => product.productId),
  };
}

function verifierFor(
  target: AppStoreEnvironment,
  environment: Readonly<Record<string, string | undefined>>,
) {
  const roots = parseRootCertificates(environment.APP_STORE_ROOT_CERTIFICATES_BASE64);
  if (roots.length === 0) {
    throw new Error("APP_STORE_ROOT_CERTIFICATES_BASE64 is required before App Store transactions can be verified.");
  }
  const appAppleId = Number(environment.APP_STORE_APP_APPLE_ID || "");
  return new SignedDataVerifier(
    roots,
    environment.APP_STORE_ENABLE_ONLINE_CHECKS !== "false",
    target === "Production" ? Environment.PRODUCTION : Environment.SANDBOX,
    environment.APP_STORE_BUNDLE_ID || "com.highgroundodyssey.HighGroundCapture",
    target === "Production" && Number.isSafeInteger(appAppleId) && appAppleId > 0
      ? appAppleId
      : undefined,
  );
}

function verificationOrder(hint?: string | null): AppStoreEnvironment[] {
  if (hint?.toLowerCase() === "sandbox") return ["Sandbox"];
  if (hint?.toLowerCase() === "production") return ["Production"];
  return ["Production", "Sandbox"];
}

export async function verifyAppStoreTransaction(input: {
  signedTransactionInfo: string;
  environmentHint?: string | null;
  environment?: Readonly<Record<string, string | undefined>>;
}) {
  const environment = input.environment ?? process.env;
  let lastError: unknown = null;
  for (const target of verificationOrder(input.environmentHint)) {
    try {
      const transaction = await verifierFor(target, environment)
        .verifyAndDecodeTransaction(input.signedTransactionInfo);
      return { transaction, environment: target };
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError instanceof Error ? lastError : new Error("Apple transaction verification failed.");
}

export async function verifyAppStoreNotification(input: {
  signedPayload: string;
  environment?: Readonly<Record<string, string | undefined>>;
}) {
  const environment = input.environment ?? process.env;
  let lastError: unknown = null;
  for (const target of verificationOrder()) {
    try {
      const notification = await verifierFor(target, environment)
        .verifyAndDecodeNotification(input.signedPayload);
      return { notification, environment: target };
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError instanceof Error ? lastError : new Error("Apple notification verification failed.");
}

export async function verifyAppStoreRenewalInfo(input: {
  signedRenewalInfo: string;
  environmentHint?: string | null;
  environment?: Readonly<Record<string, string | undefined>>;
}) {
  const environment = input.environment ?? process.env;
  let lastError: unknown = null;
  for (const target of verificationOrder(input.environmentHint)) {
    try {
      const renewalInfo = await verifierFor(target, environment)
        .verifyAndDecodeRenewalInfo(input.signedRenewalInfo);
      return { renewalInfo, environment: target };
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError instanceof Error ? lastError : new Error("Apple renewal-info verification failed.");
}

function dateFromMilliseconds(value?: number) {
  return typeof value === "number" && Number.isFinite(value) ? new Date(value) : null;
}

function transactionStatus(
  transaction: JWSTransactionDecodedPayload,
  renewalInfo: JWSRenewalInfoDecodedPayload | null,
  now: Date,
) {
  if (transaction.revocationDate) return { status: "CANCELED", providerStatus: "REVOKED" } as const;
  const expiresAt = dateFromMilliseconds(transaction.expiresDate);
  if (expiresAt && expiresAt.getTime() <= now.getTime()) {
    const graceEndsAt = dateFromMilliseconds(renewalInfo?.gracePeriodExpiresDate);
    if (graceEndsAt && graceEndsAt.getTime() > now.getTime()) {
      return { status: "ACTIVE", providerStatus: "BILLING_GRACE_PERIOD" } as const;
    }
    return { status: "CANCELED", providerStatus: "EXPIRED" } as const;
  }
  return { status: "ACTIVE", providerStatus: "ACTIVE" } as const;
}

export async function applyVerifiedAppStoreTransaction(input: {
  prisma: any;
  transaction: JWSTransactionDecodedPayload;
  renewalInfo?: JWSRenewalInfoDecodedPayload | null;
  signedPayload: string;
  verificationEnvironment: AppStoreEnvironment;
  eventId?: string | null;
  eventType?: string | null;
  expectedUserId?: string | null;
  environment?: Readonly<Record<string, string | undefined>>;
  now?: Date;
}) {
  const environment = input.environment ?? process.env;
  const now = input.now ?? new Date();
  const transactionId = input.transaction.transactionId?.trim();
  const originalTransactionId = input.transaction.originalTransactionId?.trim();
  const productId = input.transaction.productId?.trim();
  if (!transactionId || !originalTransactionId || !productId) {
    throw new Error("The verified App Store transaction is missing a transaction, original transaction, or product identifier.");
  }
  if (
    input.renewalInfo?.originalTransactionId &&
    input.renewalInfo.originalTransactionId !== originalTransactionId
  ) {
    throw new Error("The verified App Store transaction and renewal information do not describe the same subscription.");
  }
  const plan = await ensureAppStorePlan({ prisma: input.prisma, productId, environment });
  if (!plan) throw new Error("The verified App Store product is not a Quipsly subscription product.");
  const externalEventId = input.eventId?.trim() || transactionId;
  const payloadSha256 = createHash("sha256").update(input.signedPayload).digest("hex");

  const applied = await input.prisma.$transaction(async (tx: any) => {
    await acquirePrismaAdvisoryTransactionLock(tx, `app-store-subscription:${originalTransactionId}`);
    const duplicate = await tx.subscriptionProviderEvent.findUnique({
      where: { provider_externalEventId: { provider: "APP_STORE", externalEventId } },
      select: { subscriptionId: true },
    });
    if (duplicate?.subscriptionId) return { subscriptionId: duplicate.subscriptionId, duplicate: true };

    const token = input.transaction.appAccountToken?.trim() || null;
    let subscription = token
      ? await tx.subscription.findUnique({ where: { appAccountToken: token } })
      : null;
    if (!subscription) {
      subscription = await tx.subscription.findUnique({ where: { originalTransactionId } });
    }
    if (!subscription) {
      throw new Error("This verified App Store purchase is not linked to a Quipsly billing account.");
    }
    if (input.expectedUserId) {
      if (subscription.billingOwnerUserId !== input.expectedUserId) {
        throw new Error("This App Store purchase belongs to a different Quipsly account.");
      }
    }
    if (subscription.originalTransactionId && subscription.originalTransactionId !== originalTransactionId) {
      throw new Error("This Quipsly subscription is already linked to a different App Store purchase.");
    }

    const state = transactionStatus(input.transaction, input.renewalInfo ?? null, now);
    const cancelAtPeriodEnd = input.renewalInfo?.autoRenewStatus === undefined
      ? undefined
      : Number(input.renewalInfo.autoRenewStatus) === 0;
    const updated = await tx.subscription.update({
      where: { id: subscription.id },
      data: {
        planId: plan.id,
        provider: "APP_STORE",
        providerSubscriptionId: originalTransactionId,
        originalTransactionId,
        providerStatus: `${state.providerStatus}${cancelAtPeriodEnd ? ":CANCELS_AT_PERIOD_END" : ""}:${input.verificationEnvironment.toUpperCase()}`,
        status: state.status,
        currentPeriodStart: dateFromMilliseconds(input.transaction.purchaseDate),
        currentPeriodEnd: dateFromMilliseconds(input.transaction.expiresDate),
        cancelAtPeriodEnd,
        verifiedAt: now,
      },
    });
    await tx.subscriptionProviderEvent.create({
      data: {
        provider: "APP_STORE",
        externalEventId,
        eventType: input.eventType?.trim() || "TRANSACTION",
        status: "PROCESSED",
        payloadSha256,
        organizationId: updated.organizationId,
        subscriptionId: updated.id,
        occurredAt: dateFromMilliseconds(input.transaction.signedDate),
        processedAt: now,
      },
    });
    return { subscriptionId: updated.id, duplicate: false };
  }, { maxWait: 5_000, timeout: 20_000, isolationLevel: "Serializable" });

  return { ...applied, productId, originalTransactionId };
}

export async function applyVerifiedAppStoreNotification(input: {
  prisma: any;
  notification: ResponseBodyV2DecodedPayload;
  signedPayload: string;
  verificationEnvironment: AppStoreEnvironment;
  environment?: Readonly<Record<string, string | undefined>>;
}) {
  const signedTransactionInfo = input.notification.data?.signedTransactionInfo;
  if (!signedTransactionInfo) return { ignored: true, reason: "NO_TRANSACTION" } as const;
  const verified = await verifyAppStoreTransaction({
    signedTransactionInfo,
    environmentHint: input.verificationEnvironment,
    environment: input.environment,
  });
  const renewal = input.notification.data?.signedRenewalInfo
    ? await verifyAppStoreRenewalInfo({
        signedRenewalInfo: input.notification.data.signedRenewalInfo,
        environmentHint: input.verificationEnvironment,
        environment: input.environment,
      })
    : null;
  return applyVerifiedAppStoreTransaction({
    prisma: input.prisma,
    transaction: verified.transaction,
    renewalInfo: renewal?.renewalInfo ?? null,
    signedPayload: input.signedPayload,
    verificationEnvironment: verified.environment,
    eventId: input.notification.notificationUUID,
    eventType: String(input.notification.notificationType || "NOTIFICATION"),
    environment: input.environment,
  });
}

export async function appStoreEntitlementForUser(input: {
  prisma: any;
  userId: string;
  environment?: Readonly<Record<string, string | undefined>>;
}) {
  return readQuipslyEntitlement(input);
}
