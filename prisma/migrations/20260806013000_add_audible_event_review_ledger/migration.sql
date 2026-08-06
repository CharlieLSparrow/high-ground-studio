CREATE TABLE "StudioAudibleEventReviewReceipt" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "analysisId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "actorUserId" TEXT,
    "actorEmail" TEXT NOT NULL,
    "clientRequestId" TEXT NOT NULL,
    "decision" "StudioDialogueRepairReviewDecision" NOT NULL,
    "classificationIdentifier" TEXT NOT NULL,
    "displayLabel" TEXT NOT NULL,
    "family" TEXT NOT NULL,
    "detectorAlgorithm" TEXT NOT NULL,
    "classifierIdentifier" TEXT NOT NULL,
    "detectorConfigurationSha256" TEXT NOT NULL,
    "sourceSha256" TEXT NOT NULL,
    "sourceGeneration" TEXT NOT NULL,
    "startSeconds" DOUBLE PRECISION NOT NULL,
    "endSeconds" DOUBLE PRECISION NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL,
    "requestSha256" TEXT NOT NULL,
    "evidenceJson" JSONB NOT NULL,
    "note" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "StudioAudibleEventReviewReceipt_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "StudioAudibleEventReview_project_actor_request_key"
ON "StudioAudibleEventReviewReceipt"("projectId", "actorEmail", "clientRequestId");
CREATE INDEX "StudioAudibleEventReview_analysis_event_idx"
ON "StudioAudibleEventReviewReceipt"("analysisId", "eventId", "occurredAt");
CREATE INDEX "StudioAudibleEventReview_project_asset_idx"
ON "StudioAudibleEventReviewReceipt"("projectId", "assetId", "occurredAt");
CREATE INDEX "StudioAudibleEventReview_source_idx"
ON "StudioAudibleEventReviewReceipt"("sourceId", "occurredAt");

ALTER TABLE "StudioAudibleEventReviewReceipt" ADD CONSTRAINT "StudioAudibleEventReviewReceipt_projectId_fkey"
FOREIGN KEY ("projectId") REFERENCES "StudioProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StudioAudibleEventReviewReceipt" ADD CONSTRAINT "StudioAudibleEventReviewReceipt_assetId_fkey"
FOREIGN KEY ("assetId") REFERENCES "StudioMediaAsset"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StudioAudibleEventReviewReceipt" ADD CONSTRAINT "StudioAudibleEventReviewReceipt_sourceId_fkey"
FOREIGN KEY ("sourceId") REFERENCES "StudioVideoSource"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
