ALTER TYPE "CallRoomInvitationDeliveryStatus" ADD VALUE IF NOT EXISTS 'DELIVERY_DELAYED';
ALTER TYPE "CallRoomInvitationDeliveryStatus" ADD VALUE IF NOT EXISTS 'DELIVERED';
ALTER TYPE "CallRoomInvitationDeliveryStatus" ADD VALUE IF NOT EXISTS 'BOUNCED';
ALTER TYPE "CallRoomInvitationDeliveryStatus" ADD VALUE IF NOT EXISTS 'COMPLAINED';
ALTER TYPE "CallRoomInvitationDeliveryStatus" ADD VALUE IF NOT EXISTS 'SUPPRESSED';

CREATE TYPE "EmailRecipientDeliveryStatus" AS ENUM ('DELIVERABLE', 'BOUNCED', 'COMPLAINED', 'SUPPRESSED');

ALTER TABLE "CallRoomInvitationDeliveryReceipt"
ADD COLUMN "providerStatusAt" TIMESTAMP(3);

CREATE TABLE "EmailProviderEvent" (
  "id" TEXT NOT NULL,
  "provider" TEXT NOT NULL DEFAULT 'resend',
  "providerEventId" TEXT NOT NULL,
  "providerMessageId" TEXT NOT NULL,
  "eventType" TEXT NOT NULL,
  "recipientEmail" TEXT,
  "occurredAt" TIMESTAMP(3) NOT NULL,
  "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "payloadSha256" TEXT NOT NULL,
  "diagnosticJson" JSONB NOT NULL DEFAULT '{}',
  "deliveryReceiptId" TEXT,
  CONSTRAINT "EmailProviderEvent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EmailRecipientDeliveryState" (
  "recipientEmail" TEXT NOT NULL,
  "status" "EmailRecipientDeliveryStatus" NOT NULL DEFAULT 'DELIVERABLE',
  "provider" TEXT NOT NULL DEFAULT 'resend',
  "lastProviderEventId" TEXT NOT NULL,
  "lastProviderMessageId" TEXT NOT NULL,
  "reasonCode" TEXT,
  "reasonMessage" TEXT,
  "lastEventAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "EmailRecipientDeliveryState_pkey" PRIMARY KEY ("recipientEmail")
);

CREATE UNIQUE INDEX "EmailProviderEvent_provider_providerEventId_key"
ON "EmailProviderEvent"("provider", "providerEventId");
CREATE INDEX "EmailProviderEvent_provider_providerMessageId_occurredAt_idx"
ON "EmailProviderEvent"("provider", "providerMessageId", "occurredAt");
CREATE INDEX "EmailProviderEvent_eventType_occurredAt_idx"
ON "EmailProviderEvent"("eventType", "occurredAt");
CREATE INDEX "EmailProviderEvent_recipientEmail_occurredAt_idx"
ON "EmailProviderEvent"("recipientEmail", "occurredAt");
CREATE INDEX "EmailProviderEvent_deliveryReceiptId_occurredAt_idx"
ON "EmailProviderEvent"("deliveryReceiptId", "occurredAt");
CREATE INDEX "EmailRecipientDeliveryState_status_updatedAt_idx"
ON "EmailRecipientDeliveryState"("status", "updatedAt");
CREATE INDEX "EmailRecipientDeliveryState_lastProviderMessageId_idx"
ON "EmailRecipientDeliveryState"("lastProviderMessageId");

ALTER TABLE "EmailProviderEvent"
ADD CONSTRAINT "EmailProviderEvent_deliveryReceiptId_fkey"
FOREIGN KEY ("deliveryReceiptId") REFERENCES "CallRoomInvitationDeliveryReceipt"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
