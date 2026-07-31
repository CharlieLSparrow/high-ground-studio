CREATE TYPE "SessionOutputKind" AS ENUM ('CLIENT_FOLLOW_UP');
CREATE TYPE "SessionOutputStatus" AS ENUM ('DRAFT', 'RELEASED', 'REVOKED');
CREATE TYPE "DeliveryEventKind" AS ENUM ('RELEASED_IN_APP', 'OPENED_IN_APP', 'REVOKED', 'EXPORTED');

CREATE TABLE "SessionOutput" (
  "id" TEXT NOT NULL,
  "roomId" TEXT NOT NULL,
  "createdByUserId" TEXT NOT NULL,
  "recipientUserId" TEXT NOT NULL,
  "kind" "SessionOutputKind" NOT NULL DEFAULT 'CLIENT_FOLLOW_UP',
  "status" "SessionOutputStatus" NOT NULL DEFAULT 'DRAFT',
  "title" TEXT NOT NULL,
  "intro" TEXT,
  "nextSessionFocus" TEXT,
  "bodyJson" JSONB NOT NULL DEFAULT '{}',
  "sourceManifestJson" JSONB NOT NULL DEFAULT '{}',
  "contentSha256" TEXT NOT NULL,
  "revision" INTEGER NOT NULL DEFAULT 1,
  "releasedAt" TIMESTAMP(3),
  "revokedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SessionOutput_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SessionOutputRevision" (
  "id" UUID NOT NULL,
  "outputId" TEXT NOT NULL,
  "revision" INTEGER NOT NULL,
  "operation" TEXT NOT NULL,
  "actorUserId" TEXT NOT NULL,
  "snapshotJson" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SessionOutputRevision_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DeliveryEvent" (
  "id" UUID NOT NULL,
  "outputId" TEXT NOT NULL,
  "roomId" TEXT NOT NULL,
  "actorUserId" TEXT NOT NULL,
  "recipientUserId" TEXT NOT NULL,
  "kind" "DeliveryEventKind" NOT NULL,
  "destination" TEXT NOT NULL DEFAULT 'quipsly-session',
  "status" TEXT NOT NULL DEFAULT 'CONFIRMED',
  "contentSha256" TEXT NOT NULL,
  "clientRequestId" UUID NOT NULL,
  "metadataJson" JSONB NOT NULL DEFAULT '{}',
  "occurredAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DeliveryEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "SessionOutput_roomId_kind_status_updatedAt_idx"
  ON "SessionOutput"("roomId", "kind", "status", "updatedAt");
CREATE INDEX "SessionOutput_recipientUserId_status_releasedAt_idx"
  ON "SessionOutput"("recipientUserId", "status", "releasedAt");
CREATE INDEX "SessionOutput_createdByUserId_status_updatedAt_idx"
  ON "SessionOutput"("createdByUserId", "status", "updatedAt");

CREATE UNIQUE INDEX "SessionOutputRevision_outputId_revision_key"
  ON "SessionOutputRevision"("outputId", "revision");
CREATE INDEX "SessionOutputRevision_actorUserId_createdAt_idx"
  ON "SessionOutputRevision"("actorUserId", "createdAt");

CREATE UNIQUE INDEX "DeliveryEvent_actorUserId_clientRequestId_key"
  ON "DeliveryEvent"("actorUserId", "clientRequestId");
CREATE INDEX "DeliveryEvent_outputId_kind_occurredAt_idx"
  ON "DeliveryEvent"("outputId", "kind", "occurredAt");
CREATE INDEX "DeliveryEvent_roomId_kind_occurredAt_idx"
  ON "DeliveryEvent"("roomId", "kind", "occurredAt");
CREATE INDEX "DeliveryEvent_recipientUserId_kind_occurredAt_idx"
  ON "DeliveryEvent"("recipientUserId", "kind", "occurredAt");

ALTER TABLE "SessionOutput"
  ADD CONSTRAINT "SessionOutput_roomId_fkey"
  FOREIGN KEY ("roomId") REFERENCES "CallRoom"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SessionOutput"
  ADD CONSTRAINT "SessionOutput_createdByUserId_fkey"
  FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SessionOutput"
  ADD CONSTRAINT "SessionOutput_recipientUserId_fkey"
  FOREIGN KEY ("recipientUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SessionOutputRevision"
  ADD CONSTRAINT "SessionOutputRevision_outputId_fkey"
  FOREIGN KEY ("outputId") REFERENCES "SessionOutput"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SessionOutputRevision"
  ADD CONSTRAINT "SessionOutputRevision_actorUserId_fkey"
  FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DeliveryEvent"
  ADD CONSTRAINT "DeliveryEvent_outputId_fkey"
  FOREIGN KEY ("outputId") REFERENCES "SessionOutput"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DeliveryEvent"
  ADD CONSTRAINT "DeliveryEvent_roomId_fkey"
  FOREIGN KEY ("roomId") REFERENCES "CallRoom"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DeliveryEvent"
  ADD CONSTRAINT "DeliveryEvent_actorUserId_fkey"
  FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DeliveryEvent"
  ADD CONSTRAINT "DeliveryEvent_recipientUserId_fkey"
  FOREIGN KEY ("recipientUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
