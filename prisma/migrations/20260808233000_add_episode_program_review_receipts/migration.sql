CREATE TYPE "StudioEpisodeProgramReviewDecision" AS ENUM (
  'APPROVED',
  'REJECTED'
);

CREATE TABLE "StudioEpisodeProgramReviewReceipt" (
  "id" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "episodeProductionId" TEXT NOT NULL,
  "renderJobId" TEXT NOT NULL,
  "actorUserId" TEXT,
  "actorEmail" TEXT NOT NULL,
  "clientRequestId" TEXT NOT NULL,
  "decision" "StudioEpisodeProgramReviewDecision" NOT NULL,
  "branchId" TEXT NOT NULL,
  "branchRevision" INTEGER NOT NULL,
  "timelineFingerprintSha256" TEXT NOT NULL,
  "sourceProjectionFingerprintSha256" TEXT NOT NULL,
  "editStateFingerprintSha256" TEXT NOT NULL,
  "manifestSha256" TEXT NOT NULL,
  "outputSha256" TEXT NOT NULL,
  "outputGeneration" TEXT NOT NULL,
  "outputSizeBytes" BIGINT NOT NULL,
  "requestSha256" TEXT NOT NULL,
  "evidenceJson" JSONB NOT NULL,
  "note" TEXT,
  "occurredAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "StudioEpisodeProgramReviewReceipt_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "StudioEpisodeProgramReview_project_actor_request_key"
ON "StudioEpisodeProgramReviewReceipt"("projectId", "actorEmail", "clientRequestId");

CREATE INDEX "StudioEpisodeProgramReview_job_occurred_idx"
ON "StudioEpisodeProgramReviewReceipt"("renderJobId", "occurredAt");

CREATE INDEX "StudioEpisodeProgramReview_episode_occurred_idx"
ON "StudioEpisodeProgramReviewReceipt"("episodeProductionId", "occurredAt");

ALTER TABLE "StudioEpisodeProgramReviewReceipt"
ADD CONSTRAINT "StudioEpisodeProgramReviewReceipt_projectId_fkey"
FOREIGN KEY ("projectId") REFERENCES "StudioProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "StudioEpisodeProgramReviewReceipt"
ADD CONSTRAINT "StudioEpisodeProgramReviewReceipt_episodeProductionId_fkey"
FOREIGN KEY ("episodeProductionId") REFERENCES "StudioEpisodeProduction"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "StudioEpisodeProgramReviewReceipt"
ADD CONSTRAINT "StudioEpisodeProgramReviewReceipt_renderJobId_fkey"
FOREIGN KEY ("renderJobId") REFERENCES "StudioWorkflowJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;
