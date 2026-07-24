-- Preserve evolving Nest vocabulary without rewriting or deleting tag usage.
-- Aliases make older Capture input and searches resolve to the canonical tag;
-- revisions are append-only receipts for rename/archive/restore decisions.

ALTER TABLE "StudioTag" ADD COLUMN "archivedAt" TIMESTAMP(3);

CREATE TABLE "StudioTagAlias" (
  "id" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "tagId" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "provenanceJson" JSONB NOT NULL DEFAULT '{}',
  "createdByUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "StudioTagAlias_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "StudioTagRevision" (
  "id" TEXT NOT NULL,
  "tagId" TEXT NOT NULL,
  "revision" INTEGER NOT NULL,
  "operation" TEXT NOT NULL,
  "actorUserId" TEXT,
  "snapshotJson" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "StudioTagRevision_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "StudioTagAlias_projectId_slug_key" ON "StudioTagAlias"("projectId", "slug");
CREATE INDEX "StudioTagAlias_tagId_createdAt_idx" ON "StudioTagAlias"("tagId", "createdAt");
CREATE UNIQUE INDEX "StudioTagRevision_tagId_revision_key" ON "StudioTagRevision"("tagId", "revision");
CREATE INDEX "StudioTagRevision_actorUserId_createdAt_idx" ON "StudioTagRevision"("actorUserId", "createdAt");

ALTER TABLE "StudioTagAlias" ADD CONSTRAINT "StudioTagAlias_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "StudioProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StudioTagAlias" ADD CONSTRAINT "StudioTagAlias_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "StudioTag"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StudioTagRevision" ADD CONSTRAINT "StudioTagRevision_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "StudioTag"("id") ON DELETE CASCADE ON UPDATE CASCADE;
