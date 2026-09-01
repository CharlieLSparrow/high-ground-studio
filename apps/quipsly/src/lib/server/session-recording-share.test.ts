/** @jest-environment node */

jest.mock("server-only", () => ({}));

import {
  applyRecordingShareTranscriptReadiness,
  buildSessionRecordingShareEdit,
  classifyRecordingShareTranscriptCutSafety,
  newestCoherentRecordingTake,
  recordSessionRecordingSharePlaybackReview,
  sessionRecordingShareAudioMixSourceIds,
  recordingShareSourcesForTake,
  sessionRecordingSharePlaybackPlan,
  stableJson,
  transitionSessionRecordingShare,
} from "./session-recording-share";
import { buildSessionTranscriptReadiness } from "@/lib/session-transcript-readiness";

describe("Session recording share take selection", () => {
  it("keeps repeated calls in one room out of the newest take", () => {
    const at = (id: string, seconds: number) => ({ id, recordedStartedAt: new Date(1_787_180_000_000 + seconds * 1_000), captureGroupId: "same-room-group" });
    const newest = newestCoherentRecordingTake([
      at("coach-old", 0),
      at("client-old", 0.02),
      at("coach-new", 180),
      at("client-new", 180.03),
    ]);
    expect(newest.map((source) => source.id)).toEqual(["coach-new", "client-new"]);
  });

  it("keeps normal endpoint startup skew in one take", () => {
    const newest = newestCoherentRecordingTake([
      { id: "coach", recordedStartedAt: new Date("2026-08-19T12:00:00Z") },
      { id: "client", recordedStartedAt: new Date("2026-08-19T12:00:18Z") },
    ]);
    expect(newest).toHaveLength(2);
  });

  it("canonicalizes object fields independent of insertion order", () => {
    expect(stableJson({ b: 2, a: { d: 4, c: 3 } })).toBe('{"a":{"c":3,"d":4},"b":2}');
  });

  it("uses one dedicated microphone per participant without double-mixing camera audio", () => {
    const chosen = sessionRecordingShareAudioMixSourceIds([
      { id: "coach-camera", participantId: "coach", kind: "LOCAL_VIDEO", contentType: "video/mp4" },
      { id: "coach-mic", participantId: "coach", kind: "LOCAL_AUDIO", contentType: "audio/mp4" },
      { id: "client-camera", participantId: "client", kind: "LOCAL_VIDEO", contentType: "video/mp4" },
    ], "coach-camera");
    expect([...chosen].sort()).toEqual(["client-camera", "coach-mic"]);
  });

  it("keeps every sequential microphone segment after a participant reconnects", () => {
    const chosen = sessionRecordingShareAudioMixSourceIds([
      { id: "coach-before-crash", participantId: "coach", kind: "LOCAL_AUDIO", recordedStartedAt: new Date("2026-08-31T12:00:00Z"), recordedStoppedAt: new Date("2026-08-31T12:20:00Z") },
      { id: "coach-after-reconnect", participantId: "coach", kind: "LOCAL_AUDIO", recordedStartedAt: new Date("2026-08-31T12:20:08Z"), recordedStoppedAt: new Date("2026-08-31T12:50:00Z") },
      { id: "client-continuous", participantId: "client", kind: "LOCAL_AUDIO", recordedStartedAt: new Date("2026-08-31T12:00:01Z"), recordedStoppedAt: new Date("2026-08-31T12:50:01Z") },
    ]);
    expect([...chosen].sort()).toEqual([
      "client-continuous",
      "coach-after-reconnect",
      "coach-before-crash",
    ]);
  });

  it("does not double-mix concurrent microphones from the same participant", () => {
    const chosen = sessionRecordingShareAudioMixSourceIds([
      { id: "coach-browser", participantId: "coach", kind: "LOCAL_AUDIO", recordedStartedAt: new Date("2026-08-31T12:00:00Z"), recordedStoppedAt: new Date("2026-08-31T12:50:00Z") },
      { id: "coach-phone", participantId: "coach", kind: "LOCAL_AUDIO", recordedStartedAt: new Date("2026-08-31T12:00:02Z"), recordedStoppedAt: new Date("2026-08-31T12:49:58Z") },
    ]);
    expect([...chosen]).toEqual(["coach-browser"]);
  });

  it("keeps all reconnect segments in the current capture group", () => {
    const source = (id: string, group: string, startedAt: string) => ({
      id,
      recordedStartedAt: new Date(startedAt),
      localManifestJson: { captureGroupId: group },
    });
    const chosen = recordingShareSourcesForTake([
      source("old-coach", "old-take", "2026-08-31T10:00:00Z"),
      source("old-client", "old-take", "2026-08-31T10:00:01Z"),
      source("coach-before-crash", "current-take", "2026-08-31T12:00:00Z"),
      source("client-continuous", "current-take", "2026-08-31T12:00:01Z"),
      source("coach-after-reconnect", "current-take", "2026-08-31T12:20:08Z"),
    ], "current-take");
    expect(chosen.map((row) => row.id)).toEqual([
      "coach-before-crash",
      "client-continuous",
      "coach-after-reconnect",
    ]);
  });
});

