-- Authentication subjects are credentials, not people. This ledger allows a
-- single Quipsly user to prove more than one Firebase/Google identity without
-- rotating or overwriting the legacy User.firebaseUid binding.
CREATE TABLE "UserAuthIdentity" (
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

CREATE UNIQUE INDEX "UserAuthIdentity_authority_subject_key"
ON "UserAuthIdentity"("authority", "subject");

CREATE INDEX "UserAuthIdentity_userId_idx"
ON "UserAuthIdentity"("userId");

CREATE INDEX "UserAuthIdentity_emailAtLink_idx"
ON "UserAuthIdentity"("emailAtLink");

ALTER TABLE "UserAuthIdentity"
ADD CONSTRAINT "UserAuthIdentity_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

-- Preserve every live legacy Firebase binding before application code starts
-- resolving through the new ledger. md5 is built into PostgreSQL and produces
-- a deterministic, collision-resistant migration identifier for these rows.
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
