ALTER TABLE "StudioStoryBoardPlacement"
DROP CONSTRAINT "StudioStoryBoardPlacement_cardId_fkey";

ALTER TABLE "StudioStoryBoardPlacement"
ADD CONSTRAINT "StudioStoryBoardPlacement_cardId_fkey"
FOREIGN KEY ("cardId") REFERENCES "StudioStoryCard"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
