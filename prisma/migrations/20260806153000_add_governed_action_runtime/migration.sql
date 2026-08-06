-- One provider-neutral action ledger now owns user-visible automation across
-- writing, Sessions, future API clients, and scheduled agents. Domain rows
-- remain the source of truth; these rows preserve authority, intent, attempts,
-- consequence, receipts, and recovery evidence.
CREATE TYPE "GovernedPrincipalKind" AS ENUM ('USER', 'SERVICE', 'SCHEDULED_AGENT', 'API_CLIENT');
CREATE TYPE "GovernedActionDecisionPolicy" AS ENUM ('READ_ONLY', 'USER_INITIATED', 'EXPLICIT_APPROVAL', 'DELEGATED');
CREATE TYPE "GovernedActionRiskLevel" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');
CREATE TYPE "GovernedActionRunStatus" AS ENUM ('AWAITING_DECISION', 'READY', 'EXECUTING', 'SUCCEEDED', 'FAILED', 'PARTIAL', 'CANCELED', 'BLOCKED');
CREATE TYPE "GovernedActionStatus" AS ENUM ('PROPOSED', 'READY', 'EXECUTING', 'SUCCEEDED', 'FAILED', 'REJECTED', 'UNDONE', 'SUPERSEDED', 'BLOCKED');
CREATE TYPE "GovernedActionDecisionStatus" AS ENUM ('PENDING', 'NOT_REQUIRED', 'APPROVED', 'REJECTED', 'REVOKED');
CREATE TYPE "GovernedActionAttemptStatus" AS ENUM ('RUNNING', 'SUCCEEDED', 'FAILED', 'BLOCKED');
CREATE TYPE "GovernedActionReceiptKind" AS ENUM ('PROPOSAL_RECORDED', 'DECISION_RECORDED', 'EXECUTION_STARTED', 'EXECUTION_SUCCEEDED', 'EXECUTION_FAILED', 'RECOVERY_COMPLETED', 'SUPERSEDED', 'READBACK_VERIFIED');

