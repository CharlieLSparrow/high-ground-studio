-- Durable, provider-secret-free control plane for matched transcript
-- terminology experiments. Provider execution stays in an authenticated worker;
-- these rows retain intent, leases, progress, retries, and candidate bindings.
CREATE TYPE "TranscriptEvaluationRunStatus" AS ENUM (
  'QUEUED', 'PROCESSING', 'COMPLETED', 'FAILED', 'CANCELLED'
);

CREATE TYPE "TranscriptEvaluationRunWindowStatus" AS ENUM (
  'QUEUED', 'PROCESSING', 'COMPLETED', 'FAILED'
);

CREATE TABLE "TranscriptEvaluationRun" (
  "id" TEXT NOT NULL,
  "requestId" UUID NOT NULL,
  "requestSha256" TEXT NOT NULL,
  "roomId" TEXT NOT NULL,
  "requestedByUserId" TEXT NOT NULL,
  "requestedByEmailSnapshot" TEXT,
  "runKey" TEXT NOT NULL,
  "comparisonKey" TEXT NOT NULL,
  "experimentKind" TEXT NOT NULL DEFAULT 'terminology',
  "providerKey" TEXT NOT NULL,
  "providerName" TEXT NOT NULL,
  "model" TEXT NOT NULL,
  "adapterVersion" TEXT NOT NULL,
  "language" TEXT,
  "corpusRevisionSha256" TEXT NOT NULL,
  "status" "TranscriptEvaluationRunStatus" NOT NULL DEFAULT 'QUEUED',
  "requestConfigJson" JSONB NOT NULL DEFAULT '{}',
  "resultJson" JSONB NOT NULL DEFAULT '{}',
  "attemptCount" INTEGER NOT NULL DEFAULT 0,
  "maxAttempts" INTEGER NOT NULL DEFAULT 3,
  "leaseToken" UUID,
  "leaseOwner" TEXT,
  "leaseExpiresAt" TIMESTAMP(3),
  "lastHeartbeatAt" TIMESTAMP(3),
  "startedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "failedAt" TIMESTAMP(3),
  "errorCode" TEXT,
  "errorMessage" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TranscriptEvaluationRun_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TranscriptEvaluationRunWindow" (
  "id" TEXT NOT NULL,
  "runId" TEXT NOT NULL,
  "windowId" TEXT NOT NULL,
  "ordinal" INTEGER NOT NULL,
  "status" "TranscriptEvaluationRunWindowStatus" NOT NULL DEFAULT 'QUEUED',
  "baselineRunKey" TEXT NOT NULL,
  "terminologyRunKey" TEXT NOT NULL,
  "baselineCandidateId" TEXT,
  "terminologyCandidateId" TEXT,
  "derivativeSha256" TEXT,
  "startedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "failedAt" TIMESTAMP(3),
  "errorCode" TEXT,
  "errorMessage" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TranscriptEvaluationRunWindow_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TranscriptEvalRun_run_key" ON "TranscriptEvaluationRun"("runKey");
CREATE UNIQUE INDEX "TranscriptEvalRun_comparison_key" ON "TranscriptEvaluationRun"("comparisonKey");
CREATE UNIQUE INDEX "TranscriptEvalRun_requester_request_key" ON "TranscriptEvaluationRun"("requestedByUserId", "requestId");
CREATE INDEX "TranscriptEvalRun_room_created_idx" ON "TranscriptEvaluationRun"("roomId", "createdAt");
CREATE INDEX "TranscriptEvalRun_claim_idx" ON "TranscriptEvaluationRun"("status", "leaseExpiresAt", "createdAt");
CREATE INDEX "TranscriptEvalRun_requester_created_idx" ON "TranscriptEvaluationRun"("requestedByUserId", "createdAt");

CREATE UNIQUE INDEX "TranscriptEvalRunWindow_baseline_key" ON "TranscriptEvaluationRunWindow"("baselineRunKey");
CREATE UNIQUE INDEX "TranscriptEvalRunWindow_term_key" ON "TranscriptEvaluationRunWindow"("terminologyRunKey");
CREATE UNIQUE INDEX "TranscriptEvalRunWindow_run_window_key" ON "TranscriptEvaluationRunWindow"("runId", "windowId");
CREATE UNIQUE INDEX "TranscriptEvalRunWindow_run_ordinal_key" ON "TranscriptEvaluationRunWindow"("runId", "ordinal");
CREATE INDEX "TranscriptEvalRunWindow_window_created_idx" ON "TranscriptEvaluationRunWindow"("windowId", "createdAt");
CREATE INDEX "TranscriptEvalRunWindow_status_idx" ON "TranscriptEvaluationRunWindow"("runId", "status", "ordinal");

ALTER TABLE "TranscriptEvaluationRun"
  ADD CONSTRAINT "TranscriptEvalRun_room_fkey"
  FOREIGN KEY ("roomId") REFERENCES "CallRoom"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TranscriptEvaluationRun"
  ADD CONSTRAINT "TranscriptEvalRun_requester_fkey"
  FOREIGN KEY ("requestedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TranscriptEvaluationRunWindow"
  ADD CONSTRAINT "TranscriptEvalRunWindow_run_fkey"
  FOREIGN KEY ("runId") REFERENCES "TranscriptEvaluationRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TranscriptEvaluationRunWindow"
  ADD CONSTRAINT "TranscriptEvalRunWindow_window_fkey"
  FOREIGN KEY ("windowId") REFERENCES "TranscriptEvaluationWindow"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TranscriptEvaluationRunWindow"
  ADD CONSTRAINT "TranscriptEvalRunWindow_baseline_candidate_fkey"
  FOREIGN KEY ("baselineCandidateId") REFERENCES "TranscriptEvaluationCandidate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TranscriptEvaluationRunWindow"
  ADD CONSTRAINT "TranscriptEvalRunWindow_term_candidate_fkey"
  FOREIGN KEY ("terminologyCandidateId") REFERENCES "TranscriptEvaluationCandidate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
