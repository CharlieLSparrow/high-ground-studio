-- A detector analysis belongs to the exact immutable media source, not to an
-- Episode JSON projection or a coaching-only manifest.
CREATE TABLE "StudioAudibleEventAnalysisReceipt" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "supersedesAnalysisId" TEXT,
    "algorithm" TEXT NOT NULL,
    "classifierIdentifier" TEXT NOT NULL,
    "detectorConfigurationSha256" TEXT NOT NULL,
    "sourceSha256" TEXT NOT NULL,
    "sourceGeneration" TEXT NOT NULL,
    "sourceByteCount" BIGINT NOT NULL,
    "sourceDurationSeconds" DOUBLE PRECISION NOT NULL,
    "requestSha256" TEXT NOT NULL,
    "analysisJson" JSONB NOT NULL,
    "analyzedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StudioAudibleEventAnalysisReceipt_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "StudioAudibleEventAnalysis_project_asset_idx"
ON "StudioAudibleEventAnalysisReceipt"("projectId", "assetId", "analyzedAt");

CREATE INDEX "StudioAudibleEventAnalysis_source_idx"
ON "StudioAudibleEventAnalysisReceipt"("sourceId", "analyzedAt");

CREATE INDEX "StudioAudibleEventAnalysis_config_idx"
ON "StudioAudibleEventAnalysisReceipt"("detectorConfigurationSha256", "analyzedAt");

ALTER TABLE "StudioAudibleEventAnalysisReceipt"
ADD CONSTRAINT "StudioAudibleEventAnalysisReceipt_projectId_fkey"
FOREIGN KEY ("projectId") REFERENCES "StudioProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "StudioAudibleEventAnalysisReceipt"
ADD CONSTRAINT "StudioAudibleEventAnalysisReceipt_assetId_fkey"
FOREIGN KEY ("assetId") REFERENCES "StudioMediaAsset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "StudioAudibleEventAnalysisReceipt"
ADD CONSTRAINT "StudioAudibleEventAnalysisReceipt_sourceId_fkey"
FOREIGN KEY ("sourceId") REFERENCES "StudioVideoSource"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
