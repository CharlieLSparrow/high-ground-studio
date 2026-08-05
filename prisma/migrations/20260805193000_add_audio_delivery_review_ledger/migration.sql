CREATE TABLE "StudioAudioDeliveryReviewReceipt" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "deliveryJobId" TEXT NOT NULL,
    "promotionReceiptId" TEXT NOT NULL,
    "actorUserId" TEXT,
    "actorEmail" TEXT NOT NULL,
    "clientRequestId" TEXT NOT NULL,
    "decision" "StudioAudioMasterReviewDecision" NOT NULL,
    "deliveryProfileId" TEXT NOT NULL,
    "candidateSha256" TEXT NOT NULL,
    "deliverySha256" TEXT NOT NULL,
    "requestSha256" TEXT NOT NULL,
    "evidenceJson" JSONB NOT NULL,
    "note" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "StudioAudioDeliveryReviewReceipt_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "StudioAudioDeliveryReview_project_actor_request_key"
ON "StudioAudioDeliveryReviewReceipt"("projectId", "actorEmail", "clientRequestId");
CREATE INDEX "StudioAudioDeliveryReview_job_occurred_idx"
ON "StudioAudioDeliveryReviewReceipt"("deliveryJobId", "occurredAt");
CREATE INDEX "StudioAudioDeliveryReview_project_asset_occurred_idx"
ON "StudioAudioDeliveryReviewReceipt"("projectId", "assetId", "occurredAt");
CREATE INDEX "StudioAudioDeliveryReview_promotion_idx"
ON "StudioAudioDeliveryReviewReceipt"("promotionReceiptId");

ALTER TABLE "StudioAudioDeliveryReviewReceipt" ADD CONSTRAINT "StudioAudioDeliveryReviewReceipt_projectId_fkey"
FOREIGN KEY ("projectId") REFERENCES "StudioProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StudioAudioDeliveryReviewReceipt" ADD CONSTRAINT "StudioAudioDeliveryReviewReceipt_assetId_fkey"
FOREIGN KEY ("assetId") REFERENCES "StudioMediaAsset"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StudioAudioDeliveryReviewReceipt" ADD CONSTRAINT "StudioAudioDeliveryReviewReceipt_deliveryJobId_fkey"
FOREIGN KEY ("deliveryJobId") REFERENCES "StudioAssetProcessingJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StudioAudioDeliveryReviewReceipt" ADD CONSTRAINT "StudioAudioDeliveryReviewReceipt_promotionReceiptId_fkey"
FOREIGN KEY ("promotionReceiptId") REFERENCES "StudioAudioMasterPromotionReceipt"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
