CREATE TABLE "StudioTranscriptTerminologyTerm" (
  "id" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "canonicalText" TEXT NOT NULL,
  "normalizedText" TEXT NOT NULL,
  "aliasesJson" JSONB NOT NULL DEFAULT '[]',
  "category" TEXT NOT NULL DEFAULT 'general',
  "pronunciationHint" TEXT,
  "contextHint" TEXT,
  "priority" INTEGER NOT NULL DEFAULT 50,
  "status" TEXT NOT NULL DEFAULT 'active',
  "currentRevision" INTEGER NOT NULL DEFAULT 1,
  "createdByUserId" TEXT,
  "createdByEmailSnapshot" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "StudioTranscriptTerminologyTerm_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "StudioTranscriptTerminologyRevision" (
  "id" TEXT NOT NULL,
  "termId" TEXT NOT NULL,
  "revision" INTEGER NOT NULL,
  "operation" TEXT NOT NULL,
  "actorUserId" TEXT,
  "actorEmailSnapshot" TEXT,
  "snapshotJson" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "StudioTranscriptTerminologyRevision_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "StudioTranscriptTerminologyCandidate" (
  "id" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "sourceCorrectionId" TEXT,
  "sourceTranscriptJobId" TEXT,
  "proposedCanonicalText" TEXT NOT NULL,
  "normalizedText" TEXT NOT NULL,
  "aliasesJson" JSONB NOT NULL DEFAULT '[]',
  "category" TEXT NOT NULL DEFAULT 'general',
  "pronunciationHint" TEXT,
  "contextHint" TEXT,
  "priority" INTEGER NOT NULL DEFAULT 50,
  "status" TEXT NOT NULL DEFAULT 'proposed',
  "evidenceJson" JSONB NOT NULL DEFAULT '{}',
  "createdByUserId" TEXT,
  "createdByEmailSnapshot" TEXT,
  "decidedByUserId" TEXT,
  "decidedByEmailSnapshot" TEXT,
  "decisionNote" TEXT,
  "acceptedTermId" TEXT,
  "decidedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "StudioTranscriptTerminologyCandidate_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "StudioTranscriptTerminologyTerm_projectId_normalizedText_key" ON "StudioTranscriptTerminologyTerm"("projectId", "normalizedText");
CREATE INDEX "StudioTranscriptTerminologyTerm_projectId_status_priority_updatedAt_idx" ON "StudioTranscriptTerminologyTerm"("projectId", "status", "priority", "updatedAt");
CREATE INDEX "StudioTranscriptTerminologyTerm_createdByUserId_createdAt_idx" ON "StudioTranscriptTerminologyTerm"("createdByUserId", "createdAt");
CREATE UNIQUE INDEX "StudioTranscriptTerminologyRevision_termId_revision_key" ON "StudioTranscriptTerminologyRevision"("termId", "revision");
CREATE INDEX "StudioTranscriptTerminologyRevision_actorUserId_createdAt_idx" ON "StudioTranscriptTerminologyRevision"("actorUserId", "createdAt");
CREATE UNIQUE INDEX "StudioTranscriptTerminologyCandidate_projectId_sourceCorrectionId_key" ON "StudioTranscriptTerminologyCandidate"("projectId", "sourceCorrectionId");
CREATE INDEX "StudioTranscriptTerminologyCandidate_projectId_status_createdAt_idx" ON "StudioTranscriptTerminologyCandidate"("projectId", "status", "createdAt");
CREATE INDEX "StudioTranscriptTerminologyCandidate_sourceTranscriptJobId_status_idx" ON "StudioTranscriptTerminologyCandidate"("sourceTranscriptJobId", "status");
CREATE INDEX "StudioTranscriptTerminologyCandidate_decidedByUserId_decidedAt_idx" ON "StudioTranscriptTerminologyCandidate"("decidedByUserId", "decidedAt");
CREATE INDEX "StudioTranscriptTerminologyCandidate_acceptedTermId_idx" ON "StudioTranscriptTerminologyCandidate"("acceptedTermId");

ALTER TABLE "StudioTranscriptTerminologyTerm" ADD CONSTRAINT "StudioTranscriptTerminologyTerm_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "StudioProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StudioTranscriptTerminologyTerm" ADD CONSTRAINT "StudioTranscriptTerminologyTerm_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "StudioTranscriptTerminologyRevision" ADD CONSTRAINT "StudioTranscriptTerminologyRevision_termId_fkey" FOREIGN KEY ("termId") REFERENCES "StudioTranscriptTerminologyTerm"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StudioTranscriptTerminologyRevision" ADD CONSTRAINT "StudioTranscriptTerminologyRevision_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "StudioTranscriptTerminologyCandidate" ADD CONSTRAINT "StudioTranscriptTerminologyCandidate_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "StudioProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StudioTranscriptTerminologyCandidate" ADD CONSTRAINT "StudioTranscriptTerminologyCandidate_sourceCorrectionId_fkey" FOREIGN KEY ("sourceCorrectionId") REFERENCES "TranscriptCorrection"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "StudioTranscriptTerminologyCandidate" ADD CONSTRAINT "StudioTranscriptTerminologyCandidate_sourceTranscriptJobId_fkey" FOREIGN KEY ("sourceTranscriptJobId") REFERENCES "TranscriptJob"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "StudioTranscriptTerminologyCandidate" ADD CONSTRAINT "StudioTranscriptTerminologyCandidate_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "StudioTranscriptTerminologyCandidate" ADD CONSTRAINT "StudioTranscriptTerminologyCandidate_decidedByUserId_fkey" FOREIGN KEY ("decidedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "StudioTranscriptTerminologyCandidate" ADD CONSTRAINT "StudioTranscriptTerminologyCandidate_acceptedTermId_fkey" FOREIGN KEY ("acceptedTermId") REFERENCES "StudioTranscriptTerminologyTerm"("id") ON DELETE SET NULL ON UPDATE CASCADE;
