-- Canonical goals are additive. Existing Session Plan goal CoachingNotes stay
-- intact while application code dual-writes reversible Goal projections.
CREATE TYPE "GoalStatus" AS ENUM ('ACTIVE', 'PAUSED', 'ACHIEVED', 'ARCHIVED');
CREATE TYPE "GoalTaskRelationship" AS ENUM ('CONTRIBUTES', 'BLOCKS', 'OUTCOME');

CREATE TABLE "Goal" (
  "id" TEXT NOT NULL,
  "ownerUserId" TEXT NOT NULL,
  "roomId" TEXT,
  "bookingId" TEXT,
  "projectId" TEXT,
  "parentGoalId" TEXT,
  "title" TEXT NOT NULL,
  "description" TEXT,
  "status" "GoalStatus" NOT NULL DEFAULT 'ACTIVE',
  "targetAt" TIMESTAMP(3),
  "achievedAt" TIMESTAMP(3),
  "sourceJson" JSONB NOT NULL DEFAULT '{}',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Goal_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "GoalTaskLink" (
  "goalId" TEXT NOT NULL,
  "actionItemId" TEXT NOT NULL,
  "relationship" "GoalTaskRelationship" NOT NULL DEFAULT 'CONTRIBUTES',
  "createdByUserId" TEXT,
  "sourceJson" JSONB NOT NULL DEFAULT '{}',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "GoalTaskLink_pkey" PRIMARY KEY ("goalId", "actionItemId")
);

CREATE TABLE "GoalProgressReceipt" (
  "id" TEXT NOT NULL,
  "goalId" TEXT NOT NULL,
  "actorUserId" TEXT,
  "kind" TEXT NOT NULL,
  "progressPercent" INTEGER,
  "note" TEXT,
  "evidenceJson" JSONB NOT NULL DEFAULT '{}',
  "occurredAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "GoalProgressReceipt_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "GoalProgressReceipt_progressPercent_check" CHECK ("progressPercent" IS NULL OR ("progressPercent" >= 0 AND "progressPercent" <= 100))
);

CREATE INDEX "Goal_ownerUserId_status_updatedAt_idx" ON "Goal"("ownerUserId", "status", "updatedAt");
CREATE INDEX "Goal_roomId_status_idx" ON "Goal"("roomId", "status");
CREATE INDEX "Goal_bookingId_status_idx" ON "Goal"("bookingId", "status");
CREATE INDEX "Goal_projectId_status_idx" ON "Goal"("projectId", "status");
CREATE INDEX "Goal_parentGoalId_idx" ON "Goal"("parentGoalId");
CREATE INDEX "GoalTaskLink_actionItemId_relationship_idx" ON "GoalTaskLink"("actionItemId", "relationship");
CREATE INDEX "GoalTaskLink_createdByUserId_createdAt_idx" ON "GoalTaskLink"("createdByUserId", "createdAt");
CREATE INDEX "GoalProgressReceipt_goalId_occurredAt_idx" ON "GoalProgressReceipt"("goalId", "occurredAt");
CREATE INDEX "GoalProgressReceipt_actorUserId_createdAt_idx" ON "GoalProgressReceipt"("actorUserId", "createdAt");

ALTER TABLE "Goal" ADD CONSTRAINT "Goal_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Goal" ADD CONSTRAINT "Goal_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "CallRoom"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Goal" ADD CONSTRAINT "Goal_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "CoachingBooking"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Goal" ADD CONSTRAINT "Goal_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "StudioProject"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Goal" ADD CONSTRAINT "Goal_parentGoalId_fkey" FOREIGN KEY ("parentGoalId") REFERENCES "Goal"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "GoalTaskLink" ADD CONSTRAINT "GoalTaskLink_goalId_fkey" FOREIGN KEY ("goalId") REFERENCES "Goal"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GoalTaskLink" ADD CONSTRAINT "GoalTaskLink_actionItemId_fkey" FOREIGN KEY ("actionItemId") REFERENCES "ActionItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GoalTaskLink" ADD CONSTRAINT "GoalTaskLink_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "GoalProgressReceipt" ADD CONSTRAINT "GoalProgressReceipt_goalId_fkey" FOREIGN KEY ("goalId") REFERENCES "Goal"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GoalProgressReceipt" ADD CONSTRAINT "GoalProgressReceipt_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
