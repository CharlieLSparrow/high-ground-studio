/** @jest-environment node */

jest.mock("server-only", () => ({}));
jest.mock("./transcript-corrections", () => ({
  readTranscriptCorrectionDesk: jest.fn(),
}));
jest.mock("./session-reviewed-source-placement", () => ({
  readSessionReviewedSourcePlacements: jest.fn(async () => []),
  SessionReviewedSourcePlacementError: class SessionReviewedSourcePlacementError extends Error {},
}));

import { readTranscriptCorrectionDesk } from "./transcript-corrections";
import { readSessionReviewedSourcePlacements } from "./session-reviewed-source-placement";
import { readSessionTranscriptCorrectionDesk } from "./session-transcript-correction-desk";

const actor = { id: "coach-user", email: "coach@example.test", isStaff: false };

function alignment(start: string, uncertaintyMilliseconds: number) {
  return {
    schema: "quipsly-capture-alignment-proposal-v1",
    status: "proposal-ready",
    captureGroupId: "take-1",
    estimatedServerStartedAt: start,
    uncertaintyMilliseconds,
    sampleAccurateClaimed: false,
    reviewRequired: true,
    reviewGate: {
      waveformCorrelationRequired: true,
      driftReviewRequired: true,
      humanApprovalRequired: true,
    },
  };
}

function desk(input: {
  participantId: string;
  recordingAssetId: string;
  transcriptJobId: string;
  sha: string;
  segmentId: string;
  startSeconds: number;
  text: string;
}) {
  return {
    ok: true,
    roomId: "room-1",
    roomTitle: "Coaching Session",
    roomPurpose: "COACHING",
    transcriptJobId: input.transcriptJobId,
    sourceSha256: input.sha,
    gate: { allowed: true },
    processing: {
      routing: {
        sourceTopology: "participant-isolated",
        speakerAuthority: "source-binding",
      },
    },
    recording: {
      id: input.recordingAssetId,
      participantId: input.participantId,
      sourceSha256: input.sha,
    },
    playback: {
      sourceId: `playback-${input.recordingAssetId}`,
      url: `/api/ingest/media/playback-${input.recordingAssetId}`,
      kind: "audio",
      recordingAssetId: input.recordingAssetId,
      durationSeconds: 120,
      label: input.participantId,
    },
    spectralContext: {
      projectSlug: "coaching",
      assetId: `studio-${input.recordingAssetId}`,
      sourceId: `spectral-${input.recordingAssetId}`,
    },
    participants: [],
    speakerGroups: [],
    segments: [
      {
        id: input.segmentId,
        startSeconds: input.startSeconds,
        endSeconds: input.startSeconds + 2,
        text: input.text,
        providerText: input.text,
        speakerLabel: input.participantId,
      },
    ],
  };
}

