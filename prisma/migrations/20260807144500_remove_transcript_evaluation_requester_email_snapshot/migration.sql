-- The requester relation already supplies identity and provenance. Avoid
-- retaining a second email snapshot in evaluation operations.
ALTER TABLE "TranscriptEvaluationRun"
  DROP COLUMN "requestedByEmailSnapshot";
