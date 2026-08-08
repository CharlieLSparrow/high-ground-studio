CREATE TYPE "StudioEpisodeMasterReviewDecision" AS ENUM (
  'APPROVED',
  'REJECTED'
);

CREATE TABLE "StudioEpisodeMasterReviewReceipt" (
  "id" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "episodeProductionId" TEXT NOT NULL,
  "renderJobId" TEXT NOT NULL,
  "programApprovalReceiptId" TEXT NOT NULL,
  "actorUserId" TEXT,
  "actorEmail" TEXT NOT NULL,
  "clientRequestId" TEXT NOT NULL,
  "decision" "StudioEpisodeMasterReviewDecision" NOT NULL,
  "branchId" TEXT NOT NULL,
  "branchRevision" INTEGER NOT NULL,
  "timelineFingerprintSha256" TEXT NOT NULL,
  "sourceProjectionFingerprintSha256" TEXT NOT NULL,
  "editStateFingerprintSha256" TEXT NOT NULL,
  "approvedProgramManifestSha256" TEXT NOT NULL,
  "masterManifestSha256" TEXT NOT NULL,
  "outputSha256" TEXT NOT NULL,
  "outputGeneration" TEXT NOT NULL,
  "outputSizeBytes" BIGINT NOT NULL,
  "requestSha256" TEXT NOT NULL,
  "evidenceJson" JSONB NOT NULL,
  "note" TEXT,
  "occurredAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "StudioEpisodeMasterReviewReceipt_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "StudioEpisodeMasterReview_project_actor_request_key"
ON "StudioEpisodeMasterReviewReceipt"("projectId", "actorEmail", "clientRequestId");

CREATE INDEX "StudioEpisodeMasterReview_job_occurred_idx"
ON "StudioEpisodeMasterReviewReceipt"("renderJobId", "occurredAt");

CREATE INDEX "StudioEpisodeMasterReview_episode_occurred_idx"
ON "StudioEpisodeMasterReviewReceipt"("episodeProductionId", "occurredAt");

ALTER TABLE "StudioEpisodeMasterReviewReceipt"
ADD CONSTRAINT "StudioEpisodeMasterReviewReceipt_projectId_fkey"
FOREIGN KEY ("projectId") REFERENCES "StudioProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "StudioEpisodeMasterReviewReceipt"
ADD CONSTRAINT "StudioEpisodeMasterReviewReceipt_episodeProductionId_fkey"
FOREIGN KEY ("episodeProductionId") REFERENCES "StudioEpisodeProduction"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "StudioEpisodeMasterReviewReceipt"
ADD CONSTRAINT "StudioEpisodeMasterReviewReceipt_renderJobId_fkey"
FOREIGN KEY ("renderJobId") REFERENCES "StudioWorkflowJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;
