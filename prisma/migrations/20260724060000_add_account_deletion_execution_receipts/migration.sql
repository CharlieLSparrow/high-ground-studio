-- A deletion request must survive deletion of the account it describes.
ALTER TYPE "UserAccountDeletionRequestStatus" ADD VALUE IF NOT EXISTS 'EXECUTING';
ALTER TYPE "UserAccountDeletionRequestStatus" ADD VALUE IF NOT EXISTS 'FAILED';

CREATE TYPE "UserAccountDeletionExecutionStatus" AS ENUM (
  'RUNNING',
  'SUCCEEDED',
  'FAILED'
);

ALTER TABLE "UserAccountDeletionRequest"
  ALTER COLUMN "userId" DROP NOT NULL,
  ALTER COLUMN "emailSnapshot" DROP NOT NULL,
  ADD COLUMN "executionStartedAt" TIMESTAMP(3),
  ADD COLUMN "failedAt" TIMESTAMP(3),
  ADD COLUMN "executionReceiptJson" JSONB,
  ADD COLUMN "lastFailureJson" JSONB;

ALTER TABLE "UserAccountDeletionRequest"
  DROP CONSTRAINT "UserAccountDeletionRequest_userId_fkey";

ALTER TABLE "UserAccountDeletionRequest"
  ADD CONSTRAINT "UserAccountDeletionRequest_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "UserAccountDeletionExecution" (
  "id" TEXT NOT NULL,
  "requestId" TEXT NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "status" "UserAccountDeletionExecutionStatus" NOT NULL DEFAULT 'RUNNING',
  "executorVersion" TEXT NOT NULL,
  "policyVersion" TEXT NOT NULL,
  "inventoryJson" JSONB NOT NULL,
  "planJson" JSONB NOT NULL,
  "progressJson" JSONB NOT NULL DEFAULT '{}',
  "receiptJson" JSONB,
  "failureJson" JSONB,
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "finishedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "UserAccountDeletionExecution_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "UserAccountDeletionExecution_idempotencyKey_key"
  ON "UserAccountDeletionExecution"("idempotencyKey");
CREATE INDEX "UserAccountDeletionExecution_requestId_startedAt_idx"
  ON "UserAccountDeletionExecution"("requestId", "startedAt");
CREATE INDEX "UserAccountDeletionExecution_status_startedAt_idx"
  ON "UserAccountDeletionExecution"("status", "startedAt");

ALTER TABLE "UserAccountDeletionExecution"
  ADD CONSTRAINT "UserAccountDeletionExecution_requestId_fkey"
  FOREIGN KEY ("requestId") REFERENCES "UserAccountDeletionRequest"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- Existing legacy COMPLETED rows are intentionally not treated as verified
-- executor receipts. NOT VALID leaves them inspectable while enforcing the
-- invariant on every future insert or update.
ALTER TABLE "UserAccountDeletionRequest"
  ADD CONSTRAINT "UserAccountDeletionRequest_completed_requires_receipt"
  CHECK (
    "status" <> 'COMPLETED'
    OR (
      "userId" IS NULL
      AND "completedAt" IS NOT NULL
      AND "executionReceiptJson"->>'outcome' = 'completed'
    )
  ) NOT VALID;
