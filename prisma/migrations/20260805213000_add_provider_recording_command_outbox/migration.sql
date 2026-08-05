-- Durable, idempotent control plane for optional provider recording.
CREATE TYPE "ProviderRecordingCommandAction" AS ENUM ('START', 'STOP');
CREATE TYPE "ProviderRecordingCommandStatus" AS ENUM (
  'QUEUED',
  'PROCESSING',
  'APPLIED',
  'RECONCILE_REQUIRED',
  'HELD',
  'FAILED'
);

CREATE TABLE "ProviderRecordingCommand" (
  "id" TEXT NOT NULL,
  "requestId" UUID NOT NULL,
  "roomId" TEXT NOT NULL,
  "actorUserId" TEXT NOT NULL,
  "action" "ProviderRecordingCommandAction" NOT NULL,
  "status" "ProviderRecordingCommandStatus" NOT NULL DEFAULT 'QUEUED',
  "provider" TEXT NOT NULL DEFAULT 'livekit',
  "providerRoomId" TEXT NOT NULL,
  "captureGroupId" UUID NOT NULL,
  "recordingAssetId" TEXT,
  "providerEgressId" TEXT,
  "expectedStorageBucket" TEXT,
  "expectedStorageObjectPath" TEXT,
  "consentVersion" TEXT,
  "consentSnapshotJson" JSONB NOT NULL DEFAULT '{}',
  "requestJson" JSONB NOT NULL DEFAULT '{}',
  "providerResponseJson" JSONB NOT NULL DEFAULT '{}',
  "attemptCount" INTEGER NOT NULL DEFAULT 0,
  "leaseToken" UUID,
  "leaseExpiresAt" TIMESTAMP(3),
  "lastAttemptAt" TIMESTAMP(3),
  "dispatchedAt" TIMESTAMP(3),
  "appliedAt" TIMESTAMP(3),
  "reconciledAt" TIMESTAMP(3),
  "heldAt" TIMESTAMP(3),
  "failedAt" TIMESTAMP(3),
  "errorCode" TEXT,
  "errorMessage" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "ProviderRecordingCommand_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ProviderRecordingEventReceipt" (
  "id" TEXT NOT NULL,
  "providerEventId" TEXT NOT NULL,
  "provider" TEXT NOT NULL DEFAULT 'livekit',
  "eventType" TEXT NOT NULL,
  "roomId" TEXT NOT NULL,
  "commandId" TEXT,
  "recordingAssetId" TEXT,
  "providerEgressId" TEXT,
  "providerCreatedAt" TIMESTAMP(3),
  "payloadJson" JSONB NOT NULL,
  "applied" BOOLEAN NOT NULL DEFAULT false,
  "applyMessage" TEXT,
  "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "appliedAt" TIMESTAMP(3),

  CONSTRAINT "ProviderRecordingEventReceipt_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ProviderRecordingCommand_requestId_key"
  ON "ProviderRecordingCommand"("requestId");
CREATE INDEX "ProviderRecordingCommand_roomId_createdAt_idx"
  ON "ProviderRecordingCommand"("roomId", "createdAt");
CREATE INDEX "ProviderRecordingCommand_roomId_status_createdAt_idx"
  ON "ProviderRecordingCommand"("roomId", "status", "createdAt");
CREATE INDEX "ProviderRecordingCommand_status_leaseExpiresAt_idx"
  ON "ProviderRecordingCommand"("status", "leaseExpiresAt");
CREATE INDEX "ProviderRecordingCommand_recordingAssetId_createdAt_idx"
  ON "ProviderRecordingCommand"("recordingAssetId", "createdAt");
CREATE INDEX "ProviderRecordingCommand_providerEgressId_createdAt_idx"
  ON "ProviderRecordingCommand"("providerEgressId", "createdAt");
CREATE INDEX "ProviderRecordingCommand_expectedStorageBucket_expectedStorageObjectPath_idx"
  ON "ProviderRecordingCommand"("expectedStorageBucket", "expectedStorageObjectPath");

CREATE UNIQUE INDEX "ProviderRecordingEventReceipt_providerEventId_key"
  ON "ProviderRecordingEventReceipt"("providerEventId");
CREATE INDEX "ProviderRecordingEventReceipt_roomId_receivedAt_idx"
  ON "ProviderRecordingEventReceipt"("roomId", "receivedAt");
CREATE INDEX "ProviderRecordingEventReceipt_providerEgressId_receivedAt_idx"
  ON "ProviderRecordingEventReceipt"("providerEgressId", "receivedAt");
CREATE INDEX "ProviderRecordingEventReceipt_commandId_receivedAt_idx"
  ON "ProviderRecordingEventReceipt"("commandId", "receivedAt");
CREATE INDEX "ProviderRecordingEventReceipt_recordingAssetId_receivedAt_idx"
  ON "ProviderRecordingEventReceipt"("recordingAssetId", "receivedAt");

ALTER TABLE "ProviderRecordingCommand"
  ADD CONSTRAINT "ProviderRecordingCommand_roomId_fkey"
  FOREIGN KEY ("roomId") REFERENCES "CallRoom"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProviderRecordingCommand"
  ADD CONSTRAINT "ProviderRecordingCommand_recordingAssetId_fkey"
  FOREIGN KEY ("recordingAssetId") REFERENCES "RecordingAsset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ProviderRecordingEventReceipt"
  ADD CONSTRAINT "ProviderRecordingEventReceipt_roomId_fkey"
  FOREIGN KEY ("roomId") REFERENCES "CallRoom"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProviderRecordingEventReceipt"
  ADD CONSTRAINT "ProviderRecordingEventReceipt_commandId_fkey"
  FOREIGN KEY ("commandId") REFERENCES "ProviderRecordingCommand"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ProviderRecordingEventReceipt"
  ADD CONSTRAINT "ProviderRecordingEventReceipt_recordingAssetId_fkey"
  FOREIGN KEY ("recordingAssetId") REFERENCES "RecordingAsset"("id") ON DELETE SET NULL ON UPDATE CASCADE;
