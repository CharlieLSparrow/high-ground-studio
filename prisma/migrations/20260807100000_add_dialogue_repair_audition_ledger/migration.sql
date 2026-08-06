CREATE TYPE "StudioDialogueRepairAuditionDecision" AS ENUM (
  'REPAIR_PREFERRED',
  'SOURCE_PREFERRED',
  'INDISTINGUISHABLE',
  'NEEDS_WORK'
);

CREATE TABLE "StudioDialogueRepairAuditionReceipt" (
  "id" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "assetId" TEXT NOT NULL,
  "candidateId" TEXT NOT NULL,
  "repairJobId" TEXT NOT NULL,
  "actorUserId" TEXT,
  "actorEmail" TEXT NOT NULL,
  "clientRequestId" TEXT NOT NULL,
  "decision" "StudioDialogueRepairAuditionDecision" NOT NULL,
  "sourceSha256" TEXT NOT NULL,
  "sourceGeneration" TEXT NOT NULL,
  "previewSha256" TEXT NOT NULL,
  "previewGeneration" TEXT NOT NULL,
  "requestSha256" TEXT NOT NULL,
  "evidenceJson" JSONB NOT NULL,
  "note" TEXT,
  "occurredAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "StudioDialogueRepairAuditionReceipt_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "StudioDialogueRepairAudition_project_actor_request_key"
  ON "StudioDialogueRepairAuditionReceipt"("projectId", "actorEmail", "clientRequestId");
CREATE INDEX "StudioDialogueRepairAudition_candidate_occurred_idx"
  ON "StudioDialogueRepairAuditionReceipt"("candidateId", "occurredAt");
CREATE INDEX "StudioDialogueRepairAudition_job_occurred_idx"
  ON "StudioDialogueRepairAuditionReceipt"("repairJobId", "occurredAt");
CREATE INDEX "StudioDialogueRepairAudition_project_asset_occurred_idx"
  ON "StudioDialogueRepairAuditionReceipt"("projectId", "assetId", "occurredAt");

ALTER TABLE "StudioDialogueRepairAuditionReceipt"
  ADD CONSTRAINT "StudioDialogueRepairAuditionReceipt_projectId_fkey"
  FOREIGN KEY ("projectId") REFERENCES "StudioProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StudioDialogueRepairAuditionReceipt"
  ADD CONSTRAINT "StudioDialogueRepairAuditionReceipt_assetId_fkey"
  FOREIGN KEY ("assetId") REFERENCES "StudioMediaAsset"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StudioDialogueRepairAuditionReceipt"
  ADD CONSTRAINT "StudioDialogueRepairAuditionReceipt_candidateId_fkey"
  FOREIGN KEY ("candidateId") REFERENCES "StudioDialogueRepairCandidate"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StudioDialogueRepairAuditionReceipt"
  ADD CONSTRAINT "StudioDialogueRepairAuditionReceipt_repairJobId_fkey"
  FOREIGN KEY ("repairJobId") REFERENCES "StudioAssetProcessingJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;
