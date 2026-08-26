-- Make Quipsly SaaS subscription truth provider-agnostic while retaining the
-- existing Stripe compatibility columns. This migration is additive so it can
-- be staged and read before any App Store or web subscription is activated.

CREATE TYPE "SubscriptionProvider" AS ENUM ('APP_STORE', 'STRIPE', 'MANUAL');
CREATE TYPE "SubscriptionProviderEventStatus" AS ENUM ('RECEIVED', 'PROCESSED', 'IGNORED', 'FAILED');

ALTER TABLE "SubscriptionPlan"
  ADD COLUMN "stableKey" TEXT,
  ADD COLUMN "stripePriceId" TEXT,
  ADD COLUMN "appleProductId" TEXT,
  ADD COLUMN "capabilitiesJson" JSONB,
  ADD COLUMN "purchasable" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "displayOrder" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "Subscription"
  ADD COLUMN "billingOwnerUserId" TEXT,
  ADD COLUMN "provider" "SubscriptionProvider",
  ADD COLUMN "providerCustomerId" TEXT,
  ADD COLUMN "providerSubscriptionId" TEXT,
  ADD COLUMN "originalTransactionId" TEXT,
  ADD COLUMN "appAccountToken" TEXT,
  ADD COLUMN "providerStatus" TEXT,
  ADD COLUMN "currentPeriodStart" TIMESTAMP(3),
  ADD COLUMN "trialEnd" TIMESTAMP(3),
  ADD COLUMN "cancelAtPeriodEnd" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "verifiedAt" TIMESTAMP(3);

CREATE TABLE "SubscriptionProviderEvent" (
  "id" TEXT NOT NULL,
  "provider" "SubscriptionProvider" NOT NULL,
  "externalEventId" TEXT NOT NULL,
  "eventType" TEXT NOT NULL,
  "status" "SubscriptionProviderEventStatus" NOT NULL DEFAULT 'RECEIVED',
  "payloadSha256" TEXT NOT NULL,
  "organizationId" TEXT,
  "subscriptionId" TEXT,
  "occurredAt" TIMESTAMP(3),
  "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "processedAt" TIMESTAMP(3),
  "errorCode" TEXT,
  CONSTRAINT "SubscriptionProviderEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SubscriptionPlan_stableKey_key" ON "SubscriptionPlan"("stableKey");
CREATE UNIQUE INDEX "SubscriptionPlan_stripePriceId_key" ON "SubscriptionPlan"("stripePriceId");
CREATE UNIQUE INDEX "SubscriptionPlan_appleProductId_key" ON "SubscriptionPlan"("appleProductId");
CREATE UNIQUE INDEX "Subscription_providerSubscriptionId_key" ON "Subscription"("providerSubscriptionId");
CREATE UNIQUE INDEX "Subscription_billingOwnerUserId_key" ON "Subscription"("billingOwnerUserId");
CREATE UNIQUE INDEX "Subscription_originalTransactionId_key" ON "Subscription"("originalTransactionId");
CREATE UNIQUE INDEX "Subscription_appAccountToken_key" ON "Subscription"("appAccountToken");
CREATE INDEX "Subscription_provider_providerStatus_idx" ON "Subscription"("provider", "providerStatus");
CREATE INDEX "Subscription_billingOwnerUserId_status_idx" ON "Subscription"("billingOwnerUserId", "status");
CREATE INDEX "Subscription_providerCustomerId_idx" ON "Subscription"("providerCustomerId");
CREATE UNIQUE INDEX "SubscriptionProviderEvent_provider_externalEventId_key" ON "SubscriptionProviderEvent"("provider", "externalEventId");
CREATE INDEX "SubscriptionProviderEvent_organizationId_receivedAt_idx" ON "SubscriptionProviderEvent"("organizationId", "receivedAt");
CREATE INDEX "SubscriptionProviderEvent_subscriptionId_receivedAt_idx" ON "SubscriptionProviderEvent"("subscriptionId", "receivedAt");
CREATE INDEX "SubscriptionProviderEvent_status_receivedAt_idx" ON "SubscriptionProviderEvent"("status", "receivedAt");

ALTER TABLE "SubscriptionProviderEvent"
  ADD CONSTRAINT "SubscriptionProviderEvent_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "SubscriptionProviderEvent"
  ADD CONSTRAINT "SubscriptionProviderEvent_subscriptionId_fkey"
  FOREIGN KEY ("subscriptionId") REFERENCES "Subscription"("id") ON DELETE SET NULL ON UPDATE CASCADE;
