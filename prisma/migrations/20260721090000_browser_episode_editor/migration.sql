CREATE TABLE "StudioEditBaseline" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "episodeProductionId" TEXT NOT NULL,
    "stableKey" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "label" TEXT NOT NULL,
    "durationSeconds" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "sourceFingerprint" TEXT,
    "sourceManifestJson" JSONB NOT NULL DEFAULT '{}',
    "syncSummaryJson" JSONB NOT NULL DEFAULT '{}',
    "importReceiptJson" JSONB NOT NULL DEFAULT '{}',
    "importedByUserId" TEXT,
    "importedByEmail" TEXT,
    "importedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "StudioEditBaseline_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "StudioEditBranch" (
    "id" TEXT NOT NULL,
    "baselineId" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'episode-edit',
    "status" TEXT NOT NULL DEFAULT 'active',
    "headRevision" INTEGER NOT NULL DEFAULT 0,
    "stateJson" JSONB NOT NULL DEFAULT '{}',
    "stateFingerprint" TEXT,
    "createdByUserId" TEXT,
    "createdByEmail" TEXT,
    "createdByActorType" TEXT NOT NULL DEFAULT 'human',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "StudioEditBranch_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "StudioEditOperation" (
    "id" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "revision" INTEGER NOT NULL,
    "clientRequestId" TEXT NOT NULL,
    "expectedRevision" INTEGER NOT NULL,
    "actorUserId" TEXT,
    "actorEmail" TEXT,
    "actorLabel" TEXT,
    "actorType" TEXT NOT NULL DEFAULT 'human',
    "operationType" TEXT NOT NULL,
    "sequenceTime" DOUBLE PRECISION,
    "endTime" DOUBLE PRECISION,
    "payloadJson" JSONB NOT NULL DEFAULT '{}',
    "beforeJson" JSONB,
    "afterJson" JSONB,
    "sourceTimestampPrecision" TEXT NOT NULL DEFAULT 'exact',
    "sourceCreatedBefore" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "StudioEditOperation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "StudioTimelineAnnotation" (
    "id" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "startSeconds" DOUBLE PRECISION NOT NULL,
    "endSeconds" DOUBLE PRECISION,
    "kind" TEXT NOT NULL DEFAULT 'note',
    "title" TEXT,
    "body" TEXT,
    "hookKey" TEXT,
    "tagsJson" JSONB NOT NULL DEFAULT '[]',
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdByUserId" TEXT,
    "createdByEmail" TEXT,
    "createdByActorType" TEXT NOT NULL DEFAULT 'human',
    "clientRequestId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "archivedAt" TIMESTAMP(3),
    CONSTRAINT "StudioTimelineAnnotation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "StudioEditBaseline_episodeProductionId_stableKey_version_key" ON "StudioEditBaseline"("episodeProductionId", "stableKey", "version");
CREATE INDEX "StudioEditBaseline_projectId_episodeProductionId_idx" ON "StudioEditBaseline"("projectId", "episodeProductionId");
CREATE UNIQUE INDEX "StudioEditBranch_baselineId_slug_key" ON "StudioEditBranch"("baselineId", "slug");
CREATE INDEX "StudioEditBranch_baselineId_status_idx" ON "StudioEditBranch"("baselineId", "status");
CREATE UNIQUE INDEX "StudioEditOperation_branchId_revision_key" ON "StudioEditOperation"("branchId", "revision");
CREATE UNIQUE INDEX "StudioEditOperation_branchId_clientRequestId_key" ON "StudioEditOperation"("branchId", "clientRequestId");
CREATE INDEX "StudioEditOperation_branchId_createdAt_idx" ON "StudioEditOperation"("branchId", "createdAt");
CREATE INDEX "StudioEditOperation_actorUserId_createdAt_idx" ON "StudioEditOperation"("actorUserId", "createdAt");
CREATE UNIQUE INDEX "StudioTimelineAnnotation_branchId_clientRequestId_key" ON "StudioTimelineAnnotation"("branchId", "clientRequestId");
CREATE INDEX "StudioTimelineAnnotation_branchId_startSeconds_idx" ON "StudioTimelineAnnotation"("branchId", "startSeconds");
CREATE INDEX "StudioTimelineAnnotation_branchId_status_createdAt_idx" ON "StudioTimelineAnnotation"("branchId", "status", "createdAt");

ALTER TABLE "StudioEditBranch" ADD CONSTRAINT "StudioEditBranch_baselineId_fkey" FOREIGN KEY ("baselineId") REFERENCES "StudioEditBaseline"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StudioEditOperation" ADD CONSTRAINT "StudioEditOperation_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "StudioEditBranch"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StudioTimelineAnnotation" ADD CONSTRAINT "StudioTimelineAnnotation_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "StudioEditBranch"("id") ON DELETE CASCADE ON UPDATE CASCADE;
