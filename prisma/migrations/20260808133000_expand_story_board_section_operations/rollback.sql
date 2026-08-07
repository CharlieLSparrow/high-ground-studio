DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM "StudioStoryBoardSectionOperation"
        WHERE "revision" = 1
           OR "previousRevision" = 0
           OR "operation" = 'create-section'
    ) THEN
        RAISE EXCEPTION 'Cannot narrow story-board section constraints while durable create-section receipts exist. Roll back the application while retaining the expanded backward-compatible database constraint.';
    END IF;
END $$;

ALTER TABLE "StudioStoryBoardSectionOperation"
    DROP CONSTRAINT "StudioStoryBoardSectionOperation_revision_check";

ALTER TABLE "StudioStoryBoardSectionOperation"
    DROP CONSTRAINT "StudioStoryBoardSectionOperation_kind_check";

ALTER TABLE "StudioStoryBoardSectionOperation"
    ADD CONSTRAINT "StudioStoryBoardSectionOperation_revision_check"
    CHECK (
        "revision" >= 2
        AND "previousRevision" >= 1
        AND "revision" > "previousRevision"
    );

ALTER TABLE "StudioStoryBoardSectionOperation"
    ADD CONSTRAINT "StudioStoryBoardSectionOperation_kind_check"
    CHECK ("operation" IN ('create-writing-document', 'update-section', 'archive-section'));
