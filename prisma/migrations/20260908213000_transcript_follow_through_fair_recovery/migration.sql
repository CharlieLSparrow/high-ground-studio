-- Apply before deploying the worker. Existing jobs enter the first sweep with
-- a null cursor; no source/work data or processing state is rewritten.
-- Rollback: deploy the previous worker and retain this additive column/index.
-- Forward repair can reset only the cursor to NULL if a sweep needs restarting.
ALTER TABLE "TranscriptJob" ADD COLUMN "followThroughCheckedAt" TIMESTAMP(3);
CREATE INDEX "TranscriptJob_status_followThroughCheckedAt_id_idx"
  ON "TranscriptJob"("status", "followThroughCheckedAt" ASC NULLS FIRST, "id");
