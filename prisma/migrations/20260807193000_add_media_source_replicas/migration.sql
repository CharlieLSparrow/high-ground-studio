CREATE TABLE "StudioMediaSourceReplica" (
  "id" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "sourceRevisionId" TEXT NOT NULL,
  "workflowJobId" TEXT NOT NULL,
  "storageProvider" TEXT NOT NULL,
  "locator" TEXT NOT NULL,
  "generation" TEXT NOT NULL,
  "contentSha256" TEXT NOT NULL,
  "checksumMd5" TEXT,
  "sizeBytes" BIGINT NOT NULL,
  "mimeType" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'ready',
  "verificationJson" JSONB NOT NULL DEFAULT '{}',
  "provenanceJson" JSONB NOT NULL DEFAULT '{}',
  "createdByUserId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "StudioMediaSourceReplica_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "StudioMediaSourceReplica_workflowJobId_key"
  ON "StudioMediaSourceReplica"("workflowJobId");
CREATE UNIQUE INDEX "StudioMediaSourceReplica_sourceRevisionId_storageProvider_generation_key"
  ON "StudioMediaSourceReplica"("sourceRevisionId", "storageProvider", "generation");
CREATE INDEX "StudioMediaSourceReplica_projectId_status_createdAt_idx"
  ON "StudioMediaSourceReplica"("projectId", "status", "createdAt");
CREATE INDEX "StudioMediaSourceReplica_sourceRevisionId_status_createdAt_idx"
  ON "StudioMediaSourceReplica"("sourceRevisionId", "status", "createdAt");

ALTER TABLE "StudioMediaSourceReplica"
  ADD CONSTRAINT "StudioMediaSourceReplica_projectId_fkey"
  FOREIGN KEY ("projectId") REFERENCES "StudioProject"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StudioMediaSourceReplica"
  ADD CONSTRAINT "StudioMediaSourceReplica_sourceRevisionId_fkey"
  FOREIGN KEY ("sourceRevisionId") REFERENCES "StudioMediaSourceRevision"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StudioMediaSourceReplica"
  ADD CONSTRAINT "StudioMediaSourceReplica_workflowJobId_fkey"
  FOREIGN KEY ("workflowJobId") REFERENCES "StudioWorkflowJob"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StudioMediaSourceReplica"
  ADD CONSTRAINT "StudioMediaSourceReplica_createdByUserId_fkey"
  FOREIGN KEY ("createdByUserId") REFERENCES "User"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
