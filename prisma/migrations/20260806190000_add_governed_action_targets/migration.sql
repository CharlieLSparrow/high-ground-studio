ALTER TABLE "GovernedAction"
  ADD COLUMN "targetObjectType" TEXT,
  ADD COLUMN "targetObjectId" TEXT;

CREATE INDEX "GovernedAction_targetObjectType_targetObjectId_createdAt_idx"
  ON "GovernedAction"("targetObjectType", "targetObjectId", "createdAt");
