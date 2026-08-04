-- Transcript review evidence is shared by Capture sessions and imported Studio
-- media. Provider rows stay immutable; review rows retain their exact source
-- family without manufacturing a CallRoom for episode imports.
ALTER TABLE "TranscriptCorrection"
  DROP CONSTRAINT "TranscriptCorrection_roomId_fkey",
  ALTER COLUMN "roomId" DROP NOT NULL,
  ADD CONSTRAINT "TranscriptCorrection_roomId_fkey"
    FOREIGN KEY ("roomId") REFERENCES "CallRoom"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "TranscriptCorrection_transcriptJobId_fkey"
    FOREIGN KEY ("transcriptJobId") REFERENCES "TranscriptJob"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "TranscriptSegmentVerification"
  DROP CONSTRAINT "TranscriptSegmentVerification_roomId_fkey",
  DROP CONSTRAINT "TranscriptSegmentVerification_recordingAssetId_fkey",
  ALTER COLUMN "roomId" DROP NOT NULL,
  ALTER COLUMN "recordingAssetId" DROP NOT NULL,
  ADD COLUMN "studioMediaAssetId" TEXT,
  ADD CONSTRAINT "TranscriptSegmentVerification_roomId_fkey"
    FOREIGN KEY ("roomId") REFERENCES "CallRoom"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "TranscriptSegmentVerification_recordingAssetId_fkey"
    FOREIGN KEY ("recordingAssetId") REFERENCES "RecordingAsset"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "TranscriptSegmentVerification_studioMediaAssetId_fkey"
    FOREIGN KEY ("studioMediaAssetId") REFERENCES "StudioMediaAsset"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "TranscriptSegmentVerification_exact_source_check"
    CHECK (
      ("roomId" IS NOT NULL AND "recordingAssetId" IS NOT NULL AND "studioMediaAssetId" IS NULL)
      OR
      ("roomId" IS NULL AND "recordingAssetId" IS NULL AND "studioMediaAssetId" IS NOT NULL)
    );

CREATE INDEX "TranscriptSegVerify_studio_asset_created_idx"
  ON "TranscriptSegmentVerification"("studioMediaAssetId", "createdAt");
