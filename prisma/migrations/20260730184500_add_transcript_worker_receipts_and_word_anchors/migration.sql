-- Durable transcript processing binds each canonical job to immutable GCS
-- control receipts and provider evidence. Nullable columns preserve all
-- historical jobs and make rollback/export possible without rewriting them.
ALTER TABLE "TranscriptJob"
  ADD COLUMN "processingManifestObject" TEXT,
  ADD COLUMN "processingResultObject" TEXT,
  ADD COLUMN "sourceGeneration" TEXT,
  ADD COLUMN "sourceSha256" TEXT,
  ADD COLUMN "providerRequestId" TEXT,
  ADD COLUMN "providerResponseObject" TEXT,
  ADD COLUMN "workerBuildId" TEXT;

-- Stable provider word indexes and media times are immutable evidence beneath
-- segment-level human correction overlays.
CREATE TABLE "TranscriptWord" (
  "id" TEXT NOT NULL,
  "transcriptJobId" TEXT NOT NULL,
  "segmentId" TEXT NOT NULL,
  "providerWordIndex" INTEGER NOT NULL,
  "startSeconds" DOUBLE PRECISION NOT NULL,
  "endSeconds" DOUBLE PRECISION NOT NULL,
  "word" TEXT NOT NULL,
  "punctuatedWord" TEXT NOT NULL,
  "confidence" DOUBLE PRECISION,
  "speakerLabel" TEXT,
  "channel" INTEGER,
  "metadataJson" JSONB NOT NULL DEFAULT '{}',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "TranscriptWord_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TranscriptWord_transcriptJobId_providerWordIndex_key"
  ON "TranscriptWord"("transcriptJobId", "providerWordIndex");
CREATE INDEX "TranscriptWord_transcriptJobId_startSeconds_idx"
  ON "TranscriptWord"("transcriptJobId", "startSeconds");
CREATE INDEX "TranscriptWord_segmentId_providerWordIndex_idx"
  ON "TranscriptWord"("segmentId", "providerWordIndex");

ALTER TABLE "TranscriptWord"
  ADD CONSTRAINT "TranscriptWord_transcriptJobId_fkey"
  FOREIGN KEY ("transcriptJobId")
  REFERENCES "TranscriptJob"("id")
  ON DELETE CASCADE
  ON UPDATE CASCADE;

ALTER TABLE "TranscriptWord"
  ADD CONSTRAINT "TranscriptWord_segmentId_fkey"
  FOREIGN KEY ("segmentId")
  REFERENCES "TranscriptSegment"("id")
  ON DELETE CASCADE
  ON UPDATE CASCADE;
