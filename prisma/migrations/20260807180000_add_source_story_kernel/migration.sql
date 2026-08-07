-- Provider-neutral, source-backed story planning. All changes are additive;
-- legacy MediaClip and StudioStoryboard records remain untouched and can be
-- projected into this kernel through explicit, reversible operations later.

CREATE TABLE "StudioExternalMediaReference" (
  "id" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "sourceUnitId" TEXT,
  "provider" TEXT NOT NULL,
  "connectionKey" TEXT,
  "externalFileId" TEXT NOT NULL,
  "sharedDriveId" TEXT,
  "fileName" TEXT NOT NULL,
  "mimeType" TEXT,
  "sizeBytes" BIGINT,
  "headRevisionKey" TEXT,
  "checksumSha256" TEXT,
  "providerCreatedAt" TIMESTAMP(3),
  "providerModifiedAt" TIMESTAMP(3),
  "accessState" TEXT NOT NULL DEFAULT 'unverified',
  "capabilityState" TEXT NOT NULL DEFAULT 'unknown',
  "providerLocatorJson" JSONB NOT NULL DEFAULT '{}',
  "capabilitySnapshotJson" JSONB NOT NULL DEFAULT '{}',
  "lastVerifiedAt" TIMESTAMP(3),
  "importedByUserId" TEXT NOT NULL,
  "importedByEmail" TEXT NOT NULL,
  "clientRequestId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "StudioExternalMediaReference_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "StudioExternalMediaReference_size_check" CHECK ("sizeBytes" IS NULL OR "sizeBytes" >= 0),
  CONSTRAINT "StudioExternalMediaReference_sha_check" CHECK ("checksumSha256" IS NULL OR length("checksumSha256") = 64)
);

CREATE TABLE "StudioMediaSourceRevision" (
  "id" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "externalReferenceId" TEXT,
  "mediaAssetId" TEXT,
  "sourceUnitId" TEXT,
  "revisionKey" TEXT NOT NULL,
  "identitySha256" TEXT NOT NULL,
  "contentSha256" TEXT,
  "sizeBytes" BIGINT,
  "durationSeconds" DOUBLE PRECISION,
  "widthPixels" INTEGER,
  "heightPixels" INTEGER,
  "framesPerSecond" DOUBLE PRECISION,
  "sourceState" TEXT NOT NULL DEFAULT 'available',
  "providerModifiedAt" TIMESTAMP(3),
  "verifiedAt" TIMESTAMP(3),
  "verificationJson" JSONB NOT NULL DEFAULT '{}',
  "provenanceJson" JSONB NOT NULL DEFAULT '{}',
  "createdByUserId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "StudioMediaSourceRevision_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "StudioMediaSourceRevision_origin_check" CHECK ("externalReferenceId" IS NOT NULL OR "mediaAssetId" IS NOT NULL),
  CONSTRAINT "StudioMediaSourceRevision_identity_check" CHECK (length("identitySha256") = 64),
  CONSTRAINT "StudioMediaSourceRevision_content_check" CHECK ("contentSha256" IS NULL OR length("contentSha256") = 64),
  CONSTRAINT "StudioMediaSourceRevision_size_check" CHECK ("sizeBytes" IS NULL OR "sizeBytes" >= 0),
  CONSTRAINT "StudioMediaSourceRevision_duration_check" CHECK ("durationSeconds" IS NULL OR "durationSeconds" >= 0),
  CONSTRAINT "StudioMediaSourceRevision_dimensions_check" CHECK (("widthPixels" IS NULL OR "widthPixels" > 0) AND ("heightPixels" IS NULL OR "heightPixels" > 0)),
  CONSTRAINT "StudioMediaSourceRevision_fps_check" CHECK ("framesPerSecond" IS NULL OR "framesPerSecond" > 0)
);

CREATE TABLE "StudioSourceRange" (
  "id" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "sourceRevisionId" TEXT NOT NULL,
  "selectorSha256" TEXT NOT NULL,
  "startSeconds" DOUBLE PRECISION NOT NULL,
  "endSeconds" DOUBLE PRECISION NOT NULL,
  "selectorJson" JSONB NOT NULL DEFAULT '{}',
  "reframeRecipeJson" JSONB,
  "createdByUserId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "StudioSourceRange_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "StudioSourceRange_selector_check" CHECK (length("selectorSha256") = 64),
  CONSTRAINT "StudioSourceRange_clock_check" CHECK ("startSeconds" >= 0 AND "endSeconds" > "startSeconds")
);

