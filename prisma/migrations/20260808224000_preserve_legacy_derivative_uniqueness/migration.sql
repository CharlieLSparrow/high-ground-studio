-- A local derivative is either legacy/unscoped or fully owned by one local
-- executor scope. Partial custody would make its locator impossible to route.
ALTER TABLE "StudioMediaDerivative"
  ADD CONSTRAINT "StudioMediaDerivative_executor_custody_pair_check"
  CHECK (
    ("custodianNodeId" IS NULL AND "storageScopeId" IS NULL)
    OR
    ("custodianNodeId" IS NOT NULL AND "storageScopeId" IS NOT NULL)
  );

-- PostgreSQL treats NULL values as distinct in the scoped composite unique
-- index. Preserve the former uniqueness contract for legacy/unscoped rows
-- until those producers are migrated to explicit executor custody.
CREATE UNIQUE INDEX "StudioMediaDerivative_legacy_source_kind_profile_generation_key"
  ON "StudioMediaDerivative"("sourceRevisionId", "kind", "profile", "generation")
  WHERE "storageScopeId" IS NULL;
