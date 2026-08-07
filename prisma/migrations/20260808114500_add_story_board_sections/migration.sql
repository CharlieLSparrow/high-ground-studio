CREATE TABLE "StudioStoryBoardSection" (
    "id" TEXT NOT NULL,
    "boardId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "synopsis" TEXT NOT NULL DEFAULT '',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "documentId" TEXT,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "createdByUserId" TEXT NOT NULL,
    "updatedByUserId" TEXT,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "StudioStoryBoardSection_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "StudioStoryBoardSection_key_check" CHECK ("key" ~ '^[a-z0-9][a-z0-9_-]{0,59}$'),
    CONSTRAINT "StudioStoryBoardSection_revision_check" CHECK ("revision" >= 1),
    CONSTRAINT "StudioStoryBoardSection_sort_check" CHECK ("sortOrder" >= 0)
);

CREATE TABLE "StudioStoryBoardSectionOperation" (
    "id" TEXT NOT NULL,
    "sectionId" TEXT NOT NULL,
    "revision" INTEGER NOT NULL,
    "previousRevision" INTEGER NOT NULL,
    "operation" TEXT NOT NULL,
    "actorUserId" TEXT NOT NULL,
    "clientRequestId" TEXT NOT NULL,
    "requestSha256" TEXT NOT NULL,
    "snapshotJson" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "StudioStoryBoardSectionOperation_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "StudioStoryBoardSectionOperation_revision_check" CHECK ("revision" >= 2 AND "previousRevision" >= 1 AND "revision" > "previousRevision"),
    CONSTRAINT "StudioStoryBoardSectionOperation_kind_check" CHECK ("operation" IN ('create-writing-document', 'update-section', 'archive-section')),
    CONSTRAINT "StudioStoryBoardSectionOperation_request_check" CHECK ("requestSha256" ~ '^[0-9a-f]{64}$')
);

CREATE UNIQUE INDEX "StudioStoryBoardSection_boardId_key_key" ON "StudioStoryBoardSection"("boardId", "key");
CREATE UNIQUE INDEX "StudioStoryBoardSection_documentId_key" ON "StudioStoryBoardSection"("documentId");
CREATE INDEX "StudioStoryBoardSection_boardId_archivedAt_sortOrder_idx" ON "StudioStoryBoardSection"("boardId", "archivedAt", "sortOrder");
CREATE INDEX "StudioStoryBoardSection_documentId_idx" ON "StudioStoryBoardSection"("documentId");
CREATE UNIQUE INDEX "StudioStoryBoardSectionOperation_sectionId_revision_key" ON "StudioStoryBoardSectionOperation"("sectionId", "revision");
CREATE UNIQUE INDEX "StudioStoryBoardSectionOperation_section_actor_request_key" ON "StudioStoryBoardSectionOperation"("sectionId", "actorUserId", "clientRequestId");
CREATE INDEX "StudioStoryBoardSectionOperation_actorUserId_createdAt_idx" ON "StudioStoryBoardSectionOperation"("actorUserId", "createdAt");

INSERT INTO "StudioStoryBoardSection" (
    "id", "boardId", "key", "title", "sortOrder", "createdByUserId", "createdAt", "updatedAt"
)
SELECT
    'story-section-' || md5(placement."boardId" || ':' || placement."groupKey"),
    placement."boardId",
    placement."groupKey",
    initcap(replace(replace(placement."groupKey", '-', ' '), '_', ' ')),
    MIN(placement."sortOrder"),
    (array_agg(placement."createdByUserId" ORDER BY placement."sortOrder", placement."createdAt", placement."id"))[1],
    MIN(placement."createdAt"),
    CURRENT_TIMESTAMP
FROM "StudioStoryBoardPlacement" placement
GROUP BY placement."boardId", placement."groupKey";

ALTER TABLE "StudioStoryBoardSection" ADD CONSTRAINT "StudioStoryBoardSection_boardId_fkey" FOREIGN KEY ("boardId") REFERENCES "StudioStoryBoard"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StudioStoryBoardSection" ADD CONSTRAINT "StudioStoryBoardSection_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "StudioDocument"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "StudioStoryBoardSection" ADD CONSTRAINT "StudioStoryBoardSection_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StudioStoryBoardSection" ADD CONSTRAINT "StudioStoryBoardSection_updatedByUserId_fkey" FOREIGN KEY ("updatedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "StudioStoryBoardSectionOperation" ADD CONSTRAINT "StudioStoryBoardSectionOperation_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "StudioStoryBoardSection"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StudioStoryBoardSectionOperation" ADD CONSTRAINT "StudioStoryBoardSectionOperation_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StudioStoryBoardPlacement" ADD CONSTRAINT "StudioStoryBoardPlacement_boardId_groupKey_fkey" FOREIGN KEY ("boardId", "groupKey") REFERENCES "StudioStoryBoardSection"("boardId", "key") ON DELETE RESTRICT ON UPDATE CASCADE;
