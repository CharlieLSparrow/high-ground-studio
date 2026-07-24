-- Preserve both tag identities during global taxonomy consolidation. The
-- source becomes an archived redirect; exact moved-association snapshots live
-- in StudioTagMergeReceipt for audit and rollback tooling.

ALTER TABLE "StudioTag"
  ADD COLUMN "mergedIntoTagId" TEXT,
  ADD COLUMN "mergedAt" TIMESTAMP(3);

CREATE TABLE "StudioTagMergeReceipt" (
  "id" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "sourceTagId" TEXT NOT NULL,
  "targetTagId" TEXT NOT NULL,
  "actorUserId" TEXT,
  "impactHash" TEXT NOT NULL,
  "snapshotJson" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "StudioTagMergeReceipt_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "StudioTag_mergedIntoTagId_idx" ON "StudioTag"("mergedIntoTagId");
CREATE INDEX "StudioTagMergeReceipt_projectId_createdAt_idx" ON "StudioTagMergeReceipt"("projectId", "createdAt");
CREATE INDEX "StudioTagMergeReceipt_sourceTagId_createdAt_idx" ON "StudioTagMergeReceipt"("sourceTagId", "createdAt");
CREATE INDEX "StudioTagMergeReceipt_targetTagId_createdAt_idx" ON "StudioTagMergeReceipt"("targetTagId", "createdAt");

ALTER TABLE "StudioTag" ADD CONSTRAINT "StudioTag_mergedIntoTagId_fkey" FOREIGN KEY ("mergedIntoTagId") REFERENCES "StudioTag"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "StudioTagMergeReceipt" ADD CONSTRAINT "StudioTagMergeReceipt_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "StudioProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StudioTagMergeReceipt" ADD CONSTRAINT "StudioTagMergeReceipt_sourceTagId_fkey" FOREIGN KEY ("sourceTagId") REFERENCES "StudioTag"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StudioTagMergeReceipt" ADD CONSTRAINT "StudioTagMergeReceipt_targetTagId_fkey" FOREIGN KEY ("targetTagId") REFERENCES "StudioTag"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
