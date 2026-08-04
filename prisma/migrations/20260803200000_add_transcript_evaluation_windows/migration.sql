CREATE TABLE "TranscriptEvaluationWindow" (
    "id" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "transcriptJobId" TEXT NOT NULL,
    "recordingAssetId" TEXT NOT NULL,
    "approvedByUserId" TEXT NOT NULL,
    "approvedByEmailSnapshot" TEXT,
    "clientRequestId" TEXT NOT NULL,
    "windowKeySha256" TEXT NOT NULL,
    "workload" TEXT NOT NULL,
    "conditionsJson" JSONB NOT NULL,
    "sourceStartSeconds" DOUBLE PRECISION NOT NULL,
    "sourceEndSeconds" DOUBLE PRECISION NOT NULL,
    "sourceDurationSeconds" DOUBLE PRECISION NOT NULL,
    "sourceSha256" TEXT NOT NULL,
    "sourceGeneration" TEXT,
    "playbackSourceId" TEXT NOT NULL,
    "consentVersionSha256" TEXT NOT NULL,
    "referenceRevisionId" TEXT NOT NULL,
    "referenceContentSha256" TEXT NOT NULL,
    "referenceWordsJson" JSONB NOT NULL,
    "sourceSegmentIdsJson" JSONB NOT NULL,
    "sourceReviewReceiptsJson" JSONB NOT NULL,
    "providerSnapshotJson" JSONB NOT NULL,
    "reviewNote" TEXT,
    "approvedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TranscriptEvaluationWindow_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TranscriptEvalWindow_key_sha_key"
ON "TranscriptEvaluationWindow"("windowKeySha256");

CREATE UNIQUE INDEX "TranscriptEvalWindow_approver_request_key"
ON "TranscriptEvaluationWindow"("approvedByUserId", "clientRequestId");

CREATE INDEX "TranscriptEvalWindow_room_approved_idx"
ON "TranscriptEvaluationWindow"("roomId", "approvedAt");

CREATE INDEX "TranscriptEvalWindow_job_approved_idx"
ON "TranscriptEvaluationWindow"("transcriptJobId", "approvedAt");

CREATE INDEX "TranscriptEvalWindow_asset_approved_idx"
ON "TranscriptEvaluationWindow"("recordingAssetId", "approvedAt");

CREATE INDEX "TranscriptEvalWindow_workload_approved_idx"
ON "TranscriptEvaluationWindow"("workload", "approvedAt");

ALTER TABLE "TranscriptEvaluationWindow"
ADD CONSTRAINT "TranscriptEvalWindow_room_fkey"
FOREIGN KEY ("roomId") REFERENCES "CallRoom"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "TranscriptEvaluationWindow"
ADD CONSTRAINT "TranscriptEvalWindow_job_fkey"
FOREIGN KEY ("transcriptJobId") REFERENCES "TranscriptJob"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "TranscriptEvaluationWindow"
ADD CONSTRAINT "TranscriptEvalWindow_asset_fkey"
FOREIGN KEY ("recordingAssetId") REFERENCES "RecordingAsset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "TranscriptEvaluationWindow"
ADD CONSTRAINT "TranscriptEvalWindow_approver_fkey"
FOREIGN KEY ("approvedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "TranscriptEvaluationWindow"
ADD CONSTRAINT "TranscriptEvalWindow_workload_check"
CHECK ("workload" IN ('podcast', 'coaching')),
ADD CONSTRAINT "TranscriptEvalWindow_duration_check"
CHECK (
  "sourceStartSeconds" >= 0
  AND "sourceEndSeconds" > "sourceStartSeconds"
  AND "sourceDurationSeconds" = "sourceEndSeconds" - "sourceStartSeconds"
  AND "sourceDurationSeconds" BETWEEN 60 AND 180
),
ADD CONSTRAINT "TranscriptEvalWindow_sha_check"
CHECK (
  "windowKeySha256" ~ '^[0-9a-f]{64}$'
  AND "sourceSha256" ~ '^[0-9a-f]{64}$'
  AND "consentVersionSha256" ~ '^[0-9a-f]{64}$'
  AND "referenceContentSha256" ~ '^[0-9a-f]{64}$'
),
ADD CONSTRAINT "TranscriptEvalWindow_request_check"
CHECK (char_length(btrim("clientRequestId")) BETWEEN 1 AND 160),
ADD CONSTRAINT "TranscriptEvalWindow_reference_revision_check"
CHECK (char_length(btrim("referenceRevisionId")) BETWEEN 3 AND 160),
ADD CONSTRAINT "TranscriptEvalWindow_playback_source_check"
CHECK (char_length(btrim("playbackSourceId")) BETWEEN 1 AND 240),
ADD CONSTRAINT "TranscriptEvalWindow_conditions_check"
CHECK (
  jsonb_typeof("conditionsJson") = 'array'
  AND jsonb_array_length("conditionsJson") BETWEEN 1 AND 6
),
ADD CONSTRAINT "TranscriptEvalWindow_reference_words_check"
CHECK (
  jsonb_typeof("referenceWordsJson") = 'array'
  AND jsonb_array_length("referenceWordsJson") BETWEEN 1 AND 3000
),
ADD CONSTRAINT "TranscriptEvalWindow_segment_ids_check"
CHECK (
  jsonb_typeof("sourceSegmentIdsJson") = 'array'
  AND jsonb_array_length("sourceSegmentIdsJson") BETWEEN 1 AND 1000
),
ADD CONSTRAINT "TranscriptEvalWindow_review_receipts_check"
CHECK (
  jsonb_typeof("sourceReviewReceiptsJson") = 'array'
  AND jsonb_array_length("sourceReviewReceiptsJson") = jsonb_array_length("sourceSegmentIdsJson")
),
ADD CONSTRAINT "TranscriptEvalWindow_provider_snapshot_check"
CHECK (jsonb_typeof("providerSnapshotJson") = 'object');
