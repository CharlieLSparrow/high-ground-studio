-- Typed evidence-to-writing links preserve where an annotation was used while
-- leaving both the immutable source and the human-authored draft inspectable.
CREATE TABLE "StudioSourceAnnotationUse" (
  "id" TEXT NOT NULL,
  "annotationId" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "documentId" TEXT NOT NULL,
  "blockId" TEXT NOT NULL,
  "createdByUserId" TEXT,
  "clientRequestId" TEXT,
  "useKind" TEXT NOT NULL DEFAULT 'evidence',
  "citationKey" TEXT NOT NULL,
  "quoteSnapshot" TEXT NOT NULL,
  "citationLabel" TEXT NOT NULL,
  "sourceJson" JSONB NOT NULL DEFAULT '{}',
  "archivedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "StudioSourceAnnotationUse_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "StudioSourceAnnotationUse_kind_check" CHECK ("useKind" IN ('evidence', 'quotation', 'inspiration', 'counterpoint'))
);

CREATE UNIQUE INDEX "StudioSourceAnnotationUse_annotationId_blockId_useKind_key" ON "StudioSourceAnnotationUse"("annotationId", "blockId", "useKind");
CREATE UNIQUE INDEX "StudioSourceAnnotationUse_createdByUserId_clientRequestId_key" ON "StudioSourceAnnotationUse"("createdByUserId", "clientRequestId");
CREATE INDEX "StudioSourceAnnotationUse_documentId_createdAt_idx" ON "StudioSourceAnnotationUse"("documentId", "createdAt");
CREATE INDEX "StudioSourceAnnotationUse_projectId_useKind_createdAt_idx" ON "StudioSourceAnnotationUse"("projectId", "useKind", "createdAt");

ALTER TABLE "StudioSourceAnnotationUse" ADD CONSTRAINT "StudioSourceAnnotationUse_annotationId_fkey" FOREIGN KEY ("annotationId") REFERENCES "StudioSourceAnnotation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StudioSourceAnnotationUse" ADD CONSTRAINT "StudioSourceAnnotationUse_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "StudioProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StudioSourceAnnotationUse" ADD CONSTRAINT "StudioSourceAnnotationUse_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "StudioDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StudioSourceAnnotationUse" ADD CONSTRAINT "StudioSourceAnnotationUse_blockId_fkey" FOREIGN KEY ("blockId") REFERENCES "StudioDocumentBlock"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StudioSourceAnnotationUse" ADD CONSTRAINT "StudioSourceAnnotationUse_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
