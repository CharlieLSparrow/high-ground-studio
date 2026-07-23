-- Preserve provider transcript output as immutable evidence. Human and AI
-- corrections live in a separately reviewed overlay with an append-only log.
CREATE TABLE "TranscriptCorrection" (
    "id" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "transcriptJobId" TEXT NOT NULL,
    "segmentId" TEXT NOT NULL,
    "createdByUserId" TEXT NOT NULL,
    "createdByEmailSnapshot" TEXT,
    "clientRequestId" TEXT NOT NULL,
    "origin" TEXT NOT NULL DEFAULT 'human',
    "status" TEXT NOT NULL DEFAULT 'proposed',
    "baseTextSha256" TEXT NOT NULL,
    "expectedText" TEXT NOT NULL,
    "expectedSpeakerLabel" TEXT,
    "startSecondsSnapshot" DOUBLE PRECISION NOT NULL,
    "endSecondsSnapshot" DOUBLE PRECISION NOT NULL,
    "correctedText" TEXT,
    "correctedSpeakerLabel" TEXT,
    "reason" TEXT,
    "provenanceJson" JSONB NOT NULL DEFAULT '{}',
    "reviewedByUserId" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TranscriptCorrection_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TranscriptCorrectionRevision" (
    "id" TEXT NOT NULL,
    "correctionId" TEXT NOT NULL,
    "revision" INTEGER NOT NULL,
    "operation" TEXT NOT NULL,
    "actorUserId" TEXT,
    "snapshotJson" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TranscriptCorrectionRevision_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TranscriptCorrection_createdByUserId_clientRequestId_key" ON "TranscriptCorrection"("createdByUserId", "clientRequestId");
CREATE INDEX "TranscriptCorrection_roomId_status_createdAt_idx" ON "TranscriptCorrection"("roomId", "status", "createdAt");
CREATE INDEX "TranscriptCorrection_transcriptJobId_segmentId_status_updat_idx" ON "TranscriptCorrection"("transcriptJobId", "segmentId", "status", "updatedAt");
CREATE INDEX "TranscriptCorrection_reviewedByUserId_reviewedAt_idx" ON "TranscriptCorrection"("reviewedByUserId", "reviewedAt");
CREATE UNIQUE INDEX "TranscriptCorrectionRevision_correctionId_revision_key" ON "TranscriptCorrectionRevision"("correctionId", "revision");
CREATE INDEX "TranscriptCorrectionRevision_actorUserId_createdAt_idx" ON "TranscriptCorrectionRevision"("actorUserId", "createdAt");

ALTER TABLE "TranscriptCorrection" ADD CONSTRAINT "TranscriptCorrection_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "CallRoom"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TranscriptCorrection" ADD CONSTRAINT "TranscriptCorrection_segmentId_fkey" FOREIGN KEY ("segmentId") REFERENCES "TranscriptSegment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TranscriptCorrection" ADD CONSTRAINT "TranscriptCorrection_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TranscriptCorrection" ADD CONSTRAINT "TranscriptCorrection_reviewedByUserId_fkey" FOREIGN KEY ("reviewedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "TranscriptCorrectionRevision" ADD CONSTRAINT "TranscriptCorrectionRevision_correctionId_fkey" FOREIGN KEY ("correctionId") REFERENCES "TranscriptCorrection"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TranscriptCorrectionRevision" ADD CONSTRAINT "TranscriptCorrectionRevision_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