CREATE TABLE "StudioStoryCard" (
  "id" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "sourceRangeId" TEXT,
  "stableId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "synopsis" TEXT NOT NULL DEFAULT '',
  "notes" TEXT NOT NULL DEFAULT '',
  "purpose" TEXT NOT NULL DEFAULT 'select',
  "status" TEXT NOT NULL DEFAULT 'candidate',
  "visibility" TEXT NOT NULL DEFAULT 'project',
  "revision" INTEGER NOT NULL DEFAULT 1,
  "clientRequestId" TEXT NOT NULL,
  "createdByUserId" TEXT NOT NULL,
  "updatedByUserId" TEXT,
  "archivedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "StudioStoryCard_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "StudioStoryCard_revision_check" CHECK ("revision" >= 1)
);

CREATE TABLE "StudioStoryCardRevision" (
  "id" TEXT NOT NULL,
  "cardId" TEXT NOT NULL,
  "revision" INTEGER NOT NULL,
  "operation" TEXT NOT NULL,
  "actorUserId" TEXT NOT NULL,
  "clientRequestId" TEXT NOT NULL,
  "snapshotJson" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "StudioStoryCardRevision_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "StudioStoryCardRevision_revision_check" CHECK ("revision" >= 1)
);

CREATE TABLE "StudioStoryCardTagLink" (
  "cardId" TEXT NOT NULL,
  "tagId" TEXT NOT NULL,
  "createdByUserId" TEXT,
  "sourceJson" JSONB NOT NULL DEFAULT '{}',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "StudioStoryCardTagLink_pkey" PRIMARY KEY ("cardId", "tagId")
);

CREATE TABLE "StudioStoryBoard" (
  "id" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "episodeProductionId" TEXT,
  "slug" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT,
  "kind" TEXT NOT NULL DEFAULT 'story',
  "layout" TEXT NOT NULL DEFAULT 'board',
  "revision" INTEGER NOT NULL DEFAULT 0,
  "createdByUserId" TEXT NOT NULL,
  "updatedByUserId" TEXT,
  "archivedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "StudioStoryBoard_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "StudioStoryBoard_revision_check" CHECK ("revision" >= 0)
);

CREATE TABLE "StudioStoryBoardPlacement" (
  "id" TEXT NOT NULL,
  "boardId" TEXT NOT NULL,
  "cardId" TEXT NOT NULL,
  "groupKey" TEXT NOT NULL DEFAULT 'unassigned',
  "laneKey" TEXT NOT NULL DEFAULT 'story',
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdByUserId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "StudioStoryBoardPlacement_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "StudioStoryBoardPlacement_order_check" CHECK ("sortOrder" >= 0)
);

CREATE TABLE "StudioStoryBoardOperation" (
  "id" TEXT NOT NULL,
  "boardId" TEXT NOT NULL,
  "revision" INTEGER NOT NULL,
  "previousRevision" INTEGER NOT NULL,
  "operation" TEXT NOT NULL,
  "actorUserId" TEXT NOT NULL,
  "clientRequestId" TEXT NOT NULL,
  "snapshotJson" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "StudioStoryBoardOperation_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "StudioStoryBoardOperation_revision_check" CHECK ("revision" = "previousRevision" + 1)
);

