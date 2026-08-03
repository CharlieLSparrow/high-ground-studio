CREATE TABLE "TranscriptSpeakerAttribution" (
    "id" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "transcriptJobId" TEXT NOT NULL,
    "recordingAssetId" TEXT NOT NULL,
    "providerSpeakerLabel" TEXT NOT NULL,
    "participantId" TEXT,
    "participantUserIdSnapshot" TEXT,
    "participantDisplaySnapshot" TEXT NOT NULL,
    "participantEmailSnapshot" TEXT,
    "reviewedByUserId" TEXT NOT NULL,
    "reviewerEmailSnapshot" TEXT,
    "clientRequestId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "providerSnapshotSha256" TEXT NOT NULL,
    "sampleSegmentIdsJson" JSONB NOT NULL,
    "sampleEvidenceJson" JSONB NOT NULL,
    "playbackSourceId" TEXT NOT NULL,
    "reviewNote" TEXT,
    "reviewedAt" TIMESTAMP(3) NOT NULL,
    "supersededAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TranscriptSpeakerAttribution_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TranscriptSpeakerAttr_reviewer_request_key"
ON "TranscriptSpeakerAttribution"("reviewedByUserId", "clientRequestId");

CREATE UNIQUE INDEX "TranscriptSpeakerAttr_one_active_job_label_key"
ON "TranscriptSpeakerAttribution"("transcriptJobId", "providerSpeakerLabel")
WHERE "status" = 'active';

CREATE INDEX "TranscriptSpeakerAttr_room_created_idx"
ON "TranscriptSpeakerAttribution"("roomId", "createdAt");

CREATE INDEX "TranscriptSpeakerAttr_job_label_status_idx"
ON "TranscriptSpeakerAttribution"("transcriptJobId", "providerSpeakerLabel", "status", "updatedAt");

CREATE INDEX "TranscriptSpeakerAttr_participant_created_idx"
ON "TranscriptSpeakerAttribution"("participantId", "createdAt");

CREATE INDEX "TranscriptSpeakerAttr_asset_created_idx"
ON "TranscriptSpeakerAttribution"("recordingAssetId", "createdAt");

ALTER TABLE "TranscriptSpeakerAttribution"
ADD CONSTRAINT "TranscriptSpeakerAttribution_roomId_fkey"
FOREIGN KEY ("roomId") REFERENCES "CallRoom"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TranscriptSpeakerAttribution"
ADD CONSTRAINT "TranscriptSpeakerAttribution_transcriptJobId_fkey"
FOREIGN KEY ("transcriptJobId") REFERENCES "TranscriptJob"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "TranscriptSpeakerAttribution"
ADD CONSTRAINT "TranscriptSpeakerAttribution_recordingAssetId_fkey"
FOREIGN KEY ("recordingAssetId") REFERENCES "RecordingAsset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "TranscriptSpeakerAttribution"
ADD CONSTRAINT "TranscriptSpeakerAttribution_participantId_fkey"
FOREIGN KEY ("participantId") REFERENCES "CallParticipant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "TranscriptSpeakerAttribution"
ADD CONSTRAINT "TranscriptSpeakerAttribution_reviewedByUserId_fkey"
FOREIGN KEY ("reviewedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
