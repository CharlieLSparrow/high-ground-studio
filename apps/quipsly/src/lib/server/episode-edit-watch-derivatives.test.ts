/** @jest-environment node */

jest.mock("@/lib/prisma", () => ({
  getPrismaClient: jest.fn(() => ({})),
}));

import {
  normalizeEpisodeEditMediaChoices,
  normalizeEpisodeEditSources,
  normalizeWatchDerivatives,
  projectCanonicalEpisodeEditState,
  resolveMaterializedTranscriptMediaSelection,
} from "./episode-edit-store";

describe("Episode editor Shared Watch derivatives", () => {
  it("loads only complete receipt-backed Episode Room timeline spans", () => {
    expect(normalizeWatchDerivatives({
      timelineClips: [
        {
          id: "episode-room-watch-segment-1",
          assetId: "asset-clip",
          startIn: 12.5,
          duration: 4,
          sourceStart: 2,
          sourceEnd: 6,
          name: "Watched · reference clip",
          color: "#d37b43",
          kind: "video",
          generatedFrom: "quipsly-episode-room-watch.v1",
          recordingSync: {
            episodeRoomSessionId: "episode-room-session-1",
            recordingRoomId: "call-room-1",
            recordingStartedAt: "2026-07-27T18:59:00.000Z",
            watchSegmentId: "segment-1",
            startReceiptId: "receipt-start",
            endReceiptId: "receipt-end",
            watchedAt: "2026-07-27T19:00:00.000Z",
          },
        },
        {
          id: "unrelated-timeline-clip",
          assetId: "asset-host",
          startIn: 0,
          duration: 10,
          kind: "video",
          generatedFrom: "another-editor",
        },
        {
          id: "incomplete-watch-span",
          assetId: "asset-clip",
          startIn: 20,
          duration: 3,
          kind: "video",
          generatedFrom: "quipsly-episode-room-watch.v1",
          recordingSync: {
            watchSegmentId: "segment-2",
            startReceiptId: "receipt-start-2",
          },
        },
      ],
    })).toEqual([{
      id: "episode-room-watch-segment-1",
      assetId: "asset-clip",
      name: "Watched · reference clip",
      kind: "video",
      startSeconds: 12.5,
      durationSeconds: 4,
      sourceStartSeconds: 2,
      sourceEndSeconds: 6,
      color: "#d37b43",
      episodeRoomSessionId: "episode-room-session-1",
      watchSegmentId: "segment-1",
      startReceiptId: "receipt-start",
      endReceiptId: "receipt-end",
      watchedAt: "2026-07-27T19:00:00.000Z",
      recordingRoomId: "call-room-1",
      recordingStartedAt: "2026-07-27T18:59:00.000Z",
    }]);
  });
});

