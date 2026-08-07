-- Connection receipts belong to the user-owned provider connection lifecycle.
-- Cascading this actor edge avoids a restrict-vs-cascade deadlock when a user
-- and their connections are deliberately deleted together.

ALTER TABLE "StudioMediaProviderConnectionOperation"
  DROP CONSTRAINT "StudioMediaProviderConnectionOperation_actorUserId_fkey";

ALTER TABLE "StudioMediaProviderConnectionOperation"
  ADD CONSTRAINT "StudioMediaProviderConnectionOperation_actorUserId_fkey"
  FOREIGN KEY ("actorUserId") REFERENCES "User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
