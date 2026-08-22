-- Keep an accepted invitation link useful as a safe route back to its Session.
-- The opaque token remains non-authoritative: re-entry still requires the exact
-- signed-in recipient and an active canonical CallParticipant record.
ALTER TABLE "CallRoomInvitation"
  ADD COLUMN IF NOT EXISTS "acceptedTokenHash" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "CallRoomInvitation_acceptedTokenHash_key"
  ON "CallRoomInvitation"("acceptedTokenHash");
