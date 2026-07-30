-- Operator-owned rollback for the additive personal-document boundary.
-- Run only after confirming no document still relies on personal ownership;
-- dropping the column intentionally removes that access-control evidence.
ALTER TABLE "StudioDocument"
DROP CONSTRAINT IF EXISTS "StudioDocument_personalOwnerUserId_fkey";

DROP INDEX IF EXISTS "StudioDocument_personalOwnerUserId_updatedAt_idx";

ALTER TABLE "StudioDocument"
DROP COLUMN IF EXISTS "personalOwnerUserId";