CREATE INDEX "StudioExternalMediaReference_projectId_accessState_updatedA_idx" ON "StudioExternalMediaReference"("projectId", "accessState", "updatedAt");
CREATE INDEX "StudioExternalMediaReference_sourceUnitId_idx" ON "StudioExternalMediaReference"("sourceUnitId");
CREATE INDEX "StudioExternalMediaReference_connectionKey_provider_idx" ON "StudioExternalMediaReference"("connectionKey", "provider");
CREATE UNIQUE INDEX "StudioExternalMediaReference_projectId_provider_externalFil_key" ON "StudioExternalMediaReference"("projectId", "provider", "externalFileId");
CREATE UNIQUE INDEX "StudioExternalMediaReference_projectId_importedByUserId_cli_key" ON "StudioExternalMediaReference"("projectId", "importedByUserId", "clientRequestId");
CREATE INDEX "StudioMediaSourceRevision_projectId_sourceState_createdAt_idx" ON "StudioMediaSourceRevision"("projectId", "sourceState", "createdAt");
CREATE INDEX "StudioMediaSourceRevision_mediaAssetId_createdAt_idx" ON "StudioMediaSourceRevision"("mediaAssetId", "createdAt");
CREATE INDEX "StudioMediaSourceRevision_sourceUnitId_idx" ON "StudioMediaSourceRevision"("sourceUnitId");
CREATE UNIQUE INDEX "StudioMediaSourceRevision_projectId_identitySha256_key" ON "StudioMediaSourceRevision"("projectId", "identitySha256");
CREATE UNIQUE INDEX "StudioMediaSourceRevision_externalReferenceId_revisionKey_key" ON "StudioMediaSourceRevision"("externalReferenceId", "revisionKey");
CREATE INDEX "StudioSourceRange_projectId_createdAt_idx" ON "StudioSourceRange"("projectId", "createdAt");
CREATE UNIQUE INDEX "StudioSourceRange_sourceRevisionId_selectorSha256_key" ON "StudioSourceRange"("sourceRevisionId", "selectorSha256");
CREATE UNIQUE INDEX "StudioStoryCard_stableId_key" ON "StudioStoryCard"("stableId");
CREATE INDEX "StudioStoryCard_projectId_status_updatedAt_idx" ON "StudioStoryCard"("projectId", "status", "updatedAt");
CREATE INDEX "StudioStoryCard_sourceRangeId_idx" ON "StudioStoryCard"("sourceRangeId");
CREATE INDEX "StudioStoryCard_archivedAt_updatedAt_idx" ON "StudioStoryCard"("archivedAt", "updatedAt");
CREATE UNIQUE INDEX "StudioStoryCard_projectId_createdByUserId_clientRequestId_key" ON "StudioStoryCard"("projectId", "createdByUserId", "clientRequestId");
CREATE INDEX "StudioStoryCardRevision_actorUserId_createdAt_idx" ON "StudioStoryCardRevision"("actorUserId", "createdAt");
CREATE UNIQUE INDEX "StudioStoryCardRevision_cardId_revision_key" ON "StudioStoryCardRevision"("cardId", "revision");
CREATE UNIQUE INDEX "StudioStoryCardRevision_cardId_actorUserId_clientRequestId_key" ON "StudioStoryCardRevision"("cardId", "actorUserId", "clientRequestId");
CREATE INDEX "StudioStoryCardTagLink_tagId_createdAt_idx" ON "StudioStoryCardTagLink"("tagId", "createdAt");
CREATE INDEX "StudioStoryCardTagLink_createdByUserId_createdAt_idx" ON "StudioStoryCardTagLink"("createdByUserId", "createdAt");
CREATE INDEX "StudioStoryBoard_projectId_archivedAt_updatedAt_idx" ON "StudioStoryBoard"("projectId", "archivedAt", "updatedAt");
CREATE INDEX "StudioStoryBoard_episodeProductionId_idx" ON "StudioStoryBoard"("episodeProductionId");
CREATE UNIQUE INDEX "StudioStoryBoard_projectId_slug_key" ON "StudioStoryBoard"("projectId", "slug");
CREATE INDEX "StudioStoryBoardPlacement_boardId_groupKey_sortOrder_idx" ON "StudioStoryBoardPlacement"("boardId", "groupKey", "sortOrder");
CREATE INDEX "StudioStoryBoardPlacement_cardId_idx" ON "StudioStoryBoardPlacement"("cardId");
CREATE UNIQUE INDEX "StudioStoryBoardPlacement_boardId_cardId_key" ON "StudioStoryBoardPlacement"("boardId", "cardId");
CREATE INDEX "StudioStoryBoardOperation_actorUserId_createdAt_idx" ON "StudioStoryBoardOperation"("actorUserId", "createdAt");
CREATE UNIQUE INDEX "StudioStoryBoardOperation_boardId_revision_key" ON "StudioStoryBoardOperation"("boardId", "revision");
CREATE UNIQUE INDEX "StudioStoryBoardOperation_boardId_actorUserId_clientRequest_key" ON "StudioStoryBoardOperation"("boardId", "actorUserId", "clientRequestId");

