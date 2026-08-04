-- Promote the already-deployed same-project podcast episode metadata binding
-- into a first-class nullable relation. The metadata value remains in place
-- during a compatibility window so old Capture clients and retained manifests
-- remain readable and rollback can drop only the new relation.
ALTER TABLE "CallRoom"
  ADD COLUMN "episodeProductionId" TEXT;

UPDATE "CallRoom" AS room
SET "episodeProductionId" = episode.id
FROM "StudioEpisodeProduction" AS episode
WHERE room."purpose" = 'PODCAST'
  AND room."projectId" = episode."projectId"
  AND jsonb_typeof(room."metadataJson" -> 'episodeSlug') = 'string'
  AND episode."slug" = room."metadataJson" ->> 'episodeSlug';

ALTER TABLE "CallRoom"
  ADD CONSTRAINT "CallRoom_episodeProductionId_fkey"
  FOREIGN KEY ("episodeProductionId")
  REFERENCES "StudioEpisodeProduction"("id")
  ON DELETE SET NULL
  ON UPDATE CASCADE;

CREATE INDEX "CallRoom_episodeProductionId_status_recordingStartedAt_idx"
  ON "CallRoom"("episodeProductionId", "status", "recordingStartedAt");
