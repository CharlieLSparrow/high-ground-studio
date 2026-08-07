CREATE TABLE "StudioStoryTimelinePlacement" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "episodeProductionId" TEXT NOT NULL,
    "cardId" TEXT NOT NULL,
    "sourceRangeId" TEXT NOT NULL,
    "originBoardId" TEXT,
    "originBoardPlacementId" TEXT,
    "clipId" TEXT NOT NULL,
    "trackId" TEXT NOT NULL,
    "episodeStartSeconds" DOUBLE PRECISION NOT NULL,
    "durationSeconds" DOUBLE PRECISION NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "revision" INTEGER NOT NULL DEFAULT 1,
    "timelineFingerprintBeforeSha256" TEXT NOT NULL,
    "timelineFingerprintAfterSha256" TEXT NOT NULL,
    "sourceSnapshotJson" JSONB NOT NULL,
    "timelineClipJson" JSONB NOT NULL,
    "clientRequestId" TEXT NOT NULL,
    "createdByUserId" TEXT NOT NULL,
    "createdByEmail" TEXT NOT NULL,
    "updatedByUserId" TEXT,
    "withdrawnAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "StudioStoryTimelinePlacement_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "StudioStoryTimelinePlacement_clock_check" CHECK ("episodeStartSeconds" >= 0 AND "durationSeconds" >= 0.05),
    CONSTRAINT "StudioStoryTimelinePlacement_status_check" CHECK ("status" IN ('active', 'withdrawn')),
    CONSTRAINT "StudioStoryTimelinePlacement_revision_check" CHECK ("revision" >= 1),
    CONSTRAINT "StudioStoryTimelinePlacement_fingerprint_check" CHECK (
      "timelineFingerprintBeforeSha256" ~ '^[0-9a-f]{64}$'
      AND "timelineFingerprintAfterSha256" ~ '^[0-9a-f]{64}$'
    )
);

CREATE TABLE "StudioStoryTimelinePlacementOperation" (
    "id" TEXT NOT NULL,
    "placementId" TEXT NOT NULL,
    "revision" INTEGER NOT NULL,
    "previousRevision" INTEGER NOT NULL,
    "operation" TEXT NOT NULL,
    "actorUserId" TEXT NOT NULL,
    "clientRequestId" TEXT NOT NULL,
    "requestSha256" TEXT NOT NULL,
    "snapshotJson" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "StudioStoryTimelinePlacementOperation_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "StudioStoryTimelinePlacementOperation_revision_check" CHECK ("revision" >= 1 AND "previousRevision" >= 0 AND "revision" > "previousRevision"),
    CONSTRAINT "StudioStoryTimelinePlacementOperation_kind_check" CHECK ("operation" IN ('promote', 'withdraw')),
    CONSTRAINT "StudioStoryTimelinePlacementOperation_request_check" CHECK ("requestSha256" ~ '^[0-9a-f]{64}$')
);

CREATE INDEX "StudioStoryTimelinePlacement_projectId_status_updatedAt_idx" ON "StudioStoryTimelinePlacement"("projectId", "status", "updatedAt");
CREATE INDEX "StudioStoryTimelinePlacement_episodeProductionId_status_epi_idx" ON "StudioStoryTimelinePlacement"("episodeProductionId", "status", "episodeStartSeconds");
CREATE INDEX "StudioStoryTimelinePlacement_cardId_status_updatedAt_idx" ON "StudioStoryTimelinePlacement"("cardId", "status", "updatedAt");
CREATE INDEX "StudioStoryTimelinePlacement_sourceRangeId_idx" ON "StudioStoryTimelinePlacement"("sourceRangeId");
CREATE INDEX "StudioStoryTimelinePlacement_originBoardId_idx" ON "StudioStoryTimelinePlacement"("originBoardId");
CREATE INDEX "StudioStoryTimelinePlacement_originBoardPlacementId_idx" ON "StudioStoryTimelinePlacement"("originBoardPlacementId");
CREATE UNIQUE INDEX "StudioStoryTimelinePlacement_episodeProductionId_clipId_key" ON "StudioStoryTimelinePlacement"("episodeProductionId", "clipId");
CREATE UNIQUE INDEX "StudioStoryTimelinePlacement_episode_actor_request_key" ON "StudioStoryTimelinePlacement"("episodeProductionId", "createdByUserId", "clientRequestId");
CREATE INDEX "StudioStoryTimelinePlacementOperation_actorUserId_createdAt_idx" ON "StudioStoryTimelinePlacementOperation"("actorUserId", "createdAt");
CREATE UNIQUE INDEX "StudioStoryTimelinePlacementOperation_placementId_revision_key" ON "StudioStoryTimelinePlacementOperation"("placementId", "revision");
CREATE UNIQUE INDEX "StudioStoryTimelinePlacementOperation_placementId_actorUser_key" ON "StudioStoryTimelinePlacementOperation"("placementId", "actorUserId", "clientRequestId");

ALTER TABLE "StudioStoryTimelinePlacement" ADD CONSTRAINT "StudioStoryTimelinePlacement_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "StudioProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StudioStoryTimelinePlacement" ADD CONSTRAINT "StudioStoryTimelinePlacement_episodeProductionId_fkey" FOREIGN KEY ("episodeProductionId") REFERENCES "StudioEpisodeProduction"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StudioStoryTimelinePlacement" ADD CONSTRAINT "StudioStoryTimelinePlacement_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "StudioStoryCard"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StudioStoryTimelinePlacement" ADD CONSTRAINT "StudioStoryTimelinePlacement_sourceRangeId_fkey" FOREIGN KEY ("sourceRangeId") REFERENCES "StudioSourceRange"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StudioStoryTimelinePlacement" ADD CONSTRAINT "StudioStoryTimelinePlacement_originBoardId_fkey" FOREIGN KEY ("originBoardId") REFERENCES "StudioStoryBoard"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "StudioStoryTimelinePlacement" ADD CONSTRAINT "StudioStoryTimelinePlacement_originBoardPlacementId_fkey" FOREIGN KEY ("originBoardPlacementId") REFERENCES "StudioStoryBoardPlacement"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "StudioStoryTimelinePlacement" ADD CONSTRAINT "StudioStoryTimelinePlacement_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StudioStoryTimelinePlacement" ADD CONSTRAINT "StudioStoryTimelinePlacement_updatedByUserId_fkey" FOREIGN KEY ("updatedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "StudioStoryTimelinePlacementOperation" ADD CONSTRAINT "StudioStoryTimelinePlacementOperation_placementId_fkey" FOREIGN KEY ("placementId") REFERENCES "StudioStoryTimelinePlacement"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StudioStoryTimelinePlacementOperation" ADD CONSTRAINT "StudioStoryTimelinePlacementOperation_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
