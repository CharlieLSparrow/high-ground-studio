CREATE TABLE "StudioEpisodeAudioMixReviewReceipt" (
  "id" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "episodeProductionId" TEXT NOT NULL,
  "mixJobId" TEXT NOT NULL,
  "actorEmail" TEXT NOT NULL,
  "clientRequestId" TEXT NOT NULL,
  "decision" "StudioAudioMasterReviewDecision" NOT NULL,
  "programFingerprintSha256" TEXT NOT NULL,
  "proposalSha256" TEXT NOT NULL,
  "baselineSha256" TEXT NOT NULL,
  "previewSha256" TEXT NOT NULL,
  "requestSha256" TEXT NOT NULL,
  "evidenceJson" JSONB NOT NULL,
  "note" TEXT,
  "occurredAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "StudioEpisodeAudioMixReviewReceipt_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "StudioEpisodeAudioMixPromotionReceipt" (
  "id" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "episodeProductionId" TEXT NOT NULL,
  "mixJobId" TEXT NOT NULL,
  "reviewReceiptId" TEXT,
  "actorEmail" TEXT NOT NULL,
  "clientRequestId" TEXT NOT NULL,
  "operation" "StudioAudioMasterPromotionOperation" NOT NULL,
  "programFingerprintSha256" TEXT NOT NULL,
  "proposalSha256" TEXT NOT NULL,
  "baselineSha256" TEXT NOT NULL,
  "previewSha256" TEXT NOT NULL,
  "requestSha256" TEXT NOT NULL,
  "evidenceJson" JSONB NOT NULL,
  "reason" TEXT,
  "occurredAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "StudioEpisodeAudioMixPromotionReceipt_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "StudioEpisodeMixReview_project_actor_request_key"
ON "StudioEpisodeAudioMixReviewReceipt"("projectId", "actorEmail", "clientRequestId");
CREATE INDEX "StudioEpisodeMixReview_job_occurred_idx"
ON "StudioEpisodeAudioMixReviewReceipt"("mixJobId", "occurredAt");
CREATE INDEX "StudioEpisodeMixReview_episode_occurred_idx"
ON "StudioEpisodeAudioMixReviewReceipt"("episodeProductionId", "occurredAt");

CREATE UNIQUE INDEX "StudioEpisodeMixPromotion_project_actor_request_key"
ON "StudioEpisodeAudioMixPromotionReceipt"("projectId", "actorEmail", "clientRequestId");
CREATE INDEX "StudioEpisodeMixPromotion_job_occurred_idx"
ON "StudioEpisodeAudioMixPromotionReceipt"("mixJobId", "occurredAt");
CREATE INDEX "StudioEpisodeMixPromotion_episode_occurred_idx"
ON "StudioEpisodeAudioMixPromotionReceipt"("episodeProductionId", "occurredAt");
CREATE INDEX "StudioEpisodeMixPromotion_review_idx"
ON "StudioEpisodeAudioMixPromotionReceipt"("reviewReceiptId");

ALTER TABLE "StudioEpisodeAudioMixReviewReceipt"
ADD CONSTRAINT "StudioEpisodeAudioMixReviewReceipt_projectId_fkey"
FOREIGN KEY ("projectId") REFERENCES "StudioProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StudioEpisodeAudioMixReviewReceipt"
ADD CONSTRAINT "StudioEpisodeAudioMixReviewReceipt_episodeProductionId_fkey"
FOREIGN KEY ("episodeProductionId") REFERENCES "StudioEpisodeProduction"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StudioEpisodeAudioMixReviewReceipt"
ADD CONSTRAINT "StudioEpisodeAudioMixReviewReceipt_mixJobId_fkey"
FOREIGN KEY ("mixJobId") REFERENCES "StudioAssetProcessingJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "StudioEpisodeAudioMixPromotionReceipt"
ADD CONSTRAINT "StudioEpisodeAudioMixPromotionReceipt_projectId_fkey"
FOREIGN KEY ("projectId") REFERENCES "StudioProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StudioEpisodeAudioMixPromotionReceipt"
ADD CONSTRAINT "StudioEpisodeAudioMixPromotionReceipt_episodeProductionId_fkey"
FOREIGN KEY ("episodeProductionId") REFERENCES "StudioEpisodeProduction"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StudioEpisodeAudioMixPromotionReceipt"
ADD CONSTRAINT "StudioEpisodeAudioMixPromotionReceipt_mixJobId_fkey"
FOREIGN KEY ("mixJobId") REFERENCES "StudioAssetProcessingJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StudioEpisodeAudioMixPromotionReceipt"
ADD CONSTRAINT "StudioEpisodeAudioMixPromotionReceipt_reviewReceiptId_fkey"
FOREIGN KEY ("reviewReceiptId") REFERENCES "StudioEpisodeAudioMixReviewReceipt"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
