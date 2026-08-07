CREATE TABLE "StudioExternalMediaLibrary" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "connectionId" TEXT,
    "provider" TEXT NOT NULL,
    "externalRootId" TEXT NOT NULL,
    "sharedDriveId" TEXT,
    "name" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ready',
    "revision" INTEGER NOT NULL DEFAULT 1,
    "inventoryFingerprintSha256" TEXT NOT NULL,
    "totalFileCount" INTEGER NOT NULL DEFAULT 0,
    "totalSizeBytes" BIGINT NOT NULL DEFAULT 0,
    "readySegmentCount" INTEGER NOT NULL DEFAULT 0,
    "heldSegmentCount" INTEGER NOT NULL DEFAULT 0,
    "providerLocatorJson" JSONB NOT NULL DEFAULT '{}',
    "healthJson" JSONB NOT NULL DEFAULT '{}',
    "lastCheckedAt" TIMESTAMP(3) NOT NULL,
    "lastSuccessfulRefreshAt" TIMESTAMP(3) NOT NULL,
    "clientRequestId" TEXT NOT NULL,
    "createdByUserId" TEXT NOT NULL,
    "createdByEmail" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StudioExternalMediaLibrary_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "StudioExternalMediaLibrary_status_check" CHECK ("status" IN ('ready', 'attention', 'needs-reauth')),
    CONSTRAINT "StudioExternalMediaLibrary_revision_check" CHECK ("revision" >= 1),
    CONSTRAINT "StudioExternalMediaLibrary_fingerprint_check" CHECK ("inventoryFingerprintSha256" ~ '^[0-9a-f]{64}$'),
    CONSTRAINT "StudioExternalMediaLibrary_counts_check" CHECK ("totalFileCount" >= 0 AND "totalSizeBytes" >= 0 AND "readySegmentCount" >= 0 AND "heldSegmentCount" >= 0)
);

CREATE TABLE "StudioExternalMediaLibraryItem" (
    "id" TEXT NOT NULL,
    "libraryId" TEXT NOT NULL,
    "externalFileId" TEXT NOT NULL,
    "sourceUnitId" TEXT,
    "externalReferenceId" TEXT,
    "fileName" TEXT NOT NULL,
    "observedRevisionKey" TEXT,
    "sizeBytes" BIGINT,
    "state" TEXT NOT NULL DEFAULT 'present',
    "missingObservationCount" INTEGER NOT NULL DEFAULT 0,
    "firstObservedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastObservedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StudioExternalMediaLibraryItem_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "StudioExternalMediaLibraryItem_state_check" CHECK ("state" IN ('present', 'not-observed')),
    CONSTRAINT "StudioExternalMediaLibraryItem_missing_count_check" CHECK ("missingObservationCount" >= 0),
    CONSTRAINT "StudioExternalMediaLibraryItem_size_check" CHECK ("sizeBytes" IS NULL OR "sizeBytes" >= 0)
);

CREATE TABLE "StudioExternalMediaLibraryOperation" (
    "id" TEXT NOT NULL,
    "libraryId" TEXT NOT NULL,
    "revision" INTEGER NOT NULL,
    "previousRevision" INTEGER NOT NULL,
    "operation" TEXT NOT NULL,
    "outcome" TEXT NOT NULL,
    "actorUserId" TEXT NOT NULL,
    "clientRequestId" TEXT NOT NULL,
    "requestSha256" TEXT NOT NULL,
    "inventoryFingerprintSha256" TEXT NOT NULL,
    "snapshotJson" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StudioExternalMediaLibraryOperation_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "StudioExternalMediaLibraryOperation_revision_check" CHECK ("revision" >= 1 AND "previousRevision" >= 0 AND "revision" = "previousRevision" + 1),
    CONSTRAINT "StudioExternalMediaLibraryOperation_kind_check" CHECK ("operation" IN ('attach-library', 'refresh-library', 'connection-revoked')),
    CONSTRAINT "StudioExternalMediaLibraryOperation_outcome_check" CHECK ("outcome" IN ('succeeded', 'needs-attention')),
    CONSTRAINT "StudioExternalMediaLibraryOperation_request_check" CHECK ("requestSha256" ~ '^[0-9a-f]{64}$'),
    CONSTRAINT "StudioExternalMediaLibraryOperation_fingerprint_check" CHECK ("inventoryFingerprintSha256" ~ '^[0-9a-f]{64}$')
);

