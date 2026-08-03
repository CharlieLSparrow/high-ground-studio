-- Google Calendar push notifications are renewable leases. Keep each lease in
-- its own row so a proven replacement can overlap the old channel during
-- renewal without creating a notification-verification gap.
DO $$ BEGIN
  CREATE TYPE "CalendarNotificationChannelStatus" AS ENUM ('STARTING', 'ACTIVE', 'DRAINING', 'STOPPED', 'EXPIRED', 'UNKNOWN');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "CalendarReconciliationWakeStatus" AS ENUM ('QUEUED', 'PROCESSING', 'SUCCEEDED', 'FAILED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TYPE "CalendarSyncOperation" ADD VALUE IF NOT EXISTS 'WATCH_START';
ALTER TYPE "CalendarSyncOperation" ADD VALUE IF NOT EXISTS 'WATCH_NOTIFICATION';
ALTER TYPE "CalendarSyncOperation" ADD VALUE IF NOT EXISTS 'WATCH_STOP';

ALTER TABLE "CalendarCollection"
  ADD COLUMN IF NOT EXISTS "liveUpdatesEnabled" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS "CalendarNotificationChannel" (
  "id" TEXT NOT NULL,
  "collectionId" TEXT NOT NULL,
  "channelId" TEXT NOT NULL,
  "resourceId" TEXT,
  "tokenDigest" TEXT NOT NULL,
  "status" "CalendarNotificationChannelStatus" NOT NULL DEFAULT 'STARTING',
  "expiresAt" TIMESTAMP(3),
  "lastMessageNumber" TEXT,
  "lastResourceState" TEXT,
  "lastNotificationAt" TIMESTAMP(3),
  "stoppedAt" TIMESTAMP(3),
  "metadataJson" JSONB NOT NULL DEFAULT '{}',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CalendarNotificationChannel_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "CalendarReconciliationWake" (
  "id" TEXT NOT NULL,
  "collectionId" TEXT NOT NULL,
  "activeKey" TEXT,
  "status" "CalendarReconciliationWakeStatus" NOT NULL DEFAULT 'QUEUED',
  "reason" TEXT NOT NULL,
  "attemptCount" INTEGER NOT NULL DEFAULT 0,
  "availableAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "claimedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "lastErrorCode" TEXT,
  "metadataJson" JSONB NOT NULL DEFAULT '{}',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CalendarReconciliationWake_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "CalendarNotificationChannel_channelId_key"
  ON "CalendarNotificationChannel"("channelId");
CREATE INDEX IF NOT EXISTS "CalendarNotificationChannel_collectionId_status_expiresAt_idx"
  ON "CalendarNotificationChannel"("collectionId", "status", "expiresAt");
CREATE INDEX IF NOT EXISTS "CalendarNotificationChannel_status_expiresAt_idx"
  ON "CalendarNotificationChannel"("status", "expiresAt");

CREATE UNIQUE INDEX IF NOT EXISTS "CalendarReconciliationWake_activeKey_key"
  ON "CalendarReconciliationWake"("activeKey");
CREATE INDEX IF NOT EXISTS "CalendarReconciliationWake_status_availableAt_idx"
  ON "CalendarReconciliationWake"("status", "availableAt");
CREATE INDEX IF NOT EXISTS "CalendarReconciliationWake_collectionId_createdAt_idx"
  ON "CalendarReconciliationWake"("collectionId", "createdAt");

DO $$ BEGIN
  ALTER TABLE "CalendarNotificationChannel"
    ADD CONSTRAINT "CalendarNotificationChannel_collectionId_fkey"
    FOREIGN KEY ("collectionId") REFERENCES "CalendarCollection"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "CalendarReconciliationWake"
    ADD CONSTRAINT "CalendarReconciliationWake_collectionId_fkey"
    FOREIGN KEY ("collectionId") REFERENCES "CalendarCollection"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
