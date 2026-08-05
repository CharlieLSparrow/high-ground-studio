/** @jest-environment node */

import { episodeInventoryAudioMasterCandidate } from "@/lib/episode-inventory-audio-master";

function assetWithPromotion(operation: "PROMOTE" | "WITHDRAW") {
  return {
    id: "asset-1",
    filename: "episode.wav",
    url: "/api/ingest/media/source-1",
    mimeType: "audio/wav",
    isProxy: false,
    variants: [{
      id: "variant-1",
      kind: "audio-master-candidate",
      url: "/api/ingest/media/master-1",
      metadataJson: { historicalVariantIsNotCurrentState: true },
      updatedAt: new Date("2026-08-05T12:00:00.000Z"),
    }],
    workflowJobs: [],
    assetAttachments: [],
    audioMasterPromotions: [{
      id: operation === "PROMOTE" ? "promotion-1" : "withdrawal-1",
      masteryJobId: "job-1",
      reviewReceiptId: "review-1",
      operation,
      profileId: "apple-podcasts-dialogue-v1",
      reason: operation === "WITHDRAW" ? "Needs another listening pass." : null,
      actorEmail: "editor@example.test",
      occurredAt: new Date("2026-08-05T12:05:00.000Z"),
      evidenceJson: { candidatePlaybackUrl: "/api/ingest/media/master-1" },
    }],
  };
}

describe("Episode media inventory audio master candidate", () => {
  it("projects the active append-only promotion without changing source truth", () => {
    expect(episodeInventoryAudioMasterCandidate(
      assetWithPromotion("PROMOTE").audioMasterPromotions,
    )).toMatchObject({
      active: true,
      eventId: "promotion-1",
      playbackUrl: "/api/ingest/media/master-1",
      originalRemainsSourceTruth: true,
      episodeSpineUnchanged: true,
      deliveryEncodingNotCreated: true,
      publicationNotStarted: true,
    });
  });

  it("keeps a historical variant visible but not active after withdrawal", () => {
    expect(episodeInventoryAudioMasterCandidate(
      assetWithPromotion("WITHDRAW").audioMasterPromotions,
    )).toMatchObject({
      active: false,
      operation: "withdraw",
      playbackUrl: null,
      reason: "Needs another listening pass.",
    });
  });
});
