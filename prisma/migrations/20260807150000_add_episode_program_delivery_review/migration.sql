CREATE TABLE "StudioEpisodeProgramDeliveryReviewReceipt" (
  "id" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "episodeProductionId" TEXT NOT NULL,
  "programAssetId" TEXT NOT NULL,
  "deliveryJobId" TEXT NOT NULL,
  "promotionReceiptId" TEXT NOT NULL,
  "actorEmail" TEXT NOT NULL,
  "clientRequestId" TEXT NOT NULL,
  "decision" "StudioAudioMasterReviewDecision" NOT NULL,
  "deliveryProfileId" TEXT NOT NULL,
  "programFingerprintSha256" TEXT NOT NULL,
  "candidateSha256" TEXT NOT NULL,
  "deliverySha256" TEXT NOT NULL,
  "requestSha256" TEXT NOT NULL,
  "evidenceJson" JSONB NOT NULL,
  "note" TEXT,
  "occurredAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "StudioEpisodeProgramDeliveryReviewReceipt_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "StudioEpisodeProgramDeliveryReview_project_actor_request_key"
ON "StudioEpisodeProgramDeliveryReviewReceipt"("projectId", "actorEmail", "clientRequestId");
CREATE INDEX "StudioEpisodeProgramDeliveryReview_job_occurred_idx"
ON "StudioEpisodeProgramDeliveryReviewReceipt"("deliveryJobId", "occurredAt");
CREATE INDEX "StudioEpisodeProgramDeliveryReview_episode_occurred_idx"
ON "StudioEpisodeProgramDeliveryReviewReceipt"("episodeProductionId", "occurredAt");
CREATE INDEX "StudioEpisodeProgramDeliveryReview_promotion_idx"
ON "StudioEpisodeProgramDeliveryReviewReceipt"("promotionReceiptId");
CREATE INDEX "StudioEpisodeProgramDeliveryReview_asset_occurred_idx"
ON "StudioEpisodeProgramDeliveryReviewReceipt"("programAssetId", "occurredAt");

ALTER TABLE "StudioEpisodeProgramDeliveryReviewReceipt"
ADD CONSTRAINT "StudioEpisodeProgramDeliveryReviewReceipt_projectId_fkey"
FOREIGN KEY ("projectId") REFERENCES "StudioProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StudioEpisodeProgramDeliveryReviewReceipt"
ADD CONSTRAINT "StudioEpisodeProgramDeliveryReviewReceipt_episodeProductionId_fkey"
FOREIGN KEY ("episodeProductionId") REFERENCES "StudioEpisodeProduction"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StudioEpisodeProgramDeliveryReviewReceipt"
ADD CONSTRAINT "StudioEpisodeProgramDeliveryReviewReceipt_programAssetId_fkey"
FOREIGN KEY ("programAssetId") REFERENCES "StudioMediaAsset"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StudioEpisodeProgramDeliveryReviewReceipt"
ADD CONSTRAINT "StudioEpisodeProgramDeliveryReviewReceipt_deliveryJobId_fkey"
FOREIGN KEY ("deliveryJobId") REFERENCES "StudioAssetProcessingJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StudioEpisodeProgramDeliveryReviewReceipt"
ADD CONSTRAINT "StudioEpisodeProgramDeliveryReviewReceipt_promotionReceiptId_fkey"
FOREIGN KEY ("promotionReceiptId") REFERENCES "StudioEpisodeAudioMixPromotionReceipt"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
