ALTER TABLE "Snippet"
ADD COLUMN "captureFingerprint" TEXT;

CREATE TABLE "StudioPersonalSourceCaptureReceipt" (
    "id" TEXT NOT NULL,
    "createdByUserId" TEXT NOT NULL,
    "createdByEmailSnapshot" TEXT,
    "clientRequestId" TEXT NOT NULL,
    "captureType" TEXT NOT NULL,
    "snippetId" TEXT,
    "bookmarkId" TEXT,
    "sourceFingerprint" TEXT NOT NULL,
    "capturedAt" TIMESTAMP(3) NOT NULL,
    "captureSnapshotJson" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StudioPersonalSourceCaptureReceipt_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "StudioPersonalSourceCaptureReceipt_target_check" CHECK (
        ("captureType" = 'SNIPPET' AND "snippetId" IS NOT NULL AND "bookmarkId" IS NULL)
        OR ("captureType" = 'BOOKMARK' AND "bookmarkId" IS NOT NULL AND "snippetId" IS NULL)
    )
);

CREATE UNIQUE INDEX "Snippet_userId_captureFingerprint_key"
ON "Snippet"("userId", "captureFingerprint");

CREATE UNIQUE INDEX "StudioPersonalSourceCaptureReceipt_createdByUserId_clientRequestId_key"
ON "StudioPersonalSourceCaptureReceipt"("createdByUserId", "clientRequestId");

CREATE INDEX "StudioPersonalSourceCaptureReceipt_snippetId_capturedAt_idx"
ON "StudioPersonalSourceCaptureReceipt"("snippetId", "capturedAt");

CREATE INDEX "StudioPersonalSourceCaptureReceipt_bookmarkId_capturedAt_idx"
ON "StudioPersonalSourceCaptureReceipt"("bookmarkId", "capturedAt");

CREATE INDEX "StudioPersonalSourceCaptureReceipt_createdByUserId_capturedAt_idx"
ON "StudioPersonalSourceCaptureReceipt"("createdByUserId", "capturedAt");

ALTER TABLE "StudioPersonalSourceCaptureReceipt"
ADD CONSTRAINT "StudioPersonalSourceCaptureReceipt_createdByUserId_fkey"
FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "StudioPersonalSourceCaptureReceipt"
ADD CONSTRAINT "StudioPersonalSourceCaptureReceipt_snippetId_fkey"
FOREIGN KEY ("snippetId") REFERENCES "Snippet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "StudioPersonalSourceCaptureReceipt"
ADD CONSTRAINT "StudioPersonalSourceCaptureReceipt_bookmarkId_fkey"
FOREIGN KEY ("bookmarkId") REFERENCES "Bookmark"("id") ON DELETE CASCADE ON UPDATE CASCADE;
