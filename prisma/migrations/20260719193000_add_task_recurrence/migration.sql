-- Recurrence is app-owned planning truth. A series preserves the human
-- wall-clock rule while occurrences identify exact canonical ActionItems.
-- This migration does not create provider events or notification records.
CREATE TYPE "TaskRecurrenceCadence" AS ENUM ('FIXED', 'COMPLETION');
CREATE TYPE "TaskRecurrenceFrequency" AS ENUM ('DAILY', 'WEEKLY', 'MONTHLY');
CREATE TYPE "TaskRecurrenceStatus" AS ENUM ('ACTIVE', 'PAUSED', 'ENDED');
CREATE TYPE "TaskOccurrenceStatus" AS ENUM ('MATERIALIZED', 'SKIPPED');

CREATE TABLE "TaskRecurrenceSeries" (
  "id" TEXT NOT NULL,
  "ownerUserId" TEXT NOT NULL,
  "projectId" TEXT,
  "title" TEXT NOT NULL,
  "detail" TEXT,
  "cadence" "TaskRecurrenceCadence" NOT NULL,
  "frequency" "TaskRecurrenceFrequency" NOT NULL,
  "interval" INTEGER NOT NULL DEFAULT 1,
  "timezone" TEXT NOT NULL,
  "localTimeMinutes" INTEGER NOT NULL,
  "anchorLocalDate" TEXT NOT NULL,
  "anchorDayOfMonth" INTEGER NOT NULL,
  "status" "TaskRecurrenceStatus" NOT NULL DEFAULT 'ACTIVE',
  "endedAt" TIMESTAMP(3),
  "sourceJson" JSONB NOT NULL DEFAULT '{}',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TaskRecurrenceSeries_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "TaskRecurrenceSeries_interval_check" CHECK ("interval" BETWEEN 1 AND 365),
  CONSTRAINT "TaskRecurrenceSeries_local_time_check" CHECK ("localTimeMinutes" BETWEEN 0 AND 1439),
  CONSTRAINT "TaskRecurrenceSeries_anchor_day_check" CHECK ("anchorDayOfMonth" BETWEEN 1 AND 31),
  CONSTRAINT "TaskRecurrenceSeries_anchor_date_check" CHECK ("anchorLocalDate" ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$')
);

CREATE TABLE "TaskOccurrence" (
  "id" TEXT NOT NULL,
  "seriesId" TEXT NOT NULL,
  "actionItemId" TEXT,
  "occurrenceKey" TEXT NOT NULL,
  "scheduledLocalDate" TEXT NOT NULL,
  "scheduledFor" TIMESTAMP(3) NOT NULL,
  "status" "TaskOccurrenceStatus" NOT NULL DEFAULT 'MATERIALIZED',
  "sourceJson" JSONB NOT NULL DEFAULT '{}',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TaskOccurrence_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "TaskOccurrence_local_date_check" CHECK ("scheduledLocalDate" ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$')
);

CREATE UNIQUE INDEX "TaskOccurrence_actionItemId_key" ON "TaskOccurrence"("actionItemId");
CREATE UNIQUE INDEX "TaskOccurrence_seriesId_occurrenceKey_key" ON "TaskOccurrence"("seriesId", "occurrenceKey");
CREATE INDEX "TaskRecurrenceSeries_ownerUserId_status_updatedAt_idx" ON "TaskRecurrenceSeries"("ownerUserId", "status", "updatedAt");
CREATE INDEX "TaskRecurrenceSeries_projectId_status_idx" ON "TaskRecurrenceSeries"("projectId", "status");
CREATE INDEX "TaskOccurrence_seriesId_scheduledFor_idx" ON "TaskOccurrence"("seriesId", "scheduledFor");
CREATE INDEX "TaskOccurrence_status_scheduledFor_idx" ON "TaskOccurrence"("status", "scheduledFor");

ALTER TABLE "TaskRecurrenceSeries" ADD CONSTRAINT "TaskRecurrenceSeries_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TaskRecurrenceSeries" ADD CONSTRAINT "TaskRecurrenceSeries_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "StudioProject"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "TaskOccurrence" ADD CONSTRAINT "TaskOccurrence_seriesId_fkey" FOREIGN KEY ("seriesId") REFERENCES "TaskRecurrenceSeries"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TaskOccurrence" ADD CONSTRAINT "TaskOccurrence_actionItemId_fkey" FOREIGN KEY ("actionItemId") REFERENCES "ActionItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;
