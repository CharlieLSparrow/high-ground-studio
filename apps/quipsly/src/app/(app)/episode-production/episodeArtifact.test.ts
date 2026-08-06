import {
  EPISODE_ARTIFACT_CURRENT_VERSION,
  EPISODE_ARTIFACT_LEGACY_VERSION,
  episodeTimelineContentFingerprint,
  getEpisodePayloadVersion,
  normalizeEpisodeArtifact,
} from "./episodeArtifact";

describe("episode artifact v5", () => {
  it("keeps unversioned recorder payloads on the legacy version", () => {
    expect(getEpisodePayloadVersion({ version: "quipsly-recording-room.v1" })).toBe(EPISODE_ARTIFACT_LEGACY_VERSION);
    expect(getEpisodePayloadVersion({ timelineClips: [], transcript: [] })).toBe(EPISODE_ARTIFACT_LEGACY_VERSION);
    expect(EPISODE_ARTIFACT_CURRENT_VERSION).toBe(5);
  });

  it("round-trips optional exact range decisions and speaker metadata", () => {
    const artifact = normalizeEpisodeArtifact({
      payloadVersion: 5,
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
      cameraAssemblyPolicy: {
        id: "camera-assembly-policy",
        style: "natural-conversation",
        minimumShotSeconds: 2,
        speakerSwitchDelaySeconds: 0.2,
        wideAngleMode: "overlap-and-silence",
        wideClipId: "wide-camera",
        silenceWideThresholdSeconds: 1.25,
        cutawayIntervalSeconds: null,
        cutawayDurationSeconds: 2.5,
        useWideForIntroOutro: true,
        source: "manual",
        createdAt: "2026-08-07T00:00:00.000Z",
      },
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
      payloadVersion: 5,
      transcript: [expect.objectContaining({ speaker: "Charlie", deactivated: false })],
      deactivatedRanges: [expect.objectContaining({ id: "range-1", startSeconds: 2, durationSeconds: 3 })],
      speakerCameraMappings: [expect.objectContaining({ speakerKey: "charlie", targetClipId: "charlie-camera" })],
      cameraAssemblyPolicy: expect.objectContaining({ style: "natural-conversation", wideClipId: "wide-camera" }),
      cameraSwitchDecisions: [expect.objectContaining({ targetClipId: "charlie-camera", status: "draft" })],
    }));
  });

  it("fingerprints semantically identical browser and server transcript defaults equally", () => {
    const serverTimeline = {
      clips: [],
      transcript: [{
        id: "words-1",
        text: "Same canonical words.",
        time: 0,
        duration: 2,
        alert: null,
        deleted: false,
      }],
    };
    const browserTimeline = {
      clips: [],
      transcript: [{
        id: "words-1",
        time: 0,
        duration: 2,
        text: "Same canonical words.",
        deleted: false,
        alert: null,
        speaker: null,
        speakerParticipantId: null,
        speakerUserId: null,
        acceptedReviewId: null,
        deactivated: false,
        aiSuggested: false,
      }],
    };

    expect(episodeTimelineContentFingerprint(serverTimeline)).toBe(
      episodeTimelineContentFingerprint(browserTimeline),
    );
  });

  it("fingerprints audible and visual edit decisions", () => {
    const base = {
      clips: [{
        id: "clip-1",
        assetId: "/api/ingest/media/source-1",
        kind: "audio" as const,
        startIn: 0,
        duration: 2,
        sourceStart: 0,
        sourceEnd: 2,
        name: "Audio",
        color: "#fff",
        trackId: "A1",
      }],
      transcript: [],
    };
    const changedVolume = { ...base, clips: [{ ...base.clips[0], volume: 0.5 }] };
    const changedTransform = { ...base, clips: [{
      ...base.clips[0],
      transforms: [{ id: "zoom-1", timeOffset: 0, scale: 1.2 }],
    }] };

    expect(episodeTimelineContentFingerprint(changedVolume)).not.toBe(episodeTimelineContentFingerprint(base));
    expect(episodeTimelineContentFingerprint(changedTransform)).not.toBe(episodeTimelineContentFingerprint(base));
  });
});
