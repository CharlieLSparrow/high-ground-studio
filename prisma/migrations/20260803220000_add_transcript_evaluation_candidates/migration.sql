CREATE TABLE "TranscriptProviderPolicyReceipt" (
    "id" TEXT NOT NULL,
    "receiptSha256" TEXT NOT NULL,
    "providerKey" TEXT NOT NULL,
    "capturedByUserId" TEXT NOT NULL,
    "capturedByEmailSnapshot" TEXT,
    "policyJson" JSONB NOT NULL,
    "capturedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TranscriptProviderPolicyReceipt_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TranscriptEvaluationCandidate" (
    "id" TEXT NOT NULL,
    "windowId" TEXT NOT NULL,
    "policyReceiptId" TEXT NOT NULL,
    "submittedByUserId" TEXT NOT NULL,
    "submittedByEmailSnapshot" TEXT,
    "clientRequestId" TEXT NOT NULL,
    "runKey" TEXT NOT NULL,
    "candidateKeySha256" TEXT NOT NULL,
    "windowKeySha256Snapshot" TEXT NOT NULL,
    "sourceSha256Snapshot" TEXT NOT NULL,
    "referenceContentSha256" TEXT NOT NULL,
    "providerKey" TEXT NOT NULL,
    "providerName" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "adapterVersion" TEXT NOT NULL,
    "requestConfigSha256" TEXT NOT NULL,
    "requestConfigJson" JSONB NOT NULL,
    "speakerAttribution" TEXT NOT NULL,
    "timingGranularity" TEXT NOT NULL,
    "outcome" TEXT NOT NULL,
    "providerRequestId" TEXT,
    "providerReceiptSha256" TEXT,
    "rawResponseSha256" TEXT NOT NULL,
    "rawResponseJson" JSONB NOT NULL,
    "normalizedWordsJson" JSONB NOT NULL,
    "metricsJson" JSONB,
    "elapsedMilliseconds" INTEGER NOT NULL,
    "estimatedCostUsd" DOUBLE PRECISION,
    "errorCode" TEXT,
    "retryable" BOOLEAN,
    "completedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TranscriptEvaluationCandidate_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TranscriptEvaluationCorrectionObservation" (
    "id" TEXT NOT NULL,
    "candidateId" TEXT NOT NULL,
    "reviewerUserId" TEXT NOT NULL,
    "reviewerEmailSnapshot" TEXT,
    "clientRequestId" TEXT NOT NULL,
    "candidateKeySha256" TEXT NOT NULL,
    "referenceContentSha256" TEXT NOT NULL,
    "elapsedMilliseconds" INTEGER NOT NULL,
    "operationCount" INTEGER NOT NULL,
    "observationJson" JSONB NOT NULL,
    "observedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TranscriptEvaluationCorrectionObservation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TranscriptProviderPolicy_sha_key"
ON "TranscriptProviderPolicyReceipt"("receiptSha256");

CREATE INDEX "TranscriptProviderPolicy_provider_idx"
ON "TranscriptProviderPolicyReceipt"("providerKey", "capturedAt");

CREATE UNIQUE INDEX "TranscriptEvalCandidate_key_sha_key"
ON "TranscriptEvaluationCandidate"("candidateKeySha256");

CREATE UNIQUE INDEX "TranscriptEvalCandidate_actor_request_key"
ON "TranscriptEvaluationCandidate"("submittedByUserId", "clientRequestId");

CREATE UNIQUE INDEX "TranscriptEvalCandidate_window_run_key"
ON "TranscriptEvaluationCandidate"("windowId", "runKey");

CREATE INDEX "TranscriptEvalCandidate_window_created_idx"
ON "TranscriptEvaluationCandidate"("windowId", "createdAt");

CREATE INDEX "TranscriptEvalCandidate_provider_model_idx"
ON "TranscriptEvaluationCandidate"("providerKey", "model", "createdAt");

CREATE UNIQUE INDEX "TranscriptEvalCorrection_reviewer_request_key"
ON "TranscriptEvaluationCorrectionObservation"("reviewerUserId", "clientRequestId");

CREATE INDEX "TranscriptEvalCorrection_candidate_idx"
ON "TranscriptEvaluationCorrectionObservation"("candidateId", "observedAt");

ALTER TABLE "TranscriptProviderPolicyReceipt"
ADD CONSTRAINT "TranscriptProviderPolicy_actor_fkey"
FOREIGN KEY ("capturedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "TranscriptEvaluationCandidate"
ADD CONSTRAINT "TranscriptEvalCandidate_window_fkey"
FOREIGN KEY ("windowId") REFERENCES "TranscriptEvaluationWindow"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "TranscriptEvaluationCandidate"
ADD CONSTRAINT "TranscriptEvalCandidate_policy_fkey"
FOREIGN KEY ("policyReceiptId") REFERENCES "TranscriptProviderPolicyReceipt"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "TranscriptEvaluationCandidate"
ADD CONSTRAINT "TranscriptEvalCandidate_actor_fkey"
FOREIGN KEY ("submittedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "TranscriptEvaluationCorrectionObservation"
ADD CONSTRAINT "TranscriptEvalCorrection_candidate_fkey"
FOREIGN KEY ("candidateId") REFERENCES "TranscriptEvaluationCandidate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "TranscriptEvaluationCorrectionObservation"
ADD CONSTRAINT "TranscriptEvalCorrection_reviewer_fkey"
FOREIGN KEY ("reviewerUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
