import {
  EPISODE_ARTIFACT_CURRENT_VERSION,
  EPISODE_ARTIFACT_LEGACY_VERSION,
  buildEpisodeArtifactPayload,
  episodeTimelineContentFingerprint,
  getEpisodePayloadVersion,
  normalizeEpisodeArtifact,
  timelineStateFromEpisodeArtifact,
} from "./episodeArtifact";

describe("episode artifact v6", () => {
  it("keeps unversioned recorder payloads on the legacy version", () => {
    expect(getEpisodePayloadVersion({ version: "quipsly-recording-room.v1" })).toBe(EPISODE_ARTIFACT_LEGACY_VERSION);
    expect(getEpisodePayloadVersion({ timelineClips: [], transcript: [] })).toBe(EPISODE_ARTIFACT_LEGACY_VERSION);
    expect(EPISODE_ARTIFACT_CURRENT_VERSION).toBe(6);
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

  it("round-trips Source Story identity and spatial view decisions without flattening them", () => {
    const sourceStory = {
      schema: "quipsly-source-story-timeline-binding-v1" as const,
      placementId: "placement-1",
      cardId: "card-1",
      cardStableId: "story-card:project:card-1",
      cardRevision: 3,
      sourceRangeId: "range-1",
      selectorSha256: "1".repeat(64),
      sourceRevisionId: "revision-1",
      sourceIdentitySha256: "2".repeat(64),
      sourceContentSha256: "3".repeat(64),
      sourceSetId: "set-1",
      sourceSetIdentitySha256: "4".repeat(64),
      externalReferenceId: "external-1",
      browseDerivative: { id: "proxy-1", profile: "browse-1080p", contentSha256: "5".repeat(64), sizeBytes: "1234", mimeType: "video/mp4" },
      reframeRecipe: {
        schema: "quipsly-360-reframe-v1" as const,
        projection: "equirectangular" as const,
        aspectRatio: "16:9" as const,
        stabilization: "flowstate" as const,
        horizonLock: true,
        keyframes: [{ sourceSeconds: 12, panDegrees: 20, tiltDegrees: -4, rollDegrees: 1, fieldOfViewDegrees: 80, interpolation: "ease" as const }],
      },
      promotedAt: "2026-08-08T00:00:00.000Z",
      promotedByUserId: "user-1",
      promotedByEmail: "editor@quipsly.com",
      boundaries: {
        sourceMediaUnchanged: true as const,
        browseDerivativeIsNotOriginal: true as const,
        sourceClockPreserved: true as const,
        finalRenderMustResolveExactSource: true as const,
        publicationNotStarted: true as const,
      },
    };
    const timeline = {
      clips: [{
        id: "source-story:placement-1",
        assetId: "source-story-source:revision-1",
        sourceId: "revision-1",
        kind: "video" as const,
        trackId: "V2",
        startIn: 30,
        duration: 8,
        sourceStart: 10,
        sourceEnd: 18,
        name: "Spatial select",
        color: "#7c3aed",
        volume: 0.8,
        deactivated: false,
        transforms: [{ id: "view-1", timeOffset: 2, scale: 80, x: 20, y: -4, rotation: 1, easing: "ease-in-out" as const }],
        sourceStory,
      }],
      transcript: [],
    };

    const artifact = buildEpisodeArtifactPayload({ timeline, projectSlug: "high-ground-odyssey", episodeSlug: "episode-9", generatedFrom: "test", savedAt: "2026-08-08T00:00:00.000Z" });
    const hydrated = timelineStateFromEpisodeArtifact(artifact);

    expect(artifact.payloadVersion).toBe(6);
    expect(hydrated.clips[0]).toEqual(expect.objectContaining({
      volume: 0.8,
      deactivated: false,
      transforms: [expect.objectContaining({ id: "view-1", scale: 80, x: 20 })],
      sourceStory: expect.objectContaining({ placementId: "placement-1", sourceContentSha256: "3".repeat(64) }),
    }));
    expect(episodeTimelineContentFingerprint(hydrated)).toBe(episodeTimelineContentFingerprint(timeline));
  });
});
