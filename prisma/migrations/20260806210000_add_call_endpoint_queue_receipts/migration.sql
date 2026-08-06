CREATE TABLE "CallEndpointQueueReceipt" (
    "id" TEXT NOT NULL,
    "requestId" UUID NOT NULL,
    "requestSha256" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "captureGroupId" UUID NOT NULL,
    "participantId" TEXT NOT NULL,
    "actorUserId" TEXT NOT NULL,
    "clientInstanceId" TEXT NOT NULL,
    "clientKind" TEXT NOT NULL,
    "deviceLabel" TEXT,
    "queueRevision" BIGINT NOT NULL,
    "queueState" TEXT NOT NULL,
    "queueStateSha256" TEXT NOT NULL,
    "localSourceCount" INTEGER NOT NULL,
    "pendingSourceCount" INTEGER NOT NULL,
    "failedSourceCount" INTEGER NOT NULL,
    "observedCaptureIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "recordingAssetIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "latestLocalMutationAt" TIMESTAMP(3) NOT NULL,
    "reconciledAt" TIMESTAMP(3) NOT NULL,
    "serverSourceSetSha256" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CallEndpointQueueReceipt_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CallEndpointQueueReceipt_requestId_key"
ON "CallEndpointQueueReceipt"("requestId");

CREATE UNIQUE INDEX "CallEndpointQueue_room_client_revision_key"
ON "CallEndpointQueueReceipt"("roomId", "clientInstanceId", "queueRevision");

CREATE INDEX "CallEndpointQueueReceipt_roomId_createdAt_idx"
ON "CallEndpointQueueReceipt"("roomId", "createdAt");

CREATE INDEX "CallEndpointQueue_participant_client_revision_idx"
ON "CallEndpointQueueReceipt"("participantId", "clientInstanceId", "queueRevision");

CREATE INDEX "CallEndpointQueueReceipt_actorUserId_createdAt_idx"
ON "CallEndpointQueueReceipt"("actorUserId", "createdAt");

CREATE INDEX "CallEndpointQueueReceipt_roomId_queueState_createdAt_idx"
ON "CallEndpointQueueReceipt"("roomId", "queueState", "createdAt");

ALTER TABLE "CallEndpointQueueReceipt"
ADD CONSTRAINT "CallEndpointQueueReceipt_roomId_fkey"
FOREIGN KEY ("roomId") REFERENCES "CallRoom"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CallEndpointQueueReceipt"
ADD CONSTRAINT "CallEndpointQueueReceipt_participantId_fkey"
FOREIGN KEY ("participantId") REFERENCES "CallParticipant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
