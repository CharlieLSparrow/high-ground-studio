CREATE TYPE "CallParticipantAccessStatus" AS ENUM ('ACTIVE', 'REMOVED');
CREATE TYPE "CallParticipantAccessAction" AS ENUM ('REMOVE', 'RESTORE', 'PROVIDER_RECONCILE');
CREATE TYPE "CallParticipantProviderStatus" AS ENUM ('NOT_REQUIRED', 'PENDING', 'CONVERGED', 'BLOCKED', 'FAILED');

ALTER TABLE "CallParticipant"
  ADD COLUMN "accessStatus" "CallParticipantAccessStatus" NOT NULL DEFAULT 'ACTIVE',
  ADD COLUMN "accessRevision" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "accessChangedAt" TIMESTAMP(3),
  ADD COLUMN "accessChangedByUserId" TEXT,
  ADD COLUMN "providerAccessStatus" "CallParticipantProviderStatus" NOT NULL DEFAULT 'NOT_REQUIRED',
  ADD COLUMN "providerAccessReconciledAt" TIMESTAMP(3),
  ADD COLUMN "providerAccessErrorCode" TEXT;

ALTER TABLE "CallParticipant"
  ADD CONSTRAINT "CallParticipant_accessChangedByUserId_fkey"
  FOREIGN KEY ("accessChangedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "CallParticipantAccessReceipt" (
  "id" TEXT NOT NULL,
  "requestId" UUID NOT NULL,
  "roomId" TEXT NOT NULL,
  "participantId" TEXT NOT NULL,
  "actorUserId" TEXT,
  "action" "CallParticipantAccessAction" NOT NULL,
  "accessStatusBefore" "CallParticipantAccessStatus" NOT NULL,
  "accessStatusAfter" "CallParticipantAccessStatus" NOT NULL,
  "accessRevision" INTEGER NOT NULL,
  "reason" TEXT,
  "providerStatus" "CallParticipantProviderStatus" NOT NULL,
  "providerRoomId" TEXT,
  "providerIdentityCount" INTEGER NOT NULL DEFAULT 0,
  "providerOutcomeJson" JSONB NOT NULL DEFAULT '{}',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "CallParticipantAccessReceipt_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CallParticipantAccessReceipt_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "CallRoom"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "CallParticipantAccessReceipt_participantId_fkey" FOREIGN KEY ("participantId") REFERENCES "CallParticipant"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "CallParticipantAccessReceipt_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE "CallParticipantProviderGrantReceipt" (
  "id" TEXT NOT NULL,
  "roomId" TEXT NOT NULL,
  "participantId" TEXT NOT NULL,
  "tokenJti" TEXT NOT NULL,
  "providerIdentity" TEXT NOT NULL,
  "providerRoomId" TEXT NOT NULL,
  "clientInstanceId" TEXT,
  "clientKind" TEXT NOT NULL,
  "deviceLabel" TEXT,
  "issuedAt" TIMESTAMP(3) NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "metadataJson" JSONB NOT NULL DEFAULT '{}',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "CallParticipantProviderGrantReceipt_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CallParticipantProviderGrantReceipt_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "CallRoom"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "CallParticipantProviderGrantReceipt_participantId_fkey" FOREIGN KEY ("participantId") REFERENCES "CallParticipant"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "CallParticipantAccessReceipt_requestId_key" ON "CallParticipantAccessReceipt"("requestId");
CREATE UNIQUE INDEX "CallParticipantProviderGrantReceipt_tokenJti_key" ON "CallParticipantProviderGrantReceipt"("tokenJti");
CREATE INDEX "CallParticipant_roomId_accessStatus_role_idx" ON "CallParticipant"("roomId", "accessStatus", "role");
CREATE INDEX "CallParticipantAccessReceipt_roomId_createdAt_idx" ON "CallParticipantAccessReceipt"("roomId", "createdAt");
CREATE INDEX "CallParticipantAccessReceipt_participantId_createdAt_idx" ON "CallParticipantAccessReceipt"("participantId", "createdAt");
CREATE INDEX "CallParticipantAccessReceipt_participantId_accessRevision_createdAt_idx" ON "CallParticipantAccessReceipt"("participantId", "accessRevision", "createdAt");
CREATE INDEX "CallParticipantAccessReceipt_providerStatus_createdAt_idx" ON "CallParticipantAccessReceipt"("providerStatus", "createdAt");
CREATE INDEX "CallParticipantProviderGrantReceipt_participantId_expiresAt_idx" ON "CallParticipantProviderGrantReceipt"("participantId", "expiresAt");
CREATE INDEX "CallParticipantProviderGrantReceipt_roomId_providerIdentity_expiresAt_idx" ON "CallParticipantProviderGrantReceipt"("roomId", "providerIdentity", "expiresAt");
CREATE INDEX "CallParticipantProviderGrantReceipt_providerRoomId_expiresAt_idx" ON "CallParticipantProviderGrantReceipt"("providerRoomId", "expiresAt");
