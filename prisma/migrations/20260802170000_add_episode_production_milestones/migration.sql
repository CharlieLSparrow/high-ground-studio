CREATE TYPE "StudioEpisodeMilestoneKind" AS ENUM (
  'RESEARCH_LOCK',
  'RUN_OF_SHOW_READY',
  'TECH_CHECK',
  'RECORDING',
  'SOURCE_UPLOAD_VERIFIED',
  'TRANSCRIPT_REVIEW',
  'ROUGH_CUT',
  'EDITORIAL_REVIEW',
  'FINAL_APPROVAL',
  'SCHEDULED_PUBLICATION',
  'RELEASE',
  'CLIPS_WINDOW',
  'FOLLOW_UP',
  'CUSTOM'
);

CREATE TYPE "StudioEpisodeMilestoneStatus" AS ENUM (
  'PLANNED',
  'IN_PROGRESS',
  'COMPLETED',
  'CANCELED'
);

CREATE TABLE "StudioEpisodeMilestone" (
  "id" TEXT NOT NULL,
  "episodeProductionId" TEXT NOT NULL,
  "stableId" TEXT NOT NULL,
  "kind" "StudioEpisodeMilestoneKind" NOT NULL,
  "title" TEXT NOT NULL,
  "detail" TEXT,
  "startsAt" TIMESTAMP(3) NOT NULL,
  "endsAt" TIMESTAMP(3),
  "timezone" TEXT NOT NULL DEFAULT 'UTC',
  "status" "StudioEpisodeMilestoneStatus" NOT NULL DEFAULT 'PLANNED',
  "assigneeUserId" TEXT,
  "dependsOnMilestoneId" TEXT,
  "revision" INTEGER NOT NULL DEFAULT 1,
  "createdByUserId" TEXT,
  "createdByEmail" TEXT NOT NULL,
  "completedAt" TIMESTAMP(3),
  "canceledAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "StudioEpisodeMilestone_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "StudioEpisodeMilestone_valid_window" CHECK ("endsAt" IS NULL OR "endsAt" > "startsAt"),
  CONSTRAINT "StudioEpisodeMilestone_positive_revision" CHECK ("revision" > 0),
  CONSTRAINT "StudioEpisodeMilestone_nonempty_timezone" CHECK (length(btrim("timezone")) > 0),
  CONSTRAINT "StudioEpisodeMilestone_not_self_dependent" CHECK ("dependsOnMilestoneId" IS NULL OR "dependsOnMilestoneId" <> "id")
);

CREATE TABLE "StudioEpisodeMilestoneRevision" (
  "id" TEXT NOT NULL,
  "milestoneId" TEXT NOT NULL,
  "revision" INTEGER NOT NULL,
  "operation" TEXT NOT NULL,
  "actorUserId" TEXT,
  "actorEmail" TEXT NOT NULL,
  "snapshotJson" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "StudioEpisodeMilestoneRevision_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "StudioEpisodeMilestoneRevision_positive_revision" CHECK ("revision" > 0)
);

CREATE UNIQUE INDEX "StudioEpisodeMilestone_stableId_key"
  ON "StudioEpisodeMilestone"("stableId");
CREATE INDEX "StudioEpisodeMilestone_episodeProductionId_status_startsAt_idx"
  ON "StudioEpisodeMilestone"("episodeProductionId", "status", "startsAt");
CREATE INDEX "StudioEpisodeMilestone_assigneeUserId_status_startsAt_idx"
  ON "StudioEpisodeMilestone"("assigneeUserId", "status", "startsAt");
CREATE INDEX "StudioEpisodeMilestone_dependsOnMilestoneId_idx"
  ON "StudioEpisodeMilestone"("dependsOnMilestoneId");
CREATE UNIQUE INDEX "StudioEpisodeMilestoneRevision_milestoneId_revision_key"
  ON "StudioEpisodeMilestoneRevision"("milestoneId", "revision");
CREATE INDEX "StudioEpisodeMilestoneRevision_actorUserId_createdAt_idx"
  ON "StudioEpisodeMilestoneRevision"("actorUserId", "createdAt");
CREATE INDEX "StudioEpisodeMilestoneRevision_milestoneId_createdAt_idx"
  ON "StudioEpisodeMilestoneRevision"("milestoneId", "createdAt");

ALTER TABLE "StudioEpisodeMilestone"
  ADD CONSTRAINT "StudioEpisodeMilestone_episodeProductionId_fkey"
  FOREIGN KEY ("episodeProductionId") REFERENCES "StudioEpisodeProduction"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StudioEpisodeMilestone"
  ADD CONSTRAINT "StudioEpisodeMilestone_assigneeUserId_fkey"
  FOREIGN KEY ("assigneeUserId") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "StudioEpisodeMilestone"
  ADD CONSTRAINT "StudioEpisodeMilestone_createdByUserId_fkey"
  FOREIGN KEY ("createdByUserId") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "StudioEpisodeMilestone"
  ADD CONSTRAINT "StudioEpisodeMilestone_dependsOnMilestoneId_fkey"
  FOREIGN KEY ("dependsOnMilestoneId") REFERENCES "StudioEpisodeMilestone"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "StudioEpisodeMilestoneRevision"
  ADD CONSTRAINT "StudioEpisodeMilestoneRevision_milestoneId_fkey"
  FOREIGN KEY ("milestoneId") REFERENCES "StudioEpisodeMilestone"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StudioEpisodeMilestoneRevision"
  ADD CONSTRAINT "StudioEpisodeMilestoneRevision_actorUserId_fkey"
  FOREIGN KEY ("actorUserId") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