CREATE UNIQUE INDEX "StudioExternalMediaLibrary_projectId_provider_externalRootId_key" ON "StudioExternalMediaLibrary"("projectId", "provider", "externalRootId");
CREATE UNIQUE INDEX "StudioExternalMediaLibrary_project_actor_request_key" ON "StudioExternalMediaLibrary"("projectId", "createdByUserId", "clientRequestId");
CREATE INDEX "StudioExternalMediaLibrary_projectId_status_updatedAt_idx" ON "StudioExternalMediaLibrary"("projectId", "status", "updatedAt");
CREATE INDEX "StudioExternalMediaLibrary_connectionId_status_updatedAt_idx" ON "StudioExternalMediaLibrary"("connectionId", "status", "updatedAt");

CREATE UNIQUE INDEX "StudioExternalMediaLibraryItem_libraryId_externalFileId_key" ON "StudioExternalMediaLibraryItem"("libraryId", "externalFileId");
CREATE INDEX "StudioExternalMediaLibraryItem_libraryId_state_updatedAt_idx" ON "StudioExternalMediaLibraryItem"("libraryId", "state", "updatedAt");
CREATE INDEX "StudioExternalMediaLibraryItem_sourceUnitId_idx" ON "StudioExternalMediaLibraryItem"("sourceUnitId");
CREATE INDEX "StudioExternalMediaLibraryItem_externalReferenceId_idx" ON "StudioExternalMediaLibraryItem"("externalReferenceId");

CREATE UNIQUE INDEX "StudioExternalMediaLibraryOperation_libraryId_revision_key" ON "StudioExternalMediaLibraryOperation"("libraryId", "revision");
CREATE UNIQUE INDEX "StudioExternalMediaLibraryOperation_libraryId_actorUserId_clientRequestId_key" ON "StudioExternalMediaLibraryOperation"("libraryId", "actorUserId", "clientRequestId");
CREATE INDEX "StudioExternalMediaLibraryOperation_actorUserId_createdAt_idx" ON "StudioExternalMediaLibraryOperation"("actorUserId", "createdAt");

ALTER TABLE "StudioExternalMediaLibrary" ADD CONSTRAINT "StudioExternalMediaLibrary_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "StudioProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StudioExternalMediaLibrary" ADD CONSTRAINT "StudioExternalMediaLibrary_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "StudioMediaProviderConnection"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "StudioExternalMediaLibrary" ADD CONSTRAINT "StudioExternalMediaLibrary_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "StudioExternalMediaLibraryItem" ADD CONSTRAINT "StudioExternalMediaLibraryItem_libraryId_fkey" FOREIGN KEY ("libraryId") REFERENCES "StudioExternalMediaLibrary"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StudioExternalMediaLibraryItem" ADD CONSTRAINT "StudioExternalMediaLibraryItem_sourceUnitId_fkey" FOREIGN KEY ("sourceUnitId") REFERENCES "StudioSourceUnit"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "StudioExternalMediaLibraryItem" ADD CONSTRAINT "StudioExternalMediaLibraryItem_externalReferenceId_fkey" FOREIGN KEY ("externalReferenceId") REFERENCES "StudioExternalMediaReference"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "StudioExternalMediaLibraryOperation" ADD CONSTRAINT "StudioExternalMediaLibraryOperation_libraryId_fkey" FOREIGN KEY ("libraryId") REFERENCES "StudioExternalMediaLibrary"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StudioExternalMediaLibraryOperation" ADD CONSTRAINT "StudioExternalMediaLibraryOperation_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
