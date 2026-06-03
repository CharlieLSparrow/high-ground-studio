CREATE TABLE IF NOT EXISTS "StudioEpisodeProduction" (
  "id" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "documentId" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "boundaryLabel" TEXT NOT NULL,
  "boundaryKind" TEXT NOT NULL DEFAULT 'episode',
  "boundaryStartBlockId" TEXT,
  "boundaryEndBlockId" TEXT,
  "boundaryStartOrder" INTEGER,
  "boundaryEndOrder" INTEGER,
  "status" TEXT NOT NULL DEFAULT 'draft',
  "recordingRoomJson" JSONB,
  "timelineJson" JSONB,
  "transcriptJson" JSONB,
  "productionJson" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "StudioEpisodeProduction_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "StudioEpisodeProduction_projectId_slug_key"
  ON "StudioEpisodeProduction"("projectId", "slug");

CREATE INDEX IF NOT EXISTS "StudioEpisodeProduction_documentId_idx"
  ON "StudioEpisodeProduction"("documentId");

CREATE INDEX IF NOT EXISTS "StudioEpisodeProduction_projectId_boundaryKind_idx"
  ON "StudioEpisodeProduction"("projectId", "boundaryKind");

CREATE INDEX IF NOT EXISTS "StudioEpisodeProduction_projectId_status_updatedAt_idx"
  ON "StudioEpisodeProduction"("projectId", "status", "updatedAt");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'StudioEpisodeProduction_projectId_fkey'
  ) THEN
    ALTER TABLE "StudioEpisodeProduction"
      ADD CONSTRAINT "StudioEpisodeProduction_projectId_fkey"
      FOREIGN KEY ("projectId") REFERENCES "StudioProject"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'StudioEpisodeProduction_documentId_fkey'
  ) THEN
    ALTER TABLE "StudioEpisodeProduction"
      ADD CONSTRAINT "StudioEpisodeProduction_documentId_fkey"
      FOREIGN KEY ("documentId") REFERENCES "StudioDocument"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
