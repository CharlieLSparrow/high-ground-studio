-- A coaching relationship needs durable notes between individual Sessions.
-- Session notes keep their existing room binding; engagement notes use this
-- separate nullable boundary and follow the relationship's access lifecycle.
ALTER TABLE "CoachingNote"
  ADD COLUMN "engagementId" TEXT;

ALTER TABLE "CoachingNote"
  ADD CONSTRAINT "CoachingNote_engagementId_fkey"
  FOREIGN KEY ("engagementId") REFERENCES "CoachingEngagement"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "CoachingNote_engagementId_visibility_updatedAt_idx"
  ON "CoachingNote"("engagementId", "visibility", "updatedAt");

CREATE INDEX "CoachingNote_engagementId_authorUserId_updatedAt_idx"
  ON "CoachingNote"("engagementId", "authorUserId", "updatedAt");
