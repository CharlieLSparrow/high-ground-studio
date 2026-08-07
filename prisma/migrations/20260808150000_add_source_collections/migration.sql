CREATE TABLE "StudioSourceCollection" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "ownerUserId" TEXT NOT NULL,
    "scope" TEXT NOT NULL DEFAULT 'personal',
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "color" TEXT,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "clientRequestId" TEXT NOT NULL,
    "createdByUserId" TEXT NOT NULL,
    "updatedByUserId" TEXT,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StudioSourceCollection_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "StudioSourceCollection_scope_check" CHECK ("scope" IN ('personal', 'project')),
    CONSTRAINT "StudioSourceCollection_slug_check" CHECK ("slug" ~ '^[a-z0-9][a-z0-9_-]{0,59}$'),
    CONSTRAINT "StudioSourceCollection_revision_check" CHECK ("revision" >= 1)
);

CREATE TABLE "StudioSourceCollectionItem" (
    "id" TEXT NOT NULL,
    "collectionId" TEXT NOT NULL,
    "targetKey" TEXT NOT NULL,
    "sourceSetId" TEXT,
    "externalReferenceId" TEXT,
    "mediaAssetId" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "note" TEXT NOT NULL DEFAULT '',
    "addedByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StudioSourceCollectionItem_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "StudioSourceCollectionItem_sort_check" CHECK ("sortOrder" >= 0),
    CONSTRAINT "StudioSourceCollectionItem_target_check" CHECK (
      (num_nonnulls("sourceSetId", "externalReferenceId", "mediaAssetId") = 1)
      AND (
        ("sourceSetId" IS NOT NULL AND "targetKey" = ('source-set:' || "sourceSetId"))
        OR ("externalReferenceId" IS NOT NULL AND "targetKey" = ('external:' || "externalReferenceId"))
        OR ("mediaAssetId" IS NOT NULL AND "targetKey" = ('asset:' || "mediaAssetId"))
      )
    )
);

CREATE TABLE "StudioSourceCollectionOperation" (
    "id" TEXT NOT NULL,
    "collectionId" TEXT NOT NULL,
    "revision" INTEGER NOT NULL,
    "previousRevision" INTEGER NOT NULL,
    "operation" TEXT NOT NULL,
    "actorUserId" TEXT NOT NULL,
    "clientRequestId" TEXT NOT NULL,
    "requestSha256" TEXT NOT NULL,
    "snapshotJson" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StudioSourceCollectionOperation_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "StudioSourceCollectionOperation_revision_check" CHECK (
      "revision" >= 1 AND "previousRevision" >= 0 AND "revision" = "previousRevision" + 1
    ),
    CONSTRAINT "StudioSourceCollectionOperation_kind_check" CHECK (
      "operation" IN ('create-collection', 'update-collection', 'add-source', 'remove-source', 'arrange-sources', 'archive-collection')
    ),
    CONSTRAINT "StudioSourceCollectionOperation_request_check" CHECK ("requestSha256" ~ '^[0-9a-f]{64}$')
);

CREATE UNIQUE INDEX "StudioSourceCollection_projectId_ownerUserId_slug_key" ON "StudioSourceCollection"("projectId", "ownerUserId", "slug");
CREATE UNIQUE INDEX "StudioSourceCollection_project_actor_request_key" ON "StudioSourceCollection"("projectId", "createdByUserId", "clientRequestId");
CREATE INDEX "StudioSourceCollection_projectId_scope_archivedAt_updatedAt_idx" ON "StudioSourceCollection"("projectId", "scope", "archivedAt", "updatedAt");
CREATE INDEX "StudioSourceCollection_ownerUserId_archivedAt_updatedAt_idx" ON "StudioSourceCollection"("ownerUserId", "archivedAt", "updatedAt");

CREATE UNIQUE INDEX "StudioSourceCollectionItem_collectionId_targetKey_key" ON "StudioSourceCollectionItem"("collectionId", "targetKey");
CREATE INDEX "StudioSourceCollectionItem_sourceSetId_idx" ON "StudioSourceCollectionItem"("sourceSetId");
CREATE INDEX "StudioSourceCollectionItem_externalReferenceId_idx" ON "StudioSourceCollectionItem"("externalReferenceId");
CREATE INDEX "StudioSourceCollectionItem_mediaAssetId_idx" ON "StudioSourceCollectionItem"("mediaAssetId");
CREATE INDEX "StudioSourceCollectionItem_collectionId_sortOrder_idx" ON "StudioSourceCollectionItem"("collectionId", "sortOrder");

CREATE UNIQUE INDEX "StudioSourceCollectionOperation_collectionId_revision_key" ON "StudioSourceCollectionOperation"("collectionId", "revision");
CREATE UNIQUE INDEX "StudioSourceCollectionOperation_collectionId_actorUserId_clientRequestId_key" ON "StudioSourceCollectionOperation"("collectionId", "actorUserId", "clientRequestId");
CREATE INDEX "StudioSourceCollectionOperation_actorUserId_createdAt_idx" ON "StudioSourceCollectionOperation"("actorUserId", "createdAt");

ALTER TABLE "StudioSourceCollection" ADD CONSTRAINT "StudioSourceCollection_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "StudioProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StudioSourceCollection" ADD CONSTRAINT "StudioSourceCollection_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StudioSourceCollection" ADD CONSTRAINT "StudioSourceCollection_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StudioSourceCollection" ADD CONSTRAINT "StudioSourceCollection_updatedByUserId_fkey" FOREIGN KEY ("updatedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "StudioSourceCollectionItem" ADD CONSTRAINT "StudioSourceCollectionItem_collectionId_fkey" FOREIGN KEY ("collectionId") REFERENCES "StudioSourceCollection"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StudioSourceCollectionItem" ADD CONSTRAINT "StudioSourceCollectionItem_sourceSetId_fkey" FOREIGN KEY ("sourceSetId") REFERENCES "StudioMediaSourceSet"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StudioSourceCollectionItem" ADD CONSTRAINT "StudioSourceCollectionItem_externalReferenceId_fkey" FOREIGN KEY ("externalReferenceId") REFERENCES "StudioExternalMediaReference"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StudioSourceCollectionItem" ADD CONSTRAINT "StudioSourceCollectionItem_mediaAssetId_fkey" FOREIGN KEY ("mediaAssetId") REFERENCES "StudioMediaAsset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StudioSourceCollectionItem" ADD CONSTRAINT "StudioSourceCollectionItem_addedByUserId_fkey" FOREIGN KEY ("addedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "StudioSourceCollectionOperation" ADD CONSTRAINT "StudioSourceCollectionOperation_collectionId_fkey" FOREIGN KEY ("collectionId") REFERENCES "StudioSourceCollection"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StudioSourceCollectionOperation" ADD CONSTRAINT "StudioSourceCollectionOperation_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