describe("Session transcript correction desk", () => {
  beforeEach(() => jest.clearAllMocks());

  it.each([
    [true, "UPLOADING", "WAITING_FOR_UPLOAD"],
    [false, "UPLOADING", "WAITING_FOR_UPLOAD"],
    [true, "CORRUPTED", "UPLOAD_ATTENTION"],
  ])("keeps unfinished uploads in the selected take (same take %s, %s)", async (sameTake, status, expectedStatus) => {
    const ready = desk({participantId: "coach", recordingAssetId: "ready", transcriptJobId: "ready-job",
      sha: "a".repeat(64), segmentId: "ready-turn", startSeconds: 0, text: "Available words."});
    jest.mocked(readTranscriptCorrectionDesk).mockResolvedValue(ready as any);
    const rows = [{id: "ready", participantId: "coach", kind: "LOCAL_AUDIO", status: "VERIFIED", checksum: "a".repeat(64),
      recordedStartedAt: new Date("2026-09-09T12:00:00Z"), recordedStoppedAt: new Date("2026-09-09T12:10:00Z"),
      localManifestJson: {captureGroupId: "first"}, transcriptJobs: [{id: "ready-job", createdAt: new Date()}]},
    {id: "upload", participantId: "client", participant: {displayName: "Casey"}, kind: "LOCAL_AUDIO", status, checksum: null,
      recordedStartedAt: new Date(sameTake ? "2026-09-09T12:00:00Z" : "2026-09-09T13:00:00Z"), recordedStoppedAt: null,
      localManifestJson: {captureGroupId: sameTake ? "first" : "second"},
      // Even a job marked complete cannot make unverified media readable.
      transcriptJobs: [{id: "unverified-job", createdAt: new Date()}]}];
    const prisma = {recordingAsset: {findMany: jest.fn(async () => rows)},
      transcriptJob: {findMany: jest.fn(async () => [])}};
    const result = await readSessionTranscriptCorrectionDesk({prisma, roomId: "room-1", actor}) as any;
    expect(prisma.recordingAsset.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: {roomId: "room-1", kind: {in: ["LOCAL_AUDIO", "LOCAL_VIDEO"]},
        participantId: {not: null}, recordedStartedAt: {not: null}},
    }));
    expect(result.sessionTranscript).toMatchObject({status: "incomplete", pendingSourceCount: 1,
      sourceCount: sameTake ? 1 : 0, pendingSources: [{recordingAssetId: "upload", participantLabel: "Casey",
        status: expectedStatus, transcriptJobId: null, retryable: false}]});
    expect(result.segments).toEqual(sameTake ? ready.segments : []);
    expect(readTranscriptCorrectionDesk).toHaveBeenCalledTimes(sameTake ? 2 : 1);
  });

  afterEach(() =>
    jest.mocked(readSessionReviewedSourcePlacements).mockResolvedValue([]),
  );

  it.each([false, true])("keeps missing transcript coverage visible without showing an older take (same take: %s)", async (sameTake) => {
    const ready = desk({ participantId: "coach", recordingAssetId: "ready", transcriptJobId: "ready-job", sha: "a".repeat(64), segmentId: "ready-turn", startSeconds: 0, text: "Available words." });
    jest.mocked(readTranscriptCorrectionDesk).mockResolvedValue(ready as any);
    const rows = [{
      id: "ready", participantId: "coach", kind: "LOCAL_AUDIO", status: "VERIFIED", checksum: "a".repeat(64),
      recordedStartedAt: new Date("2026-09-09T12:00:00Z"), recordedStoppedAt: new Date("2026-09-09T12:10:00Z"),
      localManifestJson: { captureGroupId: "first" }, transcriptJobs: [{ id: "ready-job", createdAt: new Date() }],
    }, {
      id: "pending", participantId: "client", kind: "LOCAL_AUDIO", status: "VERIFIED", checksum: "b".repeat(64),
      recordedStartedAt: new Date(sameTake ? "2026-09-09T12:00:00Z" : "2026-09-09T13:00:00Z"), recordedStoppedAt: new Date("2026-09-09T13:10:00Z"),
      localManifestJson: { captureGroupId: sameTake ? "first" : "second" }, transcriptJobs: [],
    }];
    const prisma = { recordingAsset: { findMany: jest.fn(async (_query: { where: Record<string, unknown> }) => rows) },
      transcriptJob: {findMany: jest.fn(async () => [{id: "pending-job", assetId: "pending", status: "FAILED", errorMessage: "Temporary provider failure"}])},
    };
    const result = await readSessionTranscriptCorrectionDesk({ prisma, roomId: "room-1", actor }) as any;
    expect(prisma.recordingAsset.findMany.mock.calls[0]![0].where).not.toHaveProperty("transcriptJobs");
    expect(prisma.recordingAsset.findMany).toHaveBeenCalledWith(expect.objectContaining({
      select: expect.objectContaining({transcriptJobs: expect.objectContaining({where: {status: "COMPLETED", segments: {some: {}}}})}),
    }));
    expect(result.sessionTranscript).toMatchObject({ status: "incomplete", pendingSourceCount: 1, sourceCount: sameTake ? 1 : 0 });
    expect(result.sessionTranscript.pendingSources).toEqual([{recordingAssetId: "pending", participantLabel: "Participant recording", transcriptJobId: "pending-job", status: "FAILED",
      error: "Quipsly could not finish this transcript. The exact recording remains safe and can be tried again.", failureCode: "TRANSCRIPTION_FAILED", retryable: true}]);
    expect(prisma.transcriptJob.findMany).toHaveBeenCalledWith(expect.objectContaining({where: {roomId: "room-1", assetId: {in: ["pending"]}}}));
    expect(result.segments).toEqual(sameTake ? ready.segments : []);
    expect(result.playback).toEqual(sameTake ? ready.playback : null);
    expect(result.transcriptJobId).toBe(sameTake ? "ready-job" : null);
    expect(readTranscriptCorrectionDesk).toHaveBeenCalledTimes(2);
  });

  it.each(["FAILED", "RUNNING", "COMPLETED", null])("keeps current verified audio playable when transcription is %s", async status => {
    const older = desk({participantId: "coach", recordingAssetId: "older", transcriptJobId: "older-job", sha: "a".repeat(64), segmentId: "old-words", startSeconds: 0, text: "Old take"});
    const current = {...desk({participantId: "coach", recordingAssetId: "current", transcriptJobId: "current-job", sha: "b".repeat(64), segmentId: "none", startSeconds: 0, text: ""}),
      transcriptStatus: status, transcriptJobId: status ? "current-job" : null, sourceSha256: null, segments: []};
    jest.mocked(readTranscriptCorrectionDesk).mockImplementation(async input => (input.recordingAssetId === "current" ? current : older) as any);
    const prisma = {recordingAsset: {findMany: jest.fn(async () => [{id: "current", participantId: "coach", kind: "LOCAL_AUDIO", status: "VERIFIED", checksum: "b".repeat(64),
      recordedStartedAt: new Date("2026-09-14T12:00:00Z"), recordedStoppedAt: new Date("2026-09-14T12:01:00Z"), localManifestJson: {captureGroupId: "current-take"}, transcriptJobs: []}])},
      transcriptJob: {findMany: jest.fn(async () => status ? [{id: "current-job", assetId: "current", status, _count: {segments: 0, words: 0}}] : [])}};
    const result = await readSessionTranscriptCorrectionDesk({prisma, roomId: "room-1", actor}) as any;
    expect(result.playback).toEqual(current.playback);
    expect(result.recording.id).toBe("current");
    expect(result.gate.allowed).toBe(true);
    expect(result.segments).toEqual([]);
    expect(result.sessionTranscript).toMatchObject({sourceCount: 0, pendingSourceCount: 1, sources: [{recordingAssetId: "current", playback: current.playback}]});
    if (status === "COMPLETED") {
      expect(result.sessionTranscript.pendingSources).toEqual([expect.objectContaining({
        recordingAssetId: "current", failureCode: "NO_TRANSCRIPT_TEXT", retryable: true,
      })]);
    }
    expect(readTranscriptCorrectionDesk).toHaveBeenLastCalledWith({prisma, roomId: "room-1", actor, recordingAssetId: "current"});
  });

  it.each(["checksum", "participant", "permission"])("does not expose pending playback across a changed %s boundary", async boundary => {
    const source = desk({participantId: boundary === "participant" ? "different" : "coach", recordingAssetId: "current", transcriptJobId: "current-job", sha: boundary === "checksum" ? "c".repeat(64) : "b".repeat(64), segmentId: "none", startSeconds: 0, text: ""});
    const held = {...source, gate: {allowed: boundary !== "permission"}, playback: boundary === "permission" ? null : source.playback, segments: []};
    jest.mocked(readTranscriptCorrectionDesk).mockResolvedValue(held as any);
    const prisma = {recordingAsset: {findMany: jest.fn(async () => [{id: "current", participantId: "coach", kind: "LOCAL_AUDIO", status: "VERIFIED", checksum: "b".repeat(64),
      recordedStartedAt: new Date("2026-09-14T12:00:00Z"), recordedStoppedAt: new Date("2026-09-14T12:01:00Z"), localManifestJson: {captureGroupId: "current-take"}, transcriptJobs: []}])},
      transcriptJob: {findMany: jest.fn(async () => [{id: "current-job", assetId: "current", status: "FAILED"}])}};
    const result = await readSessionTranscriptCorrectionDesk({prisma, roomId: "room-1", actor}) as any;
    expect(result.playback).toBeNull();
    expect(result.gate.allowed).toBe(false);
    expect(result.segments).toEqual([]);
  });

  it("does not pull an earlier Record/Stop into the current transcript in the same room group", async () => {
    const captureIds = [
      "50000000-0000-4000-8000-000000000001",
      "50000000-0000-4000-8000-000000000002",
    ];
    const rows = captureIds.map((captureId, index) => ({
      id: `source-${index}`,
      participantId: "coach",
      kind: "LOCAL_AUDIO", status: "VERIFIED",
      checksum: "a".repeat(64),
      recordedStartedAt: new Date(`2026-09-09T0${index + 1}:00:00Z`),
      recordedStoppedAt: new Date(`2026-09-09T0${index + 1}:00:12Z`),
      localManifestJson: { captureGroupId: "same-room-group", captureId },
      transcriptJobs: [{ id: `job-${index}`, createdAt: new Date(`2026-09-09T0${index + 1}:01:00Z`) }],
    }));
    const latest = desk({
      participantId: "coach", recordingAssetId: "source-1", transcriptJobId: "job-1",
      sha: "a".repeat(64), segmentId: "latest-turn", startSeconds: 0,
      text: "This belongs to the later twelve-second recording.",
    });
    jest.mocked(readTranscriptCorrectionDesk).mockResolvedValue(latest as any);
    const prisma = {
      recordingAsset: { findMany: jest.fn(async () => rows) },
      callRecordingEndpointReceipt: { findMany: jest.fn(async () => rows.map((row, index) => ({
        captureId: captureIds[index], participantId: row.participantId,
        directive: { id: `start-${index}`, issuedAt: row.recordedStartedAt },
      }))) },
    };

    const result = await readSessionTranscriptCorrectionDesk({ prisma, roomId: "room-1", actor });

    if (!("sessionTranscript" in result)) throw new Error("Expected a source-bound Session transcript.");
    expect(result.sessionTranscript).toMatchObject({
      status: "single-source", sourceCount: 1,
      sources: [{ recordingAssetId: "source-1", programOffsetSeconds: 0 }],
    });
    expect(result.segments).toEqual(latest.segments);
    expect(readTranscriptCorrectionDesk).toHaveBeenCalledTimes(2);
    expect(readTranscriptCorrectionDesk).toHaveBeenLastCalledWith(expect.objectContaining({
      recordingAssetId: "source-1", transcriptJobId: "job-1",
    }));
    expect(prisma.callRecordingEndpointReceipt.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { roomId: "room-1", captureId: { in: captureIds }, state: "STARTED", directive: { roomId: "room-1", action: "START" } },
    }));
  });

  it("returns an exact transcript job without assembling newer Session sources", async () => {
    const exact = desk({
      participantId: "coach",
      recordingAssetId: "retained-source",
      transcriptJobId: "retained-job",
      sha: "d".repeat(64),
      segmentId: "retained-turn",
      startSeconds: 7,
      text: "The original linked evidence.",
    });
    jest.mocked(readTranscriptCorrectionDesk).mockResolvedValueOnce(exact as any);
    const prisma = {
      recordingAsset: {
        findMany: jest.fn(),
      },
    };

    const result = await readSessionTranscriptCorrectionDesk({
      prisma,
      roomId: "room-1",
      actor,
      recordingAssetId: "retained-source",
      transcriptJobId: "retained-job",
    });

    expect(result).toBe(exact);
    expect(readTranscriptCorrectionDesk).toHaveBeenCalledWith({
      prisma,
      roomId: "room-1",
      actor,
      recordingAssetId: "retained-source",
      transcriptJobId: "retained-job",
    });
    expect(prisma.recordingAsset.findMany).not.toHaveBeenCalled();
  });

  it("assembles participant segments on program time while retaining exact source playback", async () => {
    const coach = desk({
      participantId: "coach",
      recordingAssetId: "coach-source",
      transcriptJobId: "coach-job",
      sha: "a".repeat(64),
      segmentId: "coach-turn",
      startSeconds: 5,
      text: "What matters today?",
    });
    const client = desk({
      participantId: "client",
      recordingAssetId: "client-source",
      transcriptJobId: "client-job",
      sha: "b".repeat(64),
      segmentId: "client-turn",
      startSeconds: 5,
      text: "One clear next step.",
    });
    jest
      .mocked(readTranscriptCorrectionDesk)
      .mockResolvedValueOnce(coach as any)
      .mockResolvedValueOnce(coach as any)
      .mockResolvedValueOnce(client as any);
    const prisma = {
      recordingAsset: {
        findMany: jest.fn(async () => [
          {
            id: "coach-source",
            participantId: "coach",
            kind: "LOCAL_AUDIO", status: "VERIFIED",
            checksum: "a".repeat(64),
            recordedStartedAt: new Date("2026-08-24T15:00:05.000Z"),
            localManifestJson: {
              captureGroupId: "take-1",
              alignment: alignment("2026-08-24T15:00:00.000Z", 35),
            },
            transcriptJobs: [
              {
                id: "coach-job",
                createdAt: new Date("2026-08-24T16:00:00.000Z"),
              },
            ],
          },
          {
            id: "client-source",
            participantId: "client",
            kind: "LOCAL_AUDIO", status: "VERIFIED",
            checksum: "b".repeat(64),
            recordedStartedAt: new Date("2026-08-24T15:00:00.000Z"),
            localManifestJson: {
              captureGroupId: "take-1",
              alignment: alignment("2026-08-24T15:00:00.625Z", 48),
            },
            transcriptJobs: [
              {
                id: "client-job",
                createdAt: new Date("2026-08-24T16:00:01.000Z"),
              },
            ],
          },
        ]),
      },
    };

    const result = (await readSessionTranscriptCorrectionDesk({
      prisma,
      roomId: "room-1",
      actor,
    })) as any;

    expect(result.sessionTranscript).toMatchObject({
      schema: "quipsly-session-transcript-correction-desk-v1",
      status: "assembled",
      sourceCount: 2,
      programClock: {
        authority: "capture-clock-proposal",
        sampleAccurateClaimed: false,
      },
    });
    expect(
      result.segments.map((segment: any) => [
        segment.id,
        segment.sourceStartSeconds,
        segment.programStartSeconds,
        segment.recordingAssetId,
        segment.sourcePlayback.recordingAssetId,
      ]),
    ).toEqual([
      ["coach-turn", 5, 5, "coach-source", "coach-source"],
      ["client-turn", 5, 5.625, "client-source", "client-source"],
    ]);
    expect(result.sessionTranscript.sources.map((source: any) => [
      source.recordingAssetId,
      source.spectralContext.sourceId,
    ])).toEqual([
      ["coach-source", "spectral-coach-source"],
      ["client-source", "spectral-client-source"],
    ]);
  });

  it("prefers the coherent participant masters even when a mixed transcript was created later", async () => {
    const mixed = {
      ...desk({
        participantId: "provider",
        recordingAssetId: "provider-mix",
        transcriptJobId: "mixed-job",
        sha: "c".repeat(64),
        segmentId: "mixed-turn",
        startSeconds: 0,
        text: "A lower-authority mixed transcript.",
      }),
      processing: {
        routing: {
          sourceTopology: "mixed-room",
          speakerAuthority: "provider-diarization",
        },
      },
    };
    const coach = desk({
      participantId: "coach",
      recordingAssetId: "coach-source",
      transcriptJobId: "coach-job",
      sha: "a".repeat(64),
      segmentId: "coach-turn",
      startSeconds: 4,
      text: "What matters today?",
    });
    const client = desk({
      participantId: "client",
      recordingAssetId: "client-source",
      transcriptJobId: "client-job",
      sha: "b".repeat(64),
      segmentId: "client-turn",
      startSeconds: 5,
      text: "One clear next step.",
    });
    jest
      .mocked(readTranscriptCorrectionDesk)
      .mockResolvedValueOnce(mixed as any)
      .mockResolvedValueOnce(coach as any)
      .mockResolvedValueOnce(client as any);
    const prisma = {
      recordingAsset: {
        findMany: jest.fn(async () => [
          {
            id: "coach-source",
            participantId: "coach",
            kind: "LOCAL_AUDIO", status: "VERIFIED",
            checksum: "a".repeat(64),
            recordedStartedAt: new Date("2026-08-24T15:00:00.000Z"),
            localManifestJson: { captureGroupId: "take-1" },
            transcriptJobs: [
              {
                id: "coach-job",
                createdAt: new Date("2026-08-24T16:00:00.000Z"),
              },
            ],
          },
          {
            id: "client-source",
            participantId: "client",
            kind: "LOCAL_AUDIO", status: "VERIFIED",
            checksum: "b".repeat(64),
            recordedStartedAt: new Date("2026-08-24T15:00:00.250Z"),
            localManifestJson: { captureGroupId: "take-1" },
            transcriptJobs: [
              {
                id: "client-job",
                createdAt: new Date("2026-08-24T16:00:01.000Z"),
              },
            ],
          },
        ]),
      },
    };

    const result = (await readSessionTranscriptCorrectionDesk({
      prisma,
      roomId: "room-1",
      actor,
    })) as any;

    expect(result.transcriptJobId).toBe("coach-job");
    expect(result.sessionTranscript).toMatchObject({
      status: "assembled",
      sourceCount: 2,
      programClock: { authority: "reported-wall-clock-fallback" },
    });
    expect(result.segments.map((segment: any) => segment.id)).toEqual([
      "coach-turn",
      "client-turn",
    ]);
    expect(
      result.segments.map((segment: any) => segment.transcriptJobId),
    ).toEqual(["coach-job", "client-job"]);
  });

  it("returns the exact participant master when it is the only source-bound transcript", async () => {
    const mixed = {
      ...desk({
        participantId: "provider",
        recordingAssetId: "provider-mix",
        transcriptJobId: "mixed-job",
        sha: "c".repeat(64),
        segmentId: "mixed-turn",
        startSeconds: 0,
        text: "A lower-authority mixed transcript.",
      }),
      processing: { routing: { sourceTopology: "mixed-room" } },
    };
    const coach = desk({
      participantId: "coach",
      recordingAssetId: "coach-source",
      transcriptJobId: "coach-job",
      sha: "a".repeat(64),
      segmentId: "coach-turn",
      startSeconds: 4,
      text: "What matters today?",
    });
    jest
      .mocked(readTranscriptCorrectionDesk)
      .mockResolvedValueOnce(mixed as any)
      .mockResolvedValueOnce(coach as any);
    const prisma = {
      recordingAsset: {
        findMany: jest.fn(async () => [
          {
            id: "coach-source",
            participantId: "coach",
            kind: "LOCAL_AUDIO", status: "VERIFIED",
            checksum: "a".repeat(64),
            recordedStartedAt: new Date("2026-08-24T15:00:00.000Z"),
            localManifestJson: { captureGroupId: "take-1" },
            transcriptJobs: [
              {
                id: "coach-job",
                createdAt: new Date("2026-08-24T16:00:00.000Z"),
              },
            ],
          },
        ]),
      },
    };

    const result = (await readSessionTranscriptCorrectionDesk({
      prisma,
      roomId: "room-1",
      actor,
    })) as any;

    expect(result.transcriptJobId).toBe("coach-job");
    expect(result.segments).toEqual(coach.segments);
    expect(result.sessionTranscript).toMatchObject({
      status: "single-source",
      sourceCount: 1,
      sources: [
        { transcriptJobId: "coach-job", recordingAssetId: "coach-source" },
      ],
    });
  });

  it("keeps the exact current source visible when another participant source is held", async () => {
    const coach = desk({
      participantId: "coach",
      recordingAssetId: "coach-source",
      transcriptJobId: "coach-job",
      sha: "a".repeat(64),
      segmentId: "coach-turn",
      startSeconds: 5,
      text: "What matters today?",
    });
    const client = {
      ...desk({
        participantId: "client",
        recordingAssetId: "client-source",
        transcriptJobId: "client-job",
        sha: "b".repeat(64),
        segmentId: "client-turn",
        startSeconds: 5,
        text: "One clear next step.",
      }),
      gate: { allowed: false, error: "Source held." },
    };
    jest
      .mocked(readTranscriptCorrectionDesk)
      .mockResolvedValueOnce(coach as any)
      .mockResolvedValueOnce(coach as any)
      .mockResolvedValueOnce(client as any);
    const prisma = {
      recordingAsset: {
        findMany: jest.fn(async () => [
          {
            id: "coach-source",
            participantId: "coach",
            kind: "LOCAL_AUDIO", status: "VERIFIED",
            checksum: "a".repeat(64),
            recordedStartedAt: new Date("2026-08-24T15:00:00.000Z"),
            localManifestJson: { captureGroupId: "take-1" },
            transcriptJobs: [{ id: "coach-job", createdAt: new Date() }],
          },
          {
            id: "client-source",
            participantId: "client",
            kind: "LOCAL_AUDIO", status: "VERIFIED",
            checksum: "b".repeat(64),
            recordedStartedAt: new Date("2026-08-24T15:00:00.500Z"),
            localManifestJson: { captureGroupId: "take-1" },
            transcriptJobs: [{ id: "client-job", createdAt: new Date() }],
          },
        ]),
      },
    };

    const result = (await readSessionTranscriptCorrectionDesk({
      prisma,
      roomId: "room-1",
      actor,
    })) as any;

    expect(result.sessionTranscript).toMatchObject({
      status: "incomplete",
      sourceCount: 1,
    });
    expect(result.segments).toEqual(coach.segments);
  });

  it.each([false, true])("projects measured sync into conversation time with a clock-placed reconnect: %s", async (withReconnect) => {
    const coach = desk({
      participantId: "coach",
      recordingAssetId: "coach-source",
      transcriptJobId: "coach-job",
      sha: "a".repeat(64),
      segmentId: "coach-turn",
      startSeconds: 5,
      text: "What matters today?",
    });
    const client = desk({
      participantId: "client",
      recordingAssetId: "client-source",
      transcriptJobId: "client-job",
      sha: "b".repeat(64),
      segmentId: "client-turn",
      startSeconds: 5,
      text: "One clear next step.",
    });
    jest
      .mocked(readTranscriptCorrectionDesk)
      .mockResolvedValueOnce(coach as any)
      .mockResolvedValueOnce(coach as any)
      .mockResolvedValueOnce(client as any);
    if (withReconnect) jest.mocked(readTranscriptCorrectionDesk).mockResolvedValueOnce(desk({
      participantId: "client", recordingAssetId: "reconnect-source", transcriptJobId: "reconnect-job",
      sha: "c".repeat(64), segmentId: "reconnect-turn", startSeconds: 2, text: "Back with my next step.",
    }) as any);
    jest.mocked(readSessionReviewedSourcePlacements).mockResolvedValueOnce([
      {
        alignmentJobId: "alignment-1",
        captureGroupId: "take-1",
        spineRecordingAssetId: "coach-source",
        targetRecordingAssetId: "client-source",
        signedOffsetSeconds: 0.35,
        residualDriftMilliseconds: 1.2,
        correctionApplied: false,
        sourceBytesMutated: false,
        sampleAccurateClaimed: false,
      } as any,
    ]);
    const prisma = {
      recordingAsset: {
        findMany: jest.fn(async () => [
          {
            id: "coach-source",
            participantId: "coach",
            kind: "LOCAL_AUDIO", status: "VERIFIED",
            checksum: "a".repeat(64),
            recordedStartedAt: new Date("2026-08-24T15:00:00.000Z"),
            localManifestJson: { captureGroupId: "take-1" },
            transcriptJobs: [{ id: "coach-job", createdAt: new Date() }],
          },
          {
            id: "client-source",
            participantId: "client",
            kind: "LOCAL_AUDIO", status: "VERIFIED",
            checksum: "b".repeat(64),
            recordedStartedAt: new Date("2026-08-24T15:00:09.000Z"),
            localManifestJson: { captureGroupId: "take-1" },
            transcriptJobs: [{ id: "client-job", createdAt: new Date() }],
          },
          ...(withReconnect ? [{id: "reconnect-source", participantId: "client", kind: "LOCAL_AUDIO", status: "VERIFIED", checksum: "c".repeat(64),
            recordedStartedAt: new Date("2026-08-24T15:20:00.000Z"), localManifestJson: {captureGroupId: "take-1"},
            transcriptJobs: [{id: "reconnect-job", createdAt: new Date()}]}] : []),
        ]),
      },
    };

    const result = (await readSessionTranscriptCorrectionDesk({
      prisma,
      roomId: "room-1",
      actor,
    })) as any;

    expect(result.sessionTranscript.programClock).toMatchObject({
      authority: withReconnect ? "mixed-waveform-clock-placement" : "reviewed-waveform-placement",
      waveformReviewRequired: withReconnect,
    });
    expect(
      result.segments.map((segment: any) => [
        segment.id,
        segment.programStartSeconds,
      ]),
    ).toEqual([
      ["coach-turn", 5],
      ["client-turn", 5.35],
      ...(withReconnect ? [["reconnect-turn", 1202]] : []),
    ]);
  });
});
