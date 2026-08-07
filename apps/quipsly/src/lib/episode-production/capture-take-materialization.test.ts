/** @jest-environment node */

import type { TimelineState } from "@high-ground/quipsly-domain";

import {
  buildEpisodeArtifactPayload,
  timelineStateFromEpisodeArtifact,
} from "@/app/(app)/episode-production/episodeArtifact";

import {
  planCaptureTakeMaterialization,
  type CaptureTakeMaterializationSource,
  type CaptureTakeMaterializationTranscript,
} from "./capture-take-materialization";

const actor = { id: "user-editor", email: "editor@example.com" };
const materializedAt = "2026-08-06T16:00:00.000Z";

function source(
  recordingAssetId: string,
  kind: "audio" | "video",
  overrides: Partial<CaptureTakeMaterializationSource> = {},
): CaptureTakeMaterializationSource {
  return {
    captureGroupId: "capture-group-1",
    roomId: "room-1",
    recordingAssetId,
    mediaAssetId: `media-${recordingAssetId}`,
    sourceId: `source-${recordingAssetId}`,
    sourceSha256: recordingAssetId.padEnd(64, "a").slice(0, 64),
    storageGeneration: "12345",
    playbackUrl: `/api/ingest/media/source-${recordingAssetId}`,
    originalName: `${recordingAssetId}.${kind === "audio" ? "wav" : "mov"}`,
    kind,
    durationSeconds: 120,
    participant: {
      participantId: kind === "audio" ? "participant-charlie" : "participant-homer",
      userId: kind === "audio" ? "user-charlie" : "user-homer",
      displayLabel: kind === "audio" ? "Charlie" : "Homer",
      email: null,
      role: "HOST",
      deviceLabel: kind === "audio" ? "MV7i" : "Homer iPhone",
    },
    cameraPosition: kind === "video" ? "front" : null,
    audioDecodeEvidence: kind === "audio" ? {
      status: "complete",
      jobId: `decode-${recordingAssetId}`,
      sourceSha256: recordingAssetId.padEnd(64, "a").slice(0, 64),
      completedAt: "2026-08-06T15:55:00.000Z",
      completeDecode: true,
      signalStatus: "signal-present",
      rmsDbfs: -22,
      samplePeakDbfs: -3,
      durationSeconds: 90,
      error: null,
    } : {
      status: "not-observed",
      jobId: null,
      sourceSha256: null,
      completedAt: null,
      completeDecode: false,
      signalStatus: null,
      rmsDbfs: null,
      samplePeakDbfs: null,
      durationSeconds: null,
      error: null,
    },
    alignment: kind === "audio" ? null : {
      reviewId: `review-${recordingAssetId}`,
      method: "human-waveform-and-drift-review-v1",
      anchorTimelineSeconds: 0.5,
      targetSourceSeconds: 0,
    },
    ...overrides,
  };
}

function transcript(
  overrides: Partial<CaptureTakeMaterializationTranscript> = {},
): CaptureTakeMaterializationTranscript {
  return {
    transcriptJobId: "transcript-1",
    recordingAssetId: "audio-1",
    segments: [{
      id: "segment-1",
      speaker: "Homer",
      startSeconds: 2,
      endSeconds: 4.5,
      text: "This is the retained provider text.",
      reviewStatus: "human-reviewed",
      acceptedReviewId: "verification-1",
      speakerAttribution: {
        participantId: "participant-homer",
        participantUserId: "user-homer",
        attributedLabel: "Homer",
      },
    }],
    ...overrides,
  };
}

