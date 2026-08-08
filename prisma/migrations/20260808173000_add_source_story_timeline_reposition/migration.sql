-- Reposition is an append-only Story placement operation. Rolling this
-- migration back requires first removing any `reposition` ledger rows, then
-- restoring the prior five-value check from 20260808170000.
ALTER TABLE "StudioStoryTimelinePlacementOperation"
  DROP CONSTRAINT "StudioStoryTimelinePlacementOperation_kind_check";

ALTER TABLE "StudioStoryTimelinePlacementOperation"
  ADD CONSTRAINT "StudioStoryTimelinePlacementOperation_kind_check"
  CHECK (
    "operation" IN (
      'promote',
      'withdraw',
      'timeline-reconcile',
      'editor-withdraw',
      'editor-restore',
      'reposition'
    )
  );
