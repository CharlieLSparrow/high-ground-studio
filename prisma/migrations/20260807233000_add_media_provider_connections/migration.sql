-- Creator-owned external media connections. Durable credentials are isolated
-- from connection projections and all connection state changes are receipted.

CREATE TABLE "StudioMediaProviderConnection" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "providerAccountKey" TEXT NOT NULL,
  "accountLabel" TEXT,
  "connectionKind" TEXT NOT NULL DEFAULT 'user-oauth',
  "grantedScopes" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "status" TEXT NOT NULL DEFAULT 'pending',
  "revision" INTEGER NOT NULL DEFAULT 1,
  "verifiedAt" TIMESTAMP(3),
  "lastCheckedAt" TIMESTAMP(3),
  "revokedAt" TIMESTAMP(3),
  "metadataJson" JSONB NOT NULL DEFAULT '{}',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "StudioMediaProviderConnection_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "StudioMediaProviderConnection_revision_check" CHECK ("revision" >= 1)
);

CREATE TABLE "StudioMediaProviderCredential" (
  "id" TEXT NOT NULL,
  "connectionId" TEXT NOT NULL,
  "encryptedPayload" TEXT NOT NULL,
  "encryptionVersion" TEXT NOT NULL DEFAULT 'aes-256-gcm-v1',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "StudioMediaProviderCredential_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "StudioMediaProviderConnectionOperation" (
  "id" TEXT NOT NULL,
  "connectionId" TEXT NOT NULL,
  "revision" INTEGER NOT NULL,
  "previousRevision" INTEGER NOT NULL,
  "operation" TEXT NOT NULL,
  "outcome" TEXT NOT NULL,
  "actorUserId" TEXT NOT NULL,
  "clientRequestId" TEXT NOT NULL,
  "requestSha256" TEXT NOT NULL,
  "snapshotJson" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "StudioMediaProviderConnectionOperation_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "StudioMediaProviderConnectionOperation_revision_check" CHECK ("revision" = "previousRevision" + 1),
  CONSTRAINT "StudioMediaProviderConnectionOperation_request_sha_check" CHECK (length("requestSha256") = 64)
);

ALTER TABLE "StudioExternalMediaReference" ADD COLUMN "connectionId" TEXT;

CREATE UNIQUE INDEX "StudioMediaProviderConnection_provider_providerAccountKey_key"
  ON "StudioMediaProviderConnection"("provider", "providerAccountKey");
CREATE INDEX "StudioMediaProviderConnection_userId_provider_status_idx"
  ON "StudioMediaProviderConnection"("userId", "provider", "status");
CREATE INDEX "StudioMediaProviderConnection_status_updatedAt_idx"
  ON "StudioMediaProviderConnection"("status", "updatedAt");
CREATE UNIQUE INDEX "StudioMediaProviderCredential_connectionId_key"
  ON "StudioMediaProviderCredential"("connectionId");
CREATE INDEX "StudioMediaProviderCredential_updatedAt_idx"
  ON "StudioMediaProviderCredential"("updatedAt");
CREATE UNIQUE INDEX "StudioMediaProviderConnectionOperation_connectionId_revision_key"
  ON "StudioMediaProviderConnectionOperation"("connectionId", "revision");
CREATE UNIQUE INDEX "StudioMediaProviderConnectionOperation_connectionId_actorUserId_clientRequestId_key"
  ON "StudioMediaProviderConnectionOperation"("connectionId", "actorUserId", "clientRequestId");
CREATE INDEX "StudioMediaProviderConnectionOperation_actorUserId_createdAt_idx"
  ON "StudioMediaProviderConnectionOperation"("actorUserId", "createdAt");
CREATE INDEX "StudioExternalMediaReference_connectionId_idx"
  ON "StudioExternalMediaReference"("connectionId");

ALTER TABLE "StudioMediaProviderConnection"
  ADD CONSTRAINT "StudioMediaProviderConnection_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StudioMediaProviderCredential"
  ADD CONSTRAINT "StudioMediaProviderCredential_connectionId_fkey"
  FOREIGN KEY ("connectionId") REFERENCES "StudioMediaProviderConnection"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StudioMediaProviderConnectionOperation"
  ADD CONSTRAINT "StudioMediaProviderConnectionOperation_connectionId_fkey"
  FOREIGN KEY ("connectionId") REFERENCES "StudioMediaProviderConnection"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StudioMediaProviderConnectionOperation"
  ADD CONSTRAINT "StudioMediaProviderConnectionOperation_actorUserId_fkey"
  FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StudioExternalMediaReference"
  ADD CONSTRAINT "StudioExternalMediaReference_connectionId_fkey"
  FOREIGN KEY ("connectionId") REFERENCES "StudioMediaProviderConnection"("id") ON DELETE SET NULL ON UPDATE CASCADE;
