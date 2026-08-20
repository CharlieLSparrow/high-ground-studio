DO $$
BEGIN
  CREATE TYPE "CallRoomInvitationDeliveryStatus" AS ENUM ('PENDING', 'SENT', 'FAILED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "CallRoomInvitationDeliveryReceipt" (
  "id" TEXT NOT NULL,
  "invitationId" TEXT NOT NULL,
  "requestId" TEXT NOT NULL,
  "channel" TEXT NOT NULL DEFAULT 'EMAIL',
  "status" "CallRoomInvitationDeliveryStatus" NOT NULL DEFAULT 'PENDING',
  "recipientEmail" TEXT NOT NULL,
  "provider" TEXT NOT NULL DEFAULT 'resend',
  "providerMessageId" TEXT,
  "errorCode" TEXT,
  "errorMessage" TEXT,
  "requestedByUserId" TEXT,
  "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "CallRoomInvitationDeliveryReceipt_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CallRoomInvitationDeliveryReceipt_invitationId_fkey"
    FOREIGN KEY ("invitationId") REFERENCES "CallRoomInvitation"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "CallRoomInvitationDeliveryReceipt_requestedByUserId_fkey"
    FOREIGN KEY ("requestedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "CallRoomInvitationDeliveryReceipt_requestId_key"
  ON "CallRoomInvitationDeliveryReceipt"("requestId");
CREATE INDEX IF NOT EXISTS "CallRoomInvitationDeliveryReceipt_invitationId_createdAt_idx"
  ON "CallRoomInvitationDeliveryReceipt"("invitationId", "createdAt");
CREATE INDEX IF NOT EXISTS "CallRoomInvitationDeliveryReceipt_recipientEmail_status_createdAt_idx"
  ON "CallRoomInvitationDeliveryReceipt"("recipientEmail", "status", "createdAt");
CREATE INDEX IF NOT EXISTS "CallRoomInvitationDeliveryReceipt_status_requestedAt_idx"
  ON "CallRoomInvitationDeliveryReceipt"("status", "requestedAt");
