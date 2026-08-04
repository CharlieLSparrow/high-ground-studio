ALTER TABLE "StudioEpisodeEditProposalSet"
RENAME COLUMN "recordingAssetId" TO "mediaAssetId";

ALTER TABLE "StudioEpisodeEditProposalSet"
ADD COLUMN "mediaAssetKind" TEXT;

UPDATE "StudioEpisodeEditProposalSet"
SET "mediaAssetKind" = 'capture-recording'
WHERE "mediaAssetId" IS NOT NULL
  AND "mediaAssetKind" IS NULL;
