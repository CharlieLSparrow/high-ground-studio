-- Generated edit analyses and their review history are durable collaboration
-- records. They never mutate source media, and draft actions remain explicitly
-- separate from a canonical timeline save.
CREATE TYPE "StudioEpisodeEditReviewAction" AS ENUM (
  'PROPOSAL_CREATED',
  'PROOF_LISTENED',
  'PROOF_WATCHED',
  'APPLIED_TO_DRAFT',
  'DISMISSED',
  'RESTORED_TO_DRAFT',
  'TIMELINE_SAVED'
);

CREATE TYPE "StudioEpisodeEditReviewScope" AS ENUM (
  'REVIEW_ONLY',
  'LOCAL_DRAFT',
  'CANONICAL_TIMELINE'
);

CREATE TABLE "StudioEpisodeEditProposalSet" (
  "id" TEXT NOT NULL,
  "episodeProductionId" TEXT NOT NULL,
  "createdByUserId" TEXT,
  "createdByEmail" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "version" INTEGER NOT NULL,
  "providerKind" TEXT NOT NULL,
  "providerModel" TEXT NOT NULL,
  "timelineFingerprintSha256" TEXT NOT NULL,
  "transcriptSha256" TEXT NOT NULL,
  "blockCount" INTEGER NOT NULL,
  "sourceStartMilliseconds" INTEGER NOT NULL,
  "sourceEndMilliseconds" INTEGER NOT NULL,
  "recordingAssetId" TEXT,
  "sourceSha256" TEXT,
  "storageGeneration" TEXT,
  "signalProfileSha256" TEXT,
  "payloadSha256" TEXT NOT NULL,
  "proposalJson" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "StudioEpisodeEditProposalSet_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "StudioEpisodeEditReviewReceipt" (
  "id" TEXT NOT NULL,
  "episodeProductionId" TEXT NOT NULL,
  "proposalSetId" TEXT,
  "actorUserId" TEXT,
  "actorEmail" TEXT NOT NULL,
  "clientRequestId" TEXT NOT NULL,
  "action" "StudioEpisodeEditReviewAction" NOT NULL,
  "scope" "StudioEpisodeEditReviewScope" NOT NULL,
  "subjectId" TEXT,
  "subjectKind" TEXT,
  "sourceStartMilliseconds" INTEGER,
  "sourceEndMilliseconds" INTEGER,
  "proposalTimelineFingerprintSha256" TEXT NOT NULL,
  "timelineFingerprintBeforeSha256" TEXT NOT NULL,
  "timelineFingerprintAfterSha256" TEXT,
  "transcriptSha256" TEXT,
  "sourceSha256" TEXT,
  "storageGeneration" TEXT,
  "signalProfileSha256" TEXT,
  "requestSha256" TEXT NOT NULL,
  "evidenceJson" JSONB NOT NULL DEFAULT '{}',
  "occurredAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "StudioEpisodeEditReviewReceipt_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "StudioEpisodeEditProposalSet_episodeProductionId_createdAt_idx"
ON "StudioEpisodeEditProposalSet"("episodeProductionId", "createdAt");
CREATE INDEX "StudioEpisodeEditProposalSet_createdByEmail_createdAt_idx"
ON "StudioEpisodeEditProposalSet"("createdByEmail", "createdAt");
CREATE INDEX "StudioEpisodeEditProposalSet_timelineFingerprintSha256_idx"
ON "StudioEpisodeEditProposalSet"("timelineFingerprintSha256");

CREATE UNIQUE INDEX "StudioEpisodeEditReviewReceipt_episodeProductionId_actorEmail_clientRequestId_key"
ON "StudioEpisodeEditReviewReceipt"("episodeProductionId", "actorEmail", "clientRequestId");
CREATE INDEX "StudioEpisodeEditReviewReceipt_episodeProductionId_occurredAt_idx"
ON "StudioEpisodeEditReviewReceipt"("episodeProductionId", "occurredAt");
CREATE INDEX "StudioEpisodeEditReviewReceipt_proposalSetId_occurredAt_idx"
ON "StudioEpisodeEditReviewReceipt"("proposalSetId", "occurredAt");
CREATE INDEX "StudioEpisodeEditReviewReceipt_actorEmail_createdAt_idx"
ON "StudioEpisodeEditReviewReceipt"("actorEmail", "createdAt");
CREATE INDEX "StudioEpisodeEditReviewReceipt_subjectId_occurredAt_idx"
ON "StudioEpisodeEditReviewReceipt"("subjectId", "occurredAt");

ALTER TABLE "StudioEpisodeEditProposalSet"
ADD CONSTRAINT "StudioEpisodeEditProposalSet_episodeProductionId_fkey"
FOREIGN KEY ("episodeProductionId") REFERENCES "StudioEpisodeProduction"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "StudioEpisodeEditReviewReceipt"
ADD CONSTRAINT "StudioEpisodeEditReviewReceipt_episodeProductionId_fkey"
FOREIGN KEY ("episodeProductionId") REFERENCES "StudioEpisodeProduction"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "StudioEpisodeEditReviewReceipt"
ADD CONSTRAINT "StudioEpisodeEditReviewReceipt_proposalSetId_fkey"
FOREIGN KEY ("proposalSetId") REFERENCES "StudioEpisodeEditProposalSet"("id") ON DELETE SET NULL ON UPDATE CASCADE;
