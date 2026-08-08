-- A local path is meaningful only on the worker and workspace that owns it.
-- Existing rows remain explicitly legacy-unscoped until their owning worker
-- re-verifies them; no migration guesses custody from an absolute path.
ALTER TABLE "StudioMediaSourceReplica"
  ADD COLUMN "custodianNodeId" TEXT,
  ADD COLUMN "storageScopeId" TEXT;

DROP INDEX "StudioMediaSourceReplica_sourceRevisionId_storageProvider_generation_key";

CREATE UNIQUE INDEX "StudioMediaSourceReplica_sourceRevisionId_storageProvider_storageScopeId_generation_key"
  ON "StudioMediaSourceReplica"("sourceRevisionId", "storageProvider", "storageScopeId", "generation");

CREATE INDEX "StudioMediaSourceReplica_custodianNodeId_storageScopeId_status_idx"
  ON "StudioMediaSourceReplica"("custodianNodeId", "storageScopeId", "status");

ALTER TABLE "StudioMediaSourceReplica"
  ADD CONSTRAINT "StudioMediaSourceReplica_custodianNodeId_fkey"
  FOREIGN KEY ("custodianNodeId") REFERENCES "AgentNode"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
