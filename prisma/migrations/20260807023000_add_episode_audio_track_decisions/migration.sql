CREATE TYPE "StudioEpisodeAudioTrackDecisionOperation" AS ENUM ('SET', 'WITHDRAW');
CREATE TYPE "StudioEpisodeAudioTrackDecisionKind" AS ENUM ('TRACK_ROLE', 'PARTICIPANT', 'PROGRAM_CLOCK', 'MIX_DISPOSITION');

CREATE TABLE "StudioEpisodeAudioTrackDecisionReceipt" (
  "id" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "episodeProductionId" TEXT NOT NULL,
  "assetId" TEXT NOT NULL,
  "sourceId" TEXT NOT NULL,
  "actorUserId" TEXT,
  "actorEmail" TEXT NOT NULL,
  "clientRequestId" TEXT NOT NULL,
  "operation" "StudioEpisodeAudioTrackDecisionOperation" NOT NULL,
  "decisionKind" "StudioEpisodeAudioTrackDecisionKind" NOT NULL,
  "decisionValue" TEXT NOT NULL,
  "decisionLabel" TEXT,
  "targetReceiptId" TEXT,
  "programFingerprintSha256" TEXT NOT NULL,
  "sourceSha256" TEXT NOT NULL,
  "sourceGeneration" TEXT NOT NULL,
  "sourceSizeBytes" BIGINT NOT NULL,
  "requestSha256" TEXT NOT NULL,
  "evidenceJson" JSONB NOT NULL DEFAULT '{}',
  "reason" TEXT,
  "occurredAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "StudioEpisodeAudioTrackDecisionReceipt_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "StudioEpisodeAudioDecision_project_actor_request_key"
ON "StudioEpisodeAudioTrackDecisionReceipt"("projectId", "actorEmail", "clientRequestId");

CREATE INDEX "StudioEpisodeAudioDecision_episode_kind_time_idx"
ON "StudioEpisodeAudioTrackDecisionReceipt"("episodeProductionId", "decisionKind", "occurredAt");

CREATE INDEX "StudioEpisodeAudioDecision_track_kind_time_idx"
ON "StudioEpisodeAudioTrackDecisionReceipt"("assetId", "sourceId", "decisionKind", "occurredAt");

CREATE INDEX "StudioEpisodeAudioDecision_target_idx"
ON "StudioEpisodeAudioTrackDecisionReceipt"("targetReceiptId");

CREATE INDEX "StudioEpisodeAudioDecision_program_fingerprint_idx"
ON "StudioEpisodeAudioTrackDecisionReceipt"("programFingerprintSha256");

ALTER TABLE "StudioEpisodeAudioTrackDecisionReceipt"
ADD CONSTRAINT "StudioEpisodeAudioTrackDecisionReceipt_projectId_fkey"
FOREIGN KEY ("projectId") REFERENCES "StudioProject"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "StudioEpisodeAudioTrackDecisionReceipt"
ADD CONSTRAINT "StudioEpisodeAudioTrackDecisionReceipt_episodeProductionId_fkey"
FOREIGN KEY ("episodeProductionId") REFERENCES "StudioEpisodeProduction"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "StudioEpisodeAudioTrackDecisionReceipt"
ADD CONSTRAINT "StudioEpisodeAudioTrackDecisionReceipt_assetId_fkey"
FOREIGN KEY ("assetId") REFERENCES "StudioMediaAsset"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "StudioEpisodeAudioTrackDecisionReceipt"
ADD CONSTRAINT "StudioEpisodeAudioTrackDecisionReceipt_sourceId_fkey"
FOREIGN KEY ("sourceId") REFERENCES "StudioVideoSource"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "StudioEpisodeAudioTrackDecisionReceipt"
ADD CONSTRAINT "StudioEpisodeAudioTrackDecisionReceipt_targetReceiptId_fkey"
FOREIGN KEY ("targetReceiptId") REFERENCES "StudioEpisodeAudioTrackDecisionReceipt"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;
