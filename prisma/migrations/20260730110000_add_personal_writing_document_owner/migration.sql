-- Personal writing documents remain inside a canonical Nest and document
-- kernel while adding an explicit actor-level read/write boundary.
ALTER TABLE "StudioDocument"
ADD COLUMN "personalOwnerUserId" TEXT;

-- Native-note projections already have an unambiguous canonical owner.
UPDATE "StudioDocument" document
SET "personalOwnerUserId" = note."userId"
FROM "QuipslyNote" note
WHERE document."stableId" = note."id"
  AND document."sourceLabel" = 'quipsly-native-note';

-- Capture-created notes and transcript drafts recorded the actor in their
-- durable operation receipt before the explicit document owner existed.
UPDATE "StudioDocument" document
SET "personalOwnerUserId" = receipt."actorUserId"
FROM (
  SELECT DISTINCT ON (operation."documentId")
    operation."documentId",
    operation."payloadJson"->>'createdByUserId' AS "actorUserId"
  FROM "StudioDocumentOperation" operation
  JOIN "User" actor
    ON actor."id" = operation."payloadJson"->>'createdByUserId'
  WHERE operation."operationType" IN (
    'personal-note-create',
    'create-draft-from-transcript-segment'
  )
  ORDER BY operation."documentId", operation."createdAt" ASC, operation."id" ASC
) receipt
WHERE document."id" = receipt."documentId"
  AND document."personalOwnerUserId" IS NULL;

-- Nest quick notes predate actor IDs in their receipt, but retain a canonical
-- primary-or-alias email snapshot. Resolve it without guessing.
UPDATE "StudioDocument" document
SET "personalOwnerUserId" = receipt."actorUserId"
FROM (
  SELECT DISTINCT ON (operation."documentId")
    operation."documentId",
    COALESCE(primary_actor."id", alias_actor."userId") AS "actorUserId"
  FROM "StudioDocumentOperation" operation
  LEFT JOIN "User" primary_actor
    ON lower(primary_actor."primaryEmail") = lower(operation."actorEmail")
  LEFT JOIN "UserEmail" alias_actor
    ON lower(alias_actor."email") = lower(operation."actorEmail")
  WHERE operation."operationType" = 'create-project-quick-note'
    AND operation."actorEmail" IS NOT NULL
    AND COALESCE(primary_actor."id", alias_actor."userId") IS NOT NULL
  ORDER BY operation."documentId", operation."createdAt" ASC, operation."id" ASC
) receipt
WHERE document."id" = receipt."documentId"
  AND document."personalOwnerUserId" IS NULL;

CREATE INDEX "StudioDocument_personalOwnerUserId_updatedAt_idx"
ON "StudioDocument"("personalOwnerUserId", "updatedAt");

ALTER TABLE "StudioDocument"
ADD CONSTRAINT "StudioDocument_personalOwnerUserId_fkey"
FOREIGN KEY ("personalOwnerUserId")
REFERENCES "User"("id")
ON DELETE RESTRICT
ON UPDATE CASCADE;
