-- A private browser sound-check sample remains tab-only. This ledger stores
-- only the participant's bounded device/evidence decision so collaborators can
-- see which exact endpoint was tested and whether that result is still current.
CREATE TABLE "CallParticipantPreflightReceipt" (
    "id" TEXT NOT NULL,
    "requestId" UUID NOT NULL,
    "requestSha256" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "participantId" TEXT NOT NULL,
    "actorUserId" TEXT NOT NULL,
    "clientInstanceId" TEXT NOT NULL,
    "clientKind" TEXT NOT NULL,
    "deviceLabel" TEXT,
    "microphoneLabel" TEXT NOT NULL,
    "cameraLabel" TEXT,
    "outputLabel" TEXT,
    "cameraWanted" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL,
    "audioSignalState" TEXT NOT NULL,
    "rmsDbfs" DOUBLE PRECISION,
    "samplePeakDbfs" DOUBLE PRECISION,
    "peakHoldDbfs" DOUBLE PRECISION,
    "clippedSampleCount" INTEGER NOT NULL DEFAULT 0,
    "sampleRateHz" INTEGER,
    "channelCount" INTEGER,
    "echoCancellation" BOOLEAN,
    "noiseSuppression" BOOLEAN,
    "autoGainControl" BOOLEAN,
    "cameraWidth" INTEGER,
    "cameraHeight" INTEGER,
    "cameraFrameRate" DOUBLE PRECISION,
    "privateSampleDurationSeconds" DOUBLE PRECISION,
    "privateSamplePlaybackComplete" BOOLEAN NOT NULL DEFAULT false,
    "playbackDecision" TEXT NOT NULL,
    "issueCodes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "evidenceJson" JSONB NOT NULL DEFAULT '{}',
    "testedAt" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CallParticipantPreflightReceipt_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CallParticipantPreflightReceipt_requestId_key"
ON "CallParticipantPreflightReceipt"("requestId");

CREATE INDEX "CallParticipantPreflightReceipt_roomId_testedAt_idx"
ON "CallParticipantPreflightReceipt"("roomId", "testedAt");

CREATE INDEX "CallPreflight_participant_client_tested_idx"
ON "CallParticipantPreflightReceipt"("participantId", "clientInstanceId", "testedAt");

CREATE INDEX "CallParticipantPreflightReceipt_roomId_status_expiresAt_idx"
ON "CallParticipantPreflightReceipt"("roomId", "status", "expiresAt");

CREATE INDEX "CallParticipantPreflightReceipt_actorUserId_testedAt_idx"
ON "CallParticipantPreflightReceipt"("actorUserId", "testedAt");

ALTER TABLE "CallParticipantPreflightReceipt"
ADD CONSTRAINT "CallParticipantPreflightReceipt_roomId_fkey"
FOREIGN KEY ("roomId") REFERENCES "CallRoom"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CallParticipantPreflightReceipt"
ADD CONSTRAINT "CallParticipantPreflightReceipt_participantId_fkey"
FOREIGN KEY ("participantId") REFERENCES "CallParticipant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
