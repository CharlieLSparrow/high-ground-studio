-- Quipsly coaching/capture foundational migration.
-- Purpose: create the app-owned coaching, scheduling, billing, call-room,
-- consent, recording, transcript, notes, and action-item ledgers without broad
-- Prisma db-push drift risk.
--
-- Rules:
-- - additive only
-- - no drops
-- - no data rewrites
-- - safe to run more than once
-- - keep Stripe/Calendar/provider data as evidence, not product source of truth

DO $$ BEGIN CREATE TYPE "CoachingServiceKind" AS ENUM ('ONE_TO_ONE_COACHING', 'PODCAST_CAPTURE', 'RESEARCH_INTERVIEW'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "CoachingPaymentPolicy" AS ENUM ('FREE', 'DONATION_SUPPORTED', 'PAID_ONE_TO_ONE', 'MANUAL'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "CoachingBookingStatus" AS ENUM ('REQUESTED', 'HOLDING_PAYMENT', 'CONFIRMED', 'COMPLETED', 'CANCELED', 'NO_SHOW'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "BookingHoldStatus" AS ENUM ('ACTIVE', 'EXPIRED', 'CONVERTED', 'CANCELED'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "PaymentRecordStatus" AS ENUM ('PENDING', 'PAID', 'FAILED', 'REFUNDED', 'CANCELED', 'DISPUTED'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "CallRoomPurpose" AS ENUM ('COACHING', 'PODCAST', 'RESEARCH_INTERVIEW', 'INTERNAL_MEETING'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "CallRoomStatus" AS ENUM ('PLANNED', 'OPEN', 'RECORDING', 'ENDED', 'CANCELED', 'FAILED'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "CaptureRoomStateAction" AS ENUM ('OPEN', 'START_RECORDING', 'STOP_RECORDING', 'END'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "CallParticipantRole" AS ENUM ('HOST', 'COACH', 'CLIENT', 'GUEST', 'PRODUCER', 'OBSERVER'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "RecordingConsentStatus" AS ENUM ('REQUESTED', 'GRANTED', 'DECLINED', 'REVOKED'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "RecordingAssetKind" AS ENUM ('LOCAL_AUDIO', 'SERVER_MIX', 'LOCAL_VIDEO', 'SCREEN_REFERENCE', 'TRANSCRIPT_SOURCE'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "RecordingAssetStatus" AS ENUM ('LOCAL_READY', 'UPLOADING', 'UPLOADED', 'VERIFIED', 'FAILED', 'HELD'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "UploadChunkStatus" AS ENUM ('QUEUED', 'UPLOADING', 'UPLOADED', 'VERIFIED', 'FAILED'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "TranscriptJobStatus" AS ENUM ('QUEUED', 'RUNNING', 'COMPLETED', 'FAILED', 'HELD'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "CoachingNoteKind" AS ENUM ('SESSION_NOTE', 'ACTION_ITEM', 'SUMMARY', 'FOLLOW_UP', 'QUOTE', 'HIGHLIGHT'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "ActionItemStatus" AS ENUM ('OPEN', 'DONE', 'CANCELED'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE "CoachingRequest" ADD COLUMN IF NOT EXISTS "convertedAppointmentId" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "CoachingRequest_convertedAppointmentId_key" ON "CoachingRequest"("convertedAppointmentId");
CREATE INDEX IF NOT EXISTS "CoachingRequest_assignedCoachUserId_status_idx" ON "CoachingRequest"("assignedCoachUserId", "status");
DO $$ BEGIN
  ALTER TABLE "CoachingRequest"
    ADD CONSTRAINT "CoachingRequest_convertedAppointmentId_fkey"
    FOREIGN KEY ("convertedAppointmentId") REFERENCES "Appointment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "CoachProfile" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "slug" TEXT,
  "displayName" TEXT,
  "bio" TEXT,
  "timezone" TEXT NOT NULL DEFAULT 'America/Denver',
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "metadataJson" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CoachProfile_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CoachProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "CoachProfile_userId_key" ON "CoachProfile"("userId");
CREATE UNIQUE INDEX IF NOT EXISTS "CoachProfile_slug_key" ON "CoachProfile"("slug");
CREATE INDEX IF NOT EXISTS "CoachProfile_isActive_updatedAt_idx" ON "CoachProfile"("isActive", "updatedAt");

CREATE TABLE IF NOT EXISTS "ServiceOffering" (
  "id" TEXT NOT NULL,
  "coachProfileId" TEXT,
  "slug" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT,
  "kind" "CoachingServiceKind" NOT NULL DEFAULT 'ONE_TO_ONE_COACHING',
  "paymentPolicy" "CoachingPaymentPolicy" NOT NULL DEFAULT 'DONATION_SUPPORTED',
  "durationMinutes" INTEGER NOT NULL DEFAULT 60,
  "priceCents" INTEGER,
  "currency" TEXT NOT NULL DEFAULT 'USD',
  "stripePriceId" TEXT,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "metadataJson" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ServiceOffering_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ServiceOffering_coachProfileId_fkey" FOREIGN KEY ("coachProfileId") REFERENCES "CoachProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "ServiceOffering_slug_key" ON "ServiceOffering"("slug");
CREATE INDEX IF NOT EXISTS "ServiceOffering_coachProfileId_isActive_idx" ON "ServiceOffering"("coachProfileId", "isActive");
CREATE INDEX IF NOT EXISTS "ServiceOffering_kind_isActive_idx" ON "ServiceOffering"("kind", "isActive");
CREATE INDEX IF NOT EXISTS "ServiceOffering_paymentPolicy_isActive_idx" ON "ServiceOffering"("paymentPolicy", "isActive");

CREATE TABLE IF NOT EXISTS "AvailabilityWindow" (
  "id" TEXT NOT NULL,
  "coachProfileId" TEXT NOT NULL,
  "label" TEXT,
  "timezone" TEXT NOT NULL DEFAULT 'America/Denver',
  "dayOfWeek" INTEGER,
  "startMinute" INTEGER,
  "endMinute" INTEGER,
  "startsAt" TIMESTAMP(3),
  "endsAt" TIMESTAMP(3),
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "metadataJson" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AvailabilityWindow_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AvailabilityWindow_coachProfileId_fkey" FOREIGN KEY ("coachProfileId") REFERENCES "CoachProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "AvailabilityWindow_coachProfileId_isActive_idx" ON "AvailabilityWindow"("coachProfileId", "isActive");
CREATE INDEX IF NOT EXISTS "AvailabilityWindow_dayOfWeek_startMinute_idx" ON "AvailabilityWindow"("dayOfWeek", "startMinute");
CREATE INDEX IF NOT EXISTS "AvailabilityWindow_startsAt_endsAt_idx" ON "AvailabilityWindow"("startsAt", "endsAt");

CREATE TABLE IF NOT EXISTS "PaymentRecord" (
  "id" TEXT NOT NULL,
  "userId" TEXT,
  "provider" TEXT NOT NULL DEFAULT 'stripe',
  "status" "PaymentRecordStatus" NOT NULL DEFAULT 'PENDING',
  "amountCents" INTEGER NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'USD',
  "description" TEXT,
  "providerCustomerId" TEXT,
  "providerCheckoutSessionId" TEXT,
  "providerPaymentIntentId" TEXT,
  "paidAt" TIMESTAMP(3),
  "refundedAt" TIMESTAMP(3),
  "metadataJson" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PaymentRecord_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PaymentRecord_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "PaymentRecord_userId_createdAt_idx" ON "PaymentRecord"("userId", "createdAt");
CREATE INDEX IF NOT EXISTS "PaymentRecord_provider_status_createdAt_idx" ON "PaymentRecord"("provider", "status", "createdAt");
CREATE INDEX IF NOT EXISTS "PaymentRecord_providerCheckoutSessionId_idx" ON "PaymentRecord"("providerCheckoutSessionId");
CREATE INDEX IF NOT EXISTS "PaymentRecord_providerPaymentIntentId_idx" ON "PaymentRecord"("providerPaymentIntentId");

CREATE TABLE IF NOT EXISTS "CoachingBooking" (
  "id" TEXT NOT NULL,
  "requestId" TEXT,
  "appointmentId" TEXT,
  "offeringId" TEXT,
  "clientUserId" TEXT NOT NULL,
  "coachUserId" TEXT,
  "status" "CoachingBookingStatus" NOT NULL DEFAULT 'REQUESTED',
  "scheduledStart" TIMESTAMP(3) NOT NULL,
  "scheduledEnd" TIMESTAMP(3) NOT NULL,
  "timezone" TEXT NOT NULL DEFAULT 'America/Denver',
  "paymentPolicy" "CoachingPaymentPolicy" NOT NULL DEFAULT 'DONATION_SUPPORTED',
  "paymentRecordId" TEXT,
  "calendarEventId" TEXT,
  "notes" TEXT,
  "metadataJson" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CoachingBooking_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CoachingBooking_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "CoachingRequest"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "CoachingBooking_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "Appointment"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "CoachingBooking_offeringId_fkey" FOREIGN KEY ("offeringId") REFERENCES "ServiceOffering"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "CoachingBooking_clientUserId_fkey" FOREIGN KEY ("clientUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "CoachingBooking_coachUserId_fkey" FOREIGN KEY ("coachUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "CoachingBooking_paymentRecordId_fkey" FOREIGN KEY ("paymentRecordId") REFERENCES "PaymentRecord"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "CoachingBooking_appointmentId_key" ON "CoachingBooking"("appointmentId");
CREATE UNIQUE INDEX IF NOT EXISTS "CoachingBooking_paymentRecordId_key" ON "CoachingBooking"("paymentRecordId");
CREATE INDEX IF NOT EXISTS "CoachingBooking_clientUserId_scheduledStart_idx" ON "CoachingBooking"("clientUserId", "scheduledStart");
CREATE INDEX IF NOT EXISTS "CoachingBooking_coachUserId_scheduledStart_idx" ON "CoachingBooking"("coachUserId", "scheduledStart");
CREATE INDEX IF NOT EXISTS "CoachingBooking_status_scheduledStart_idx" ON "CoachingBooking"("status", "scheduledStart");
CREATE INDEX IF NOT EXISTS "CoachingBooking_requestId_idx" ON "CoachingBooking"("requestId");
CREATE INDEX IF NOT EXISTS "CoachingBooking_offeringId_idx" ON "CoachingBooking"("offeringId");

CREATE TABLE IF NOT EXISTS "BookingHold" (
  "id" TEXT NOT NULL,
  "offeringId" TEXT,
  "coachProfileId" TEXT,
  "clientUserId" TEXT,
  "contactEmail" TEXT,
  "scheduledStart" TIMESTAMP(3) NOT NULL,
  "scheduledEnd" TIMESTAMP(3) NOT NULL,
  "timezone" TEXT NOT NULL DEFAULT 'America/Denver',
  "status" "BookingHoldStatus" NOT NULL DEFAULT 'ACTIVE',
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "convertedBookingId" TEXT,
  "metadataJson" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "BookingHold_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "BookingHold_offeringId_fkey" FOREIGN KEY ("offeringId") REFERENCES "ServiceOffering"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "BookingHold_coachProfileId_fkey" FOREIGN KEY ("coachProfileId") REFERENCES "CoachProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "BookingHold_clientUserId_fkey" FOREIGN KEY ("clientUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "BookingHold_convertedBookingId_fkey" FOREIGN KEY ("convertedBookingId") REFERENCES "CoachingBooking"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "BookingHold_convertedBookingId_key" ON "BookingHold"("convertedBookingId");
CREATE INDEX IF NOT EXISTS "BookingHold_offeringId_status_expiresAt_idx" ON "BookingHold"("offeringId", "status", "expiresAt");
CREATE INDEX IF NOT EXISTS "BookingHold_coachProfileId_scheduledStart_idx" ON "BookingHold"("coachProfileId", "scheduledStart");
CREATE INDEX IF NOT EXISTS "BookingHold_clientUserId_createdAt_idx" ON "BookingHold"("clientUserId", "createdAt");
CREATE INDEX IF NOT EXISTS "BookingHold_status_expiresAt_idx" ON "BookingHold"("status", "expiresAt");

CREATE TABLE IF NOT EXISTS "StripeCustomerLink" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "stripeCustomerId" TEXT NOT NULL,
  "livemode" BOOLEAN NOT NULL DEFAULT false,
  "metadataJson" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "StripeCustomerLink_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "StripeCustomerLink_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "StripeCustomerLink_stripeCustomerId_key" ON "StripeCustomerLink"("stripeCustomerId");
CREATE INDEX IF NOT EXISTS "StripeCustomerLink_userId_idx" ON "StripeCustomerLink"("userId");
CREATE INDEX IF NOT EXISTS "StripeCustomerLink_livemode_updatedAt_idx" ON "StripeCustomerLink"("livemode", "updatedAt");

CREATE TABLE IF NOT EXISTS "StripeCheckoutSessionLedger" (
  "id" TEXT NOT NULL,
  "bookingId" TEXT,
  "paymentRecordId" TEXT,
  "checkoutSessionId" TEXT NOT NULL,
  "mode" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'created',
  "url" TEXT,
  "livemode" BOOLEAN NOT NULL DEFAULT false,
  "expiresAt" TIMESTAMP(3),
  "rawJson" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "metadataJson" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "StripeCheckoutSessionLedger_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "StripeCheckoutSessionLedger_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "CoachingBooking"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "StripeCheckoutSessionLedger_paymentRecordId_fkey" FOREIGN KEY ("paymentRecordId") REFERENCES "PaymentRecord"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "StripeCheckoutSessionLedger_checkoutSessionId_key" ON "StripeCheckoutSessionLedger"("checkoutSessionId");
CREATE INDEX IF NOT EXISTS "StripeCheckoutSessionLedger_bookingId_createdAt_idx" ON "StripeCheckoutSessionLedger"("bookingId", "createdAt");
CREATE INDEX IF NOT EXISTS "StripeCheckoutSessionLedger_paymentRecordId_createdAt_idx" ON "StripeCheckoutSessionLedger"("paymentRecordId", "createdAt");
CREATE INDEX IF NOT EXISTS "StripeCheckoutSessionLedger_status_createdAt_idx" ON "StripeCheckoutSessionLedger"("status", "createdAt");

CREATE TABLE IF NOT EXISTS "StripeWebhookEvent" (
  "id" TEXT NOT NULL,
  "externalEventId" TEXT,
  "eventType" TEXT NOT NULL,
  "livemode" BOOLEAN NOT NULL DEFAULT false,
  "verificationStatus" TEXT NOT NULL DEFAULT 'unchecked',
  "processingStatus" TEXT NOT NULL DEFAULT 'received',
  "payloadHash" TEXT,
  "payloadJson" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "errorMessage" TEXT,
  "occurredAt" TIMESTAMP(3),
  "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "processedAt" TIMESTAMP(3),
  "retryCount" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "StripeWebhookEvent_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "StripeWebhookEvent_externalEventId_key" ON "StripeWebhookEvent"("externalEventId");
CREATE INDEX IF NOT EXISTS "StripeWebhookEvent_eventType_receivedAt_idx" ON "StripeWebhookEvent"("eventType", "receivedAt");
CREATE INDEX IF NOT EXISTS "StripeWebhookEvent_processingStatus_receivedAt_idx" ON "StripeWebhookEvent"("processingStatus", "receivedAt");
CREATE INDEX IF NOT EXISTS "StripeWebhookEvent_livemode_receivedAt_idx" ON "StripeWebhookEvent"("livemode", "receivedAt");

CREATE TABLE IF NOT EXISTS "CallRoom" (
  "id" TEXT NOT NULL,
  "bookingId" TEXT,
  "createdByUserId" TEXT,
  "purpose" "CallRoomPurpose" NOT NULL DEFAULT 'COACHING',
  "status" "CallRoomStatus" NOT NULL DEFAULT 'PLANNED',
  "provider" TEXT NOT NULL DEFAULT 'planned',
  "providerRoomId" TEXT,
  "title" TEXT,
  "scheduledStart" TIMESTAMP(3),
  "scheduledEnd" TIMESTAMP(3),
  "openedAt" TIMESTAMP(3),
  "recordingStartedAt" TIMESTAMP(3),
  "endedAt" TIMESTAMP(3),
  "nestSlug" TEXT,
  "projectSlug" TEXT,
  "recordingPolicyJson" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "transcriptPolicyJson" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "metadataJson" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CallRoom_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CallRoom_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "CoachingBooking"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "CallRoom_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "CallRoom_bookingId_key" ON "CallRoom"("bookingId");
CREATE UNIQUE INDEX IF NOT EXISTS "CallRoom_providerRoomId_key" ON "CallRoom"("providerRoomId");
CREATE INDEX IF NOT EXISTS "CallRoom_purpose_status_scheduledStart_idx" ON "CallRoom"("purpose", "status", "scheduledStart");
CREATE INDEX IF NOT EXISTS "CallRoom_createdByUserId_createdAt_idx" ON "CallRoom"("createdByUserId", "createdAt");
CREATE INDEX IF NOT EXISTS "CallRoom_nestSlug_createdAt_idx" ON "CallRoom"("nestSlug", "createdAt");
CREATE INDEX IF NOT EXISTS "CallRoom_projectSlug_createdAt_idx" ON "CallRoom"("projectSlug", "createdAt");

-- Append-only idempotency ledger for iPhone room-state outbox receipts. The
-- UUID primary key binds one request to one durable outcome; JSON metadata on
-- CallRoom remains a compatibility projection, never the receipt source of truth.
CREATE TABLE IF NOT EXISTS "CaptureRoomStateReceipt" (
  "receiptId" UUID NOT NULL,
  "sequence" BIGSERIAL NOT NULL,
  "roomId" TEXT NOT NULL,
  "captureId" UUID,
  "actorUserId" TEXT NOT NULL,
  "action" "CaptureRoomStateAction" NOT NULL,
  "source" TEXT NOT NULL DEFAULT 'mobile-capture',
  "occurredAt" TIMESTAMP(3) NOT NULL,
  "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "outcome" TEXT NOT NULL DEFAULT 'APPLIED',
  "stateApplied" BOOLEAN NOT NULL DEFAULT true,
  "roomStatusBefore" "CallRoomStatus",
  "roomStatusAfter" "CallRoomStatus",
  "httpStatus" INTEGER NOT NULL DEFAULT 200,
  "errorCode" TEXT,
  "errorMessage" TEXT,
  "metadataJson" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CaptureRoomStateReceipt_pkey" PRIMARY KEY ("receiptId"),
  CONSTRAINT "CaptureRoomStateReceipt_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "CallRoom"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
ALTER TABLE "CaptureRoomStateReceipt" ADD COLUMN IF NOT EXISTS "sequence" BIGSERIAL NOT NULL;
ALTER TABLE "CaptureRoomStateReceipt" ADD COLUMN IF NOT EXISTS "captureOwnerUserId" TEXT;
ALTER TABLE "CaptureRoomStateReceipt" ADD COLUMN IF NOT EXISTS "actorConsentId" TEXT;
ALTER TABLE "CaptureRoomStateReceipt" ADD COLUMN IF NOT EXISTS "consentVersion" TEXT;
ALTER TABLE "CaptureRoomStateReceipt" ADD COLUMN IF NOT EXISTS "staffCrashCompensation" BOOLEAN NOT NULL DEFAULT false;
CREATE UNIQUE INDEX IF NOT EXISTS "CaptureRoomStateReceipt_sequence_key" ON "CaptureRoomStateReceipt"("sequence");
CREATE INDEX IF NOT EXISTS "CaptureRoomStateReceipt_roomId_receivedAt_idx" ON "CaptureRoomStateReceipt"("roomId", "receivedAt");
CREATE INDEX IF NOT EXISTS "CaptureRoomStateReceipt_roomId_captureId_receivedAt_idx" ON "CaptureRoomStateReceipt"("roomId", "captureId", "receivedAt");
CREATE INDEX IF NOT EXISTS "CaptureRoomStateReceipt_captureId_action_receivedAt_idx" ON "CaptureRoomStateReceipt"("captureId", "action", "receivedAt");
CREATE INDEX IF NOT EXISTS "CaptureRoomStateReceipt_actorUserId_receivedAt_idx" ON "CaptureRoomStateReceipt"("actorUserId", "receivedAt");
CREATE INDEX IF NOT EXISTS "CaptureRoomStateReceipt_roomId_captureId_captureOwnerUserId_idx" ON "CaptureRoomStateReceipt"("roomId", "captureId", "captureOwnerUserId");
CREATE INDEX IF NOT EXISTS "CaptureRoomStateReceipt_outcome_receivedAt_idx" ON "CaptureRoomStateReceipt"("outcome", "receivedAt");

-- Durable processing disposition for every verified canonical upload. HELD is
-- preservation-only: bytes and RecordingAsset evidence remain immutable, while
-- transcription, reusable media creation, and episode attachment stay blocked
-- until an explicit audited release changes this row to RELEASED.
CREATE TABLE IF NOT EXISTS "MobileCaptureFinalizationReceipt" (
  "uploadSessionId" UUID NOT NULL,
  "captureId" UUID NOT NULL,
  "roomId" TEXT NOT NULL,
  "actorUserId" TEXT NOT NULL,
  "startReceiptId" UUID,
  "consentVersion" TEXT,
  "processingDisposition" TEXT NOT NULL,
  "transcriptDisposition" TEXT NOT NULL,
  "holdReasonCode" TEXT,
  "holdReason" TEXT,
  "transcriptHoldReasonCode" TEXT,
  "transcriptHoldReason" TEXT,
  "sourceId" TEXT,
  "mediaAssetId" TEXT,
  "recordingAssetId" TEXT,
  "transcriptJobId" TEXT,
  "releasedByUserId" TEXT,
  "releaseReason" TEXT,
  "releasedAt" TIMESTAMP(3),
  "transcriptReleasedByUserId" TEXT,
  "transcriptReleaseReason" TEXT,
  "transcriptReleasedAt" TIMESTAMP(3),
  "metadataJson" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MobileCaptureFinalizationReceipt_pkey" PRIMARY KEY ("uploadSessionId")
);
ALTER TABLE "MobileCaptureFinalizationReceipt" ADD COLUMN IF NOT EXISTS "transcriptDisposition" TEXT NOT NULL DEFAULT 'HELD';
ALTER TABLE "MobileCaptureFinalizationReceipt" ADD COLUMN IF NOT EXISTS "transcriptHoldReasonCode" TEXT;
ALTER TABLE "MobileCaptureFinalizationReceipt" ADD COLUMN IF NOT EXISTS "transcriptHoldReason" TEXT;
ALTER TABLE "MobileCaptureFinalizationReceipt" ADD COLUMN IF NOT EXISTS "transcriptReleasedByUserId" TEXT;
ALTER TABLE "MobileCaptureFinalizationReceipt" ADD COLUMN IF NOT EXISTS "transcriptReleaseReason" TEXT;
ALTER TABLE "MobileCaptureFinalizationReceipt" ADD COLUMN IF NOT EXISTS "transcriptReleasedAt" TIMESTAMP(3);
CREATE INDEX IF NOT EXISTS "MobileCaptureFinalizationReceipt_roomId_captureId_idx" ON "MobileCaptureFinalizationReceipt"("roomId", "captureId");
CREATE INDEX IF NOT EXISTS "MobileCaptureFinalizationReceipt_actorUserId_createdAt_idx" ON "MobileCaptureFinalizationReceipt"("actorUserId", "createdAt");
CREATE INDEX IF NOT EXISTS "MobileCaptureFinalizationReceipt_processingDisposition_createdAt_idx" ON "MobileCaptureFinalizationReceipt"("processingDisposition", "createdAt");
CREATE INDEX IF NOT EXISTS "MobileCaptureFinalizationReceipt_recordingAssetId_idx" ON "MobileCaptureFinalizationReceipt"("recordingAssetId");

-- Normalized idempotency key for the JSON episode projection. The row lock in
-- finalization protects concurrent append operations; this table proves which
-- exact upload owns an attachment and makes retries deterministic.
CREATE TABLE IF NOT EXISTS "MobileCaptureEpisodeAttachment" (
  "uploadSessionId" UUID NOT NULL,
  "productionId" TEXT NOT NULL,
  "mediaAssetId" TEXT NOT NULL,
  "sourceId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MobileCaptureEpisodeAttachment_pkey" PRIMARY KEY ("uploadSessionId")
);
CREATE UNIQUE INDEX IF NOT EXISTS "MobileCaptureEpisodeAttachment_productionId_mediaAssetId_key" ON "MobileCaptureEpisodeAttachment"("productionId", "mediaAssetId");
CREATE INDEX IF NOT EXISTS "MobileCaptureEpisodeAttachment_productionId_createdAt_idx" ON "MobileCaptureEpisodeAttachment"("productionId", "createdAt");

-- Persistent capability reservations serialize quota decisions across every
-- Quipsly instance. Rows are append-preserving: expired reservations progress
-- to ABANDONED, while verified objects progress to COMPLETED with immutable
-- generation/size evidence. No cleanup step deletes source bytes.
CREATE TABLE IF NOT EXISTS "MediaVaultUploadReservation" (
  "id" TEXT NOT NULL,
  "lane" TEXT NOT NULL,
  "requestId" UUID NOT NULL,
  "actorUserId" TEXT NOT NULL,
  "actorEmail" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "projectSlug" TEXT NOT NULL,
  "bucketName" TEXT NOT NULL,
  "objectPath" TEXT NOT NULL,
  "contentType" TEXT NOT NULL,
  "expectedSizeBytes" BIGINT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "expiredAt" TIMESTAMP(3),
  "abandonedAt" TIMESTAMP(3),
  "abandonedReason" TEXT,
  "completedAt" TIMESTAMP(3),
  "completedSizeBytes" BIGINT,
  "completionGeneration" TEXT,
  "completionSource" TEXT,
  "completionEvidenceJson" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "metadataJson" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "renewedAt" TIMESTAMP(3),
  "renewalCount" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MediaVaultUploadReservation_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "MediaVaultUploadReservation" ADD COLUMN IF NOT EXISTS "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "MediaVaultUploadReservation" ADD COLUMN IF NOT EXISTS "renewedAt" TIMESTAMP(3);
ALTER TABLE "MediaVaultUploadReservation" ADD COLUMN IF NOT EXISTS "renewalCount" INTEGER NOT NULL DEFAULT 0;
CREATE UNIQUE INDEX IF NOT EXISTS "MediaVaultUploadReservation_lane_actorUserId_requestId_key" ON "MediaVaultUploadReservation"("lane", "actorUserId", "requestId");
CREATE UNIQUE INDEX IF NOT EXISTS "MediaVaultUploadReservation_bucketName_objectPath_key" ON "MediaVaultUploadReservation"("bucketName", "objectPath");
CREATE INDEX IF NOT EXISTS "MediaVaultUploadReservation_actorUserId_createdAt_idx" ON "MediaVaultUploadReservation"("actorUserId", "createdAt");
CREATE INDEX IF NOT EXISTS "MediaVaultUploadReservation_projectId_createdAt_idx" ON "MediaVaultUploadReservation"("projectId", "createdAt");
CREATE INDEX IF NOT EXISTS "MediaVaultUploadReservation_actorUserId_issuedAt_idx" ON "MediaVaultUploadReservation"("actorUserId", "issuedAt");
CREATE INDEX IF NOT EXISTS "MediaVaultUploadReservation_projectId_issuedAt_idx" ON "MediaVaultUploadReservation"("projectId", "issuedAt");
CREATE INDEX IF NOT EXISTS "MediaVaultUploadReservation_actorUserId_status_expiresAt_idx" ON "MediaVaultUploadReservation"("actorUserId", "status", "expiresAt");
CREATE INDEX IF NOT EXISTS "MediaVaultUploadReservation_projectId_status_expiresAt_idx" ON "MediaVaultUploadReservation"("projectId", "status", "expiresAt");
CREATE INDEX IF NOT EXISTS "MediaVaultUploadReservation_status_expiresAt_idx" ON "MediaVaultUploadReservation"("status", "expiresAt");

-- Preserve the bounded historical JSON receipts that predate the relational
-- ledger. Server-generated UUID/action validation makes this additive backfill
-- safe. Each timestamp cast is isolated so malformed hand-edited metadata falls
-- back without aborting the schema job; valid server timestamps stay intact.
DO $$
DECLARE
  room_record RECORD;
  historical_receipt JSONB;
  historical_ordinality BIGINT;
  receipt_occurred_at TIMESTAMP(3);
  receipt_received_at TIMESTAMP(3);
  receipt_state_applied BOOLEAN;
BEGIN
  FOR room_record IN
    SELECT "id", "status", "metadataJson", "updatedAt"
    FROM "CallRoom"
    ORDER BY "id"
  LOOP
    FOR historical_receipt, historical_ordinality IN
      SELECT historical.value, historical.ordinality
      FROM jsonb_array_elements(
        CASE
          WHEN jsonb_typeof(room_record."metadataJson"->'mobileCaptureRoomReceipts') = 'array'
            THEN room_record."metadataJson"->'mobileCaptureRoomReceipts'
          ELSE '[]'::jsonb
        END
      ) WITH ORDINALITY AS historical(value, ordinality)
      ORDER BY historical.ordinality
    LOOP
      CONTINUE WHEN COALESCE(historical_receipt->>'receiptId', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$';
      CONTINUE WHEN UPPER(COALESCE(historical_receipt->>'action', '')) NOT IN ('OPEN', 'START_RECORDING', 'STOP_RECORDING', 'END');

      BEGIN
        receipt_occurred_at := (historical_receipt->>'occurredAt')::timestamptz AT TIME ZONE 'UTC';
      EXCEPTION WHEN OTHERS THEN
        receipt_occurred_at := room_record."updatedAt";
      END;
      BEGIN
        receipt_received_at := (historical_receipt->>'receivedAt')::timestamptz AT TIME ZONE 'UTC';
      EXCEPTION WHEN OTHERS THEN
        receipt_received_at := room_record."updatedAt" + (historical_ordinality * INTERVAL '1 millisecond');
      END;

      receipt_state_applied := CASE
        WHEN jsonb_typeof(historical_receipt->'stateApplied') = 'boolean'
          THEN (historical_receipt->>'stateApplied')::boolean
        ELSE true
      END;

      INSERT INTO "CaptureRoomStateReceipt" (
        "receiptId",
        "roomId",
        "captureId",
        "actorUserId",
        "action",
        "source",
        "occurredAt",
        "receivedAt",
        "outcome",
        "stateApplied",
        "roomStatusBefore",
        "roomStatusAfter",
        "httpStatus",
        "metadataJson",
        "createdAt"
      ) VALUES (
        (historical_receipt->>'receiptId')::uuid,
        room_record."id",
        CASE
          WHEN COALESCE(historical_receipt->>'captureId', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
            THEN (historical_receipt->>'captureId')::uuid
          ELSE NULL
        END,
        COALESCE(NULLIF(historical_receipt->>'userId', ''), 'legacy-metadata-backfill'),
        UPPER(historical_receipt->>'action')::"CaptureRoomStateAction",
        COALESCE(NULLIF(historical_receipt->>'source', ''), 'legacy-mobile-capture-metadata'),
        receipt_occurred_at,
        receipt_received_at,
        CASE WHEN receipt_state_applied THEN 'APPLIED' ELSE 'IGNORED_TERMINAL_STOP' END,
        receipt_state_applied,
        room_record."status",
        room_record."status",
        200,
        historical_receipt,
        receipt_received_at
      )
      ON CONFLICT ("receiptId") DO NOTHING;
    END LOOP;
  END LOOP;
END $$;

CREATE TABLE IF NOT EXISTS "CalendarEventLink" (
  "id" TEXT NOT NULL,
  "bookingId" TEXT,
  "roomId" TEXT,
  "provider" TEXT NOT NULL DEFAULT 'google',
  "providerCalendarId" TEXT,
  "providerEventId" TEXT,
  "status" TEXT NOT NULL DEFAULT 'planned',
  "title" TEXT,
  "scheduledStart" TIMESTAMP(3),
  "scheduledEnd" TIMESTAMP(3),
  "timezone" TEXT NOT NULL DEFAULT 'America/Denver',
  "htmlLink" TEXT,
  "conferenceDataJson" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "rawJson" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CalendarEventLink_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CalendarEventLink_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "CoachingBooking"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "CalendarEventLink_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "CallRoom"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "CalendarEventLink_bookingId_createdAt_idx" ON "CalendarEventLink"("bookingId", "createdAt");
CREATE INDEX IF NOT EXISTS "CalendarEventLink_roomId_createdAt_idx" ON "CalendarEventLink"("roomId", "createdAt");
CREATE INDEX IF NOT EXISTS "CalendarEventLink_provider_providerEventId_idx" ON "CalendarEventLink"("provider", "providerEventId");
CREATE INDEX IF NOT EXISTS "CalendarEventLink_status_scheduledStart_idx" ON "CalendarEventLink"("status", "scheduledStart");

CREATE TABLE IF NOT EXISTS "CallParticipant" (
  "id" TEXT NOT NULL,
  "roomId" TEXT NOT NULL,
  "userId" TEXT,
  "displayName" TEXT,
  "email" TEXT,
  "role" "CallParticipantRole" NOT NULL DEFAULT 'GUEST',
  "joinedAt" TIMESTAMP(3),
  "leftAt" TIMESTAMP(3),
  "deviceLabel" TEXT,
  "connectionJson" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CallParticipant_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CallParticipant_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "CallRoom"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "CallParticipant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "CallParticipant_roomId_role_idx" ON "CallParticipant"("roomId", "role");
CREATE INDEX IF NOT EXISTS "CallParticipant_userId_createdAt_idx" ON "CallParticipant"("userId", "createdAt");
CREATE INDEX IF NOT EXISTS "CallParticipant_email_createdAt_idx" ON "CallParticipant"("email", "createdAt");

CREATE TABLE IF NOT EXISTS "RecordingConsent" (
  "id" TEXT NOT NULL,
  "roomId" TEXT NOT NULL,
  "participantId" TEXT,
  "userId" TEXT,
  "status" "RecordingConsentStatus" NOT NULL DEFAULT 'REQUESTED',
  "consentText" TEXT NOT NULL,
  "policyVersion" TEXT NOT NULL DEFAULT '2026-07-04',
  "canRecordAudio" BOOLEAN NOT NULL DEFAULT false,
  "canRecordVideo" BOOLEAN NOT NULL DEFAULT false,
  "canTranscribe" BOOLEAN NOT NULL DEFAULT false,
  "consentedAt" TIMESTAMP(3),
  "declinedAt" TIMESTAMP(3),
  "revokedAt" TIMESTAMP(3),
  "metadataJson" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RecordingConsent_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "RecordingConsent_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "CallRoom"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "RecordingConsent_participantId_fkey" FOREIGN KEY ("participantId") REFERENCES "CallParticipant"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "RecordingConsent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "RecordingConsent_roomId_status_idx" ON "RecordingConsent"("roomId", "status");
CREATE INDEX IF NOT EXISTS "RecordingConsent_participantId_createdAt_idx" ON "RecordingConsent"("participantId", "createdAt");
CREATE INDEX IF NOT EXISTS "RecordingConsent_userId_createdAt_idx" ON "RecordingConsent"("userId", "createdAt");

CREATE TABLE IF NOT EXISTS "RecordingAsset" (
  "id" TEXT NOT NULL,
  "roomId" TEXT NOT NULL,
  "participantId" TEXT,
  "kind" "RecordingAssetKind" NOT NULL DEFAULT 'LOCAL_AUDIO',
  "status" "RecordingAssetStatus" NOT NULL DEFAULT 'LOCAL_READY',
  "fileName" TEXT,
  "contentType" TEXT,
  "byteSize" BIGINT,
  "durationSeconds" DOUBLE PRECISION,
  "storageBucket" TEXT,
  "storageObjectPath" TEXT,
  "localManifestJson" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "segmentsJson" JSONB NOT NULL DEFAULT '[]'::jsonb,
  "checksum" TEXT,
  "errorMessage" TEXT,
  "recordedStartedAt" TIMESTAMP(3),
  "recordedStoppedAt" TIMESTAMP(3),
  "uploadedAt" TIMESTAMP(3),
  "verifiedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RecordingAsset_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "RecordingAsset_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "CallRoom"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "RecordingAsset_participantId_fkey" FOREIGN KEY ("participantId") REFERENCES "CallParticipant"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "RecordingAsset_roomId_status_idx" ON "RecordingAsset"("roomId", "status");
CREATE INDEX IF NOT EXISTS "RecordingAsset_participantId_createdAt_idx" ON "RecordingAsset"("participantId", "createdAt");
CREATE INDEX IF NOT EXISTS "RecordingAsset_kind_status_createdAt_idx" ON "RecordingAsset"("kind", "status", "createdAt");

CREATE TABLE IF NOT EXISTS "UploadChunk" (
  "id" TEXT NOT NULL,
  "assetId" TEXT NOT NULL,
  "chunkIndex" INTEGER NOT NULL,
  "status" "UploadChunkStatus" NOT NULL DEFAULT 'QUEUED',
  "byteStart" BIGINT,
  "byteEnd" BIGINT,
  "byteSize" BIGINT,
  "checksum" TEXT,
  "storageObjectPath" TEXT,
  "uploadedAt" TIMESTAMP(3),
  "verifiedAt" TIMESTAMP(3),
  "errorMessage" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "UploadChunk_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "UploadChunk_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "RecordingAsset"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "UploadChunk_assetId_chunkIndex_key" ON "UploadChunk"("assetId", "chunkIndex");
CREATE INDEX IF NOT EXISTS "UploadChunk_status_createdAt_idx" ON "UploadChunk"("status", "createdAt");

CREATE TABLE IF NOT EXISTS "TranscriptJob" (
  "id" TEXT NOT NULL,
  "roomId" TEXT,
  "assetId" TEXT,
  "status" "TranscriptJobStatus" NOT NULL DEFAULT 'QUEUED',
  "provider" TEXT NOT NULL DEFAULT 'pending',
  "language" TEXT,
  "requestedBy" TEXT,
  "startedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "errorMessage" TEXT,
  "resultJson" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TranscriptJob_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "TranscriptJob_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "CallRoom"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "TranscriptJob_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "RecordingAsset"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "TranscriptJob_roomId_status_createdAt_idx" ON "TranscriptJob"("roomId", "status", "createdAt");
CREATE INDEX IF NOT EXISTS "TranscriptJob_assetId_status_createdAt_idx" ON "TranscriptJob"("assetId", "status", "createdAt");
CREATE INDEX IF NOT EXISTS "TranscriptJob_status_createdAt_idx" ON "TranscriptJob"("status", "createdAt");

CREATE TABLE IF NOT EXISTS "TranscriptSegment" (
  "id" TEXT NOT NULL,
  "transcriptJobId" TEXT NOT NULL,
  "speakerLabel" TEXT,
  "speakerUserId" TEXT,
  "startSeconds" DOUBLE PRECISION NOT NULL,
  "endSeconds" DOUBLE PRECISION NOT NULL,
  "text" TEXT NOT NULL,
  "confidence" DOUBLE PRECISION,
  "metadataJson" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TranscriptSegment_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "TranscriptSegment_transcriptJobId_fkey" FOREIGN KEY ("transcriptJobId") REFERENCES "TranscriptJob"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "TranscriptSegment_transcriptJobId_startSeconds_idx" ON "TranscriptSegment"("transcriptJobId", "startSeconds");
CREATE INDEX IF NOT EXISTS "TranscriptSegment_speakerLabel_idx" ON "TranscriptSegment"("speakerLabel");

CREATE TABLE IF NOT EXISTS "CoachingNote" (
  "id" TEXT NOT NULL,
  "roomId" TEXT,
  "bookingId" TEXT,
  "authorUserId" TEXT,
  "kind" "CoachingNoteKind" NOT NULL DEFAULT 'SESSION_NOTE',
  "title" TEXT,
  "body" TEXT NOT NULL,
  "sourceJson" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CoachingNote_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CoachingNote_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "CallRoom"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "CoachingNote_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "CoachingBooking"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "CoachingNote_authorUserId_fkey" FOREIGN KEY ("authorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "CoachingNote_roomId_createdAt_idx" ON "CoachingNote"("roomId", "createdAt");
CREATE INDEX IF NOT EXISTS "CoachingNote_bookingId_createdAt_idx" ON "CoachingNote"("bookingId", "createdAt");
CREATE INDEX IF NOT EXISTS "CoachingNote_authorUserId_createdAt_idx" ON "CoachingNote"("authorUserId", "createdAt");
CREATE INDEX IF NOT EXISTS "CoachingNote_kind_createdAt_idx" ON "CoachingNote"("kind", "createdAt");

CREATE TABLE IF NOT EXISTS "ActionItem" (
  "id" TEXT NOT NULL,
  "roomId" TEXT,
  "bookingId" TEXT,
  "noteId" TEXT,
  "assignedUserId" TEXT,
  "title" TEXT NOT NULL,
  "detail" TEXT,
  "status" "ActionItemStatus" NOT NULL DEFAULT 'OPEN',
  "dueAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "sourceJson" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ActionItem_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ActionItem_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "CallRoom"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ActionItem_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "CoachingBooking"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ActionItem_noteId_fkey" FOREIGN KEY ("noteId") REFERENCES "CoachingNote"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "ActionItem_assignedUserId_fkey" FOREIGN KEY ("assignedUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "ActionItem_roomId_status_idx" ON "ActionItem"("roomId", "status");
CREATE INDEX IF NOT EXISTS "ActionItem_bookingId_status_idx" ON "ActionItem"("bookingId", "status");
CREATE INDEX IF NOT EXISTS "ActionItem_assignedUserId_status_idx" ON "ActionItem"("assignedUserId", "status");
CREATE INDEX IF NOT EXISTS "ActionItem_dueAt_idx" ON "ActionItem"("dueAt");
