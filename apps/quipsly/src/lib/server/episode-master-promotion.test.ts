import assert from "node:assert/strict";
import test from "node:test";

import {
  EpisodeMasterPromotionError,
  queueEpisodeMasterPromotion,
  readEpisodeMasterPromotionSummary,
} from "./episode-master-promotion.js";

test("readEpisodeMasterPromotionSummary returns empty summary when no promotions exist", async () => {
  const mockPrisma = {
    studioEpisodeMasterPromotionReceipt: {
      async findFirst() {
        return null;
      },
      async count() {
        return 0;
      },
    },
  };

  const summary = await readEpisodeMasterPromotionSummary({
    prisma: mockPrisma,
    masterReviewReceiptId: "review-123",
  });

  assert.equal(summary.latest, null);
  assert.equal(summary.promotionCount, 0);
  assert.equal(summary.boundaries.requiresExplicitMasterApproval, true);
});

test("queueEpisodeMasterPromotion throws error when master review is not APPROVED", async () => {
  const mockPrisma = {
    studioEpisodeMasterReviewReceipt: {
      async findUnique() {
        return {
          id: "review-123",
          decision: "REJECTED",
        };
      },
    },
  };

  await assert.rejects(
    () =>
      queueEpisodeMasterPromotion({
        prisma: mockPrisma,
        projectSlug: "proj-slug",
        episodeSlug: "ep-slug",
        masterReviewReceiptId: "review-123",
        actor: { email: "test@example.com" },
        clientRequestId: "req-1",
      }),
    (err: any) => {
      assert(err instanceof EpisodeMasterPromotionError);
      assert.equal(err.code, "EPISODE_MASTER_PROMOTION_UNAPPROVED");
      return true;
    },
  );
});
