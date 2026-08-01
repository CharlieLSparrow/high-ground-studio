-- Calendar providers remain projections of Quipsly-owned appointments, work,
-- and production milestones. Credentials and sync tokens are stored only as
-- opaque references; append-only receipts preserve provider effects.

CREATE TYPE "CalendarProvider" AS ENUM ('GOOGLE', 'ICALENDAR', 'APPLE_EVENTKIT', 'QUIPSLY');
CREATE TYPE "CalendarConnectionKind" AS ENUM ('MANAGED_ORGANIZATION', 'USER_OAUTH', 'DEVICE_LOCAL', 'SUBSCRIPTION');
CREATE TYPE "CalendarConnectionStatus" AS ENUM ('PENDING', 'VERIFIED', 'DEGRADED', 'REVOKED');
CREATE TYPE "CalendarCollectionPurpose" AS ENUM ('COACHING', 'PODCAST_PRODUCTION', 'PERSONAL_COMMITMENTS');
CREATE TYPE "CalendarCollectionVisibility" AS ENUM ('PRIVATE', 'TEAM', 'CLIENT_VISIBLE');
CREATE TYPE "CalendarCollectionStatus" AS ENUM ('ACTIVE', 'PAUSED', 'REVOKED');
CREATE TYPE "CalendarProjectionStatus" AS ENUM ('PLANNED', 'SYNCED', 'CONFLICT', 'MISSING', 'CANCELED', 'REVOKED');
CREATE TYPE "CalendarConflictState" AS ENUM ('NONE', 'EXTERNAL_CHANGED', 'QUIPSLY_CHANGED', 'BOTH_CHANGED', 'RESOLUTION_REQUIRED');
CREATE TYPE "CalendarSyncOperation" AS ENUM ('VERIFY', 'FULL_SYNC', 'INCREMENTAL_SYNC', 'CREATE_EVENT', 'UPDATE_EVENT', 'CANCEL_EVENT', 'DELETE_EVENT', 'READ_EVENT', 'FEED_RENDER', 'FEED_REVOKE');
CREATE TYPE "CalendarSyncOutcome" AS ENUM ('SUCCEEDED', 'FAILED', 'SKIPPED', 'CONFLICT');
CREATE TYPE "CalendarFeedStatus" AS ENUM ('ACTIVE', 'REVOKED');

CREATE TABLE "CalendarConnection" (
    "id" TEXT NOT NULL,
    "nestId" TEXT,
    "userId" TEXT,
    "provider" "CalendarProvider" NOT NULL,
    "connectionKind" "CalendarConnectionKind" NOT NULL,
    "providerAccountKey" TEXT,
    "credentialRef" TEXT,
    "grantedScopes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "status" "CalendarConnectionStatus" NOT NULL DEFAULT 'PENDING',
    "verifiedAt" TIMESTAMP(3),
    "lastCheckedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "metadataJson" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CalendarConnection_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "CalendarConnection_scope_exactly_one" CHECK ((CASE WHEN "nestId" IS NULL THEN 0 ELSE 1 END) + (CASE WHEN "userId" IS NULL THEN 0 ELSE 1 END) = 1)
);

CREATE TABLE "CalendarCollection" (
    "id" TEXT NOT NULL,
    "connectionId" TEXT,
    "nestId" TEXT,
    "ownerUserId" TEXT,
    "purpose" "CalendarCollectionPurpose" NOT NULL,
    "displayName" TEXT NOT NULL,
    "timezone" TEXT NOT NULL DEFAULT 'UTC',
    "providerCalendarId" TEXT,
    "visibility" "CalendarCollectionVisibility" NOT NULL DEFAULT 'PRIVATE',
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "status" "CalendarCollectionStatus" NOT NULL DEFAULT 'ACTIVE',
    "metadataJson" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CalendarCollection_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "CalendarCollection_scope_exactly_one" CHECK ((CASE WHEN "nestId" IS NULL THEN 0 ELSE 1 END) + (CASE WHEN "ownerUserId" IS NULL THEN 0 ELSE 1 END) = 1)
);

