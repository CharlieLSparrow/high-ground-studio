ALTER TABLE "StudioExternalMediaReferenceOperation"
  DROP CONSTRAINT "StudioExternalMediaReferenceOperation_revision_check";

ALTER TABLE "StudioExternalMediaReferenceOperation"
  ADD CONSTRAINT "StudioExternalMediaReferenceOperation_revision_check"
  CHECK (
    ("operation" = 'observe' AND "revision" = "previousRevision")
    OR
    ("operation" <> 'observe' AND "revision" = "previousRevision" + 1)
  );
