CREATE TABLE "SessionAudioAuditionJob" (
    "id" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "recordingAssetId" TEXT NOT NULL,
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

    CONSTRAINT "SessionAudioAuditionJob_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "SessionAudioAuditionJob_roomId_status_createdAt_idx"
    ON "SessionAudioAuditionJob"("roomId", "status", "createdAt");
CREATE INDEX "SessionAudioAuditionJob_recordingAssetId_createdAt_idx"
    ON "SessionAudioAuditionJob"("recordingAssetId", "createdAt");
CREATE INDEX "SessionAudioAuditionJob_status_createdAt_idx"
    ON "SessionAudioAuditionJob"("status", "createdAt");

ALTER TABLE "SessionAudioAuditionJob"
    ADD CONSTRAINT "SessionAudioAuditionJob_roomId_fkey"
    FOREIGN KEY ("roomId") REFERENCES "CallRoom"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SessionAudioAuditionJob"
    ADD CONSTRAINT "SessionAudioAuditionJob_recordingAssetId_fkey"
    FOREIGN KEY ("recordingAssetId") REFERENCES "RecordingAsset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SessionAudioAuditionJob"
    ADD CONSTRAINT "SessionAudioAuditionJob_requestedByUserId_fkey"
    FOREIGN KEY ("requestedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
