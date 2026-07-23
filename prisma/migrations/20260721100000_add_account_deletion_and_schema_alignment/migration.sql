-- CreateEnum
CREATE TYPE "UserAccountDeletionRequestStatus" AS ENUM ('REQUESTED', 'REVIEWING', 'EXPORT_PREPARING', 'READY_FOR_DELETION', 'COMPLETED', 'CANCELED', 'REJECTED');

-- AlterTable
ALTER TABLE "ActionItem" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "Appointment" ALTER COLUMN "timezone" SET DEFAULT 'America/Los_Angeles';

-- AlterTable
ALTER TABLE "AvailabilityWindow" ALTER COLUMN "timezone" SET DEFAULT 'America/Los_Angeles',
ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "BookingHold" ALTER COLUMN "timezone" SET DEFAULT 'America/Los_Angeles',
ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "CalendarEventLink" ALTER COLUMN "timezone" SET DEFAULT 'America/Los_Angeles',
ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "CallParticipant" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "CallRoom" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "CoachProfile" ALTER COLUMN "timezone" SET DEFAULT 'America/Los_Angeles',
ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "CoachingBooking" ALTER COLUMN "timezone" SET DEFAULT 'America/Los_Angeles',
ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "CoachingNote" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "MediaVaultUploadReservation" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "MobileCaptureFinalizationReceipt" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "PaymentRecord" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "RecordingAsset" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "RecordingConsent" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "ServiceOffering" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "StripeCheckoutSessionLedger" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "StripeCustomerLink" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "StripeWebhookEvent" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "TranscriptJob" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "UploadChunk" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- CreateTable
CREATE TABLE "UserAccountDeletionRequest" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "emailSnapshot" TEXT NOT NULL,
    "status" "UserAccountDeletionRequestStatus" NOT NULL DEFAULT 'REQUESTED',
    "reason" TEXT,
    "source" TEXT NOT NULL DEFAULT 'unknown',
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "canceledAt" TIMESTAMP(3),
    "metadataJson" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserAccountDeletionRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "UserAccountDeletionRequest_userId_status_createdAt_idx" ON "UserAccountDeletionRequest"("userId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "UserAccountDeletionRequest_status_createdAt_idx" ON "UserAccountDeletionRequest"("status", "createdAt");

-- AddForeignKey
ALTER TABLE "UserAccountDeletionRequest" ADD CONSTRAINT "UserAccountDeletionRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RenameIndex
ALTER INDEX "MobileCaptureFinalizationReceipt_processingDisposition_createdA" RENAME TO "MobileCaptureFinalizationReceipt_processingDisposition_crea_idx";

-- RenameIndex
ALTER INDEX "StudioPersonalSourceCaptureReceipt_createdByUserId_capturedAt_i" RENAME TO "StudioPersonalSourceCaptureReceipt_createdByUserId_captured_idx";

-- RenameIndex
ALTER INDEX "StudioPersonalSourceCaptureReceipt_createdByUserId_clientReques" RENAME TO "StudioPersonalSourceCaptureReceipt_createdByUserId_clientRe_key";

-- RenameIndex
ALTER INDEX "StudioSourceAnnotation_projectId_visibility_status_updatedAt_id" RENAME TO "StudioSourceAnnotation_projectId_visibility_status_updatedA_idx";
