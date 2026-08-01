CREATE TABLE "CalendarOAuthCredential" (
    "id" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "encryptedPayload" TEXT NOT NULL,
    "encryptionVersion" TEXT NOT NULL DEFAULT 'aes-256-gcm-v1',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CalendarOAuthCredential_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CalendarOAuthCredential_connectionId_key"
ON "CalendarOAuthCredential"("connectionId");

CREATE INDEX "CalendarOAuthCredential_updatedAt_idx"
ON "CalendarOAuthCredential"("updatedAt");

ALTER TABLE "CalendarOAuthCredential"
ADD CONSTRAINT "CalendarOAuthCredential_connectionId_fkey"
FOREIGN KEY ("connectionId") REFERENCES "CalendarConnection"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
