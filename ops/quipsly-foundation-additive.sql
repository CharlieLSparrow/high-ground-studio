-- Quipsly production foundation patch.
-- Additive-only by design: do not drop tables, columns, enum values, or data.

ALTER TABLE "StudioWorkspace"
  ADD COLUMN IF NOT EXISTS "organizationId" TEXT;

CREATE INDEX IF NOT EXISTS "StudioWorkspace_organizationId_idx"
  ON "StudioWorkspace"("organizationId");

ALTER TABLE "StudioProject"
  ADD COLUMN IF NOT EXISTS "createdByUserId" TEXT,
  ADD COLUMN IF NOT EXISTS "updatedByUserId" TEXT;

CREATE INDEX IF NOT EXISTS "StudioProject_createdByUserId_idx"
  ON "StudioProject"("createdByUserId");

CREATE INDEX IF NOT EXISTS "StudioProject_updatedByUserId_idx"
  ON "StudioProject"("updatedByUserId");

CREATE TABLE IF NOT EXISTS "StudioAssistantSession" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "projectId" TEXT NOT NULL,
  "documentId" TEXT,
  "title" TEXT,
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "StudioAssistantSession_projectId_idx"
  ON "StudioAssistantSession"("projectId");

CREATE INDEX IF NOT EXISTS "StudioAssistantSession_documentId_idx"
  ON "StudioAssistantSession"("documentId");

CREATE TABLE IF NOT EXISTS "StudioAssistantMessage" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "sessionId" TEXT NOT NULL,
  "role" TEXT NOT NULL,
  "content" TEXT NOT NULL,
  "contextJson" JSONB,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "StudioAssistantMessage_sessionId_idx"
  ON "StudioAssistantMessage"("sessionId");

CREATE TABLE IF NOT EXISTS "StudioAssistantAction" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "sessionId" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "explanation" TEXT,
  "riskLevel" TEXT NOT NULL,
  "payloadJson" JSONB,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "StudioAssistantAction_sessionId_idx"
  ON "StudioAssistantAction"("sessionId");

CREATE INDEX IF NOT EXISTS "StudioAssistantAction_status_idx"
  ON "StudioAssistantAction"("status");

CREATE TABLE IF NOT EXISTS "StudioAssistantLedger" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "actionId" TEXT NOT NULL,
  "previousStatus" TEXT,
  "newStatus" TEXT NOT NULL,
  "notes" TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "StudioAssistantLedger_actionId_idx"
  ON "StudioAssistantLedger"("actionId");

-- 2026-06-04 parallel-lane additive reconciliation.
-- Keep this section additive-only. Do not drop or narrow existing data.

CREATE TABLE IF NOT EXISTS "StudioViewDefinition" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "projectId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "type" TEXT NOT NULL DEFAULT 'review',
  "filters" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "displaySettings" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "isDefault" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS "StudioViewDefinition_projectId_name_key"
  ON "StudioViewDefinition"("projectId", "name");

CREATE INDEX IF NOT EXISTS "StudioViewDefinition_projectId_idx"
  ON "StudioViewDefinition"("projectId");

ALTER TABLE "StudioAssistantSession"
  ADD COLUMN IF NOT EXISTS "title" TEXT,
  ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE "StudioAssistantMessage"
  ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE "StudioAssistantAction"
  ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE TABLE IF NOT EXISTS "StudioAssistantLedger" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "actionId" TEXT NOT NULL,
  "previousStatus" TEXT,
  "newStatus" TEXT NOT NULL,
  "notes" TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "StudioAssistantLedger_actionId_idx"
  ON "StudioAssistantLedger"("actionId");

ALTER TABLE "WorldHubProviderEvent"
  ADD COLUMN IF NOT EXISTS "retryCount" INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS "MembershipReconciliation" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "provider" TEXT NOT NULL,
  "providerEmail" TEXT NOT NULL,
  "proposedTier" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "providerStatus" TEXT,
  "eventId" TEXT NOT NULL,
  "membershipId" TEXT,
  "note" TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "MembershipReconciliation_status_createdAt_idx"
  ON "MembershipReconciliation"("status", "createdAt");