CREATE TABLE "CalendarProjection" (
    "id" TEXT NOT NULL,
    "collectionId" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "sourceRevision" TEXT NOT NULL,
    "providerEventId" TEXT,
    "providerEtag" TEXT,
    "providerUpdatedAt" TIMESTAMP(3),
    "uid" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL DEFAULT 0,
    "status" "CalendarProjectionStatus" NOT NULL DEFAULT 'PLANNED',
    "conflictState" "CalendarConflictState" NOT NULL DEFAULT 'NONE',
    "lastSyncedAt" TIMESTAMP(3),
    "metadataJson" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CalendarProjection_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CalendarSyncCursor" (
    "id" TEXT NOT NULL,
    "collectionId" TEXT NOT NULL,
    "syncTokenRef" TEXT,
    "channelId" TEXT,
    "channelResourceId" TEXT,
    "channelExpiresAt" TIMESTAMP(3),
    "lastFullSyncAt" TIMESTAMP(3),
    "lastIncrementalSyncAt" TIMESTAMP(3),
    "metadataJson" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CalendarSyncCursor_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CalendarSyncReceipt" (
    "id" TEXT NOT NULL,
    "connectionId" TEXT,
    "collectionId" TEXT,
    "projectionId" TEXT,
    "actorUserId" TEXT,
    "operation" "CalendarSyncOperation" NOT NULL,
    "outcome" "CalendarSyncOutcome" NOT NULL,
    "requestDigest" TEXT,
    "responseDigest" TEXT,
    "providerStatus" TEXT,
    "externalMutated" BOOLEAN NOT NULL DEFAULT false,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "metadataJson" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CalendarSyncReceipt_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CalendarFeed" (
    "id" TEXT NOT NULL,
    "collectionId" TEXT NOT NULL,
    "ownerUserId" TEXT,
    "tokenDigest" TEXT NOT NULL,
    "status" "CalendarFeedStatus" NOT NULL DEFAULT 'ACTIVE',
    "timezone" TEXT NOT NULL DEFAULT 'UTC',
    "lastGeneratedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "metadataJson" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CalendarFeed_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CalendarConnection_provider_providerAccountKey_key" ON "CalendarConnection"("provider", "providerAccountKey");
CREATE INDEX "CalendarConnection_nestId_provider_status_idx" ON "CalendarConnection"("nestId", "provider", "status");
CREATE INDEX "CalendarConnection_userId_provider_status_idx" ON "CalendarConnection"("userId", "provider", "status");
CREATE INDEX "CalendarConnection_status_updatedAt_idx" ON "CalendarConnection"("status", "updatedAt");

CREATE UNIQUE INDEX "CalendarCollection_connectionId_providerCalendarId_key" ON "CalendarCollection"("connectionId", "providerCalendarId");
CREATE INDEX "CalendarCollection_nestId_purpose_status_idx" ON "CalendarCollection"("nestId", "purpose", "status");
CREATE INDEX "CalendarCollection_ownerUserId_purpose_status_idx" ON "CalendarCollection"("ownerUserId", "purpose", "status");
CREATE INDEX "CalendarCollection_connectionId_status_idx" ON "CalendarCollection"("connectionId", "status");
CREATE INDEX "CalendarCollection_purpose_isDefault_idx" ON "CalendarCollection"("purpose", "isDefault");

CREATE UNIQUE INDEX "CalendarProjection_uid_key" ON "CalendarProjection"("uid");
CREATE UNIQUE INDEX "CalendarProjection_collectionId_sourceType_sourceId_key" ON "CalendarProjection"("collectionId", "sourceType", "sourceId");
CREATE UNIQUE INDEX "CalendarProjection_collectionId_providerEventId_key" ON "CalendarProjection"("collectionId", "providerEventId");
CREATE INDEX "CalendarProjection_sourceType_sourceId_idx" ON "CalendarProjection"("sourceType", "sourceId");
CREATE INDEX "CalendarProjection_collectionId_status_updatedAt_idx" ON "CalendarProjection"("collectionId", "status", "updatedAt");
CREATE INDEX "CalendarProjection_conflictState_updatedAt_idx" ON "CalendarProjection"("conflictState", "updatedAt");

CREATE UNIQUE INDEX "CalendarSyncCursor_collectionId_key" ON "CalendarSyncCursor"("collectionId");
CREATE INDEX "CalendarSyncCursor_channelExpiresAt_idx" ON "CalendarSyncCursor"("channelExpiresAt");

CREATE INDEX "CalendarSyncReceipt_connectionId_occurredAt_idx" ON "CalendarSyncReceipt"("connectionId", "occurredAt");
CREATE INDEX "CalendarSyncReceipt_collectionId_occurredAt_idx" ON "CalendarSyncReceipt"("collectionId", "occurredAt");
CREATE INDEX "CalendarSyncReceipt_projectionId_occurredAt_idx" ON "CalendarSyncReceipt"("projectionId", "occurredAt");
CREATE INDEX "CalendarSyncReceipt_actorUserId_occurredAt_idx" ON "CalendarSyncReceipt"("actorUserId", "occurredAt");
CREATE INDEX "CalendarSyncReceipt_outcome_occurredAt_idx" ON "CalendarSyncReceipt"("outcome", "occurredAt");

CREATE UNIQUE INDEX "CalendarFeed_tokenDigest_key" ON "CalendarFeed"("tokenDigest");
CREATE INDEX "CalendarFeed_collectionId_status_idx" ON "CalendarFeed"("collectionId", "status");
CREATE INDEX "CalendarFeed_ownerUserId_status_idx" ON "CalendarFeed"("ownerUserId", "status");
CREATE INDEX "CalendarFeed_status_updatedAt_idx" ON "CalendarFeed"("status", "updatedAt");

ALTER TABLE "CalendarConnection" ADD CONSTRAINT "CalendarConnection_nestId_fkey" FOREIGN KEY ("nestId") REFERENCES "StudioProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CalendarConnection" ADD CONSTRAINT "CalendarConnection_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CalendarCollection" ADD CONSTRAINT "CalendarCollection_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "CalendarConnection"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CalendarCollection" ADD CONSTRAINT "CalendarCollection_nestId_fkey" FOREIGN KEY ("nestId") REFERENCES "StudioProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CalendarCollection" ADD CONSTRAINT "CalendarCollection_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CalendarProjection" ADD CONSTRAINT "CalendarProjection_collectionId_fkey" FOREIGN KEY ("collectionId") REFERENCES "CalendarCollection"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CalendarSyncCursor" ADD CONSTRAINT "CalendarSyncCursor_collectionId_fkey" FOREIGN KEY ("collectionId") REFERENCES "CalendarCollection"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CalendarSyncReceipt" ADD CONSTRAINT "CalendarSyncReceipt_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "CalendarConnection"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CalendarSyncReceipt" ADD CONSTRAINT "CalendarSyncReceipt_collectionId_fkey" FOREIGN KEY ("collectionId") REFERENCES "CalendarCollection"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CalendarSyncReceipt" ADD CONSTRAINT "CalendarSyncReceipt_projectionId_fkey" FOREIGN KEY ("projectionId") REFERENCES "CalendarProjection"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CalendarSyncReceipt" ADD CONSTRAINT "CalendarSyncReceipt_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CalendarFeed" ADD CONSTRAINT "CalendarFeed_collectionId_fkey" FOREIGN KEY ("collectionId") REFERENCES "CalendarCollection"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CalendarFeed" ADD CONSTRAINT "CalendarFeed_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
