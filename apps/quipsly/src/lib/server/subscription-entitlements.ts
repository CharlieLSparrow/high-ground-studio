import "server-only";

import { randomUUID } from "node:crypto";

import { acquirePrismaAdvisoryTransactionLock } from "@/lib/server/prisma-advisory-lock";

export const QUIPSLY_COACH_CAPABILITIES = [
  "coaching.schedule",
  "coaching.invite",
  "coaching.call",
  "coaching.local_recording",
  "coaching.cloud_sync",
  "coaching.transcription",
  "coaching.basic_editing",
  "coaching.shared_notes",
  "coaching.shared_tasks",
  "coaching.shared_goals",
] as const;

export type QuipslyCoachCapability = typeof QUIPSLY_COACH_CAPABILITIES[number];

export const QUIPSLY_COACH_PLAN_KEYS = {
  earlyAccess: "quipsly-early-access",
  monthly: "quipsly-coach-monthly",
  annual: "quipsly-coach-annual",
} as const;

export function quipslyAppStoreProducts(
  environment: Readonly<Record<string, string | undefined>> = process.env,
) {
  return [
    {
      planKey: QUIPSLY_COACH_PLAN_KEYS.monthly,
      productId:
        environment.QUIPSLY_APP_STORE_COACH_MONTHLY_PRODUCT_ID ||
        "com.quipsly.capture.coach.monthly",
      billingPeriod: "P1M",
    },
    {
      planKey: QUIPSLY_COACH_PLAN_KEYS.annual,
      productId:
        environment.QUIPSLY_APP_STORE_COACH_ANNUAL_PRODUCT_ID ||
        "com.quipsly.capture.coach.annual",
      billingPeriod: "P1Y",
    },
  ] as const;
}

function entitlementEnforcementEnabled(
  environment: Readonly<Record<string, string | undefined>>,
) {
  return environment.QUIPSLY_SAAS_ENTITLEMENT_ENFORCEMENT === "true";
}

function planCapabilities(plan: any): QuipslyCoachCapability[] {
  const configured = plan?.capabilitiesJson;
  if (!Array.isArray(configured)) return [...QUIPSLY_COACH_CAPABILITIES];
  const allowed = new Set<string>(QUIPSLY_COACH_CAPABILITIES);
  return configured.filter(
    (value: unknown): value is QuipslyCoachCapability =>
      typeof value === "string" && allowed.has(value),
  );
}

export async function readQuipslyEntitlement(input: {
  prisma: any;
  userId: string;
  environment?: Readonly<Record<string, string | undefined>>;
  now?: Date;
}) {
  const environment = input.environment ?? process.env;
  const now = input.now ?? new Date();
  const subscription = await input.prisma.subscription.findFirst({
    where: {
      billingOwnerUserId: input.userId,
      status: { in: ["ACTIVE", "TRIALING"] },
      OR: [{ currentPeriodEnd: null }, { currentPeriodEnd: { gt: now } }],
    },
    orderBy: { plan: { displayOrder: "desc" } },
    include: { plan: true },
  });
  const enforcementEnabled = entitlementEnforcementEnabled(environment);
  const provider = subscription?.provider ?? null;
  const entitled = Boolean(subscription) || !enforcementEnabled;

  return {
    schema: "quipsly-saas-entitlement-v1",
    entitled,
    enforcementEnabled,
    accessMode: subscription
      ? provider === "MANUAL"
        ? "EARLY_ACCESS"
        : "SUBSCRIBED"
      : enforcementEnabled
        ? "FREE"
        : "EARLY_ACCESS",
    planKey: subscription?.plan?.stableKey ?? QUIPSLY_COACH_PLAN_KEYS.earlyAccess,
    planName: subscription?.plan?.name ?? "Quipsly early access",
    provider,
    status: subscription?.status ?? (enforcementEnabled ? "INACTIVE" : "ACTIVE"),
    currentPeriodEnd: subscription?.currentPeriodEnd?.toISOString?.() ?? null,
    cancelAtPeriodEnd: subscription?.cancelAtPeriodEnd === true,
    verifiedAt: subscription?.verifiedAt?.toISOString?.() ?? null,
    capabilities: entitled
      ? planCapabilities(subscription?.plan)
      : [],
    organizationId: subscription?.organizationId ?? null,
    subscriptionId: subscription?.id ?? null,
    appAccountToken: subscription?.appAccountToken ?? null,
    products: quipslyAppStoreProducts(environment),
    management: {
      appStoreURL: "https://apps.apple.com/account/subscriptions",
      webURL: "/settings#subscription",
    },
  };
}

