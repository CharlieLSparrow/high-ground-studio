-- One person may rotate a private capability, but must never retain two active
-- links for the same calendar collection. Reconcile any pre-constraint race
-- deterministically before installing the database-owned invariant.

WITH ranked_active_feeds AS (
  SELECT
    "id",
    ROW_NUMBER() OVER (
      PARTITION BY "collectionId", "ownerUserId"
      ORDER BY "createdAt" DESC, "id" DESC
    ) AS "activeRank"
  FROM "CalendarFeed"
  WHERE "status" = 'ACTIVE'
    AND "ownerUserId" IS NOT NULL
), duplicate_active_feeds AS (
  SELECT feed.*
  FROM "CalendarFeed" AS feed
  INNER JOIN ranked_active_feeds AS ranked ON ranked."id" = feed."id"
  WHERE ranked."activeRank" > 1
)
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
  'calendar-feed-race-reconcile-' || MD5(duplicate."id"),
  duplicate."collectionId",
  duplicate."ownerUserId",
  'FEED_REVOKE',
  'SUCCEEDED',
  false,
  CURRENT_TIMESTAMP,
  JSONB_BUILD_OBJECT(
    'source', 'calendar-feed-active-uniqueness-migration',
    'feedId', duplicate."id",
    'reason', 'older-race-created-active-capability',
    'externalMutated', false
  ),
  CURRENT_TIMESTAMP
FROM duplicate_active_feeds AS duplicate;

WITH ranked_active_feeds AS (
  SELECT
    "id",
    ROW_NUMBER() OVER (
      PARTITION BY "collectionId", "ownerUserId"
      ORDER BY "createdAt" DESC, "id" DESC
    ) AS "activeRank"
  FROM "CalendarFeed"
  WHERE "status" = 'ACTIVE'
    AND "ownerUserId" IS NOT NULL
)
UPDATE "CalendarFeed" AS feed
SET
  "status" = 'REVOKED',
  "revokedAt" = COALESCE(feed."revokedAt", CURRENT_TIMESTAMP),
  "updatedAt" = CURRENT_TIMESTAMP
FROM ranked_active_feeds AS ranked
WHERE feed."id" = ranked."id"
  AND ranked."activeRank" > 1;

CREATE UNIQUE INDEX "CalendarFeed_one_active_owner_collection_key"
ON "CalendarFeed"("collectionId", "ownerUserId")
WHERE "status" = 'ACTIVE' AND "ownerUserId" IS NOT NULL;
