ALTER TABLE "StudioStoryBoardSectionOperation"
    DROP CONSTRAINT "StudioStoryBoardSectionOperation_revision_check";

ALTER TABLE "StudioStoryBoardSectionOperation"
    DROP CONSTRAINT "StudioStoryBoardSectionOperation_kind_check";

ALTER TABLE "StudioStoryBoardSectionOperation"
    ADD CONSTRAINT "StudioStoryBoardSectionOperation_revision_check"
    CHECK (
        "revision" >= 1
        AND "previousRevision" >= 0
        AND "revision" = "previousRevision" + 1
    );

ALTER TABLE "StudioStoryBoardSectionOperation"
    ADD CONSTRAINT "StudioStoryBoardSectionOperation_kind_check"
    CHECK (
        "operation" IN (
            'create-section',
            'create-writing-document',
            'update-section',
            'archive-section'
        )
    );
