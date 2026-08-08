-- PostgreSQL truncates identifiers at 63 bytes. Use explicit stable names so
-- Prisma does not report a rename on every schema audit.
ALTER INDEX "StudioMediaDerivative_sourceRevisionId_kind_profile_storageScop"
  RENAME TO "StudioMediaDerivative_source_scope_generation_key";

ALTER INDEX "StudioMediaDerivative_custodianNodeId_storageScopeId_status_idx"
  RENAME TO "StudioMediaDerivative_custody_status_idx";
