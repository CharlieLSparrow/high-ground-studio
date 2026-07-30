-- Evidence-to-writing drafts created before the explicit StudioDocument owner
-- boundary still retain an actor on their durable annotation-use receipt.
-- Backfill only unambiguous one-actor documents; ambiguous historical records
-- remain shared for manual review instead of guessing an owner.
UPDATE "StudioDocument" document
SET "personalOwnerUserId" = evidence_owner."actorUserId"
FROM (
  SELECT
    annotation_use."documentId",
    min(annotation_use."createdByUserId") AS "actorUserId"
  FROM "StudioSourceAnnotationUse" annotation_use
  WHERE annotation_use."createdByUserId" IS NOT NULL
    AND annotation_use."useKind" = 'evidence'
  GROUP BY annotation_use."documentId"
  HAVING count(DISTINCT annotation_use."createdByUserId") = 1
) evidence_owner
WHERE document."id" = evidence_owner."documentId"
  AND document."personalOwnerUserId" IS NULL;
