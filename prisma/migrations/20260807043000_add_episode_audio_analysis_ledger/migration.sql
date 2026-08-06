CREATE TYPE "StudioEpisodeAudioReviewDecision" AS ENUM (
  'CONFIRMED_OVERLAP',
  'INTENTIONAL_OVERLAP',
  'SAME_PARTICIPANT_REDUNDANCY',
  'MIC_BLEED',
  'CONFIRMED_DIALOGUE_GAP',
  'FALSE_POSITIVE',
  'NEEDS_COMPARISON'
);

CREATE TABLE "StudioEpisodeAudioAnalysisReceipt" (
  "id" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "episodeProductionId" TEXT NOT NULL,
  "supersedesAnalysisId" TEXT,
  "actorUserId" TEXT,
  "actorEmail" TEXT NOT NULL,
  "clientRequestId" TEXT NOT NULL,
  "programFingerprintSha256" TEXT NOT NULL,
  "algorithm" TEXT NOT NULL,
  "configurationSha256" TEXT NOT NULL,
  "inputSha256" TEXT NOT NULL,
  "requestSha256" TEXT NOT NULL,
  "inputJson" JSONB NOT NULL,
  "analysisJson" JSONB NOT NULL,
  "analyzedAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "StudioEpisodeAudioAnalysisReceipt_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "StudioEpisodeAudioReviewReceipt" (
  "id" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "episodeProductionId" TEXT NOT NULL,
  "analysisId" TEXT NOT NULL,
  "eventId" TEXT NOT NULL,
  "actorUserId" TEXT,
  "actorEmail" TEXT NOT NULL,
  "clientRequestId" TEXT NOT NULL,
  "decision" "StudioEpisodeAudioReviewDecision" NOT NULL,
  "programFingerprintSha256" TEXT NOT NULL,
  "eventKind" TEXT NOT NULL,
  "startSeconds" DOUBLE PRECISION NOT NULL,
  "endSeconds" DOUBLE PRECISION NOT NULL,
  "involvedAssetIdsJson" JSONB NOT NULL,
  "playbackEvidenceJson" JSONB NOT NULL,
  "requestSha256" TEXT NOT NULL,
  "note" TEXT,
  "occurredAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "StudioEpisodeAudioReviewReceipt_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "StudioEpisodeAudioAnalysis_project_actor_request_key"
ON "StudioEpisodeAudioAnalysisReceipt"("projectId", "actorEmail", "clientRequestId");
CREATE UNIQUE INDEX "StudioEpisodeAudioAnalysis_episode_input_key"
ON "StudioEpisodeAudioAnalysisReceipt"("episodeProductionId", "inputSha256");
CREATE INDEX "StudioEpisodeAudioAnalysis_episode_time_idx"
ON "StudioEpisodeAudioAnalysisReceipt"("episodeProductionId", "analyzedAt");
CREATE INDEX "StudioEpisodeAudioAnalysis_program_fingerprint_idx"
ON "StudioEpisodeAudioAnalysisReceipt"("programFingerprintSha256");
CREATE INDEX "StudioEpisodeAudioAnalysis_supersedes_idx"
ON "StudioEpisodeAudioAnalysisReceipt"("supersedesAnalysisId");
CREATE UNIQUE INDEX "StudioEpisodeAudioReview_project_actor_request_key"
ON "StudioEpisodeAudioReviewReceipt"("projectId", "actorEmail", "clientRequestId");
CREATE INDEX "StudioEpisodeAudioReview_analysis_event_time_idx"
ON "StudioEpisodeAudioReviewReceipt"("analysisId", "eventId", "occurredAt");
CREATE INDEX "StudioEpisodeAudioReview_episode_time_idx"
ON "StudioEpisodeAudioReviewReceipt"("episodeProductionId", "occurredAt");

ALTER TABLE "StudioEpisodeAudioAnalysisReceipt"
ADD CONSTRAINT "StudioEpisodeAudioAnalysisReceipt_projectId_fkey"
FOREIGN KEY ("projectId") REFERENCES "StudioProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StudioEpisodeAudioAnalysisReceipt"
ADD CONSTRAINT "StudioEpisodeAudioAnalysisReceipt_episodeProductionId_fkey"
FOREIGN KEY ("episodeProductionId") REFERENCES "StudioEpisodeProduction"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StudioEpisodeAudioAnalysisReceipt"
ADD CONSTRAINT "StudioEpisodeAudioAnalysisReceipt_supersedesAnalysisId_fkey"
FOREIGN KEY ("supersedesAnalysisId") REFERENCES "StudioEpisodeAudioAnalysisReceipt"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StudioEpisodeAudioReviewReceipt"
ADD CONSTRAINT "StudioEpisodeAudioReviewReceipt_projectId_fkey"
FOREIGN KEY ("projectId") REFERENCES "StudioProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StudioEpisodeAudioReviewReceipt"
ADD CONSTRAINT "StudioEpisodeAudioReviewReceipt_episodeProductionId_fkey"
FOREIGN KEY ("episodeProductionId") REFERENCES "StudioEpisodeProduction"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StudioEpisodeAudioReviewReceipt"
ADD CONSTRAINT "StudioEpisodeAudioReviewReceipt_analysisId_fkey"
FOREIGN KEY ("analysisId") REFERENCES "StudioEpisodeAudioAnalysisReceipt"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