describe("Session recording share text edits", () => {
  const sourceSha256 = "f".repeat(64);
  const transcriptReadiness = (overrides: Record<string, unknown> = {}) => buildSessionTranscriptReadiness({
    id: "job-1",
    status: "COMPLETED",
    segmentCount: 1,
    wordCount: 8,
    reviewedAttributionCount: 0,
    sourceSha256,
    sourceGeneration: "9",
    processingManifestObject: "transcripts/jobs/job-1/manifest.json",
    processingResultObject: "transcripts/jobs/job-1/result.json",
    providerRequestId: "provider-request-1",
    providerResponseObject: "transcripts/jobs/job-1/provider.json",
    workerBuildId: "worker-build-1",
    resultJson: { processingControl: { routing: { schema: "quipsly-transcript-routing-summary-v1", sourceTopology: "participant-isolated", participantLabel: "Coach", speakerAuthority: "source-binding", timingGranularity: "word", manifestBacked: true } } },
    ...overrides,
  }, { status: "VERIFIED_MATCH", sha256: sourceSha256, generation: "9" });
  const transcriptSegment = {
    transcriptJobId: "transcript_job_0001",
    segmentId: "transcript_segment_0001",
    sourceRecordingAssetId: "recording_asset_0001",
    providerTextSha256: "a".repeat(64),
    speakerLabel: "Coach",
    text: "This passage should not be in the shared copy.",
    startSeconds: 10,
    endSeconds: 14,
    cutStartSeconds: 10.2,
    cutEndSeconds: 13.8,
    timingFingerprint: "c".repeat(64),
    timingBasis: "provider-words" as const,
    cutSafety: "safe" as const,
    cutSafetyReason: "Word timing is bound to this exact source recording.",
  };

  it("turns source-bound transcript exclusions into reversible kept ranges", () => {
    const edit = buildSessionRecordingShareEdit({
      startSeconds: 2,
      endSeconds: 20,
      transcriptSegments: [transcriptSegment],
      excludedTranscriptSegments: [{
        transcriptJobId: transcriptSegment.transcriptJobId,
        segmentId: transcriptSegment.segmentId,
        providerTextSha256: transcriptSegment.providerTextSha256,
        timingFingerprint: transcriptSegment.timingFingerprint,
      }],
    });
    expect(edit.keptRanges).toEqual([
      expect.objectContaining({ startSeconds: 2, endSeconds: 10.2 }),
      expect.objectContaining({ startSeconds: 13.8, endSeconds: 20 }),
    ]);
    expect(edit.transcriptExclusions).toEqual([expect.objectContaining({
      sourceRecordingAssetId: "recording_asset_0001",
      startSeconds: 10.2,
      endSeconds: 13.8,
      timingFingerprint: "c".repeat(64),
      timingBasis: "provider-words",
      cutSafety: "safe",
    })]);
    expect(edit.joinCrossfadeSeconds).toBe(0.01);
  });

  it("keeps a safe word-timed passage removable only when the shared readiness contract is ready", () => {
    expect(applyRecordingShareTranscriptReadiness(transcriptSegment, transcriptReadiness())).toEqual(transcriptSegment);
  });

  it("keeps a passage included when mixed-room speaker authority still needs review", () => {
    const readiness = transcriptReadiness({
      resultJson: { processingControl: { routing: { schema: "quipsly-transcript-routing-summary-v1", sourceTopology: "mixed-room", speakerAuthority: "provider-candidate", timingGranularity: "word", manifestBacked: true } } },
    });
    const guarded = applyRecordingShareTranscriptReadiness(transcriptSegment, readiness);

    expect(guarded).toMatchObject({
      cutSafety: "timing-unavailable",
      cutSafetyReason: expect.stringContaining("speaker labels remain candidates"),
    });
    expect(() => buildSessionRecordingShareEdit({
      startSeconds: 2,
      endSeconds: 20,
      transcriptSegments: [guarded],
      excludedTranscriptSegments: [{
        transcriptJobId: guarded.transcriptJobId,
        segmentId: guarded.segmentId,
        providerTextSha256: guarded.providerTextSha256,
        timingFingerprint: guarded.timingFingerprint,
      }],
    })).toThrow(/speaker labels remain candidates/i);
  });

  it("fails closed when a transcript selection no longer matches provider truth", () => {
    expect(() => buildSessionRecordingShareEdit({
      startSeconds: 2,
      endSeconds: 20,
      transcriptSegments: [transcriptSegment],
      excludedTranscriptSegments: [{
        transcriptJobId: transcriptSegment.transcriptJobId,
        segmentId: transcriptSegment.segmentId,
        providerTextSha256: "b".repeat(64),
        timingFingerprint: transcriptSegment.timingFingerprint,
      }],
    })).toThrow(/transcript changed/i);
  });

  it("fails closed when immutable word timing no longer matches the selection", () => {
    expect(() => buildSessionRecordingShareEdit({
      startSeconds: 2,
      endSeconds: 20,
      transcriptSegments: [transcriptSegment],
      excludedTranscriptSegments: [{
        transcriptJobId: transcriptSegment.transcriptJobId,
        segmentId: transcriptSegment.segmentId,
        providerTextSha256: transcriptSegment.providerTextSha256,
        timingFingerprint: "d".repeat(64),
      }],
    })).toThrow(/transcript changed/i);
  });

  it("keeps a passage when ripple deletion would cut overlapping speech", () => {
    expect(() => buildSessionRecordingShareEdit({
      startSeconds: 2,
      endSeconds: 20,
      transcriptSegments: [{
        ...transcriptSegment,
        cutSafety: "overlapping-speech",
        cutSafetyReason: "Another participant is speaking here.",
      }],
      excludedTranscriptSegments: [{
        transcriptJobId: transcriptSegment.transcriptJobId,
        segmentId: transcriptSegment.segmentId,
        providerTextSha256: transcriptSegment.providerTextSha256,
        timingFingerprint: transcriptSegment.timingFingerprint,
      }],
    })).toThrow(/another participant is speaking/i);
  });

  it("detects overlapping speech before the editor offers a ripple delete", () => {
    const [coach, client] = classifyRecordingShareTranscriptCutSafety([
      transcriptSegment,
      {
        ...transcriptSegment,
        transcriptJobId: "transcript_job_0002",
        segmentId: "transcript_segment_0002",
        sourceRecordingAssetId: "recording_asset_0002",
        timingFingerprint: "e".repeat(64),
        startSeconds: 12,
        endSeconds: 15,
        cutStartSeconds: 12.2,
        cutEndSeconds: 14.8,
      },
    ]);
    expect(coach?.cutSafety).toBe("overlapping-speech");
    expect(client?.cutSafety).toBe("overlapping-speech");
    expect(coach?.cutSafetyReason).toMatch(/another participant/i);
  });

  it("keeps same-source passages when their word timing overlaps", () => {
    const [first, second] = classifyRecordingShareTranscriptCutSafety([
      transcriptSegment,
      {
        ...transcriptSegment,
        segmentId: "transcript_segment_0002",
        timingFingerprint: "f".repeat(64),
        startSeconds: 13.7,
        endSeconds: 16,
        cutStartSeconds: 13.7,
        cutEndSeconds: 15.8,
      },
    ]);
    expect(first?.cutSafety).toBe("timing-overlap");
    expect(second?.cutSafety).toBe("timing-overlap");
    expect(first?.cutSafetyReason).toMatch(/shares timing with nearby words/i);
  });
});