DO $$
BEGIN
  CREATE TYPE "StoryEntityType" AS ENUM ('CHARACTER', 'SETTING', 'SCENE', 'RELATIONSHIP', 'TIMELINE_EVENT', 'THEME_MOTIF');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE "StoryBibleActionStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'UNDONE');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE "StoryBibleActionType" AS ENUM ('PROPOSE_ENTITY', 'PROPOSE_ENTITY_UPDATE', 'PROPOSE_RELATIONSHIP');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "StoryEntity" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "projectId" TEXT NOT NULL,
  "type" "StoryEntityType" NOT NULL,
  "name" TEXT NOT NULL,
  "aliases" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "attributes" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "StoryEntity_projectId_type_idx"
  ON "StoryEntity"("projectId", "type");

CREATE TABLE IF NOT EXISTS "StoryEntityMention" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "entityId" TEXT NOT NULL,
  "documentId" TEXT NOT NULL,
  "blockId" TEXT NOT NULL,
  "snippet" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "StoryEntityMention_entityId_idx"
  ON "StoryEntityMention"("entityId");

CREATE INDEX IF NOT EXISTS "StoryEntityMention_documentId_blockId_idx"
  ON "StoryEntityMention"("documentId", "blockId");

CREATE TABLE IF NOT EXISTS "StoryBibleAction" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "projectId" TEXT NOT NULL,
  "documentId" TEXT,
  "type" "StoryBibleActionType" NOT NULL,
  "status" "StoryBibleActionStatus" NOT NULL DEFAULT 'PENDING',
  "payloadJson" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "explanation" TEXT,
  "riskLevel" TEXT NOT NULL DEFAULT 'LOW',
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "StoryBibleAction_projectId_status_idx"
  ON "StoryBibleAction"("projectId", "status");

CREATE TABLE IF NOT EXISTS "StoryBibleLedger" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "actionId" TEXT NOT NULL,
  "oldStatus" "StoryBibleActionStatus",
  "newStatus" "StoryBibleActionStatus" NOT NULL,
  "comments" TEXT,
  "changedBy" TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "StoryBibleLedger_actionId_createdAt_idx"
  ON "StoryBibleLedger"("actionId", "createdAt");

CREATE TABLE IF NOT EXISTS "RetrievalEmbedding" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "sourceOrigin" TEXT NOT NULL,
  "sourceId" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "contentSnapshot" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "RetrievalEmbedding_projectId_idx"
  ON "RetrievalEmbedding"("projectId");

CREATE TABLE IF NOT EXISTS "StudioStoryboard" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "projectId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT,
  "aspectRatio" TEXT NOT NULL DEFAULT '16:9',
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "StudioStoryboard_projectId_idx"
  ON "StudioStoryboard"("projectId");

CREATE TABLE IF NOT EXISTS "StudioStoryboardFrame" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "storyboardId" TEXT NOT NULL,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "frameNumber" TEXT NOT NULL,
  "imageUrl" TEXT,
  "action" TEXT NOT NULL,
  "dialogue" TEXT,
  "cameraInfo" TEXT NOT NULL DEFAULT 'Static',
  "shotSize" TEXT NOT NULL DEFAULT 'Medium Shot',
  "lens" TEXT,
  "cameraMovement" TEXT,
  "mediaClipId" TEXT,
  "estimatedDuration" INTEGER,
  "vfxNotes" TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE "StudioStoryboardFrame"
  ADD COLUMN IF NOT EXISTS "sortOrder" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "imageUrl" TEXT,
  ADD COLUMN IF NOT EXISTS "cameraMovement" TEXT,
  ADD COLUMN IF NOT EXISTS "mediaClipId" TEXT;

CREATE INDEX IF NOT EXISTS "StudioStoryboardFrame_storyboardId_sortOrder_idx"
  ON "StudioStoryboardFrame"("storyboardId", "sortOrder");

-- 2026-06-05 StudioViewDefinition existing-table reconciliation.
-- Production may already have this table from an earlier workbench version, so
-- CREATE TABLE IF NOT EXISTS is not enough to add newly expected columns.
ALTER TABLE "StudioViewDefinition"
  ADD COLUMN IF NOT EXISTS "type" TEXT NOT NULL DEFAULT 'review',
  ADD COLUMN IF NOT EXISTS "filters" JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS "displaySettings" JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS "isDefault" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP;
