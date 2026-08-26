CREATE TYPE "CoachingSessionPreparationLane" AS ENUM (
  'CLIENT_SHARED',
  'COACH_PRIVATE'
);

CREATE TABLE "CoachingSessionPreparation" (
  "id" TEXT NOT NULL,
  "bookingId" TEXT NOT NULL,
  "clientUserId" TEXT NOT NULL,
  "coachUserId" TEXT,
  "revision" INTEGER NOT NULL DEFAULT 0,
  "clientFocus" TEXT,
  "clientDesiredOutcome" TEXT,
  "clientSuccessMeasure" TEXT,
  "clientProgressScore" INTEGER,
  "clientUpdate" TEXT,
  "clientSubmittedAt" TIMESTAMP(3),
  "coachPrivateNote" TEXT,
  "coachPreparedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "CoachingSessionPreparation_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CoachSessionPrep_revision_check" CHECK ("revision" >= 0),
  CONSTRAINT "CoachSessionPrep_progress_check" CHECK (
    "clientProgressScore" IS NULL OR
    ("clientProgressScore" >= 0 AND "clientProgressScore" <= 10)
  )
);

CREATE TABLE "CoachingSessionPreparationRevision" (
  "id" TEXT NOT NULL,
  "requestId" UUID NOT NULL,
  "preparationId" TEXT NOT NULL,
  "actorUserId" TEXT NOT NULL,
  "lane" "CoachingSessionPreparationLane" NOT NULL,
  "revision" INTEGER NOT NULL,
  "inputSha256" TEXT NOT NULL,
  "snapshotJson" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "CoachingSessionPreparationRevision_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CoachSessionPrepRevision_revision_check" CHECK ("revision" > 0),
  CONSTRAINT "CoachSessionPrepRevision_sha_check" CHECK (
    "inputSha256" ~ '^[0-9a-f]{64}$'
  ),
  CONSTRAINT "CoachSessionPrepRevision_snapshot_check" CHECK (
    jsonb_typeof("snapshotJson") = 'object'
  )
);

CREATE UNIQUE INDEX "CoachingSessionPreparation_bookingId_key"
  ON "CoachingSessionPreparation"("bookingId");
CREATE INDEX "CoachSessionPrep_client_updated_idx"
  ON "CoachingSessionPreparation"("clientUserId", "updatedAt");
CREATE INDEX "CoachSessionPrep_coach_updated_idx"
  ON "CoachingSessionPreparation"("coachUserId", "updatedAt");

CREATE UNIQUE INDEX "CoachingSessionPreparationRevision_requestId_key"
  ON "CoachingSessionPreparationRevision"("requestId");
CREATE UNIQUE INDEX "CoachSessionPrepRevision_prep_revision_key"
  ON "CoachingSessionPreparationRevision"("preparationId", "revision");
CREATE INDEX "CoachSessionPrepRevision_actor_created_idx"
  ON "CoachingSessionPreparationRevision"("actorUserId", "createdAt");

ALTER TABLE "CoachingSessionPreparation"
  ADD CONSTRAINT "CoachingSessionPreparation_bookingId_fkey"
  FOREIGN KEY ("bookingId") REFERENCES "CoachingBooking"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CoachingSessionPreparation"
  ADD CONSTRAINT "CoachingSessionPreparation_clientUserId_fkey"
  FOREIGN KEY ("clientUserId") REFERENCES "User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CoachingSessionPreparation"
  ADD CONSTRAINT "CoachingSessionPreparation_coachUserId_fkey"
  FOREIGN KEY ("coachUserId") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CoachingSessionPreparationRevision"
  ADD CONSTRAINT "CoachingSessionPreparationRevision_preparationId_fkey"
  FOREIGN KEY ("preparationId") REFERENCES "CoachingSessionPreparation"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CoachingSessionPreparationRevision"
  ADD CONSTRAINT "CoachingSessionPreparationRevision_actorUserId_fkey"
  FOREIGN KEY ("actorUserId") REFERENCES "User"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