describe("Session recording share playback review", () => {
  function verifiedBody(keptRanges: Array<{ startSeconds: number; endSeconds: number }> = [{ startSeconds: 0, endSeconds: 60 }]) {
    return {
      edit: { keptRanges },
      render: {
        status: "VERIFIED",
        recordingAssetId: "recording_share_asset_0001",
        sha256: "e".repeat(64),
        durationSeconds: keptRanges.reduce((total, range) => total + range.endSeconds - range.startSeconds, 0),
      },
    };
  }

  function fixture() {
    const actor = { id: "coach_user_0001", email: "coach@example.test", primaryEmail: "coach@example.test", isStaff: false };
    const room = {
      id: "session_room_0001",
      title: "First coaching session",
      booking: {
        coachUserId: actor.id,
        clientUserId: "client_user_0001",
        coachUser: { id: actor.id, name: "Coach", primaryEmail: actor.primaryEmail },
        clientUser: { id: "client_user_0001", name: "Client", primaryEmail: "client@example.test" },
      },
    };
    const output: any = {
      id: "session_output_0001",
      roomId: room.id,
      createdByUserId: actor.id,
      recipientUserId: room.booking.clientUserId,
      kind: "RECORDING_SHARE",
      status: "DRAFT",
      title: "Reviewed coaching recording",
      bodyJson: verifiedBody(),
      sourceManifestJson: {},
      contentSha256: "d".repeat(64),
      revision: 2,
      releasedAt: null,
      revokedAt: null,
      createdAt: new Date("2026-08-24T12:00:00.000Z"),
      updatedAt: new Date("2026-08-24T12:01:00.000Z"),
      recipient: { id: room.booking.clientUserId, name: "Client", primaryEmail: "client@example.test" },
      createdBy: { id: actor.id, name: "Coach", primaryEmail: actor.primaryEmail },
      deliveries: [],
      revisions: [],
    };
    const revisions = new Map<string, any>();
    const client: any = {
      callRoom: { findFirst: jest.fn().mockResolvedValue(room) },
      sessionOutput: {
        findFirst: jest.fn().mockImplementation(async () => output),
        findUnique: jest.fn().mockImplementation(async () => output),
        updateMany: jest.fn(),
      },
      sessionOutputRevision: { findUnique: jest.fn().mockImplementation(async ({ where }: any) => revisions.get(where.id) ?? null) },
      deliveryEvent: { findUnique: jest.fn() },
      $transaction: jest.fn(async (operation: (tx: any) => Promise<any>) => operation({
        sessionOutput: {
          updateMany: jest.fn(async ({ data }: any) => { Object.assign(output, data); return { count: 1 }; }),
          findUnique: jest.fn(async () => output),
        },
        sessionOutputRevision: {
          create: jest.fn(async ({ data }: any) => {
            const created = { ...data, createdAt: new Date(data.snapshotJson.completedAt || "2026-08-24T12:02:00.000Z") };
            revisions.set(data.id, created);
            output.revisions = data.operation === "PLAYBACK_REVIEWED" ? [created] : output.revisions;
            return created;
          }),
        },
        deliveryEvent: { create: jest.fn(async ({ data }: any) => { output.deliveries.push({ ...data }); return data; }) },
      })),
    };
    return { actor, client, output, room };
  }

  it("requires opening, middle, ending, and every rendered edit join", () => {
    const plan = sessionRecordingSharePlaybackPlan(verifiedBody([
      { startSeconds: 0, endSeconds: 10 },
      { startSeconds: 15, endSeconds: 30 },
    ]));
    expect(plan.joinSecondBins).toEqual([10]);
    expect(plan.requiredSecondBins).toEqual(expect.arrayContaining([0, 1, 2, 8, 9, 10, 11, 12, 23, 24]));
  });

  it("rejects incomplete browser-observed review evidence without changing the draft", async () => {
    const { actor, client, output, room } = fixture();
    await expect(recordSessionRecordingSharePlaybackReview(client, {
      roomId: room.id,
      outputId: output.id,
      actor,
      clientRequestId: "11111111-1111-4111-8111-111111111111",
      expectedRevision: output.revision,
      listenedSecondBins: [0, 1, 2],
      clientTrackedPlaybackIsNotProofOfAudibility: true,
    })).rejects.toMatchObject({ code: "PLAYBACK_REVIEW_INCOMPLETE", status: 409 });
    expect(client.$transaction).not.toHaveBeenCalled();
  });

  it("persists an optional exact-revision listening receipt without making it paperwork", async () => {
    const { actor, client, output, room } = fixture();
    const plan = sessionRecordingSharePlaybackPlan(output.bodyJson);
    const reviewInput = {
      roomId: room.id,
      outputId: output.id,
      actor,
      clientRequestId: "22222222-2222-4222-8222-222222222222",
      expectedRevision: output.revision,
      listenedSecondBins: plan.requiredSecondBins,
      clientTrackedPlaybackIsNotProofOfAudibility: true,
    };
    const reviewed = await recordSessionRecordingSharePlaybackReview(client, reviewInput);
    expect(reviewed.output?.playbackReview).toMatchObject({ reviewed: true, requiredSecondBins: plan.requiredSecondBins });
    expect(output.revision).toBe(3);
    const replay = await recordSessionRecordingSharePlaybackReview(client, reviewInput);
    expect(replay).toMatchObject({ idempotentReplay: true, output: { playbackReview: { reviewed: true } } });
    expect(client.$transaction).toHaveBeenCalledTimes(1);

    const released = await transitionSessionRecordingShare(client, {
      roomId: room.id,
      outputId: output.id,
      actor,
      clientRequestId: "33333333-3333-4333-8333-333333333333",
      expectedRevision: output.revision,
      action: "RELEASE",
    });
    expect(released.output?.status).toBe("RELEASED");
    expect(output.revision).toBe(4);
  });

  it("shares a verified private edit without forcing a listening receipt", async () => {
    const { actor, client, output, room } = fixture();
    const released = await transitionSessionRecordingShare(client, {
      roomId: room.id,
      outputId: output.id,
      actor,
      clientRequestId: "44444444-4444-4444-8444-444444444444",
      expectedRevision: output.revision,
      action: "RELEASE",
    });
    expect(released.output).toMatchObject({
      status: "RELEASED",
      playbackReview: { reviewed: false },
    });
    expect(client.$transaction).toHaveBeenCalledTimes(1);
  });

  it("keeps a stale listening receipt visible as stale without blocking a later share", async () => {
    const { actor, client, output, room } = fixture();
    const plan = sessionRecordingSharePlaybackPlan(output.bodyJson);
    await recordSessionRecordingSharePlaybackReview(client, {
      roomId: room.id,
      outputId: output.id,
      actor,
      clientRequestId: "55555555-5555-4555-8555-555555555555",
      expectedRevision: output.revision,
      listenedSecondBins: plan.requiredSecondBins,
      clientTrackedPlaybackIsNotProofOfAudibility: true,
    });
    output.revision += 1;
    output.contentSha256 = "a".repeat(64);
    output.bodyJson = {
      ...output.bodyJson,
      render: { ...output.bodyJson.render, sha256: "b".repeat(64) },
    };

    const released = await transitionSessionRecordingShare(client, {
      roomId: room.id,
      outputId: output.id,
      actor,
      clientRequestId: "66666666-6666-4666-8666-666666666666",
      expectedRevision: output.revision,
      action: "RELEASE",
    });
    expect(released.output).toMatchObject({
      status: "RELEASED",
      playbackReview: { reviewed: false },
    });
  });
});
