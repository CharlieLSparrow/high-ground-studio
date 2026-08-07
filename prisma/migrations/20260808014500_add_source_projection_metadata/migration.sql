ALTER TABLE "StudioMediaSourceRevision"
ADD COLUMN "mediaProjection" TEXT NOT NULL DEFAULT 'flat',
ADD COLUMN "projectionJson" JSONB NOT NULL DEFAULT '{}';
