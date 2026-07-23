-- Canonical project identity and explicit tags for Tasks, Goals, and Sessions.
-- Legacy CallRoom slug columns remain intact as reversible compatibility data.
-- Every new relation is nullable or additive; no source or work record is dropped.

ALTER TABLE "CallRoom" ADD COLUMN "projectId" TEXT;
ALTER TABLE "ActionItem" ADD COLUMN "projectId" TEXT;

-- Backfill a Session only when its legacy slug resolves to exactly one project.
UPDATE "CallRoom" AS room
SET "projectId" = candidate."projectId"
FROM (
  SELECT room_candidate."id" AS "roomId", MIN(project."id") AS "projectId"
  FROM "CallRoom" AS room_candidate
  JOIN "StudioProject" AS project
    ON project."slug" = room_candidate."projectSlug"
    OR project."slug" = room_candidate."nestSlug"
  WHERE room_candidate."projectId" IS NULL
  GROUP BY room_candidate."id"
  HAVING COUNT(DISTINCT project."id") = 1
) AS candidate
WHERE room."id" = candidate."roomId";

-- Existing goals and tasks inherit only a now-canonical Session project.
UPDATE "Goal" AS goal
SET "projectId" = room."projectId"
FROM "CallRoom" AS room
WHERE goal."projectId" IS NULL
  AND goal."roomId" = room."id"
  AND room."projectId" IS NOT NULL;

UPDATE "ActionItem" AS item
SET "projectId" = room."projectId"
FROM "CallRoom" AS room
WHERE item."projectId" IS NULL
  AND item."roomId" = room."id"
  AND room."projectId" IS NOT NULL;

-- A task linked to goals inherits a project only when every project-bearing
-- link agrees. Ambiguous legacy links remain null for explicit human repair.
UPDATE "ActionItem" AS item
SET "projectId" = candidate."projectId"
FROM (
  SELECT link."actionItemId", MIN(goal."projectId") AS "projectId"
  FROM "GoalTaskLink" AS link
  JOIN "Goal" AS goal ON goal."id" = link."goalId"
  WHERE goal."projectId" IS NOT NULL
  GROUP BY link."actionItemId"
  HAVING COUNT(DISTINCT goal."projectId") = 1
) AS candidate
WHERE item."id" = candidate."actionItemId"
  AND item."projectId" IS NULL;

CREATE TABLE "ActionItemTagLink" (
  "actionItemId" TEXT NOT NULL,
  "tagId" TEXT NOT NULL,
  "createdByUserId" TEXT,
  "sourceJson" JSONB NOT NULL DEFAULT '{}',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ActionItemTagLink_pkey" PRIMARY KEY ("actionItemId", "tagId")
);

CREATE TABLE "GoalTagLink" (
  "goalId" TEXT NOT NULL,
  "tagId" TEXT NOT NULL,
  "createdByUserId" TEXT,
  "sourceJson" JSONB NOT NULL DEFAULT '{}',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "GoalTagLink_pkey" PRIMARY KEY ("goalId", "tagId")
);

CREATE TABLE "CallRoomTagLink" (
  "roomId" TEXT NOT NULL,
  "tagId" TEXT NOT NULL,
  "createdByUserId" TEXT,
  "sourceJson" JSONB NOT NULL DEFAULT '{}',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CallRoomTagLink_pkey" PRIMARY KEY ("roomId", "tagId")
);

CREATE INDEX "CallRoom_projectId_status_scheduledStart_idx" ON "CallRoom"("projectId", "status", "scheduledStart");
CREATE INDEX "ActionItem_projectId_status_updatedAt_idx" ON "ActionItem"("projectId", "status", "updatedAt");
CREATE INDEX "ActionItemTagLink_tagId_createdAt_idx" ON "ActionItemTagLink"("tagId", "createdAt");
CREATE INDEX "ActionItemTagLink_createdByUserId_createdAt_idx" ON "ActionItemTagLink"("createdByUserId", "createdAt");
CREATE INDEX "GoalTagLink_tagId_createdAt_idx" ON "GoalTagLink"("tagId", "createdAt");
CREATE INDEX "GoalTagLink_createdByUserId_createdAt_idx" ON "GoalTagLink"("createdByUserId", "createdAt");
CREATE INDEX "CallRoomTagLink_tagId_createdAt_idx" ON "CallRoomTagLink"("tagId", "createdAt");
CREATE INDEX "CallRoomTagLink_createdByUserId_createdAt_idx" ON "CallRoomTagLink"("createdByUserId", "createdAt");

ALTER TABLE "CallRoom" ADD CONSTRAINT "CallRoom_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "StudioProject"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ActionItem" ADD CONSTRAINT "ActionItem_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "StudioProject"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ActionItemTagLink" ADD CONSTRAINT "ActionItemTagLink_actionItemId_fkey" FOREIGN KEY ("actionItemId") REFERENCES "ActionItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ActionItemTagLink" ADD CONSTRAINT "ActionItemTagLink_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "StudioTag"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ActionItemTagLink" ADD CONSTRAINT "ActionItemTagLink_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "GoalTagLink" ADD CONSTRAINT "GoalTagLink_goalId_fkey" FOREIGN KEY ("goalId") REFERENCES "Goal"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GoalTagLink" ADD CONSTRAINT "GoalTagLink_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "StudioTag"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GoalTagLink" ADD CONSTRAINT "GoalTagLink_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CallRoomTagLink" ADD CONSTRAINT "CallRoomTagLink_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "CallRoom"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CallRoomTagLink" ADD CONSTRAINT "CallRoomTagLink_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "StudioTag"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CallRoomTagLink" ADD CONSTRAINT "CallRoomTagLink_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Rollback remains non-destructive to the pre-migration schema: drop the three
-- join tables, their indexes/FKs, then the two nullable projectId columns. The
-- preserved projectSlug/nestSlug values remain available for re-resolution.
