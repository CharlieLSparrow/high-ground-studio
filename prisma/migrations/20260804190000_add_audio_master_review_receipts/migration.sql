CREATE TYPE "StudioAudioMasterReviewDecision" AS ENUM ('APPROVED', 'REJECTED');

CREATE TABLE "StudioAudioMasterReviewReceipt" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "masteryJobId" TEXT NOT NULL,
    "actorUserId" TEXT,
    "actorEmail" TEXT NOT NULL,
    "clientRequestId" TEXT NOT NULL,
    "decision" "StudioAudioMasterReviewDecision" NOT NULL,
    "profileId" TEXT NOT NULL,
    "sourceSha256" TEXT NOT NULL,
    "sourceGeneration" TEXT NOT NULL,
    "previewSha256" TEXT NOT NULL,
    "requestSha256" TEXT NOT NULL,
    "evidenceJson" JSONB NOT NULL,
    "note" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StudioAudioMasterReviewReceipt_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "StudioAudioMasterReview_project_actor_request_key"
ON "StudioAudioMasterReviewReceipt"("projectId", "actorEmail", "clientRequestId");

CREATE INDEX "StudioAudioMasterReview_job_created_idx"
ON "StudioAudioMasterReviewReceipt"("masteryJobId", "createdAt");

CREATE INDEX "StudioAudioMasterReview_project_asset_created_idx"
ON "StudioAudioMasterReviewReceipt"("projectId", "assetId", "createdAt");

ALTER TABLE "StudioAudioMasterReviewReceipt"
ADD CONSTRAINT "StudioAudioMasterReviewReceipt_projectId_fkey"
FOREIGN KEY ("projectId") REFERENCES "StudioProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "StudioAudioMasterReviewReceipt"
ADD CONSTRAINT "StudioAudioMasterReviewReceipt_assetId_fkey"
FOREIGN KEY ("assetId") REFERENCES "StudioMediaAsset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "StudioAudioMasterReviewReceipt"
ADD CONSTRAINT "StudioAudioMasterReviewReceipt_masteryJobId_fkey"
FOREIGN KEY ("masteryJobId") REFERENCES "StudioAssetProcessingJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;
