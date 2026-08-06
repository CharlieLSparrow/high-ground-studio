CREATE TYPE "CallExpectedSourceKind" AS ENUM ('AUDIO', 'VIDEO', 'SCREEN', 'PROVIDER', 'OTHER');
CREATE TYPE "CallExpectedSourceRole" AS ENUM ('REQUIRED_MASTER', 'OPTIONAL_MASTER', 'SYNC_WITNESS', 'BACKUP');
CREATE TYPE "CallExpectedSourceStatus" AS ENUM ('ACTIVE', 'WAIVED', 'CANCELED');
CREATE TYPE "CallExpectedSourceAction" AS ENUM ('CREATE', 'BIND', 'UNBIND', 'WAIVE', 'RESTORE', 'CANCEL');

CREATE TABLE "CallExpectedSource" (
    "id" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "participantId" TEXT,
    "createdByUserId" TEXT,
    "label" TEXT NOT NULL,
    "sourceKind" "CallExpectedSourceKind" NOT NULL,
    "retentionRole" "CallExpectedSourceRole" NOT NULL DEFAULT 'REQUIRED_MASTER',
    "status" "CallExpectedSourceStatus" NOT NULL DEFAULT 'ACTIVE',
    "expectedClientKind" TEXT,
    "expectedDeviceLabel" TEXT,
    "recordingAssetId" TEXT,
    "captureId" UUID,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "latestReason" TEXT,
    "metadataJson" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CallExpectedSource_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CallExpectedSourceRevision" (
    "id" TEXT NOT NULL,
    "requestId" UUID NOT NULL,
    "requestSha256" TEXT NOT NULL,
    "expectationId" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "actorUserId" TEXT NOT NULL,
    "action" "CallExpectedSourceAction" NOT NULL,
    "revision" INTEGER NOT NULL,
    "beforeJson" JSONB NOT NULL DEFAULT '{}',
    "afterJson" JSONB NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CallExpectedSourceRevision_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CallExpectedSource_recordingAssetId_key" ON "CallExpectedSource"("recordingAssetId");
CREATE INDEX "CallExpectedSource_room_status_role_idx" ON "CallExpectedSource"("roomId", "status", "retentionRole");
CREATE INDEX "CallExpectedSource_participant_status_idx" ON "CallExpectedSource"("participantId", "status");
CREATE INDEX "CallExpectedSource_room_kind_client_idx" ON "CallExpectedSource"("roomId", "sourceKind", "expectedClientKind");
CREATE INDEX "CallExpectedSource_captureId_idx" ON "CallExpectedSource"("captureId");

CREATE UNIQUE INDEX "CallExpectedSourceRevision_requestId_key" ON "CallExpectedSourceRevision"("requestId");
CREATE UNIQUE INDEX "CallExpectedSourceRevision_expectation_revision_key" ON "CallExpectedSourceRevision"("expectationId", "revision");
CREATE INDEX "CallExpectedSourceRevision_room_created_idx" ON "CallExpectedSourceRevision"("roomId", "createdAt");
CREATE INDEX "CallExpectedSourceRevision_actor_created_idx" ON "CallExpectedSourceRevision"("actorUserId", "createdAt");
CREATE INDEX "CallExpectedSourceRevision_expectation_created_idx" ON "CallExpectedSourceRevision"("expectationId", "createdAt");

ALTER TABLE "CallExpectedSource"
ADD CONSTRAINT "CallExpectedSource_roomId_fkey"
FOREIGN KEY ("roomId") REFERENCES "CallRoom"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CallExpectedSource"
ADD CONSTRAINT "CallExpectedSource_participantId_fkey"
FOREIGN KEY ("participantId") REFERENCES "CallParticipant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "CallExpectedSource"
ADD CONSTRAINT "CallExpectedSource_createdByUserId_fkey"
FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "CallExpectedSource"
ADD CONSTRAINT "CallExpectedSource_recordingAssetId_fkey"
FOREIGN KEY ("recordingAssetId") REFERENCES "RecordingAsset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "CallExpectedSourceRevision"
ADD CONSTRAINT "CallExpectedSourceRevision_expectationId_fkey"
FOREIGN KEY ("expectationId") REFERENCES "CallExpectedSource"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CallExpectedSourceRevision"
ADD CONSTRAINT "CallExpectedSourceRevision_roomId_fkey"
FOREIGN KEY ("roomId") REFERENCES "CallRoom"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CallExpectedSourceRevision"
ADD CONSTRAINT "CallExpectedSourceRevision_actorUserId_fkey"
FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
