import assert from "node:assert/strict";
import test from "node:test";

import {
  EPISODE_DELIVERY_PACKAGE_MANIFEST_KIND,
  parseEpisodeDeliveryPackageManifest,
  type EpisodeDeliveryPackageManifest,
} from "./episode-delivery-package.js";

const sampleDeliveryManifest: EpisodeDeliveryPackageManifest = {
  kind: EPISODE_DELIVERY_PACKAGE_MANIFEST_KIND,
  version: 1,
  packageId: "deliv-pkg-1001",
  projectId: "proj-101",
  episodeProductionId: "ep-202",
  actorEmail: "producer@example.com",
  createdAt: "2026-08-12T16:30:00.000Z",
  promotedMaster: {
    promotionReceiptId: "promo-rcpt-555",
    gcsBucket: "high-ground-masters-vault",
    gcsObjectName: "media-vault/masters/proj-101/ep-202/master-promoted-1001.mp4",
    gcsGeneration: "2001",
    sha256: "a".repeat(64),
    sizeBytes: 1500000000,
  },
  metadata: {
    title: "Episode 10: High Ground Odyssey",
    summary: "Final master delivery package with verified captions and chapter markers.",
    durationSeconds: 1420.5,
    width: 3840,
    height: 2160,
    fps: 24,
    captions: [
      {
        kind: "vtt",
        language: "en",
        sha256: "c".repeat(64),
        sizeBytes: 45000,
        locator: "media-vault/captions/ep-202/en.vtt",
      },
    ],
    chapters: [
      {
        timeSeconds: 0,
        title: "Introduction",
        synopsis: "Opening sequence and title card",
      },
      {
        timeSeconds: 300,
        title: "Main Discussion",
      },
    ],
  },
  boundaries: {
    deliveryPackageIsImmutable: true,
    requiresPromotedGcsMaster: true,
  },
};

test("parseEpisodeDeliveryPackageManifest validates complete delivery package manifest", () => {
  const parsed = parseEpisodeDeliveryPackageManifest(sampleDeliveryManifest);
  assert.equal(parsed.packageId, "deliv-pkg-1001");
  assert.equal(parsed.metadata.captions.length, 1);
  assert.equal(parsed.metadata.chapters.length, 2);
});

test("parseEpisodeDeliveryPackageManifest rejects invalid SHA-256 in master binding", () => {
  const invalid = {
    ...sampleDeliveryManifest,
    promotedMaster: {
      ...sampleDeliveryManifest.promotedMaster,
      sha256: "invalid-sha",
    },
  };
  assert.throws(
    () => parseEpisodeDeliveryPackageManifest(invalid),
    /Episode delivery package promoted master binding is invalid/,
  );
});
