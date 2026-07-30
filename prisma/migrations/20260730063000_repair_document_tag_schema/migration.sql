-- A database can retain the Prisma receipt for
-- 20260728223500_add_document_tags while missing its physical objects after an
-- out-of-band schema replacement. Never rewrite that applied migration.
-- Reconcile the exact canonical document-tag substrate forward instead.

ALTER TABLE "StudioDocument"
  ADD COLUMN IF NOT EXISTS "tagRevision" INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS "StudioDocumentTagLink" (
  "documentId" TEXT NOT NULL,
  "tagId" TEXT NOT NULL,
  "createdByUserId" TEXT,
  "sourceJson" JSONB NOT NULL DEFAULT '{}',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "StudioDocumentTagLink_pkey" PRIMARY KEY ("documentId", "tagId")
);

CREATE INDEX IF NOT EXISTS "StudioDocumentTagLink_tagId_createdAt_idx"
  ON "StudioDocumentTagLink"("tagId", "createdAt");

CREATE INDEX IF NOT EXISTS "StudioDocumentTagLink_createdByUserId_createdAt_idx"
  ON "StudioDocumentTagLink"("createdByUserId", "createdAt");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'StudioDocumentTagLink_documentId_fkey'
      AND conrelid = '"StudioDocumentTagLink"'::regclass
  ) THEN
    ALTER TABLE "StudioDocumentTagLink"
      ADD CONSTRAINT "StudioDocumentTagLink_documentId_fkey"
      FOREIGN KEY ("documentId") REFERENCES "StudioDocument"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'StudioDocumentTagLink_tagId_fkey'
      AND conrelid = '"StudioDocumentTagLink"'::regclass
  ) THEN
    ALTER TABLE "StudioDocumentTagLink"
      ADD CONSTRAINT "StudioDocumentTagLink_tagId_fkey"
      FOREIGN KEY ("tagId") REFERENCES "StudioTag"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'StudioDocumentTagLink_createdByUserId_fkey'
      AND conrelid = '"StudioDocumentTagLink"'::regclass
  ) THEN
    ALTER TABLE "StudioDocumentTagLink"
      ADD CONSTRAINT "StudioDocumentTagLink_createdByUserId_fkey"
      FOREIGN KEY ("createdByUserId") REFERENCES "User"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END
$$;

-- Recover truthful document classifications from the exact legacy
-- representation. Ordinary passage annotations remain passage annotations.
INSERT INTO "StudioDocumentTagLink" (
  "documentId",
  "tagId",
  "createdByUserId",
  "sourceJson",
  "createdAt"
)
SELECT DISTINCT ON (span."documentId", span."tagId")
  span."documentId",
  span."tagId",
  actor."id",
  jsonb_build_object(
    'source', 'quipsly-document-tag-repair-v1',
    'legacySpanId', span."id",
    'legacySpanPreserved', true,
    'externalSideEffects', false
  ),
  span."createdAt"
FROM "StudioTaggedSpan" AS span
JOIN "StudioDocument" AS document
  ON document."id" = span."documentId"
JOIN "StudioDocumentBlock" AS block
  ON block."id" = span."blockId"
LEFT JOIN "User" AS actor
  ON lower(actor."primaryEmail") = lower(span."createdByLabel")
WHERE document."sourceLabel" ILIKE '%origin:nest-project-capture%'
  AND span."startOffset" = 0
  AND span."endOffset" = char_length(block."body")
  AND span."selectedText" = block."body"
ORDER BY span."documentId", span."tagId", span."createdAt", span."id"
ON CONFLICT ("documentId", "tagId") DO NOTHING;

UPDATE "StudioDocument" AS document
SET "tagRevision" = 1
WHERE document."tagRevision" = 0
  AND EXISTS (
    SELECT 1
    FROM "StudioDocumentTagLink" AS link
    WHERE link."documentId" = document."id"
  );
