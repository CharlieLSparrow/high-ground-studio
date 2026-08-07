-- Repeated provider inspections are audit evidence, but they are not state
-- revisions when the provider projection is unchanged. Keep request identity
-- unique while allowing multiple observations to cite the same revision.
DROP INDEX "StudioExternalMediaReferenceOperation_referenceId_revision_key";
CREATE INDEX "StudioExternalMediaReferenceOperation_referenceId_revision_idx"
  ON "StudioExternalMediaReferenceOperation"("referenceId", "revision");
