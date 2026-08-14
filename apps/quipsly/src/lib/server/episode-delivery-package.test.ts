import assert from "node:assert/strict";
import test from "node:test";

import {
  EpisodeDeliveryPackageError,
  createEpisodeDeliveryPackage,
  readEpisodeDeliveryPackageSummary,
} from "./episode-delivery-package.js";

test("readEpisodeDeliveryPackageSummary returns empty summary when no packages exist", async () => {
  const mockPrisma = {
    studioEpisodeDeliveryPackageReceipt: {
      async findFirst() {
        return null;
      },
      async count() {
        return 0;
      },
    },
  };

  const summary = await readEpisodeDeliveryPackageSummary({
    prisma: mockPrisma,
    promotionReceiptId: "promo-rcpt-1",
  });

  assert.equal(summary.latest, null);
  assert.equal(summary.packageCount, 0);
  assert.equal(summary.boundaries.deliveryPackageIsImmutable, true);
});

test("createEpisodeDeliveryPackage throws error when promotion receipt does not exist", async () => {
  const mockPrisma = {
    studioEpisodeMasterPromotionReceipt: {
      async findUnique() {
        return null;
      },
    },
  };

  await assert.rejects(
    () =>
      createEpisodeDeliveryPackage({
        prisma: mockPrisma,
        promotionReceiptId: "missing-promo-1",
        actor: { email: "producer@example.com" },
        clientRequestId: "req-deliv-1",
        title: "Test Package",
        summary: "Test summary",
      }),
    (err: any) => {
      assert(err instanceof EpisodeDeliveryPackageError);
      assert.equal(err.code, "EPISODE_DELIVERY_PACKAGE_PROMOTION_REQUIRED");
      return true;
    },
  );
});
