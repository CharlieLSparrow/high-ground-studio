import {
  EPISODE_ARTIFACT_CURRENT_VERSION,
  EPISODE_ARTIFACT_LEGACY_VERSION,
  getEpisodePayloadVersion,
  normalizeEpisodeArtifact,
} from "./episodeArtifact";

describe("episode artifact v4", () => {
  it("keeps unversioned recorder payloads on the legacy version", () => {
    expect(getEpisodePayloadVersion({ version: "quipsly-recording-room.v1" })).toBe(EPISODE_ARTIFACT_LEGACY_VERSION);
    expect(getEpisodePayloadVersion({ timelineClips: [], transcript: [] })).toBe(EPISODE_ARTIFACT_LEGACY_VERSION);
    expect(EPISODE_ARTIFACT_CURRENT_VERSION).toBe(4);
  });

  it("round-trips optional exact range decisions and speaker metadata", () => {
    const artifact = normalizeEpisodeArtifact({
      payloadVersion: 4,
      projectSlug: "high-ground-odyssey",
      episodeSlug: "audio-evidence",
      source: "quipsly-editor",
      timelineClips: [],
      transcript: [{
        id: "words-1",
        time: 0,
        duration: 2,
        text: "Keep the speaker label.",
        deleted: false,
        deactivated: false,
        alert: null,
        speaker: "Charlie",
      }],
      deactivatedRanges: [{
        id: "range-1",
        startSeconds: 2,
        durationSeconds: 3,
        reason: "Measured low energy.",
        source: "deterministic-signal",
      }],
      speakerCameraMappings: [{
        id: "map-charlie",
        speakerKey: "charlie",
        speakerLabel: "Charlie",
        targetClipId: "charlie-camera",
        targetAssetId: "charlie.mp4",
        source: "manual",
        createdAt: "2026-08-03T00:00:00.000Z",
      }],
      cameraSwitchDecisions: [{
        id: "camera-switch:map-charlie:0",
        startSeconds: 0,
        durationSeconds: 2,
        speakerKey: "charlie",
        speakerLabel: "Charlie",
        targetClipId: "charlie-camera",
        targetAssetId: "charlie.mp4",
        mappingId: "map-charlie",
        source: "deterministic-speaker",
        status: "draft",
        createdAt: "2026-08-03T00:00:00.000Z",
        evidence: { transcriptBlockIds: ["words-1"] },
      }],
      generatedFrom: "test",
      savedAt: "2026-08-03T00:00:00.000Z",
    });

    expect(artifact).toEqual(expect.objectContaining({
      payloadVersion: 4,
      transcript: [expect.objectContaining({ speaker: "Charlie", deactivated: false })],
      deactivatedRanges: [expect.objectContaining({ id: "range-1", startSeconds: 2, durationSeconds: 3 })],
      speakerCameraMappings: [expect.objectContaining({ speakerKey: "charlie", targetClipId: "charlie-camera" })],
      cameraSwitchDecisions: [expect.objectContaining({ targetClipId: "charlie-camera", status: "draft" })],
    }));
  });
});
