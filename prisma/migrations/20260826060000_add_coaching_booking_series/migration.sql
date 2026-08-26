CREATE TYPE "CoachingBookingSeriesFrequency" AS ENUM ('WEEKLY', 'MONTHLY');
CREATE TYPE "CoachingBookingSeriesStatus" AS ENUM ('ACTIVE', 'COMPLETED', 'CANCELED');

CREATE TABLE "CoachingBookingSeries" (
    "id" TEXT NOT NULL,
    "requestId" UUID NOT NULL,
    "clientUserId" TEXT NOT NULL,
    "coachUserId" TEXT NOT NULL,
    "engagementId" TEXT NOT NULL,
    "offeringId" TEXT,
    "createdByUserId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "timezone" TEXT NOT NULL,
    "frequency" "CoachingBookingSeriesFrequency" NOT NULL,
    "intervalCount" INTEGER NOT NULL DEFAULT 1,
    "occurrenceCount" INTEGER NOT NULL,
    "durationMinutes" INTEGER NOT NULL,
    "firstScheduledStart" TIMESTAMP(3) NOT NULL,
    "lastScheduledStart" TIMESTAMP(3) NOT NULL,
    "status" "CoachingBookingSeriesStatus" NOT NULL DEFAULT 'ACTIVE',
    "metadataJson" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CoachingBookingSeries_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "CoachingBooking"
    ADD COLUMN "seriesId" TEXT,
    ADD COLUMN "seriesSequence" INTEGER;

CREATE UNIQUE INDEX "CoachingBookingSeries_requestId_key" ON "CoachingBookingSeries"("requestId");
CREATE INDEX "CoachBookingSeries_coach_status_start_idx" ON "CoachingBookingSeries"("coachUserId", "status", "firstScheduledStart");
CREATE INDEX "CoachBookingSeries_client_status_start_idx" ON "CoachingBookingSeries"("clientUserId", "status", "firstScheduledStart");
CREATE INDEX "CoachBookingSeries_engagement_status_start_idx" ON "CoachingBookingSeries"("engagementId", "status", "firstScheduledStart");
CREATE UNIQUE INDEX "CoachingBooking_seriesId_seriesSequence_key" ON "CoachingBooking"("seriesId", "seriesSequence");
CREATE INDEX "CoachingBooking_seriesId_scheduledStart_idx" ON "CoachingBooking"("seriesId", "scheduledStart");

ALTER TABLE "CoachingBookingSeries" ADD CONSTRAINT "CoachingBookingSeries_clientUserId_fkey" FOREIGN KEY ("clientUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CoachingBookingSeries" ADD CONSTRAINT "CoachingBookingSeries_coachUserId_fkey" FOREIGN KEY ("coachUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CoachingBookingSeries" ADD CONSTRAINT "CoachingBookingSeries_engagementId_fkey" FOREIGN KEY ("engagementId") REFERENCES "CoachingEngagement"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CoachingBookingSeries" ADD CONSTRAINT "CoachingBookingSeries_offeringId_fkey" FOREIGN KEY ("offeringId") REFERENCES "ServiceOffering"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CoachingBookingSeries" ADD CONSTRAINT "CoachingBookingSeries_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CoachingBooking" ADD CONSTRAINT "CoachingBooking_seriesId_fkey" FOREIGN KEY ("seriesId") REFERENCES "CoachingBookingSeries"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "CoachingBookingSeries"
    ADD CONSTRAINT "CoachingBookingSeries_intervalCount_check" CHECK ("intervalCount" BETWEEN 1 AND 12),
    ADD CONSTRAINT "CoachingBookingSeries_occurrenceCount_check" CHECK ("occurrenceCount" BETWEEN 2 AND 24),
    ADD CONSTRAINT "CoachingBookingSeries_durationMinutes_check" CHECK ("durationMinutes" BETWEEN 15 AND 480);

ALTER TABLE "CoachingBooking"
    ADD CONSTRAINT "CoachingBooking_seriesSequence_check" CHECK ("seriesSequence" IS NULL OR "seriesSequence" >= 1),
    ADD CONSTRAINT "CoachingBooking_series_pair_check" CHECK (("seriesId" IS NULL) = ("seriesSequence" IS NULL));
