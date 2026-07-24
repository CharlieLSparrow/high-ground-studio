-- Keep imported source keywords separate from intentional Nest vocabulary.
-- Evidence is append-only and promotion links to a canonical StudioTag only
-- after an explicit editor review.

CREATE TYPE "StudioTagCandidateStatus" AS ENUM ('PENDING', 'PROMOTED', 'REJECTED');

CREATE TABLE "StudioTagCandidate" (
  "id" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "status" "StudioTagCandidateStatus" NOT NULL DEFAULT 'PENDING',
  "promotedTagId" TEXT,
  "reviewedByUserId" TEXT,
  "reviewedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "StudioTagCandidate_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "StudioTagCandidateEvidence" (
  "id" TEXT NOT NULL,
  "candidateId" TEXT NOT NULL,
  "fingerprint" TEXT NOT NULL,
  "sourceKind" TEXT NOT NULL,
  "sourceIdentity" TEXT NOT NULL,
  "labelSnapshot" TEXT NOT NULL,
  "provenanceJson" JSONB NOT NULL DEFAULT '{}',
  "importedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "StudioTagCandidateEvidence_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "StudioTagCandidateRevision" (
  "id" TEXT NOT NULL,
  "candidateId" TEXT NOT NULL,
  "revision" INTEGER NOT NULL,
  "operation" TEXT NOT NULL,
  "actorUserId" TEXT,
  "snapshotJson" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "StudioTagCandidateRevision_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "StudioTagCandidate_projectId_slug_key" ON "StudioTagCandidate"("projectId", "slug");
CREATE INDEX "StudioTagCandidate_projectId_status_updatedAt_idx" ON "StudioTagCandidate"("projectId", "status", "updatedAt");
CREATE INDEX "StudioTagCandidate_promotedTagId_idx" ON "StudioTagCandidate"("promotedTagId");
CREATE UNIQUE INDEX "StudioTagCandidateEvidence_candidateId_fingerprint_key" ON "StudioTagCandidateEvidence"("candidateId", "fingerprint");
CREATE INDEX "StudioTagCandidateEvidence_sourceKind_importedAt_idx" ON "StudioTagCandidateEvidence"("sourceKind", "importedAt");
CREATE UNIQUE INDEX "StudioTagCandidateRevision_candidateId_revision_key" ON "StudioTagCandidateRevision"("candidateId", "revision");
CREATE INDEX "StudioTagCandidateRevision_actorUserId_createdAt_idx" ON "StudioTagCandidateRevision"("actorUserId", "createdAt");

ALTER TABLE "StudioTagCandidate" ADD CONSTRAINT "StudioTagCandidate_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "StudioProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StudioTagCandidate" ADD CONSTRAINT "StudioTagCandidate_promotedTagId_fkey" FOREIGN KEY ("promotedTagId") REFERENCES "StudioTag"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "StudioTagCandidateEvidence" ADD CONSTRAINT "StudioTagCandidateEvidence_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "StudioTagCandidate"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StudioTagCandidateRevision" ADD CONSTRAINT "StudioTagCandidateRevision_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "StudioTagCandidate"("id") ON DELETE CASCADE ON UPDATE CASCADE;
