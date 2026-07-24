-- Personal focus blocks are Quipsly-owned planning intent. They deliberately
-- do not write provider event identifiers or mutate task/goal lifecycle state.
CREATE TYPE "WorkPlanBlockStatus" AS ENUM ('PLANNED', 'COMPLETED', 'SKIPPED', 'CANCELED');

CREATE TABLE "WorkPlanBlock" (
  "id" TEXT NOT NULL,
  "ownerUserId" TEXT NOT NULL,
  "actionItemId" TEXT,
  "goalId" TEXT,
  "startsAt" TIMESTAMP(3) NOT NULL,
  "endsAt" TIMESTAMP(3) NOT NULL,
  "timezone" TEXT NOT NULL,
  "status" "WorkPlanBlockStatus" NOT NULL DEFAULT 'PLANNED',
  "completedAt" TIMESTAMP(3),
  "sourceJson" JSONB NOT NULL DEFAULT '{}',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "WorkPlanBlock_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "WorkPlanBlock_exactly_one_target_check" CHECK (("actionItemId" IS NOT NULL) <> ("goalId" IS NOT NULL)),
  CONSTRAINT "WorkPlanBlock_time_order_check" CHECK ("endsAt" > "startsAt")
);

CREATE INDEX "WorkPlanBlock_ownerUserId_status_startsAt_idx" ON "WorkPlanBlock"("ownerUserId", "status", "startsAt");
CREATE INDEX "WorkPlanBlock_actionItemId_startsAt_idx" ON "WorkPlanBlock"("actionItemId", "startsAt");
CREATE INDEX "WorkPlanBlock_goalId_startsAt_idx" ON "WorkPlanBlock"("goalId", "startsAt");

ALTER TABLE "WorkPlanBlock" ADD CONSTRAINT "WorkPlanBlock_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WorkPlanBlock" ADD CONSTRAINT "WorkPlanBlock_actionItemId_fkey" FOREIGN KEY ("actionItemId") REFERENCES "ActionItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WorkPlanBlock" ADD CONSTRAINT "WorkPlanBlock_goalId_fkey" FOREIGN KEY ("goalId") REFERENCES "Goal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Existing coaching commitments gain client reflection evidence without
-- changing coach-review semantics or rewriting historical rows.
ALTER TABLE "WeeklyCommitment"
  ADD COLUMN "clientReviewedAt" TIMESTAMP(3),
  ADD COLUMN "sourceJson" JSONB NOT NULL DEFAULT '{}';
