ALTER TABLE "StudioDocument"
  ADD COLUMN "tagRevision" INTEGER NOT NULL DEFAULT 0;

CREATE TABLE "StudioDocumentTagLink" (
  "documentId" TEXT NOT NULL,
  "tagId" TEXT NOT NULL,
  "createdByUserId" TEXT,
  "sourceJson" JSONB NOT NULL DEFAULT '{}',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "StudioDocumentTagLink_pkey" PRIMARY KEY ("documentId", "tagId")
);

CREATE INDEX "StudioDocumentTagLink_tagId_createdAt_idx"
  ON "StudioDocumentTagLink"("tagId", "createdAt");

CREATE INDEX "StudioDocumentTagLink_createdByUserId_createdAt_idx"
  ON "StudioDocumentTagLink"("createdByUserId", "createdAt");

ALTER TABLE "StudioDocumentTagLink"
  ADD CONSTRAINT "StudioDocumentTagLink_documentId_fkey"
  FOREIGN KEY ("documentId") REFERENCES "StudioDocument"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "StudioDocumentTagLink"
  ADD CONSTRAINT "StudioDocumentTagLink_tagId_fkey"
  FOREIGN KEY ("tagId") REFERENCES "StudioTag"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "StudioDocumentTagLink"
  ADD CONSTRAINT "StudioDocumentTagLink_createdByUserId_fkey"
  FOREIGN KEY ("createdByUserId") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- Earlier Nest quick-note capture represented a document classification as a
-- full-body StudioTaggedSpan. Preserve those immutable span rows, but also
-- materialize the truthful document-level relationship. The source-label and
-- exact full-body checks prevent ordinary passage annotations from being
-- promoted accidentally.
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
    'source', 'quipsly-document-tag-backfill-v1',
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
WHERE EXISTS (
  SELECT 1
  FROM "StudioDocumentTagLink" AS link
  WHERE link."documentId" = document."id"
);
