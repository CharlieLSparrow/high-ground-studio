ALTER TABLE "StudioStoryTimelinePlacementOperation"
  DROP CONSTRAINT "StudioStoryTimelinePlacementOperation_kind_check";

ALTER TABLE "StudioStoryTimelinePlacementOperation"
  ADD CONSTRAINT "StudioStoryTimelinePlacementOperation_kind_check"
  CHECK ("operation" IN ('promote', 'withdraw', 'timeline-reconcile', 'editor-withdraw', 'editor-restore'));
