-- CreateTable
CREATE TABLE "StudioMediaDerivative" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "sourceRevisionId" TEXT NOT NULL,
    "workflowJobId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "profile" TEXT NOT NULL,
    "storageProvider" TEXT NOT NULL,
    "locator" TEXT NOT NULL,
    "generation" TEXT NOT NULL,
    "contentSha256" TEXT NOT NULL,
    "sizeBytes" BIGINT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "durationSeconds" DOUBLE PRECISION,
    "widthPixels" INTEGER,
    "heightPixels" INTEGER,
    "framesPerSecond" DOUBLE PRECISION,
    "status" TEXT NOT NULL DEFAULT 'ready',
    "verificationJson" JSONB NOT NULL DEFAULT '{}',
    "provenanceJson" JSONB NOT NULL DEFAULT '{}',
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StudioMediaDerivative_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "StudioMediaDerivative_workflowJobId_key" ON "StudioMediaDerivative"("workflowJobId");
CREATE UNIQUE INDEX "StudioMediaDerivative_sourceRevisionId_kind_profile_generation_key" ON "StudioMediaDerivative"("sourceRevisionId", "kind", "profile", "generation");
CREATE INDEX "StudioMediaDerivative_projectId_kind_createdAt_idx" ON "StudioMediaDerivative"("projectId", "kind", "createdAt");
CREATE INDEX "StudioMediaDerivative_sourceRevisionId_status_createdAt_idx" ON "StudioMediaDerivative"("sourceRevisionId", "status", "createdAt");

ALTER TABLE "StudioMediaDerivative" ADD CONSTRAINT "StudioMediaDerivative_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "StudioProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StudioMediaDerivative" ADD CONSTRAINT "StudioMediaDerivative_sourceRevisionId_fkey" FOREIGN KEY ("sourceRevisionId") REFERENCES "StudioMediaSourceRevision"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StudioMediaDerivative" ADD CONSTRAINT "StudioMediaDerivative_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
