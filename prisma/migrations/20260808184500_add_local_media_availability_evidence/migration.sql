-- Local media is a cache or derivative, never the source of truth. These
-- timestamps let the local executor distinguish a recently observed artifact
-- from a historical database receipt without exposing its filesystem path.
ALTER TABLE "StudioMediaDerivative"
  ADD COLUMN "availabilityCheckedAt" TIMESTAMP(3),
  ADD COLUMN "contentVerifiedAt" TIMESTAMP(3),
  ADD COLUMN "unavailableAt" TIMESTAMP(3);

ALTER TABLE "StudioMediaSourceReplica"
  ADD COLUMN "availabilityCheckedAt" TIMESTAMP(3),
  ADD COLUMN "contentVerifiedAt" TIMESTAMP(3),
  ADD COLUMN "unavailableAt" TIMESTAMP(3);

CREATE INDEX "StudioMediaDerivative_status_availabilityCheckedAt_idx"
  ON "StudioMediaDerivative"("status", "availabilityCheckedAt");

CREATE INDEX "StudioMediaSourceReplica_status_availabilityCheckedAt_idx"
  ON "StudioMediaSourceReplica"("status", "availabilityCheckedAt");
