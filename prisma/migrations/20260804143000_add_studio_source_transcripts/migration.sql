-- A transcript is provider evidence for exactly one immutable source. Capture
-- recordings keep their existing RecordingAsset identity; imported episode
-- media receives a StudioMediaAsset identity without manufacturing a CallRoom.
ALTER TABLE "TranscriptJob"
  ADD COLUMN "studioMediaAssetId" TEXT,
  ADD COLUMN "studioProjectId" TEXT,
  ADD COLUMN "episodeProductionId" TEXT;

ALTER TABLE "TranscriptJob"
  ADD CONSTRAINT "TranscriptJob_exactly_one_source_check"
  CHECK (
    (("assetId" IS NOT NULL)::integer + ("studioMediaAssetId" IS NOT NULL)::integer) = 1
  ),
  ADD CONSTRAINT "TranscriptJob_studioMediaAssetId_fkey"
  FOREIGN KEY ("studioMediaAssetId") REFERENCES "StudioMediaAsset"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "TranscriptJob_studioProjectId_fkey"
  FOREIGN KEY ("studioProjectId") REFERENCES "StudioProject"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "TranscriptJob_episodeProductionId_fkey"
  FOREIGN KEY ("episodeProductionId") REFERENCES "StudioEpisodeProduction"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "TranscriptJob_studio_context_check"
  CHECK (
    ("studioMediaAssetId" IS NULL AND "studioProjectId" IS NULL AND "episodeProductionId" IS NULL)
    OR
    ("studioMediaAssetId" IS NOT NULL AND "studioProjectId" IS NOT NULL AND "episodeProductionId" IS NOT NULL AND "roomId" IS NULL)
  );

CREATE INDEX "TranscriptJob_studioMediaAssetId_status_createdAt_idx"
  ON "TranscriptJob"("studioMediaAssetId", "status", "createdAt");
CREATE INDEX "TranscriptJob_studioProjectId_status_createdAt_idx"
  ON "TranscriptJob"("studioProjectId", "status", "createdAt");
CREATE INDEX "TranscriptJob_episodeProductionId_status_createdAt_idx"
  ON "TranscriptJob"("episodeProductionId", "status", "createdAt");
