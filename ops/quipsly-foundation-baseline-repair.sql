-- Additive-only repair for historical foundation objects that predate Prisma
-- migration tracking. This file is intentionally narrow and idempotent.

ALTER TABLE "StudioOutputPacket"
  ADD COLUMN IF NOT EXISTS "publishAt" TIMESTAMP(3);