CREATE TABLE "GovernedActionRun" (
    "id" TEXT NOT NULL,
    "projectId" TEXT,
    "roomId" TEXT,
    "requestedByUserId" TEXT NOT NULL,
    "requestedByEmail" TEXT NOT NULL,
    "principalKind" "GovernedPrincipalKind" NOT NULL,
    "principalId" TEXT NOT NULL,
    "sourceSurface" TEXT NOT NULL,
    "intent" TEXT NOT NULL,
    "decisionPolicy" "GovernedActionDecisionPolicy" NOT NULL,
    "riskLevel" "GovernedActionRiskLevel" NOT NULL,
    "status" "GovernedActionRunStatus" NOT NULL,
    "authorityJson" JSONB NOT NULL DEFAULT '{}',
    "budgetJson" JSONB NOT NULL DEFAULT '{}',
    "readSetJson" JSONB NOT NULL DEFAULT '[]',
    "consequenceJson" JSONB NOT NULL DEFAULT '{}',
    "progressJson" JSONB NOT NULL DEFAULT '{}',
    "summaryJson" JSONB NOT NULL DEFAULT '{}',
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GovernedActionRun_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "GovernedAction" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "requestId" UUID NOT NULL,
    "capabilityId" TEXT NOT NULL,
    "capabilityVersion" INTEGER NOT NULL,
    "actionKind" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "explanation" TEXT,
    "payloadJson" JSONB NOT NULL,
    "payloadSha256" TEXT NOT NULL,
    "requestSha256" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "decisionPolicy" "GovernedActionDecisionPolicy" NOT NULL,
    "decisionStatus" "GovernedActionDecisionStatus" NOT NULL,
    "riskLevel" "GovernedActionRiskLevel" NOT NULL,
    "status" "GovernedActionStatus" NOT NULL,
    "consequenceJson" JSONB NOT NULL DEFAULT '{}',
    "recoveryJson" JSONB NOT NULL DEFAULT '{}',
    "resultJson" JSONB NOT NULL DEFAULT '{}',
    "approvedByUserId" TEXT,
    "approvedByEmail" TEXT,
    "approvedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GovernedAction_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "GovernedActionAttempt" (
    "id" TEXT NOT NULL,
    "actionId" TEXT NOT NULL,
    "attemptNumber" INTEGER NOT NULL,
    "executorKind" TEXT NOT NULL,
    "status" "GovernedActionAttemptStatus" NOT NULL,
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "evidenceJson" JSONB NOT NULL DEFAULT '{}',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GovernedActionAttempt_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "GovernedActionReceipt" (
    "id" TEXT NOT NULL,
    "actionId" TEXT NOT NULL,
    "attemptId" TEXT,
    "kind" "GovernedActionReceiptKind" NOT NULL,
    "previousStatus" "GovernedActionStatus",
    "newStatus" "GovernedActionStatus" NOT NULL,
    "actorUserId" TEXT,
    "actorEmail" TEXT,
    "evidenceJson" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GovernedActionReceipt_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "StudioAssistantAction" ADD COLUMN "governedActionId" TEXT;
ALTER TABLE "CallParticipantPreflightReceipt" ADD COLUMN "governedActionId" TEXT;

CREATE UNIQUE INDEX "GovernedAction_requestId_key" ON "GovernedAction"("requestId");
CREATE UNIQUE INDEX "GovernedAction_runId_idempotencyKey_key" ON "GovernedAction"("runId", "idempotencyKey");
CREATE INDEX "GovernedActionRun_projectId_status_createdAt_idx" ON "GovernedActionRun"("projectId", "status", "createdAt");
CREATE INDEX "GovernedActionRun_roomId_status_createdAt_idx" ON "GovernedActionRun"("roomId", "status", "createdAt");
CREATE INDEX "GovernedActionRun_requestedByUserId_createdAt_idx" ON "GovernedActionRun"("requestedByUserId", "createdAt");
CREATE INDEX "GovernedActionRun_principalKind_principalId_createdAt_idx" ON "GovernedActionRun"("principalKind", "principalId", "createdAt");
CREATE INDEX "GovernedAction_capabilityId_status_createdAt_idx" ON "GovernedAction"("capabilityId", "status", "createdAt");
CREATE INDEX "GovernedAction_runId_createdAt_idx" ON "GovernedAction"("runId", "createdAt");
CREATE INDEX "GovernedAction_payloadSha256_idx" ON "GovernedAction"("payloadSha256");
CREATE UNIQUE INDEX "GovernedActionAttempt_actionId_attemptNumber_key" ON "GovernedActionAttempt"("actionId", "attemptNumber");
CREATE INDEX "GovernedActionAttempt_status_startedAt_idx" ON "GovernedActionAttempt"("status", "startedAt");
CREATE INDEX "GovernedActionReceipt_actionId_createdAt_idx" ON "GovernedActionReceipt"("actionId", "createdAt");
CREATE INDEX "GovernedActionReceipt_attemptId_createdAt_idx" ON "GovernedActionReceipt"("attemptId", "createdAt");
CREATE INDEX "GovernedActionReceipt_kind_createdAt_idx" ON "GovernedActionReceipt"("kind", "createdAt");
CREATE UNIQUE INDEX "StudioAssistantAction_governedActionId_key" ON "StudioAssistantAction"("governedActionId");
CREATE UNIQUE INDEX "CallParticipantPreflightReceipt_governedActionId_key" ON "CallParticipantPreflightReceipt"("governedActionId");

ALTER TABLE "GovernedActionRun" ADD CONSTRAINT "GovernedActionRun_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "StudioProject"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "GovernedActionRun" ADD CONSTRAINT "GovernedActionRun_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "CallRoom"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "GovernedAction" ADD CONSTRAINT "GovernedAction_runId_fkey" FOREIGN KEY ("runId") REFERENCES "GovernedActionRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GovernedActionAttempt" ADD CONSTRAINT "GovernedActionAttempt_actionId_fkey" FOREIGN KEY ("actionId") REFERENCES "GovernedAction"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GovernedActionReceipt" ADD CONSTRAINT "GovernedActionReceipt_actionId_fkey" FOREIGN KEY ("actionId") REFERENCES "GovernedAction"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GovernedActionReceipt" ADD CONSTRAINT "GovernedActionReceipt_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "GovernedActionAttempt"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "StudioAssistantAction" ADD CONSTRAINT "StudioAssistantAction_governedActionId_fkey" FOREIGN KEY ("governedActionId") REFERENCES "GovernedAction"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CallParticipantPreflightReceipt" ADD CONSTRAINT "CallParticipantPreflightReceipt_governedActionId_fkey" FOREIGN KEY ("governedActionId") REFERENCES "GovernedAction"("id") ON DELETE SET NULL ON UPDATE CASCADE;
