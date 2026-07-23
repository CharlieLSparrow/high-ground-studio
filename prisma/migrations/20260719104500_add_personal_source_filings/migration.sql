CREATE TABLE "StudioPersonalSourceFiling" (
  "id" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "sourceUnitId" TEXT NOT NULL,
  "createdByUserId" TEXT,
  "createdByEmailSnapshot" TEXT,
  "captureType" TEXT NOT NULL,
  "snippetId" TEXT,
  "bookmarkId" TEXT,
  "clientRequestId" TEXT NOT NULL,
  "captureSnapshotJson" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "StudioPersonalSourceFiling_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "StudioPersonalSourceFiling_capture_type_check" CHECK ("captureType" IN ('SNIPPET', 'BOOKMARK')),
  CONSTRAINT "StudioPersonalSourceFiling_capture_reference_check" CHECK (
    ("captureType" = 'SNIPPET' AND "bookmarkId" IS NULL)
    OR ("captureType" = 'BOOKMARK' AND "snippetId" IS NULL)
  )
);

CREATE UNIQUE INDEX "StudioPersonalSourceFiling_sourceUnitId_key" ON "StudioPersonalSourceFiling"("sourceUnitId");
CREATE UNIQUE INDEX "StudioPersonalSourceFiling_createdByUserId_clientRequestId_key" ON "StudioPersonalSourceFiling"("createdByUserId", "clientRequestId");
CREATE UNIQUE INDEX "StudioPersonalSourceFiling_projectId_snippetId_key" ON "StudioPersonalSourceFiling"("projectId", "snippetId");
CREATE UNIQUE INDEX "StudioPersonalSourceFiling_projectId_bookmarkId_key" ON "StudioPersonalSourceFiling"("projectId", "bookmarkId");
CREATE INDEX "StudioPersonalSourceFiling_createdByUserId_createdAt_idx" ON "StudioPersonalSourceFiling"("createdByUserId", "createdAt");
CREATE INDEX "StudioPersonalSourceFiling_projectId_createdAt_idx" ON "StudioPersonalSourceFiling"("projectId", "createdAt");

ALTER TABLE "StudioPersonalSourceFiling" ADD CONSTRAINT "StudioPersonalSourceFiling_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "StudioProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StudioPersonalSourceFiling" ADD CONSTRAINT "StudioPersonalSourceFiling_sourceUnitId_fkey" FOREIGN KEY ("sourceUnitId") REFERENCES "StudioSourceUnit"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StudioPersonalSourceFiling" ADD CONSTRAINT "StudioPersonalSourceFiling_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "StudioPersonalSourceFiling" ADD CONSTRAINT "StudioPersonalSourceFiling_snippetId_fkey" FOREIGN KEY ("snippetId") REFERENCES "Snippet"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "StudioPersonalSourceFiling" ADD CONSTRAINT "StudioPersonalSourceFiling_bookmarkId_fkey" FOREIGN KEY ("bookmarkId") REFERENCES "Bookmark"("id") ON DELETE SET NULL ON UPDATE CASCADE;
