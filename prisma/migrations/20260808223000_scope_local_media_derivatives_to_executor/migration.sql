-- Local derivatives are usable only on the worker and storage root that owns
-- their locator. Legacy rows remain unscoped until reverified or regenerated.
ALTER TABLE "StudioMediaDerivative"
  ADD COLUMN "custodianNodeId" TEXT,
  ADD COLUMN "storageScopeId" TEXT;

DROP INDEX "StudioMediaDerivative_sourceRevisionId_kind_profile_generation_key";

CREATE UNIQUE INDEX "StudioMediaDerivative_sourceRevisionId_kind_profile_storageScopeId_generation_key"
  ON "StudioMediaDerivative"("sourceRevisionId", "kind", "profile", "storageScopeId", "generation");

CREATE INDEX "StudioMediaDerivative_custodianNodeId_storageScopeId_status_idx"
  ON "StudioMediaDerivative"("custodianNodeId", "storageScopeId", "status");

ALTER TABLE "StudioMediaDerivative"
  ADD CONSTRAINT "StudioMediaDerivative_custodianNodeId_fkey"
  FOREIGN KEY ("custodianNodeId") REFERENCES "AgentNode"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
