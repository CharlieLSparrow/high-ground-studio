import { fireEvent, render, screen } from "@testing-library/react";

import { AudioMasteryAudition, type AudioMasteryMeasurement } from "./AudioMasteryAudition";

const measured: AudioMasteryMeasurement = {
  measuredAt: "2026-08-05T19:30:00.000Z",
  durationSeconds: 10,
  integratedLufs: -16,
  truePeakDbtp: -1.5,
  loudnessRangeLu: 3,
  thresholdLufs: -26,
  seriesResolutionMs: 1_000,
  series: [
    { timeMs: 1_000, momentaryLufs: -16, shortTermLufs: -16, integratedLufs: -16, truePeakDbtp: -1.5 },
    { timeMs: 5_000, momentaryLufs: -16, shortTermLufs: -16, integratedLufs: -16, truePeakDbtp: -1.5 },
    { timeMs: 9_000, momentaryLufs: -16, shortTermLufs: -16, integratedLufs: -16, truePeakDbtp: -1.5 },
  ],
};

describe("audio delivery artifact desk", () => {
  it("keeps encoded-byte review separate from output packaging and publishing", () => {
    render(<AudioMasteryAudition
      masteryJobId="audio_mastery_ui_001"
      sourceUrl="/source.wav"
      masteredUrl="/master.wav"
      source={{ ...measured, integratedLufs: -24 }}
      mastered={measured}
      targetLufs={-16}
      maximumTruePeakDbtp={-1}
      diagnosis={null}
      promotion={{
        active: true,
        latest: { id: "promotion_ui_001", jobId: "audio_mastery_ui_001", reviewReceiptId: "review_master_ui_001", operation: "promote", reason: null, occurredAt: "2026-08-05T19:30:00.000Z", actorEmail: "qa@example.test", candidatePlaybackUrl: "/master.wav" },
        activePromotion: { id: "promotion_ui_001", jobId: "audio_mastery_ui_001", reviewReceiptId: "review_master_ui_001", operation: "promote", reason: null, occurredAt: "2026-08-05T19:30:00.000Z", actorEmail: "qa@example.test", candidatePlaybackUrl: "/master.wav" },
        promoteCount: 1, withdrawalCount: 0, candidatePlaybackUrl: "/master.wav",
        boundaries: { originalRemainsSourceTruth: true, episodeSpineUnchanged: true, deliveryEncodingNotCreated: true, publicationNotStarted: true, withdrawalPreservesHistory: true },
      }}
      delivery={{
        jobId: "audio_delivery_ui_001", status: "completed", masteryJobId: "audio_mastery_ui_001", promotionReceiptId: "promotion_ui_001", profileId: "apple-podcasts-aac-stereo-v1",
        output: { playbackUrl: "/delivery.m4a", sha256: "a".repeat(64), sizeBytes: 128_000, durationSeconds: 10, codec: "aac", codecProfile: "LC", sampleRateHz: 48_000, channels: 2, bitrateBps: 128_000, integratedLufs: -16, truePeakDbtp: -1.2, fastStart: true, completeDecode: true },
        review: { latest: null, approvalCount: 0, rejectionCount: 0 }, promotionStillActive: true, error: null, updatedAt: "2026-08-05T19:31:00.000Z",
        boundaries: { originalRemainsSourceTruth: true, outputIsUnapprovedDeliveryArtifact: true, proofListenRequiredBeforeOutputPacket: true, uploadNotStarted: true, publicationNotStarted: true },
      }}
      onDelivery={jest.fn()}
      onDeliveryReview={jest.fn()}
    />);
    fireEvent.click(screen.getByRole("button", { name: /open full audition desk/i }));
    const delivery = screen.getByRole("region", { name: "Podcast delivery artifact" });
    expect(delivery).toHaveTextContent(/AAC-LC/i);
    expect(delivery).toHaveTextContent(/cannot create an output packet, upload, or publish/i);
    expect(screen.getByRole("button", { name: /approve encoded bytes as heard/i })).toBeDisabled();
    expect(screen.getByLabelText("Encoded podcast delivery artifact")).toHaveAttribute("src", "/delivery.m4a");
  });
});
