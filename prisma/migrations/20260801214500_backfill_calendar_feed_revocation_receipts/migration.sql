-- Older subscription rotations and the active-feed uniqueness reconciliation
-- can contain a revoked capability without one feed-specific receipt. Backfill
-- that provenance once without changing capability state or external systems.

INSERT INTO "CalendarSyncReceipt" (
  "id",
  "collectionId",
  "actorUserId",
  "operation",
  "outcome",
  "externalMutated",
  "occurredAt",
  "metadataJson",
  "createdAt"
)
SELECT
  'calendar-feed-revoke-backfill-' || MD5(feed."id"),
  feed."collectionId",
  feed."ownerUserId",
  'FEED_REVOKE',
  'SUCCEEDED',
  false,
  COALESCE(feed."revokedAt", feed."updatedAt"),
  JSONB_BUILD_OBJECT(
    'source', 'calendar-feed-revocation-receipt-backfill',
    'feedId', feed."id",
    'reason', 'historical-revoked-capability-without-feed-specific-receipt',
    'externalMutated', false
  ),
  CURRENT_TIMESTAMP
FROM "CalendarFeed" AS feed
WHERE feed."status" = 'REVOKED'
  AND feed."ownerUserId" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM "CalendarSyncReceipt" AS receipt
    WHERE receipt."collectionId" = feed."collectionId"
      AND receipt."actorUserId" = feed."ownerUserId"
      AND receipt."operation" = 'FEED_REVOKE'
      AND receipt."metadataJson"->>'feedId' = feed."id"
  );
