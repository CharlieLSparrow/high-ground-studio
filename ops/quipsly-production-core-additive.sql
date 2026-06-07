-- Quipsly production core additive schema patch.
-- Purpose: create the first-class Nest/source/asset/production/publishing/job tables
-- added on 2026-06-07 without broad Prisma db-push drift risk.
--
-- Rules:
-- - additive only
-- - no drops
-- - no data rewrites
-- - safe to run more than once

DO $$
BEGIN
  CREATE TYPE "StudioProjectAccessRole" AS ENUM ('OWNER', 'EDITOR', 'VIEWER');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "StudioNestInvite" (
  "id" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "role" "StudioProjectAccessRole" NOT NULL DEFAULT 'VIEWER',
  "status" TEXT NOT NULL DEFAULT 'pending',
  "tokenHash" TEXT,
  "invitedByEmail" TEXT,
  "acceptedAt" TIMESTAMP(3),
  "revokedAt" TIMESTAMP(3),
  "note" TEXT,
  "metadataJson" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "StudioNestInvite_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "StudioNestInvite_projectId_email_key"
  ON "StudioNestInvite"("projectId", "email");

CREATE UNIQUE INDEX IF NOT EXISTS "StudioNestInvite_tokenHash_key"
  ON "StudioNestInvite"("tokenHash");

CREATE INDEX IF NOT EXISTS "StudioNestInvite_email_status_idx"
  ON "StudioNestInvite"("email", "status");

CREATE INDEX IF NOT EXISTS "StudioNestInvite_projectId_status_idx"
  ON "StudioNestInvite"("projectId", "status");

CREATE TABLE IF NOT EXISTS "StudioAssetAttachment" (
  "id" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "assetId" TEXT NOT NULL,
  "role" TEXT,
  "source" TEXT NOT NULL DEFAULT 'manual',
  "createdByEmail" TEXT,
  "metadataJson" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "StudioAssetAttachment_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "StudioAssetAttachment_projectId_assetId_key"
  ON "StudioAssetAttachment"("projectId", "assetId");

CREATE INDEX IF NOT EXISTS "StudioAssetAttachment_assetId_idx"
  ON "StudioAssetAttachment"("assetId");

CREATE INDEX IF NOT EXISTS "StudioAssetAttachment_projectId_role_idx"
  ON "StudioAssetAttachment"("projectId", "role");

CREATE TABLE IF NOT EXISTS "StudioAssetVariant" (
  "id" TEXT NOT NULL,
  "assetId" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "url" TEXT NOT NULL,
  "mimeType" TEXT,
  "width" INTEGER,
  "height" INTEGER,
  "duration" DOUBLE PRECISION,
  "sizeBytes" BIGINT,
  "metadataJson" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "StudioAssetVariant_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "StudioAssetVariant_assetId_kind_url_key"
  ON "StudioAssetVariant"("assetId", "kind", "url");

CREATE INDEX IF NOT EXISTS "StudioAssetVariant_assetId_kind_idx"
  ON "StudioAssetVariant"("assetId", "kind");

CREATE TABLE IF NOT EXISTS "StudioAssetProcessingJob" (
  "id" TEXT NOT NULL,
  "projectId" TEXT,
  "assetId" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'queued',
  "requestedByEmail" TEXT,
  "inputJson" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "resultJson" JSONB,
  "error" TEXT,
  "startedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "StudioAssetProcessingJob_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "StudioAssetProcessingJob_assetId_status_createdAt_idx"
  ON "StudioAssetProcessingJob"("assetId", "status", "createdAt");

CREATE INDEX IF NOT EXISTS "StudioAssetProcessingJob_projectId_status_idx"
  ON "StudioAssetProcessingJob"("projectId", "status");

CREATE INDEX IF NOT EXISTS "StudioAssetProcessingJob_type_status_idx"
  ON "StudioAssetProcessingJob"("type", "status");

CREATE TABLE IF NOT EXISTS "StudioSourceUnit" (
  "id" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "documentId" TEXT,
  "assetId" TEXT,
  "slug" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "sourceUrl" TEXT,
  "sourcePath" TEXT,
  "author" TEXT,
  "capturedAt" TIMESTAMP(3),
  "immutableText" TEXT,
  "editableNotes" TEXT,
  "metadataJson" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "createdByEmail" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "StudioSourceUnit_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "StudioSourceUnit_projectId_slug_key"
  ON "StudioSourceUnit"("projectId", "slug");

CREATE INDEX IF NOT EXISTS "StudioSourceUnit_projectId_kind_idx"
  ON "StudioSourceUnit"("projectId", "kind");

CREATE INDEX IF NOT EXISTS "StudioSourceUnit_documentId_idx"
  ON "StudioSourceUnit"("documentId");

CREATE INDEX IF NOT EXISTS "StudioSourceUnit_assetId_idx"
  ON "StudioSourceUnit"("assetId");

CREATE TABLE IF NOT EXISTS "StudioDocumentOperation" (
  "id" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "documentId" TEXT NOT NULL,
  "groupId" TEXT,
  "actorEmail" TEXT,
  "origin" TEXT NOT NULL DEFAULT 'human',
  "operationType" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'applied',
  "beforeJson" JSONB,
  "afterJson" JSONB,
  "payloadJson" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "reversible" BOOLEAN NOT NULL DEFAULT true,
  "revertedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "StudioDocumentOperation_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "StudioDocumentOperation_documentId_createdAt_idx"
  ON "StudioDocumentOperation"("documentId", "createdAt");

CREATE INDEX IF NOT EXISTS "StudioDocumentOperation_projectId_groupId_idx"
  ON "StudioDocumentOperation"("projectId", "groupId");

CREATE INDEX IF NOT EXISTS "StudioDocumentOperation_actorEmail_createdAt_idx"
  ON "StudioDocumentOperation"("actorEmail", "createdAt");

CREATE TABLE IF NOT EXISTS "StudioProductionRoom" (
  "id" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "documentId" TEXT,
  "slug" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "kind" TEXT NOT NULL DEFAULT 'episode',
  "status" TEXT NOT NULL DEFAULT 'draft',
  "spineAssetId" TEXT,
  "metadataJson" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "createdByEmail" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "StudioProductionRoom_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "StudioProductionRoom_projectId_slug_key"
  ON "StudioProductionRoom"("projectId", "slug");

CREATE INDEX IF NOT EXISTS "StudioProductionRoom_documentId_idx"
  ON "StudioProductionRoom"("documentId");

CREATE INDEX IF NOT EXISTS "StudioProductionRoom_projectId_kind_status_idx"
  ON "StudioProductionRoom"("projectId", "kind", "status");

CREATE TABLE IF NOT EXISTS "StudioTimelineVersion" (
  "id" TEXT NOT NULL,
  "productionRoomId" TEXT NOT NULL,
  "version" INTEGER NOT NULL,
  "label" TEXT,
  "status" TEXT NOT NULL DEFAULT 'draft',
  "timelineJson" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "createdByEmail" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "StudioTimelineVersion_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "StudioTimelineVersion_productionRoomId_version_key"
  ON "StudioTimelineVersion"("productionRoomId", "version");

CREATE INDEX IF NOT EXISTS "StudioTimelineVersion_productionRoomId_createdAt_idx"
  ON "StudioTimelineVersion"("productionRoomId", "createdAt");

CREATE TABLE IF NOT EXISTS "StudioOutputPacket" (
  "id" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "documentId" TEXT,
  "productionRoomId" TEXT,
  "slug" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'draft',
  "packetJson" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "lineageJson" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "createdByEmail" TEXT,
  "approvedByEmail" TEXT,
  "approvedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "StudioOutputPacket_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "StudioOutputPacket_projectId_slug_key"
  ON "StudioOutputPacket"("projectId", "slug");

CREATE INDEX IF NOT EXISTS "StudioOutputPacket_projectId_kind_status_idx"
  ON "StudioOutputPacket"("projectId", "kind", "status");

CREATE INDEX IF NOT EXISTS "StudioOutputPacket_documentId_idx"
  ON "StudioOutputPacket"("documentId");

CREATE INDEX IF NOT EXISTS "StudioOutputPacket_productionRoomId_idx"
  ON "StudioOutputPacket"("productionRoomId");

CREATE TABLE IF NOT EXISTS "StudioPublishAttempt" (
  "id" TEXT NOT NULL,
  "outputPacketId" TEXT NOT NULL,
  "destination" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'queued',
  "requestJson" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "resultJson" JSONB,
  "error" TEXT,
  "requestedByEmail" TEXT,
  "startedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "StudioPublishAttempt_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "StudioPublishAttempt_outputPacketId_destination_status_idx"
  ON "StudioPublishAttempt"("outputPacketId", "destination", "status");

CREATE INDEX IF NOT EXISTS "StudioPublishAttempt_destination_status_createdAt_idx"
  ON "StudioPublishAttempt"("destination", "status", "createdAt");

CREATE TABLE IF NOT EXISTS "StudioPublishedArtifact" (
  "id" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "outputPacketId" TEXT,
  "destination" TEXT NOT NULL,
  "externalId" TEXT,
  "publicUrl" TEXT,
  "status" TEXT NOT NULL DEFAULT 'published',
  "metadataJson" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "publishedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "StudioPublishedArtifact_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "StudioPublishedArtifact_projectId_destination_status_idx"
  ON "StudioPublishedArtifact"("projectId", "destination", "status");

CREATE INDEX IF NOT EXISTS "StudioPublishedArtifact_outputPacketId_idx"
  ON "StudioPublishedArtifact"("outputPacketId");

CREATE INDEX IF NOT EXISTS "StudioPublishedArtifact_destination_externalId_idx"
  ON "StudioPublishedArtifact"("destination", "externalId");

CREATE TABLE IF NOT EXISTS "StudioWorkflowJob" (
  "id" TEXT NOT NULL,
  "projectId" TEXT,
  "assetId" TEXT,
  "productionRoomId" TEXT,
  "outputPacketId" TEXT,
  "type" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'queued',
  "source" TEXT NOT NULL DEFAULT 'app',
  "priority" INTEGER NOT NULL DEFAULT 100,
  "inputJson" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "resultJson" JSONB,
  "error" TEXT,
  "requestedByEmail" TEXT,
  "startedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "StudioWorkflowJob_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "StudioWorkflowJob_projectId_status_createdAt_idx"
  ON "StudioWorkflowJob"("projectId", "status", "createdAt");

CREATE INDEX IF NOT EXISTS "StudioWorkflowJob_assetId_status_idx"
  ON "StudioWorkflowJob"("assetId", "status");

CREATE INDEX IF NOT EXISTS "StudioWorkflowJob_productionRoomId_status_idx"
  ON "StudioWorkflowJob"("productionRoomId", "status");

CREATE INDEX IF NOT EXISTS "StudioWorkflowJob_outputPacketId_status_idx"
  ON "StudioWorkflowJob"("outputPacketId", "status");

CREATE INDEX IF NOT EXISTS "StudioWorkflowJob_type_status_idx"
  ON "StudioWorkflowJob"("type", "status");

DO $$
BEGIN
  ALTER TABLE "StudioNestInvite"
    ADD CONSTRAINT "StudioNestInvite_projectId_fkey"
    FOREIGN KEY ("projectId") REFERENCES "StudioProject"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "StudioAssetAttachment"
    ADD CONSTRAINT "StudioAssetAttachment_projectId_fkey"
    FOREIGN KEY ("projectId") REFERENCES "StudioProject"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "StudioAssetAttachment"
    ADD CONSTRAINT "StudioAssetAttachment_assetId_fkey"
    FOREIGN KEY ("assetId") REFERENCES "StudioMediaAsset"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "StudioAssetVariant"
    ADD CONSTRAINT "StudioAssetVariant_assetId_fkey"
    FOREIGN KEY ("assetId") REFERENCES "StudioMediaAsset"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "StudioAssetProcessingJob"
    ADD CONSTRAINT "StudioAssetProcessingJob_projectId_fkey"
    FOREIGN KEY ("projectId") REFERENCES "StudioProject"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "StudioAssetProcessingJob"
    ADD CONSTRAINT "StudioAssetProcessingJob_assetId_fkey"
    FOREIGN KEY ("assetId") REFERENCES "StudioMediaAsset"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "StudioSourceUnit"
    ADD CONSTRAINT "StudioSourceUnit_projectId_fkey"
    FOREIGN KEY ("projectId") REFERENCES "StudioProject"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "StudioSourceUnit"
    ADD CONSTRAINT "StudioSourceUnit_documentId_fkey"
    FOREIGN KEY ("documentId") REFERENCES "StudioDocument"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "StudioSourceUnit"
    ADD CONSTRAINT "StudioSourceUnit_assetId_fkey"
    FOREIGN KEY ("assetId") REFERENCES "StudioMediaAsset"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "StudioDocumentOperation"
    ADD CONSTRAINT "StudioDocumentOperation_projectId_fkey"
    FOREIGN KEY ("projectId") REFERENCES "StudioProject"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "StudioDocumentOperation"
    ADD CONSTRAINT "StudioDocumentOperation_documentId_fkey"
    FOREIGN KEY ("documentId") REFERENCES "StudioDocument"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "StudioProductionRoom"
    ADD CONSTRAINT "StudioProductionRoom_projectId_fkey"
    FOREIGN KEY ("projectId") REFERENCES "StudioProject"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "StudioProductionRoom"
    ADD CONSTRAINT "StudioProductionRoom_documentId_fkey"
    FOREIGN KEY ("documentId") REFERENCES "StudioDocument"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "StudioTimelineVersion"
    ADD CONSTRAINT "StudioTimelineVersion_productionRoomId_fkey"
    FOREIGN KEY ("productionRoomId") REFERENCES "StudioProductionRoom"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "StudioOutputPacket"
    ADD CONSTRAINT "StudioOutputPacket_projectId_fkey"
    FOREIGN KEY ("projectId") REFERENCES "StudioProject"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "StudioOutputPacket"
    ADD CONSTRAINT "StudioOutputPacket_documentId_fkey"
    FOREIGN KEY ("documentId") REFERENCES "StudioDocument"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "StudioOutputPacket"
    ADD CONSTRAINT "StudioOutputPacket_productionRoomId_fkey"
    FOREIGN KEY ("productionRoomId") REFERENCES "StudioProductionRoom"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "StudioPublishAttempt"
    ADD CONSTRAINT "StudioPublishAttempt_outputPacketId_fkey"
    FOREIGN KEY ("outputPacketId") REFERENCES "StudioOutputPacket"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "StudioPublishedArtifact"
    ADD CONSTRAINT "StudioPublishedArtifact_projectId_fkey"
    FOREIGN KEY ("projectId") REFERENCES "StudioProject"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "StudioPublishedArtifact"
    ADD CONSTRAINT "StudioPublishedArtifact_outputPacketId_fkey"
    FOREIGN KEY ("outputPacketId") REFERENCES "StudioOutputPacket"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "StudioWorkflowJob"
    ADD CONSTRAINT "StudioWorkflowJob_projectId_fkey"
    FOREIGN KEY ("projectId") REFERENCES "StudioProject"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "StudioWorkflowJob"
    ADD CONSTRAINT "StudioWorkflowJob_assetId_fkey"
    FOREIGN KEY ("assetId") REFERENCES "StudioMediaAsset"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "StudioWorkflowJob"
    ADD CONSTRAINT "StudioWorkflowJob_productionRoomId_fkey"
    FOREIGN KEY ("productionRoomId") REFERENCES "StudioProductionRoom"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "StudioWorkflowJob"
    ADD CONSTRAINT "StudioWorkflowJob_outputPacketId_fkey"
    FOREIGN KEY ("outputPacketId") REFERENCES "StudioOutputPacket"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
