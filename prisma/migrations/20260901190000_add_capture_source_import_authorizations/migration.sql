-- Browser-imported originals have a different authority boundary from live
-- device capture. Preserve an append-only, source-bound attestation instead of
-- impersonating a START_RECORDING receipt.
CREATE TABLE "CaptureSourceImportAuthorization" (
    "id" UUID NOT NULL,
    "uploadSessionId" UUID NOT NULL,
    "captureId" UUID NOT NULL,
    "captureGroupId" UUID NOT NULL,
    "roomId" TEXT NOT NULL,
    "actorUserId" TEXT NOT NULL,
    "participantId" TEXT NOT NULL,
    "recordingConsentId" TEXT NOT NULL,
    "consentVersion" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL,
    "sha256" TEXT NOT NULL,
    "sizeBytes" BIGINT NOT NULL,
    "fileName" TEXT NOT NULL,
    "attestationVersion" TEXT NOT NULL,
    "attestedAt" TIMESTAMP(3) NOT NULL,
    "metadataJson" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CaptureSourceImportAuthorization_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CaptureSourceImportAuthorization_uploadSessionId_key"
ON "CaptureSourceImportAuthorization"("uploadSessionId");

CREATE UNIQUE INDEX "CaptureSourceImportAuthorization_roomId_captureId_key"
ON "CaptureSourceImportAuthorization"("roomId", "captureId");

CREATE INDEX "CaptureSourceImportAuthorization_actorUserId_createdAt_idx"
ON "CaptureSourceImportAuthorization"("actorUserId", "createdAt");

CREATE INDEX "CaptureSourceImportAuthorization_recordingConsentId_createdAt_idx"
ON "CaptureSourceImportAuthorization"("recordingConsentId", "createdAt");

CREATE INDEX "CaptureSourceImportAuthorization_captureGroupId_createdAt_idx"
ON "CaptureSourceImportAuthorization"("captureGroupId", "createdAt");

ALTER TABLE "CaptureSourceImportAuthorization"
ADD CONSTRAINT "CaptureSourceImportAuthorization_roomId_fkey"
FOREIGN KEY ("roomId") REFERENCES "CallRoom"("id") ON DELETE CASCADE ON UPDATE CASCADE;
