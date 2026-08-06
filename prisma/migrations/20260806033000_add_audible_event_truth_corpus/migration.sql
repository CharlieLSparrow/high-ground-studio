CREATE TYPE "StudioAudibleEventTruthVerdict" AS ENUM ('POSITIVE', 'ABSENT');
CREATE TYPE "StudioAudibleEventTruthWorkload" AS ENUM ('PODCAST', 'COACHING');
CREATE TYPE "StudioAudibleEventTruthSplit" AS ENUM ('CALIBRATION', 'VALIDATION', 'RETAINED_CHALLENGE');

CREATE TABLE "StudioAudibleEventTruthReceipt" (
  "id" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "assetId" TEXT NOT NULL,
  "sourceId" TEXT NOT NULL,
  "actorUserId" TEXT,
  "actorEmail" TEXT NOT NULL,
  "clientRequestId" TEXT NOT NULL,
  "supersedesReceiptId" TEXT,
  "verdict" "StudioAudibleEventTruthVerdict" NOT NULL,
  "workload" "StudioAudibleEventTruthWorkload" NOT NULL,
  "split" "StudioAudibleEventTruthSplit" NOT NULL,
  "classificationIdentifier" TEXT NOT NULL,
  "displayLabel" TEXT NOT NULL,
  "family" TEXT NOT NULL,
  "detectorAnalysisId" TEXT NOT NULL,
  "detectorAlgorithm" TEXT NOT NULL,
  "classifierIdentifier" TEXT NOT NULL,
  "detectorConfigurationSha256" TEXT NOT NULL,
  "sourceSha256" TEXT NOT NULL,
  "sourceGeneration" TEXT NOT NULL,
  "sourceDurationSeconds" DOUBLE PRECISION NOT NULL,
  "reviewStartSeconds" DOUBLE PRECISION NOT NULL,
  "reviewEndSeconds" DOUBLE PRECISION NOT NULL,
  "eventStartSeconds" DOUBLE PRECISION,
  "eventEndSeconds" DOUBLE PRECISION,
  "requestSha256" TEXT NOT NULL,
  "analysisJson" JSONB NOT NULL,
  "evidenceJson" JSONB NOT NULL,
  "note" TEXT NOT NULL,
  "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "StudioAudibleEventTruthReceipt_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "StudioAudibleEventTruth_supersedes_key" ON "StudioAudibleEventTruthReceipt"("supersedesReceiptId");
CREATE UNIQUE INDEX "StudioAudibleEventTruth_project_actor_request_key" ON "StudioAudibleEventTruthReceipt"("projectId", "actorEmail", "clientRequestId");
CREATE INDEX "StudioAudibleEventTruth_project_class_idx" ON "StudioAudibleEventTruthReceipt"("projectId", "classificationIdentifier", "occurredAt");
CREATE INDEX "StudioAudibleEventTruth_source_class_idx" ON "StudioAudibleEventTruthReceipt"("sourceId", "classificationIdentifier", "occurredAt");
CREATE INDEX "StudioAudibleEventTruth_analysis_idx" ON "StudioAudibleEventTruthReceipt"("detectorAnalysisId", "occurredAt");

ALTER TABLE "StudioAudibleEventTruthReceipt" ADD CONSTRAINT "StudioAudibleEventTruthReceipt_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "StudioProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StudioAudibleEventTruthReceipt" ADD CONSTRAINT "StudioAudibleEventTruthReceipt_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "StudioMediaAsset"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StudioAudibleEventTruthReceipt" ADD CONSTRAINT "StudioAudibleEventTruthReceipt_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "StudioVideoSource"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
