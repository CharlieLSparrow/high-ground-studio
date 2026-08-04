DO $$ BEGIN
  CREATE TYPE "CallRoomInvitationStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REVOKED', 'EXPIRED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "CallRoomInvitation" (
  "id" TEXT NOT NULL,
  "roomId" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "displayName" TEXT,
  "role" "CallParticipantRole" NOT NULL DEFAULT 'GUEST',
  "status" "CallRoomInvitationStatus" NOT NULL DEFAULT 'PENDING',
  "tokenHash" TEXT,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "acceptedAt" TIMESTAMP(3),
  "revokedAt" TIMESTAMP(3),
  "createdByUserId" TEXT,
  "acceptedByUserId" TEXT,
  "participantId" TEXT,
  "participantCreated" BOOLEAN NOT NULL DEFAULT false,
  "metadataJson" JSONB NOT NULL DEFAULT '{}',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "CallRoomInvitation_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CallRoomInvitation_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "CallRoom"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "CallRoomInvitation_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "CallRoomInvitation_acceptedByUserId_fkey" FOREIGN KEY ("acceptedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "CallRoomInvitation_participantId_fkey" FOREIGN KEY ("participantId") REFERENCES "CallParticipant"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "CallRoomInvitation_tokenHash_key" ON "CallRoomInvitation"("tokenHash");
CREATE UNIQUE INDEX IF NOT EXISTS "CallRoomInvitation_roomId_email_key" ON "CallRoomInvitation"("roomId", "email");
CREATE INDEX IF NOT EXISTS "CallRoomInvitation_roomId_status_expiresAt_idx" ON "CallRoomInvitation"("roomId", "status", "expiresAt");
CREATE INDEX IF NOT EXISTS "CallRoomInvitation_email_status_expiresAt_idx" ON "CallRoomInvitation"("email", "status", "expiresAt");
CREATE INDEX IF NOT EXISTS "CallRoomInvitation_participantId_idx" ON "CallRoomInvitation"("participantId");
