-- Source annotations are additive overlays around immutable StudioSourceUnit
-- records. Existing StudioTaggedSpan and QuipLore annotation rows remain intact
-- and readable while product surfaces move to this canonical anchor contract.
CREATE TABLE "StudioSourceAnnotation" (
  "id" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "sourceUnitId" TEXT NOT NULL,
  "documentId" TEXT,
  "blockId" TEXT,
  "createdByUserId" TEXT,
  "createdByEmailSnapshot" TEXT,
  "kind" TEXT NOT NULL DEFAULT 'note',
  "status" TEXT NOT NULL DEFAULT 'active',
  "visibility" TEXT NOT NULL DEFAULT 'private',
  "body" TEXT NOT NULL,
  "selectorKind" TEXT NOT NULL,
  "startOffset" INTEGER,
  "endOffset" INTEGER,
  "exactText" TEXT,
  "prefixText" TEXT,
  "suffixText" TEXT,
  "startSeconds" DOUBLE PRECISION,
  "endSeconds" DOUBLE PRECISION,
  "sourceFingerprint" TEXT,
  "clientRequestId" TEXT,
  "provenanceJson" JSONB NOT NULL DEFAULT '{}',
  "archivedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "StudioSourceAnnotation_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "StudioSourceAnnotation_visibility_check" CHECK ("visibility" IN ('private', 'project')),
  CONSTRAINT "StudioSourceAnnotation_status_check" CHECK ("status" IN ('active', 'resolved', 'archived')),
  CONSTRAINT "StudioSourceAnnotation_kind_check" CHECK ("kind" IN ('highlight', 'note', 'question', 'quote', 'claim', 'idea', 'correction', 'action')),
  CONSTRAINT "StudioSourceAnnotation_selector_kind_check" CHECK ("selectorKind" IN ('whole-document', 'block', 'text-quote', 'character-range', 'time-range', 'media-segment')),
  CONSTRAINT "StudioSourceAnnotation_text_range_check" CHECK (
    ("selectorKind" NOT IN ('text-quote', 'character-range')) OR
    ("startOffset" IS NOT NULL AND "endOffset" IS NOT NULL AND "startOffset" >= 0 AND "endOffset" > "startOffset" AND "exactText" IS NOT NULL)
  ),
  CONSTRAINT "StudioSourceAnnotation_time_range_check" CHECK (
    ("selectorKind" NOT IN ('time-range', 'media-segment')) OR
    ("startSeconds" IS NOT NULL AND "endSeconds" IS NOT NULL AND "startSeconds" >= 0 AND "endSeconds" > "startSeconds")
  )
);

CREATE TABLE "StudioSourceAnnotationTag" (
  "annotationId" TEXT NOT NULL,
  "tagId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "StudioSourceAnnotationTag_pkey" PRIMARY KEY ("annotationId", "tagId")
);

CREATE TABLE "StudioSourceAnnotationRevision" (
  "id" TEXT NOT NULL,
  "annotationId" TEXT NOT NULL,
  "revision" INTEGER NOT NULL,
  "operation" TEXT NOT NULL,
  "actorUserId" TEXT,
  "snapshotJson" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "StudioSourceAnnotationRevision_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "StudioSourceAnnotationRevision_revision_check" CHECK ("revision" > 0),
  CONSTRAINT "StudioSourceAnnotationRevision_operation_check" CHECK ("operation" IN ('created', 'updated', 'resolved', 'reopened', 'archived'))
);

CREATE UNIQUE INDEX "StudioSourceAnnotation_createdByUserId_clientRequestId_key" ON "StudioSourceAnnotation"("createdByUserId", "clientRequestId");
CREATE INDEX "StudioSourceAnnotation_projectId_visibility_status_updatedAt_idx" ON "StudioSourceAnnotation"("projectId", "visibility", "status", "updatedAt");
CREATE INDEX "StudioSourceAnnotation_sourceUnitId_status_updatedAt_idx" ON "StudioSourceAnnotation"("sourceUnitId", "status", "updatedAt");
CREATE INDEX "StudioSourceAnnotation_createdByUserId_visibility_updatedAt_idx" ON "StudioSourceAnnotation"("createdByUserId", "visibility", "updatedAt");
CREATE INDEX "StudioSourceAnnotation_documentId_blockId_idx" ON "StudioSourceAnnotation"("documentId", "blockId");
CREATE INDEX "StudioSourceAnnotationTag_tagId_createdAt_idx" ON "StudioSourceAnnotationTag"("tagId", "createdAt");
CREATE UNIQUE INDEX "StudioSourceAnnotationRevision_annotationId_revision_key" ON "StudioSourceAnnotationRevision"("annotationId", "revision");
CREATE INDEX "StudioSourceAnnotationRevision_actorUserId_createdAt_idx" ON "StudioSourceAnnotationRevision"("actorUserId", "createdAt");

ALTER TABLE "StudioSourceAnnotation" ADD CONSTRAINT "StudioSourceAnnotation_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "StudioProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StudioSourceAnnotation" ADD CONSTRAINT "StudioSourceAnnotation_sourceUnitId_fkey" FOREIGN KEY ("sourceUnitId") REFERENCES "StudioSourceUnit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StudioSourceAnnotation" ADD CONSTRAINT "StudioSourceAnnotation_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "StudioDocument"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "StudioSourceAnnotation" ADD CONSTRAINT "StudioSourceAnnotation_blockId_fkey" FOREIGN KEY ("blockId") REFERENCES "StudioDocumentBlock"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "StudioSourceAnnotation" ADD CONSTRAINT "StudioSourceAnnotation_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "StudioSourceAnnotationTag" ADD CONSTRAINT "StudioSourceAnnotationTag_annotationId_fkey" FOREIGN KEY ("annotationId") REFERENCES "StudioSourceAnnotation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StudioSourceAnnotationTag" ADD CONSTRAINT "StudioSourceAnnotationTag_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "StudioTag"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StudioSourceAnnotationRevision" ADD CONSTRAINT "StudioSourceAnnotationRevision_annotationId_fkey" FOREIGN KEY ("annotationId") REFERENCES "StudioSourceAnnotation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StudioSourceAnnotationRevision" ADD CONSTRAINT "StudioSourceAnnotationRevision_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
