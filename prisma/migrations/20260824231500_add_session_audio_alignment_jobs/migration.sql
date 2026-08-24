-- First-class Session waveform alignment evidence. These jobs intentionally
-- remain separate from StudioAssetProcessingJob so coaching calls never need
-- fabricated Episode or StudioMediaAsset identities.
CREATE TABLE "SessionAudioAlignmentJob" (
    "id" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "spineRecordingAssetId" TEXT NOT NULL,
    "targetRecordingAssetId" TEXT NOT NULL,
    "requestedByUserId" TEXT NOT NULL,
    "requestedByEmail" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "inputJson" JSONB NOT NULL,
    "resultJson" JSONB,
    "error" TEXT,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SessionAudioAlignmentJob_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "SessionAudioAlignmentJob_roomId_status_createdAt_idx"
    ON "SessionAudioAlignmentJob"("roomId", "status", "createdAt");
CREATE INDEX "SessionAudioAlignmentJob_targetRecordingAssetId_createdAt_idx"
    ON "SessionAudioAlignmentJob"("targetRecordingAssetId", "createdAt");
CREATE INDEX "SessionAudioAlignmentJob_spineRecordingAssetId_targetRecordingAssetId_createdAt_idx"
    ON "SessionAudioAlignmentJob"("spineRecordingAssetId", "targetRecordingAssetId", "createdAt");
CREATE INDEX "SessionAudioAlignmentJob_status_createdAt_idx"
    ON "SessionAudioAlignmentJob"("status", "createdAt");

ALTER TABLE "SessionAudioAlignmentJob"
    ADD CONSTRAINT "SessionAudioAlignmentJob_roomId_fkey"
    FOREIGN KEY ("roomId") REFERENCES "CallRoom"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SessionAudioAlignmentJob"
    ADD CONSTRAINT "SessionAudioAlignmentJob_spineRecordingAssetId_fkey"
    FOREIGN KEY ("spineRecordingAssetId") REFERENCES "RecordingAsset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SessionAudioAlignmentJob"
    ADD CONSTRAINT "SessionAudioAlignmentJob_targetRecordingAssetId_fkey"
    FOREIGN KEY ("targetRecordingAssetId") REFERENCES "RecordingAsset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SessionAudioAlignmentJob"
    ADD CONSTRAINT "SessionAudioAlignmentJob_requestedByUserId_fkey"
    FOREIGN KEY ("requestedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
