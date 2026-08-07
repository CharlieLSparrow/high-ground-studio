ALTER TABLE "StudioStoryBoard"
ADD COLUMN "clientRequestId" TEXT;

UPDATE "StudioStoryBoard" AS board
SET "clientRequestId" = COALESCE(
  (
    SELECT operation."clientRequestId"
    FROM "StudioStoryBoardOperation" AS operation
    WHERE operation."boardId" = board."id"
      AND operation."revision" = 1
    ORDER BY operation."createdAt" ASC
    LIMIT 1
  ),
  'legacy-board:' || board."id"
);

ALTER TABLE "StudioStoryBoard"
ALTER COLUMN "clientRequestId" SET NOT NULL;

CREATE UNIQUE INDEX "StudioStoryBoard_project_actor_request_key"
ON "StudioStoryBoard"("projectId", "createdByUserId", "clientRequestId");
