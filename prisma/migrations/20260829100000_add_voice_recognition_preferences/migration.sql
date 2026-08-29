-- Speech adaptation follows the signed-in Quipsly account while remaining
-- independent from shared Nest terminology and immutable source recordings.
CREATE TABLE "VoiceRecognitionPreference" (
    "userId" TEXT NOT NULL,
    "adaptationEnabled" BOOLEAN NOT NULL DEFAULT false,
    "revision" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VoiceRecognitionPreference_pkey" PRIMARY KEY ("userId")
);

CREATE TABLE "VoiceRecognitionTerm" (
    "id" TEXT NOT NULL,
    "preferenceUserId" TEXT NOT NULL,
    "normalizedText" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 1,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VoiceRecognitionTerm_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "VoiceRecognitionTerm_count_check" CHECK ("count" >= 0)
);

CREATE TABLE "VoiceRecognitionOperation" (
    "id" TEXT NOT NULL,
    "preferenceUserId" TEXT NOT NULL,
    "operationKind" TEXT NOT NULL,
    "payloadHash" TEXT NOT NULL,
    "payloadJson" JSONB NOT NULL,
    "resultingRevision" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VoiceRecognitionOperation_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "VoiceRecognitionOperation_revision_check" CHECK ("resultingRevision" >= 1)
);

CREATE UNIQUE INDEX "VoiceRecognitionTerm_preferenceUserId_normalizedText_key"
ON "VoiceRecognitionTerm"("preferenceUserId", "normalizedText");

CREATE INDEX "VoiceRecognitionTerm_preferenceUserId_isActive_count_updatedAt_idx"
ON "VoiceRecognitionTerm"("preferenceUserId", "isActive", "count", "updatedAt");

CREATE INDEX "VoiceRecognitionOperation_preferenceUserId_createdAt_idx"
ON "VoiceRecognitionOperation"("preferenceUserId", "createdAt");

ALTER TABLE "VoiceRecognitionPreference"
ADD CONSTRAINT "VoiceRecognitionPreference_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "VoiceRecognitionTerm"
ADD CONSTRAINT "VoiceRecognitionTerm_preferenceUserId_fkey"
FOREIGN KEY ("preferenceUserId") REFERENCES "VoiceRecognitionPreference"("userId") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "VoiceRecognitionOperation"
ADD CONSTRAINT "VoiceRecognitionOperation_preferenceUserId_fkey"
FOREIGN KEY ("preferenceUserId") REFERENCES "VoiceRecognitionPreference"("userId") ON DELETE CASCADE ON UPDATE CASCADE;
