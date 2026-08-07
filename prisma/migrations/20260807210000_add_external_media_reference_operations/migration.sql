-- Durable provider-source capability history. The mutable external reference
-- remains a current projection; every verified attach/refresh is append-only.

ALTER TABLE "StudioExternalMediaReference"
  ADD COLUMN "revision" INTEGER NOT NULL DEFAULT 1,
  ADD CONSTRAINT "StudioExternalMediaReference_revision_check" CHECK ("revision" >= 1);

CREATE TABLE "StudioExternalMediaReferenceOperation" (
  "id" TEXT NOT NULL,
  "referenceId" TEXT NOT NULL,
  "revision" INTEGER NOT NULL,
  "previousRevision" INTEGER NOT NULL,
  "operation" TEXT NOT NULL,
  "actorUserId" TEXT NOT NULL,
  "clientRequestId" TEXT NOT NULL,
  "requestSha256" TEXT NOT NULL,
  "snapshotJson" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "StudioExternalMediaReferenceOperation_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "StudioExternalMediaReferenceOperation_revision_check" CHECK ("revision" = "previousRevision" + 1),
  CONSTRAINT "StudioExternalMediaReferenceOperation_request_sha_check" CHECK (length("requestSha256") = 64)
);

CREATE UNIQUE INDEX "StudioExternalMediaReferenceOperation_referenceId_revision_key"
  ON "StudioExternalMediaReferenceOperation"("referenceId", "revision");
CREATE UNIQUE INDEX "StudioExternalMediaReferenceOperation_referenceId_actorUserId_clientRequestId_key"
  ON "StudioExternalMediaReferenceOperation"("referenceId", "actorUserId", "clientRequestId");
CREATE INDEX "StudioExternalMediaReferenceOperation_actorUserId_createdAt_idx"
  ON "StudioExternalMediaReferenceOperation"("actorUserId", "createdAt");

ALTER TABLE "StudioExternalMediaReferenceOperation"
  ADD CONSTRAINT "StudioExternalMediaReferenceOperation_referenceId_fkey"
  FOREIGN KEY ("referenceId") REFERENCES "StudioExternalMediaReference"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StudioExternalMediaReferenceOperation"
  ADD CONSTRAINT "StudioExternalMediaReferenceOperation_actorUserId_fkey"
  FOREIGN KEY ("actorUserId") REFERENCES "User"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
