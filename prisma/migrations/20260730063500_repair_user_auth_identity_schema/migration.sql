-- Reconcile the physical identity ledger when an out-of-band schema
-- replacement retained the receipt for 20260728183000_add_user_auth_identities
-- but removed its table. Keep the original migration immutable.

CREATE TABLE IF NOT EXISTS "UserAuthIdentity" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "authority" TEXT NOT NULL,
  "subject" TEXT NOT NULL,
  "provider" TEXT,
  "emailAtLink" TEXT,
  "emailVerifiedAt" TIMESTAMP(3),
  "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "UserAuthIdentity_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "UserAuthIdentity_authority_subject_key"
  ON "UserAuthIdentity"("authority", "subject");

CREATE INDEX IF NOT EXISTS "UserAuthIdentity_userId_idx"
  ON "UserAuthIdentity"("userId");

CREATE INDEX IF NOT EXISTS "UserAuthIdentity_emailAtLink_idx"
  ON "UserAuthIdentity"("emailAtLink");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'UserAuthIdentity_userId_fkey'
      AND conrelid = '"UserAuthIdentity"'::regclass
  ) THEN
    ALTER TABLE "UserAuthIdentity"
      ADD CONSTRAINT "UserAuthIdentity_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END
$$;

INSERT INTO "UserAuthIdentity" (
  "id",
  "userId",
  "authority",
  "subject",
  "provider",
  "emailAtLink",
  "emailVerifiedAt",
  "lastSeenAt",
  "createdAt",
  "updatedAt"
)
SELECT
  'firebase_' || md5("id" || ':' || "firebaseUid"),
  "id",
  'firebase:quipsly-reef',
  "firebaseUid",
  NULL,
  lower("primaryEmail"),
  "emailVerified",
  "updatedAt",
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "User"
WHERE "firebaseUid" IS NOT NULL
ON CONFLICT ("authority", "subject") DO NOTHING;
