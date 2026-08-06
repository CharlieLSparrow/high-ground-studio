CREATE TYPE "StudioDialogueRepairReviewDecision" AS ENUM (
    'CONFIRMED',
    'FALSE_POSITIVE',
    'NEEDS_COMPARISON'
);

CREATE TABLE "StudioDialogueRepairCandidate" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "createdByUserId" TEXT,
    "createdByEmail" TEXT NOT NULL,
    "clientRequestId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "sourceSha256" TEXT NOT NULL,
    "sourceGeneration" TEXT NOT NULL,
    "startSeconds" DOUBLE PRECISION NOT NULL,
    "endSeconds" DOUBLE PRECISION NOT NULL,
    "requestSha256" TEXT NOT NULL,
    "candidateJson" JSONB NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "StudioDialogueRepairCandidate_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "StudioDialogueRepairReviewReceipt" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "candidateId" TEXT NOT NULL,
    "actorUserId" TEXT,
    "actorEmail" TEXT NOT NULL,
    "clientRequestId" TEXT NOT NULL,
    "decision" "StudioDialogueRepairReviewDecision" NOT NULL,
    "sourceSha256" TEXT NOT NULL,
    "sourceGeneration" TEXT NOT NULL,
    "requestSha256" TEXT NOT NULL,
    "evidenceJson" JSONB NOT NULL,
    "note" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "StudioDialogueRepairReviewReceipt_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "StudioDialogueRepairCandidate_project_actor_request_key"
ON "StudioDialogueRepairCandidate"("projectId", "createdByEmail", "clientRequestId");
CREATE INDEX "StudioDialogueRepairCandidate_project_asset_occurred_idx"
ON "StudioDialogueRepairCandidate"("projectId", "assetId", "occurredAt");
CREATE INDEX "StudioDialogueRepairCandidate_source_occurred_idx"
ON "StudioDialogueRepairCandidate"("sourceId", "occurredAt");

CREATE UNIQUE INDEX "StudioDialogueRepairReview_project_actor_request_key"
ON "StudioDialogueRepairReviewReceipt"("projectId", "actorEmail", "clientRequestId");
CREATE INDEX "StudioDialogueRepairReview_candidate_occurred_idx"
ON "StudioDialogueRepairReviewReceipt"("candidateId", "occurredAt");
CREATE INDEX "StudioDialogueRepairReview_project_asset_occurred_idx"
ON "StudioDialogueRepairReviewReceipt"("projectId", "assetId", "occurredAt");

ALTER TABLE "StudioDialogueRepairCandidate" ADD CONSTRAINT "StudioDialogueRepairCandidate_projectId_fkey"
FOREIGN KEY ("projectId") REFERENCES "StudioProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StudioDialogueRepairCandidate" ADD CONSTRAINT "StudioDialogueRepairCandidate_assetId_fkey"
FOREIGN KEY ("assetId") REFERENCES "StudioMediaAsset"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StudioDialogueRepairCandidate" ADD CONSTRAINT "StudioDialogueRepairCandidate_sourceId_fkey"
FOREIGN KEY ("sourceId") REFERENCES "StudioVideoSource"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "StudioDialogueRepairReviewReceipt" ADD CONSTRAINT "StudioDialogueRepairReviewReceipt_projectId_fkey"
FOREIGN KEY ("projectId") REFERENCES "StudioProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StudioDialogueRepairReviewReceipt" ADD CONSTRAINT "StudioDialogueRepairReviewReceipt_assetId_fkey"
FOREIGN KEY ("assetId") REFERENCES "StudioMediaAsset"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StudioDialogueRepairReviewReceipt" ADD CONSTRAINT "StudioDialogueRepairReviewReceipt_candidateId_fkey"
FOREIGN KEY ("candidateId") REFERENCES "StudioDialogueRepairCandidate"("id") ON DELETE CASCADE ON UPDATE CASCADE;
