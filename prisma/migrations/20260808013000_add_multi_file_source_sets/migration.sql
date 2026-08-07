CREATE TABLE "StudioMediaSourceSet" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "captureKey" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "identitySha256" TEXT NOT NULL,
    "sourceClockRevisionId" TEXT NOT NULL,
    "completeness" TEXT NOT NULL DEFAULT 'complete',
    "metadataJson" JSONB NOT NULL DEFAULT '{}',
    "clientRequestId" TEXT NOT NULL,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "StudioMediaSourceSet_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "StudioMediaSourceSetMember" (
    "id" TEXT NOT NULL,
    "sourceSetId" TEXT NOT NULL,
    "sourceRevisionId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "ordinal" INTEGER NOT NULL DEFAULT 0,
    "requiredForRender" BOOLEAN NOT NULL DEFAULT true,
    "memberIdentitySha256" TEXT NOT NULL,
    "metadataJson" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "StudioMediaSourceSetMember_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "StudioSourceRange" ADD COLUMN "sourceSetId" TEXT;

CREATE UNIQUE INDEX "StudioMediaSourceSet_projectId_identitySha256_key" ON "StudioMediaSourceSet"("projectId", "identitySha256");
CREATE UNIQUE INDEX "StudioMediaSourceSet_projectId_createdByUserId_clientRequestId_key" ON "StudioMediaSourceSet"("projectId", "createdByUserId", "clientRequestId");
CREATE INDEX "StudioMediaSourceSet_projectId_captureKey_createdAt_idx" ON "StudioMediaSourceSet"("projectId", "captureKey", "createdAt");
CREATE INDEX "StudioMediaSourceSet_sourceClockRevisionId_idx" ON "StudioMediaSourceSet"("sourceClockRevisionId");
CREATE UNIQUE INDEX "StudioMediaSourceSetMember_sourceSetId_sourceRevisionId_key" ON "StudioMediaSourceSetMember"("sourceSetId", "sourceRevisionId");
CREATE UNIQUE INDEX "StudioMediaSourceSetMember_sourceSetId_role_ordinal_key" ON "StudioMediaSourceSetMember"("sourceSetId", "role", "ordinal");
CREATE INDEX "StudioMediaSourceSetMember_sourceRevisionId_idx" ON "StudioMediaSourceSetMember"("sourceRevisionId");
CREATE INDEX "StudioSourceRange_sourceSetId_idx" ON "StudioSourceRange"("sourceSetId");

ALTER TABLE "StudioMediaSourceSet" ADD CONSTRAINT "StudioMediaSourceSet_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "StudioProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StudioMediaSourceSet" ADD CONSTRAINT "StudioMediaSourceSet_sourceClockRevisionId_fkey" FOREIGN KEY ("sourceClockRevisionId") REFERENCES "StudioMediaSourceRevision"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StudioMediaSourceSet" ADD CONSTRAINT "StudioMediaSourceSet_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StudioMediaSourceSetMember" ADD CONSTRAINT "StudioMediaSourceSetMember_sourceSetId_fkey" FOREIGN KEY ("sourceSetId") REFERENCES "StudioMediaSourceSet"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StudioMediaSourceSetMember" ADD CONSTRAINT "StudioMediaSourceSetMember_sourceRevisionId_fkey" FOREIGN KEY ("sourceRevisionId") REFERENCES "StudioMediaSourceRevision"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StudioSourceRange" ADD CONSTRAINT "StudioSourceRange_sourceSetId_fkey" FOREIGN KEY ("sourceSetId") REFERENCES "StudioMediaSourceSet"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
