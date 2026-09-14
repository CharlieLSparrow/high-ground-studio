CREATE TABLE "SessionFollowThroughAnalysis" (
    "roomId" TEXT NOT NULL,
    "sourceFingerprint" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "leaseId" TEXT,
    "leaseUntil" TIMESTAMP(3),
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" TIMESTAMP(3),
    "resultJson" JSONB,
    "errorCode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "SessionFollowThroughAnalysis_pkey" PRIMARY KEY ("roomId"),
    CONSTRAINT "SessionFollowThroughAnalysis_roomId_fkey" FOREIGN KEY ("roomId")
      REFERENCES "CallRoom"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "SessionFollowThroughAnalysis_status_nextAttemptAt_idx"
    ON "SessionFollowThroughAnalysis"("status", "nextAttemptAt");