describe("Capture take materialization", () => {
  it("blocks a byte-verified source whose complete decode failed", () => {
    const result = planCaptureTakeMaterialization({
      timeline: { clips: [], transcript: [] },
      sources: [source("audio-broken", "audio", {
        audioDecodeEvidence: {
          status: "failed",
          jobId: "decode-broken",
          sourceSha256: "b".repeat(64),
          completedAt: null,
          completeDecode: false,
          signalStatus: null,
          rmsDbfs: null,
          samplePeakDbfs: null,
          durationSeconds: null,
          error: "audio-signal-probe-invalid: invalid stream metadata",
        },
      })],
      actor,
      materializedAt,
    });

    expect(result.ok).toBe(false);
    expect(result.issues).toEqual([
      expect.objectContaining({
        code: "source-media-unplayable",
        severity: "blocker",
        message: expect.stringContaining("invalid stream metadata"),
      }),
    ]);
    expect(result.nextAction).toContain("Replace or recover");
    expect(result.timeline.clips).toHaveLength(0);
  });

  it("blocks a completely decodable required master that contains only near-digital silence", () => {
    const result = planCaptureTakeMaterialization({
      timeline: { clips: [], transcript: [] },
      sources: [source("audio-silent", "audio", {
        audioDecodeEvidence: {
          status: "complete",
          jobId: "decode-silent",
          sourceSha256: "s".repeat(64),
          completedAt: "2026-08-06T15:55:00.000Z",
          completeDecode: true,
          signalStatus: "near-digital-silence",
          rmsDbfs: -160,
          samplePeakDbfs: -160,
          durationSeconds: 6.42,
          error: null,
        },
      })],
      actor,
      materializedAt,
    });

    expect(result.ok).toBe(false);
    expect(result.issues).toEqual([
      expect.objectContaining({
        code: "source-audio-near-silence",
        severity: "blocker",
        message: expect.stringContaining("-160.0 dBFS"),
      }),
    ]);
    expect(result.nextAction).toContain("near-silent required master");
  });

  it("materializes aligned media, corrected transcript provenance, and an unambiguous participant camera", () => {
    const result = planCaptureTakeMaterialization({
      timeline: { clips: [], transcript: [] },
      sources: [source("audio-1", "audio"), source("video-1", "video")],
      transcript: transcript(),
      actor,
      materializedAt,
    });

    expect(result.ok).toBe(true);
    expect(result.status).toBe("assembly-ready");
    expect(result.timeline.clips).toHaveLength(2);
    expect(result.timeline.clips.find((clip) => clip.kind === "video")).toMatchObject({
      startIn: 0.5,
      sourceStart: 0,
      captureTakeSource: {
        recordingAssetId: "video-1",
        alignmentReviewId: "review-video-1",
        participant: { participantId: "participant-homer" },
      },
    });
    expect(result.timeline.clips.find((clip) => clip.kind === "audio")?.captureTakeSource).toMatchObject({
      audioDecodeEvidence: {
        jobId: "decode-audio-1",
        completeDecode: true,
      },
    });
    expect(result.timeline.transcript[0]).toMatchObject({
      id: "capture-transcript:transcript-1:segment-1",
      time: 2,
      duration: 2.5,
      speakerParticipantId: "participant-homer",
      sourceRecordingAssetId: "audio-1",
      reviewStatus: "human-reviewed",
    });
    expect(result.timeline.speakerCameraMappings).toEqual([
      expect.objectContaining({
        speakerKey: "homer",
        targetClipId: "capture-take:capture-group-1:video-1",
        source: "imported",
      }),
    ]);
    expect(result.timeline.captureTakeMaterializations?.[0]).toMatchObject({
      status: "assembly-ready",
      boundaries: {
        sourceMediaUnchanged: true,
        providerWordsUnchanged: true,
        speakerIdentityNeverGuessed: true,
        existingHumanTimelineDecisionsPreserved: true,
        publicationNotStarted: true,
      },
    });
  });

  it("blocks every non-spine source until alignment is explicitly reviewed", () => {
    const result = planCaptureTakeMaterialization({
      timeline: { clips: [], transcript: [] },
      sources: [
        source("audio-1", "audio"),
        source("video-1", "video", { alignment: null }),
      ],
      actor,
      materializedAt,
    });

    expect(result.ok).toBe(false);
    expect(result.status).toBe("blocked");
    expect(result.issues).toEqual([
      expect.objectContaining({ code: "reviewed-alignment-required", severity: "blocker" }),
    ]);
    expect(result.timeline.clips).toHaveLength(0);
  });

  it("lets safe source lanes arrive while the canonical transcript is still processing", () => {
    const result = planCaptureTakeMaterialization({
      timeline: { clips: [], transcript: [] },
      sources: [source("audio-1", "audio")],
      actor,
      materializedAt,
    });

    expect(result.ok).toBe(true);
    expect(result.status).toBe("media-ready");
    expect(result.timeline.clips).toHaveLength(1);
    expect(result.timeline.transcript).toHaveLength(0);
    expect(result.issues).toEqual([
      expect.objectContaining({ code: "transcript-not-ready", severity: "warning" }),
    ]);
  });

  it("never guesses between two cameras owned by the same reviewed participant", () => {
    const result = planCaptureTakeMaterialization({
      timeline: { clips: [], transcript: [] },
      sources: [
        source("audio-1", "audio"),
        source("video-front", "video"),
        source("video-back", "video", { cameraPosition: "back" }),
      ],
      transcript: transcript(),
      actor,
      materializedAt,
    });

    expect(result.ok).toBe(true);
    expect(result.status).toBe("media-ready");
    expect(result.timeline.speakerCameraMappings).toHaveLength(0);
    expect(result.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "participant-camera-ambiguous" }),
    ]));
  });

  it("preserves unrelated editorial decisions and replays the same materialization without churn", () => {
    const timeline: TimelineState = {
      clips: [{
        id: "human-clip",
        assetId: "manual-media",
        trackId: "V1",
        startIn: 180,
        duration: 12,
        sourceStart: 0,
        sourceEnd: 12,
        name: "Manual cutaway",
        color: "#123456",
        kind: "video",
      }],
      transcript: [],
      cameraSwitchDecisions: [{
        id: "human-decision",
        startSeconds: 180,
        durationSeconds: 12,
        speakerKey: "manual",
        speakerLabel: "Manual",
        targetClipId: "human-clip",
        targetAssetId: "manual-media",
        mappingId: "human-map",
        source: "manual",
        status: "approved",
        createdAt: materializedAt,
        evidence: { transcriptBlockIds: [] },
      }],
    };
    const first = planCaptureTakeMaterialization({
      timeline,
      sources: [source("audio-1", "audio")],
      actor,
      materializedAt,
    });
    const replay = planCaptureTakeMaterialization({
      timeline: first.timeline,
      sources: [source("audio-1", "audio")],
      actor: { id: "another-user", email: "another@example.com" },
      materializedAt: "2026-08-07T00:00:00.000Z",
    });

    expect(first.timeline.clips.some((clip) => clip.id === "human-clip")).toBe(true);
    expect(first.timeline.cameraSwitchDecisions).toEqual(timeline.cameraSwitchDecisions);
    expect(replay.changed).toBe(false);
    expect(replay.timeline.captureTakeMaterializations?.[0]?.materializedByUserId).toBe(actor.id);
    expect(replay.timeline.captureTakeMaterializations?.[0]?.materializedAt).toBe(materializedAt);
  });

  it("stays idempotent after the canonical artifact is saved and hydrated by the editor", () => {
    const first = planCaptureTakeMaterialization({
      timeline: { clips: [], transcript: [] },
      sources: [source("audio-1", "audio")],
      actor,
      materializedAt,
    });
    const artifact = buildEpisodeArtifactPayload({
      timeline: first.timeline,
      projectSlug: "high-ground-odyssey",
      episodeSlug: "episode-9",
      generatedFrom: "capture-take-materialization",
      savedAt: materializedAt,
    });
    const hydrated = timelineStateFromEpisodeArtifact(artifact);
    const replay = planCaptureTakeMaterialization({
      timeline: hydrated,
      sources: [source("audio-1", "audio")],
      actor: { id: "another-user", email: "another@example.com" },
      materializedAt: "2026-08-07T00:00:00.000Z",
    });

    expect(hydrated.clips[0]?.transforms).toEqual([]);
    expect(replay.timeline).toEqual(hydrated);
    expect(replay.changed).toBe(false);
  });

  it("stays idempotent after transcript-bearing materialization is saved and hydrated", () => {
    const sources = [source("audio-1", "audio"), source("video-1", "video")];
    const first = planCaptureTakeMaterialization({
      timeline: { clips: [], transcript: [] },
      sources,
      transcript: transcript(),
      actor,
      materializedAt,
    });
    const artifact = buildEpisodeArtifactPayload({
      timeline: first.timeline,
      projectSlug: "high-ground-odyssey",
      episodeSlug: "episode-9",
      generatedFrom: "capture-take-materialization",
      savedAt: materializedAt,
    });
    const hydrated = timelineStateFromEpisodeArtifact(artifact);
    const replay = planCaptureTakeMaterialization({
      timeline: hydrated,
      sources,
      transcript: transcript(),
      actor,
      materializedAt: "2026-08-07T00:00:00.000Z",
    });

    expect(hydrated.transcript[0]).toMatchObject({ deactivated: false });
    expect(replay.timeline).toEqual(hydrated);
    expect(replay.changed).toBe(false);
    expect(replay.impact).toMatchObject({
      operation: "no-change",
      sourceLanesCreated: 0,
      sourceLanesReused: 2,
      transcriptBlocksAdded: 0,
      transcriptBlocksReplaced: 0,
    });
  });

  it("previews transcript enrichment while retaining source lanes and unrelated human work", () => {
    const first = planCaptureTakeMaterialization({
      timeline: { clips: [], transcript: [] },
      sources: [source("audio-1", "audio")],
      actor,
      materializedAt,
    });
    const enriched = planCaptureTakeMaterialization({
      timeline: {
        ...first.timeline,
        clips: [...first.timeline.clips, {
          id: "human-clip",
          assetId: "manual-media",
          trackId: "V1",
          startIn: 30,
          duration: 5,
          sourceStart: 0,
          sourceEnd: 5,
          name: "Human cutaway",
          color: "#123456",
          kind: "video",
        }],
      },
      sources: [source("audio-1", "audio")],
      transcript: transcript(),
      actor,
      materializedAt: "2026-08-07T00:00:00.000Z",
    });

    expect(enriched.changed).toBe(true);
    expect(enriched.impact).toEqual({
      operation: "evidence-update",
      priorMaterializationStatus: "media-materialized",
      sourceLanesCreated: 0,
      sourceLanesReused: 1,
      transcriptBlocksAdded: 1,
      transcriptBlocksReplaced: 0,
      unrelatedTimelineClipsPreserved: 1,
      unrelatedTranscriptBlocksPreserved: 0,
      manualSpeakerCameraMappingsPreserved: 0,
      speakerCameraMappingsAdded: 0,
    });
    expect(enriched.timeline.clips.find((clip) => clip.id === "human-clip")).toBeDefined();
  });

  it("materializes protected playback URLs while retaining durable source identity", () => {
    const input = source("audio-playback", "audio");
    const result = planCaptureTakeMaterialization({
      timeline: { clips: [], transcript: [] },
      sources: [input],
      actor,
      materializedAt,
    });

    expect(result.ok).toBe(true);
    expect(result.timeline.clips[0]).toMatchObject({
      assetId: input.playbackUrl,
      sourceId: input.sourceId,
      captureTakeSource: {
        recordingAssetId: input.recordingAssetId,
        mediaAssetId: input.mediaAssetId,
        sourceId: input.sourceId,
        sourceSha256: input.sourceSha256,
        storageGeneration: input.storageGeneration,
      },
    });
    expect(result.timeline.clips[0]?.assetId).not.toBe(input.mediaAssetId);
  });

  it("preserves human lane edits and a manual replacement for a generated camera mapping", () => {
    const first = planCaptureTakeMaterialization({
      timeline: { clips: [], transcript: [] },
      sources: [source("audio-1", "audio"), source("video-1", "video")],
      transcript: transcript(),
      actor,
      materializedAt,
    });
    const generatedMapping = first.timeline.speakerCameraMappings?.[0];
    const edited: TimelineState = {
      ...first.timeline,
      clips: first.timeline.clips.map((clip) => clip.kind === "audio"
        ? {
            ...clip,
            trackId: "A3",
            startIn: 5,
            sourceStart: 10,
            sourceEnd: 110,
            duration: 100,
            name: "Human-trimmed MV7i lane",
          }
        : clip),
      speakerCameraMappings: generatedMapping
        ? [{
            ...generatedMapping,
            source: "manual",
            targetClipId: "human-selected-camera",
            targetAssetId: "human-selected-camera-asset",
          }]
        : [],
    };
    const replay = planCaptureTakeMaterialization({
      timeline: edited,
      sources: [source("audio-1", "audio"), source("video-1", "video")],
      transcript: transcript(),
      actor,
      materializedAt: "2026-08-07T00:00:00.000Z",
    });

    expect(replay.timeline.clips.find((clip) => clip.kind === "audio")).toMatchObject({
      trackId: "A3",
      startIn: 5,
      sourceStart: 10,
      sourceEnd: 110,
      duration: 100,
      name: "Human-trimmed MV7i lane",
    });
    expect(replay.timeline.speakerCameraMappings).toEqual([
      expect.objectContaining({
        source: "manual",
        targetClipId: "human-selected-camera",
      }),
    ]);
  });

  it("holds instead of silently recreating a human-removed materialized lane", () => {
    const first = planCaptureTakeMaterialization({
      timeline: { clips: [], transcript: [] },
      sources: [source("audio-1", "audio")],
      actor,
      materializedAt,
    });
    const removed: TimelineState = { ...first.timeline, clips: [] };
    const replay = planCaptureTakeMaterialization({
      timeline: removed,
      sources: [source("audio-1", "audio")],
      actor,
      materializedAt: "2026-08-07T00:00:00.000Z",
    });

    expect(replay.ok).toBe(false);
    expect(replay.issues).toEqual([
      expect.objectContaining({ code: "materialized-source-lane-missing", severity: "blocker" }),
    ]);
    expect(replay.timeline).toBe(removed);
  });

  it("holds a previously materialized take when exact source or review evidence changes", () => {
    const first = planCaptureTakeMaterialization({
      timeline: { clips: [], transcript: [] },
      sources: [source("audio-1", "audio")],
      actor,
      materializedAt,
    });
    const changed = planCaptureTakeMaterialization({
      timeline: first.timeline,
      sources: [source("audio-1", "audio", { storageGeneration: "different-generation" })],
      actor,
      materializedAt,
    });

    expect(changed.ok).toBe(false);
    expect(changed.issues).toEqual([
      expect.objectContaining({ code: "source-set-changed", severity: "blocker" }),
    ]);
    expect(changed.timeline).toBe(first.timeline);
  });
});
