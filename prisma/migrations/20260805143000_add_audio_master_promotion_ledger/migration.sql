CREATE TYPE "StudioAudioMasterPromotionOperation" AS ENUM ('PROMOTE', 'WITHDRAW');

CREATE TABLE "StudioAudioMasterPromotionReceipt" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "masteryJobId" TEXT NOT NULL,
    "reviewReceiptId" TEXT,
    "actorUserId" TEXT,
    "actorEmail" TEXT NOT NULL,
    "clientRequestId" TEXT NOT NULL,
    "operation" "StudioAudioMasterPromotionOperation" NOT NULL,
    "profileId" TEXT NOT NULL,
    "sourceSha256" TEXT NOT NULL,
    "sourceGeneration" TEXT NOT NULL,
    "previewSha256" TEXT NOT NULL,
    "requestSha256" TEXT NOT NULL,
    "evidenceJson" JSONB NOT NULL,
    "reason" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StudioAudioMasterPromotionReceipt_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "StudioAudioMasterPromotion_operation_review_check" CHECK (
      ("operation" = 'PROMOTE' AND "reviewReceiptId" IS NOT NULL)
      OR "operation" = 'WITHDRAW'
    ),
    CONSTRAINT "StudioAudioMasterPromotion_withdraw_reason_check" CHECK (
      "operation" <> 'WITHDRAW' OR length(trim(COALESCE("reason", ''))) >= 3
    )
);

CREATE UNIQUE INDEX "StudioAudioMasterPromotion_project_actor_request_key"
ON "StudioAudioMasterPromotionReceipt"("projectId", "actorEmail", "clientRequestId");

CREATE INDEX "StudioAudioMasterPromotion_job_occurred_idx"
ON "StudioAudioMasterPromotionReceipt"("masteryJobId", "occurredAt");

CREATE INDEX "StudioAudioMasterPromotion_project_asset_occurred_idx"
ON "StudioAudioMasterPromotionReceipt"("projectId", "assetId", "occurredAt");

CREATE INDEX "StudioAudioMasterPromotion_review_idx"
ON "StudioAudioMasterPromotionReceipt"("reviewReceiptId");

ALTER TABLE "StudioAudioMasterPromotionReceipt"
ADD CONSTRAINT "StudioAudioMasterPromotionReceipt_projectId_fkey"
FOREIGN KEY ("projectId") REFERENCES "StudioProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "StudioAudioMasterPromotionReceipt"
ADD CONSTRAINT "StudioAudioMasterPromotionReceipt_assetId_fkey"
FOREIGN KEY ("assetId") REFERENCES "StudioMediaAsset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "StudioAudioMasterPromotionReceipt"
ADD CONSTRAINT "StudioAudioMasterPromotionReceipt_masteryJobId_fkey"
FOREIGN KEY ("masteryJobId") REFERENCES "StudioAssetProcessingJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "StudioAudioMasterPromotionReceipt"
ADD CONSTRAINT "StudioAudioMasterPromotionReceipt_reviewReceiptId_fkey"
FOREIGN KEY ("reviewReceiptId") REFERENCES "StudioAudioMasterReviewReceipt"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
