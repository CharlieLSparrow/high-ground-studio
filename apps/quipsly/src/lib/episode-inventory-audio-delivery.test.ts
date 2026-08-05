import { episodeInventoryAudioDeliveryArtifact } from "./episode-inventory-audio-delivery";

describe("episode audio delivery inventory", () => {
  it("projects verified and proof-listened readiness without claiming upload or publication", () => {
    const delivery = episodeInventoryAudioDeliveryArtifact({
      jobs: [{ id: "audio_delivery_001", type: "audio-delivery", status: "completed", inputJson: { profileId: "apple-podcasts-aac-stereo-v1", source: { masteryJobId: "audio_mastery_001", promotionReceiptId: "promotion_001", sha256: "a".repeat(64) } }, resultJson: { receipt: { output: { sha256: "b".repeat(64), sizeBytes: 1234, durationSeconds: 60, codec: "aac", codecProfile: "LC", sampleRateHz: 48000, channels: 2, bitrateBps: 128000, fastStart: true, completeDecode: true, verificationMeasurement: { integratedLufs: -16, truePeakDbtp: -1.2 } } }, registration: { playbackUrl: "/api/ingest/media/delivery-source" } }, audioDeliveryReviews: [{ id: "delivery_review_001", decision: "APPROVED", occurredAt: new Date("2026-08-05T20:00:00.000Z"), actorEmail: "qa@example.test", note: null }] }],
      variants: [{ kind: "audio-delivery-artifact", url: "/api/ingest/media/delivery-source" }],
      promotionEvents: [{ id: "promotion_001", operation: "PROMOTE" }],
    });
    expect(delivery).toMatchObject({
      readiness: { encodedAndVerified: true, proofListenApproved: true, outputPacketEligible: true, uploadEligible: false, publicationEligible: false },
      outputPacketNotCreated: true, uploadNotStarted: true, publicationNotStarted: true,
    });
  });

  it("holds a historical artifact when its promotion was withdrawn", () => {
    const delivery = episodeInventoryAudioDeliveryArtifact({
      jobs: [{ id: "audio_delivery_001", type: "audio-delivery", status: "completed", inputJson: { source: { promotionReceiptId: "promotion_001" } }, resultJson: { receipt: { output: { sha256: "b".repeat(64) } }, registration: { playbackUrl: "/delivery" } }, audioDeliveryReviews: [{ decision: "APPROVED" }] }],
      variants: [{ kind: "audio-delivery-artifact", url: "/delivery" }],
      promotionEvents: [{ id: "withdrawal_001", operation: "WITHDRAW" }],
    });
    expect(delivery?.promotionStillActive).toBe(false);
    expect(delivery?.readiness.proofListenApproved).toBe(false);
    expect(delivery?.readiness.outputPacketEligible).toBe(false);
  });
});
