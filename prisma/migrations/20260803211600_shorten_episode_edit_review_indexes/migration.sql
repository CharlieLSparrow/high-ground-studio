-- PostgreSQL truncates identifiers at 63 bytes. Give the two long receipt
-- indexes explicit stable names so Prisma schema comparison remains clean.
ALTER INDEX "StudioEpisodeEditReviewReceipt_episodeProductionId_actorEmail_c"
RENAME TO "StudioEpisodeEditReceipt_episode_actor_request_key";

ALTER INDEX "StudioEpisodeEditReviewReceipt_episodeProductionId_occurredAt_i"
RENAME TO "StudioEpisodeEditReceipt_episode_occurred_idx";