ALTER TABLE "StudioExternalMediaReference" ADD CONSTRAINT "StudioExternalMediaReference_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "StudioProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StudioExternalMediaReference" ADD CONSTRAINT "StudioExternalMediaReference_sourceUnitId_fkey" FOREIGN KEY ("sourceUnitId") REFERENCES "StudioSourceUnit"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "StudioExternalMediaReference" ADD CONSTRAINT "StudioExternalMediaReference_importedByUserId_fkey" FOREIGN KEY ("importedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StudioMediaSourceRevision" ADD CONSTRAINT "StudioMediaSourceRevision_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "StudioProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StudioMediaSourceRevision" ADD CONSTRAINT "StudioMediaSourceRevision_externalReferenceId_fkey" FOREIGN KEY ("externalReferenceId") REFERENCES "StudioExternalMediaReference"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StudioMediaSourceRevision" ADD CONSTRAINT "StudioMediaSourceRevision_mediaAssetId_fkey" FOREIGN KEY ("mediaAssetId") REFERENCES "StudioMediaAsset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StudioMediaSourceRevision" ADD CONSTRAINT "StudioMediaSourceRevision_sourceUnitId_fkey" FOREIGN KEY ("sourceUnitId") REFERENCES "StudioSourceUnit"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "StudioMediaSourceRevision" ADD CONSTRAINT "StudioMediaSourceRevision_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StudioSourceRange" ADD CONSTRAINT "StudioSourceRange_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "StudioProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StudioSourceRange" ADD CONSTRAINT "StudioSourceRange_sourceRevisionId_fkey" FOREIGN KEY ("sourceRevisionId") REFERENCES "StudioMediaSourceRevision"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StudioSourceRange" ADD CONSTRAINT "StudioSourceRange_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StudioStoryCard" ADD CONSTRAINT "StudioStoryCard_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "StudioProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StudioStoryCard" ADD CONSTRAINT "StudioStoryCard_sourceRangeId_fkey" FOREIGN KEY ("sourceRangeId") REFERENCES "StudioSourceRange"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StudioStoryCard" ADD CONSTRAINT "StudioStoryCard_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StudioStoryCard" ADD CONSTRAINT "StudioStoryCard_updatedByUserId_fkey" FOREIGN KEY ("updatedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "StudioStoryCardRevision" ADD CONSTRAINT "StudioStoryCardRevision_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "StudioStoryCard"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StudioStoryCardRevision" ADD CONSTRAINT "StudioStoryCardRevision_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StudioStoryCardTagLink" ADD CONSTRAINT "StudioStoryCardTagLink_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "StudioStoryCard"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StudioStoryCardTagLink" ADD CONSTRAINT "StudioStoryCardTagLink_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "StudioTag"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StudioStoryCardTagLink" ADD CONSTRAINT "StudioStoryCardTagLink_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "StudioStoryBoard" ADD CONSTRAINT "StudioStoryBoard_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "StudioProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StudioStoryBoard" ADD CONSTRAINT "StudioStoryBoard_episodeProductionId_fkey" FOREIGN KEY ("episodeProductionId") REFERENCES "StudioEpisodeProduction"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "StudioStoryBoard" ADD CONSTRAINT "StudioStoryBoard_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StudioStoryBoard" ADD CONSTRAINT "StudioStoryBoard_updatedByUserId_fkey" FOREIGN KEY ("updatedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "StudioStoryBoardPlacement" ADD CONSTRAINT "StudioStoryBoardPlacement_boardId_fkey" FOREIGN KEY ("boardId") REFERENCES "StudioStoryBoard"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StudioStoryBoardPlacement" ADD CONSTRAINT "StudioStoryBoardPlacement_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "StudioStoryCard"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StudioStoryBoardPlacement" ADD CONSTRAINT "StudioStoryBoardPlacement_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StudioStoryBoardOperation" ADD CONSTRAINT "StudioStoryBoardOperation_boardId_fkey" FOREIGN KEY ("boardId") REFERENCES "StudioStoryBoard"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StudioStoryBoardOperation" ADD CONSTRAINT "StudioStoryBoardOperation_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