describe("Episode editor exact source choices", () => {
  it("prefers Capture recording identity and preserves Studio source identity", () => {
    expect(normalizeEpisodeEditMediaChoices({
      importedMedia: [
        {
          id: "capture-media-1",
          sourceId: "capture-source-1",
          originalName: "Charlie MV7i.wav",
          kind: "audio",
          importRole: "primary audio",
          metadata: { recordingSync: { recordingAssetId: "recording-charlie", captureGroupId: "capture-group-1" } },
        },
        {
          id: "studio-media-1",
          sourceId: "studio-source-1",
          originalName: "Homer iPhone.mov",
          contentType: "video/quicktime",
        },
      ],
    }, null)).toEqual([
      expect.objectContaining({ id: "recording-charlie", recordingAssetId: "recording-charlie", sourceId: "capture-source-1", captureGroupId: "capture-group-1", kind: "audio" }),
      expect.objectContaining({ id: "studio-media-1", recordingAssetId: null, sourceId: "studio-source-1", captureGroupId: null, kind: "video" }),
    ]);
  });

  it("projects materialized timeline lanes from canonical Episode truth with imported playback", () => {
    expect(normalizeEpisodeEditSources({
      timelineClips: [{
        id: "capture-clip-1",
        assetId: "capture-media-1",
        trackId: "A1",
        startIn: 9.25,
        duration: 20,
        sourceStart: 2,
        sourceEnd: 22,
        name: "Charlie MV7i",
        kind: "audio",
      }],
      importedMedia: [{
        id: "capture-media-1",
        originalName: "Charlie MV7i.wav",
        kind: "audio",
        playbackUrl: "/api/ingest/media/capture-media-1",
      }],
    }, null)).toEqual([expect.objectContaining({
      id: "capture-clip-1",
      role: "audio",
      offsetSeconds: 9.25,
      durationSeconds: 20,
      playbackUrl: "/api/ingest/media/capture-media-1",
    })]);
  });

  it("rejects protocol-relative playback and derives duration from the visible source range", () => {
    expect(normalizeEpisodeEditSources({
      timelineClips: [{
        id: "protected-clip-1",
        assetId: "protected-media-1",
        startIn: 4,
        sourceStart: 2,
        sourceEnd: 22,
        name: "Protected camera",
        kind: "video",
      }],
      importedMedia: [{
        id: "protected-media-1",
        kind: "video",
        playbackUrl: "//untrusted.example.test/source.mov",
      }],
    }, null)).toEqual([expect.objectContaining({
      id: "protected-clip-1",
      offsetSeconds: 4,
      durationSeconds: 20,
      playbackUrl: undefined,
    })]);
  });

  it("keeps transcript-only Episodes seekable through their final timed turn", () => {
    expect(projectCanonicalEpisodeEditState({
      timelineJson: { transcript: [
        { id: "turn-1", time: 0, duration: 1, text: "Opening" },
        { id: "turn-2", time: 10, duration: 2.5, text: "Closing thought" },
      ] },
      transcriptJson: { transcript: [
        { id: "turn-1", time: 0, duration: 1, text: "Opening" },
        { id: "turn-2", time: 10, duration: 2.5, text: "Closing thought" },
      ] },
      productionJson: {},
      updatedAt: new Date("2026-08-07T08:00:00.000Z"),
    })).toEqual(expect.objectContaining({ durationSeconds: 12.5 }));
  });

  it("uses a materialization receipt to select the transcript's exact source", () => {
    expect(resolveMaterializedTranscriptMediaSelection({
      captureTakeMaterializations: [{
        schema: "quipsly-capture-take-materialization-v1",
        id: "materialization-1",
        captureGroupId: "capture-group-1",
        roomId: "room-1",
        sourceSetFingerprintSha256: "source-fingerprint",
        status: "media-materialized",
        sourceBindings: [],
        transcriptBinding: {
          schema: "quipsly-capture-take-transcript-v1",
          transcriptJobId: "transcript-1",
          recordingAssetId: "recording-audio-1",
          sourceClipId: "clip-1",
          blockIds: ["turn-1"],
          providerWordsImmutable: true,
          reviewedCorrectionsAreOverlays: true,
          speakerAttributionComplete: false,
        },
        speakerCameraMappingIds: [],
        materializedByUserId: null,
        materializedByEmail: "editor@example.test",
        materializedAt: "2026-08-07T08:00:00.000Z",
        boundaries: {
          sourceMediaUnchanged: true,
          providerWordsUnchanged: true,
          reviewedAlignmentRequiredForNonSpineSources: true,
          speakerIdentityNeverGuessed: true,
          existingHumanTimelineDecisionsPreserved: true,
          publicationNotStarted: true,
        },
      }],
    }, [
      { id: "recording-audio-1", label: "MV7i", kind: "audio", role: "spine", sourceId: "source-1", recordingAssetId: "recording-audio-1", captureGroupId: "capture-group-1" },
      { id: "recording-video-1", label: "iPhone", kind: "video", role: "camera", sourceId: "source-2", recordingAssetId: "recording-video-1", captureGroupId: "capture-group-1" },
    ])).toBe("recording-audio-1");
  });
});