async function upsertQuipslyPlans(prisma: any, environment: Readonly<Record<string, string | undefined>>) {
  const products = quipslyAppStoreProducts(environment);
  const capabilitiesJson = [...QUIPSLY_COACH_CAPABILITIES];
  const earlyAccess = await prisma.subscriptionPlan.upsert({
    where: { stableKey: QUIPSLY_COACH_PLAN_KEYS.earlyAccess },
    update: { capabilitiesJson, displayOrder: 10 },
    create: {
      stableKey: QUIPSLY_COACH_PLAN_KEYS.earlyAccess,
      name: "Quipsly early access",
      price: 0,
      currency: "usd",
      interval: "month",
      capabilitiesJson,
      purchasable: false,
      displayOrder: 10,
    },
  });
  for (const [index, product] of products.entries()) {
    await prisma.subscriptionPlan.upsert({
      where: { stableKey: product.planKey },
      update: {
        appleProductId: product.productId,
        capabilitiesJson,
        purchasable: true,
        displayOrder: 100 + index,
      },
      create: {
        stableKey: product.planKey,
        name: product.billingPeriod === "P1Y" ? "Quipsly Coach annual" : "Quipsly Coach monthly",
        appleProductId: product.productId,
        price: 0,
        currency: "usd",
        interval: product.billingPeriod === "P1Y" ? "year" : "month",
        capabilitiesJson,
        purchasable: true,
        displayOrder: 100 + index,
      },
    });
  }
  return earlyAccess;
}

export async function ensureQuipslyBillingContext(input: {
  prisma: any;
  user: { id: string; name?: string | null };
  environment?: Readonly<Record<string, string | undefined>>;
}) {
  const environment = input.environment ?? process.env;
  await input.prisma.$transaction(async (tx: any) => {
    await acquirePrismaAdvisoryTransactionLock(tx, `quipsly-billing-context:${input.user.id}`);
    const earlyAccess = await upsertQuipslyPlans(tx, environment);
    let subscription = await tx.subscription.findUnique({
      where: { billingOwnerUserId: input.user.id },
      include: { organization: true },
    });
    let membership = subscription
      ? await tx.organizationMember.findFirst({
          where: { userId: input.user.id, organizationId: subscription.organizationId },
          include: { organization: { include: { subscription: true } } },
        })
      : null;
    if (subscription && !membership) {
      membership = await tx.organizationMember.create({
        data: {
          organizationId: subscription.organizationId,
          userId: input.user.id,
          role: "OWNER",
        },
        include: { organization: { include: { subscription: true } } },
      });
    }
    if (!subscription) {
      const legacyOwnerMemberships = await tx.organizationMember.findMany({
        where: {
          userId: input.user.id,
          role: "OWNER",
          organization: { subscription: { is: { billingOwnerUserId: null } } },
        },
        take: 2,
        include: { organization: { include: { subscription: true } } },
      });
      if (legacyOwnerMemberships.length === 1) {
        membership = legacyOwnerMemberships[0];
        subscription = await tx.subscription.update({
          where: { id: membership.organization.subscription.id },
          data: { billingOwnerUserId: input.user.id },
          include: { organization: true },
        });
      }
    }
    if (!membership) {
      const suffix = input.user.id.replace(/[^a-zA-Z0-9]/g, "").slice(-12).toLowerCase();
      const organization = await tx.organization.create({
        data: {
          name: input.user.name?.trim() ? `${input.user.name.trim()}'s Quipsly` : "My Quipsly",
          slug: `quipsly-${suffix || randomUUID().slice(0, 12)}`,
        },
      });
      membership = await tx.organizationMember.create({
        data: {
          organizationId: organization.id,
          userId: input.user.id,
          role: "OWNER",
        },
        include: { organization: { include: { subscription: true } } },
      });
    }
    subscription = membership.organization.subscription ?? subscription;
    if (!subscription) {
      const grantEarlyAccess = !entitlementEnforcementEnabled(environment);
      await tx.subscription.create({
        data: {
          organizationId: membership.organizationId,
          billingOwnerUserId: input.user.id,
          planId: earlyAccess.id,
          provider: "MANUAL",
          providerStatus: grantEarlyAccess ? "EARLY_ACCESS" : "AWAITING_PURCHASE",
          status: grantEarlyAccess ? "ACTIVE" : "INCOMPLETE",
          appAccountToken: randomUUID(),
          verifiedAt: grantEarlyAccess ? new Date() : null,
        },
      });
    } else if (!subscription.appAccountToken || !subscription.billingOwnerUserId) {
      await tx.subscription.update({
        where: { id: subscription.id },
        data: {
          appAccountToken: subscription.appAccountToken || randomUUID(),
          billingOwnerUserId: input.user.id,
        },
      });
    }
  }, { maxWait: 5_000, timeout: 20_000, isolationLevel: "Serializable" });

  return readQuipslyEntitlement({
    prisma: input.prisma,
    userId: input.user.id,
    environment,
  });
}

export async function ensureAppStorePlan(input: {
  prisma: any;
  productId: string;
  environment?: Readonly<Record<string, string | undefined>>;
}) {
  const environment = input.environment ?? process.env;
  const product = quipslyAppStoreProducts(environment).find((candidate) => candidate.productId === input.productId);
  if (!product) return null;
  await upsertQuipslyPlans(input.prisma, environment);
  return input.prisma.subscriptionPlan.findUnique({ where: { stableKey: product.planKey } });
}
