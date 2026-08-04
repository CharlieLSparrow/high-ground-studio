-- A Coaching Engagement is an explicit, durable privacy boundary. It may use
-- a StudioProject for storage and tooling, but engagement membership never
-- implies a StudioProjectAccessGrant. This migration is additive and does not
-- infer relationships from historical coach/client coincidences.
CREATE TYPE "CoachingEngagementStatus" AS ENUM ('ACTIVE', 'PAUSED', 'COMPLETED', 'ARCHIVED');
CREATE TYPE "CoachingEngagementMemberRole" AS ENUM ('CLIENT', 'COACH', 'SUPPORT', 'OBSERVER');
CREATE TYPE "CoachingEngagementMemberStatus" AS ENUM ('ACTIVE', 'REMOVED');

CREATE TABLE "CoachingEngagement" (
  "id" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "createdByUserId" TEXT,
  "primaryClientUserId" TEXT,
  "primaryCoachUserId" TEXT,
  "title" TEXT NOT NULL,
  "status" "CoachingEngagementStatus" NOT NULL DEFAULT 'ACTIVE',
  "metadataJson" JSONB NOT NULL DEFAULT '{}',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CoachingEngagement_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CoachingEngagementMember" (
  "id" TEXT NOT NULL,
  "engagementId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "role" "CoachingEngagementMemberRole" NOT NULL,
  "status" "CoachingEngagementMemberStatus" NOT NULL DEFAULT 'ACTIVE',
  "addedByUserId" TEXT,
  "removedByUserId" TEXT,
  "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "removedAt" TIMESTAMP(3),
  "metadataJson" JSONB NOT NULL DEFAULT '{}',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CoachingEngagementMember_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "CoachingBooking" ADD COLUMN "engagementId" TEXT;
ALTER TABLE "CallRoom" ADD COLUMN "coachingEngagementId" TEXT;
ALTER TABLE "ActionItem" ADD COLUMN "engagementId" TEXT;
ALTER TABLE "Goal" ADD COLUMN "engagementId" TEXT;

CREATE INDEX "CoachingEngagement_projectId_status_updatedAt_idx" ON "CoachingEngagement"("projectId", "status", "updatedAt");
CREATE INDEX "CoachingEngagement_primaryClientUserId_status_updatedAt_idx" ON "CoachingEngagement"("primaryClientUserId", "status", "updatedAt");
CREATE INDEX "CoachingEngagement_primaryCoachUserId_status_updatedAt_idx" ON "CoachingEngagement"("primaryCoachUserId", "status", "updatedAt");
CREATE UNIQUE INDEX "CoachingEngagementMember_engagementId_userId_key" ON "CoachingEngagementMember"("engagementId", "userId");
CREATE INDEX "CoachingEngagementMember_userId_status_updatedAt_idx" ON "CoachingEngagementMember"("userId", "status", "updatedAt");
CREATE INDEX "CoachingEngagementMember_engagementId_role_status_idx" ON "CoachingEngagementMember"("engagementId", "role", "status");
CREATE INDEX "CoachingBooking_engagementId_scheduledStart_idx" ON "CoachingBooking"("engagementId", "scheduledStart");
CREATE INDEX "CallRoom_coachingEngagementId_status_scheduledStart_idx" ON "CallRoom"("coachingEngagementId", "status", "scheduledStart");
CREATE INDEX "ActionItem_engagementId_status_updatedAt_idx" ON "ActionItem"("engagementId", "status", "updatedAt");
CREATE INDEX "Goal_engagementId_status_updatedAt_idx" ON "Goal"("engagementId", "status", "updatedAt");

ALTER TABLE "CoachingEngagement" ADD CONSTRAINT "CoachingEngagement_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "StudioProject"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CoachingEngagement" ADD CONSTRAINT "CoachingEngagement_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CoachingEngagement" ADD CONSTRAINT "CoachingEngagement_primaryClientUserId_fkey" FOREIGN KEY ("primaryClientUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CoachingEngagement" ADD CONSTRAINT "CoachingEngagement_primaryCoachUserId_fkey" FOREIGN KEY ("primaryCoachUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CoachingEngagementMember" ADD CONSTRAINT "CoachingEngagementMember_engagementId_fkey" FOREIGN KEY ("engagementId") REFERENCES "CoachingEngagement"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CoachingEngagementMember" ADD CONSTRAINT "CoachingEngagementMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CoachingEngagementMember" ADD CONSTRAINT "CoachingEngagementMember_addedByUserId_fkey" FOREIGN KEY ("addedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CoachingEngagementMember" ADD CONSTRAINT "CoachingEngagementMember_removedByUserId_fkey" FOREIGN KEY ("removedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CoachingBooking" ADD CONSTRAINT "CoachingBooking_engagementId_fkey" FOREIGN KEY ("engagementId") REFERENCES "CoachingEngagement"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CallRoom" ADD CONSTRAINT "CallRoom_coachingEngagementId_fkey" FOREIGN KEY ("coachingEngagementId") REFERENCES "CoachingEngagement"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ActionItem" ADD CONSTRAINT "ActionItem_engagementId_fkey" FOREIGN KEY ("engagementId") REFERENCES "CoachingEngagement"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Goal" ADD CONSTRAINT "Goal_engagementId_fkey" FOREIGN KEY ("engagementId") REFERENCES "CoachingEngagement"("id") ON DELETE SET NULL ON UPDATE CASCADE;
