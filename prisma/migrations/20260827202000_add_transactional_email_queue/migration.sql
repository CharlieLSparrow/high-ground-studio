CREATE TYPE "TransactionalEmailKind" AS ENUM (
  'BOOKING_CONFIRMED',
  'SESSION_REMINDER_24H',
  'SESSION_REMINDER_1H'
);

CREATE TYPE "TransactionalEmailStatus" AS ENUM (
  'PLANNED',
  'SENDING',
  'SENT',
  'DELIVERY_DELAYED',
  'DELIVERED',
  'BOUNCED',
  'COMPLAINED',
  'SUPPRESSED',
  'FAILED',
  'CANCELED'
);

CREATE TABLE "TransactionalEmail" (
  "id" TEXT NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "bookingId" TEXT NOT NULL,
  "roomId" TEXT NOT NULL,
  "recipientUserId" TEXT NOT NULL,
  "recipientEmail" TEXT NOT NULL,
  "recipientRole" TEXT NOT NULL,
  "kind" "TransactionalEmailKind" NOT NULL,
  "status" "TransactionalEmailStatus" NOT NULL DEFAULT 'PLANNED',
  "templateVersion" TEXT NOT NULL DEFAULT '2026-08-27.v1',
  "scheduleFingerprint" TEXT NOT NULL,
  "scheduledFor" TIMESTAMP(3) NOT NULL,
  "nextAttemptAt" TIMESTAMP(3) NOT NULL,
  "attemptCount" INTEGER NOT NULL DEFAULT 0,
  "maxAttempts" INTEGER NOT NULL DEFAULT 5,
  "leaseToken" TEXT,
  "leaseExpiresAt" TIMESTAMP(3),
  "provider" TEXT NOT NULL DEFAULT 'resend',
  "providerMessageId" TEXT,
  "providerStatusAt" TIMESTAMP(3),
  "errorCode" TEXT,
  "errorMessage" TEXT,
  "sentAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "canceledAt" TIMESTAMP(3),
  "metadataJson" JSONB NOT NULL DEFAULT '{}',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TransactionalEmail_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "EmailProviderEvent"
ADD COLUMN "transactionalEmailId" TEXT;

CREATE UNIQUE INDEX "TransactionalEmail_idempotencyKey_key"
ON "TransactionalEmail"("idempotencyKey");
CREATE INDEX "TransactionalEmail_status_nextAttemptAt_scheduledFor_idx"
ON "TransactionalEmail"("status", "nextAttemptAt", "scheduledFor");
CREATE INDEX "TransactionalEmail_bookingId_status_scheduledFor_idx"
ON "TransactionalEmail"("bookingId", "status", "scheduledFor");
CREATE INDEX "TransactionalEmail_roomId_status_scheduledFor_idx"
ON "TransactionalEmail"("roomId", "status", "scheduledFor");
CREATE INDEX "TransactionalEmail_recipientEmail_status_scheduledFor_idx"
ON "TransactionalEmail"("recipientEmail", "status", "scheduledFor");
CREATE INDEX "TransactionalEmail_provider_providerMessageId_idx"
ON "TransactionalEmail"("provider", "providerMessageId");
CREATE INDEX "EmailProviderEvent_transactionalEmailId_occurredAt_idx"
ON "EmailProviderEvent"("transactionalEmailId", "occurredAt");

ALTER TABLE "TransactionalEmail"
ADD CONSTRAINT "TransactionalEmail_bookingId_fkey"
FOREIGN KEY ("bookingId") REFERENCES "CoachingBooking"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TransactionalEmail"
ADD CONSTRAINT "TransactionalEmail_roomId_fkey"
FOREIGN KEY ("roomId") REFERENCES "CallRoom"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TransactionalEmail"
ADD CONSTRAINT "TransactionalEmail_recipientUserId_fkey"
FOREIGN KEY ("recipientUserId") REFERENCES "User"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "EmailProviderEvent"
ADD CONSTRAINT "EmailProviderEvent_transactionalEmailId_fkey"
FOREIGN KEY ("transactionalEmailId") REFERENCES "TransactionalEmail"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
