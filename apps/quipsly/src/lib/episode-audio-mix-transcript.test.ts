import { createHash } from "node:crypto";

import { projectEpisodeAudioMixTranscriptReview } from "./episode-audio-mix-transcript";

function sha256(value: string) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function track(overrides: Record<string, unknown> = {}) {
  return {
    assetId: "asset-primary",
    sourceId: "source-primary",
    title: "Charlie MV7i",
    participantLabel: "Charlie",
    programOffsetSeconds: 2.5,
    transcriptJobId: "transcript-primary",
    provider: "openai-whisper-local",
    providerModel: "large-v3-turbo",
    unavailableReason: null,
    ...overrides,
  };
}

function segment(overrides: Record<string, unknown> = {}) {
  const text = "The original provider words are immutable evidence.";
  return {
    id: "segment-primary-1",
    transcriptJobId: "transcript-primary",
    startSeconds: 27.5,
    endSeconds: 31.5,
    text,
    speakerLabel: "Speaker 0",
    confidence: 0.82,
    corrections: [],
    verifications: [],
    ...overrides,
  };
}

describe("Episode mix transcript checkpoint projection", () => {
  it("maps source time onto the program clock and keeps provider confidence distinct from accuracy", () => {
    const projection = projectEpisodeAudioMixTranscriptReview({
      checkpointSeconds: [30],
      tracks: [track()],
      segments: [segment()],
    });

    expect(projection.status).toBe("available");
    expect(projection.checkpoints[0]?.snippets[0]).toMatchObject({
      programStartSeconds: 30,
      programEndSeconds: 34,
      sourceStartSeconds: 27.5,
      reviewStatus: "provider",
      providerConfidence: 0.82,
      text: "The original provider words are immutable evidence.",
    });
    expect(projection.boundaries.providerConfidenceIsNotMeasuredAccuracy).toBe(true);
    expect(projection.boundaries.transcriptDoesNotAuthorizeMixAutomation).toBe(true);
  });

  it("applies only a snapshot-matching accepted correction and exposes its review receipt", () => {
    const providerText = "The original provider words are immutable evidence.";
    const projection = projectEpisodeAudioMixTranscriptReview({
      checkpointSeconds: [30],
      tracks: [track()],
      segments: [segment({ corrections: [{
        id: "correction-reviewed-1",
        status: "accepted",
        baseTextSha256: sha256(providerText),
        expectedText: providerText,
        expectedSpeakerLabel: "Speaker 0",
        startSecondsSnapshot: 27.5,
        endSecondsSnapshot: 31.5,
        correctedText: "The human-reviewed words remain an overlay.",
        correctedSpeakerLabel: "Charlie",
        reviewedAt: "2026-08-06T12:00:00.000Z",
        updatedAt: "2026-08-06T12:00:00.000Z",
      }] })],
    });

    expect(projection.checkpoints[0]?.snippets[0]).toMatchObject({
      text: "The human-reviewed words remain an overlay.",
      speakerLabel: "Charlie",
      reviewStatus: "human-corrected",
      reviewReceiptId: "correction-reviewed-1",
      providerTextSha256: sha256(providerText),
    });
  });

  it("ignores stale corrections while recognizing a current confirmed-as-is receipt", () => {
    const providerText = "The original provider words are immutable evidence.";
    const projection = projectEpisodeAudioMixTranscriptReview({
      checkpointSeconds: [30],
      tracks: [track()],
      segments: [segment({
        corrections: [{
          id: "stale-correction",
          status: "accepted",
          baseTextSha256: "0".repeat(64),
          expectedText: "old provider text",
          expectedSpeakerLabel: "Speaker 0",
          startSecondsSnapshot: 27.5,
          endSecondsSnapshot: 31.5,
          correctedText: "This must not appear.",
          correctedSpeakerLabel: null,
          reviewedAt: "2026-08-06T12:00:00.000Z",
          updatedAt: "2026-08-06T12:00:00.000Z",
        }],
        verifications: [{
          id: "verification-current-1",
          reviewKind: "confirmed-as-is",
          providerTextSha256: sha256(providerText),
          providerSpeakerLabel: "Speaker 0",
          startSecondsSnapshot: 27.5,
          endSecondsSnapshot: 31.5,
          createdAt: "2026-08-06T12:01:00.000Z",
        }],
      })],
    });

    expect(projection.checkpoints[0]?.snippets[0]).toMatchObject({
      text: providerText,
      reviewStatus: "human-confirmed",
      reviewReceiptId: "verification-current-1",
    });
  });

  it("reports partial and unavailable coverage without inventing text", () => {
    const partial = projectEpisodeAudioMixTranscriptReview({
      checkpointSeconds: [2, 30],
      tracks: [track(), track({ assetId: "asset-camera", title: "Camera scratch", transcriptJobId: null, unavailableReason: "Transcription has not been run." })],
      segments: [segment()],
    });
    expect(partial.status).toBe("partial");
    expect(partial.missingTrackCount).toBe(1);
    expect(partial.checkpoints[0]?.snippets).toEqual([]);

    const unavailable = projectEpisodeAudioMixTranscriptReview({
      checkpointSeconds: [30],
      tracks: [track({ transcriptJobId: null })],
      segments: [],
    });
    expect(unavailable.status).toBe("unavailable");
    expect(unavailable.checkpoints[0]?.snippets).toEqual([]);
    expect(unavailable.detail).toMatch(/No included exact source/);
  });
});
