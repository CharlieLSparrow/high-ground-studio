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

  afterEach(() =>
    jest.mocked(readSessionReviewedSourcePlacements).mockResolvedValue([]),
  );

  it("does not pull an earlier Record/Stop into the current transcript in the same room group", async () => {
    const captureIds = [
      "50000000-0000-4000-8000-000000000001",
      "50000000-0000-4000-8000-000000000002",
    ];
    const rows = captureIds.map((captureId, index) => ({
      id: `source-${index}`,
      participantId: "coach",
      kind: "LOCAL_AUDIO",
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
            kind: "LOCAL_AUDIO",
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
            kind: "LOCAL_AUDIO",
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
            kind: "LOCAL_AUDIO",
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
            kind: "LOCAL_AUDIO",
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
            kind: "LOCAL_AUDIO",
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
            kind: "LOCAL_AUDIO",
            checksum: "a".repeat(64),
            recordedStartedAt: new Date("2026-08-24T15:00:00.000Z"),
            localManifestJson: { captureGroupId: "take-1" },
            transcriptJobs: [{ id: "coach-job", createdAt: new Date() }],
          },
          {
            id: "client-source",
            participantId: "client",
            kind: "LOCAL_AUDIO",
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

  it("projects an approved measured placement into conversation segment time", async () => {
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
            kind: "LOCAL_AUDIO",
            checksum: "a".repeat(64),
            recordedStartedAt: new Date("2026-08-24T15:00:00.000Z"),
            localManifestJson: { captureGroupId: "take-1" },
            transcriptJobs: [{ id: "coach-job", createdAt: new Date() }],
          },
          {
            id: "client-source",
            participantId: "client",
            kind: "LOCAL_AUDIO",
            checksum: "b".repeat(64),
            recordedStartedAt: new Date("2026-08-24T15:00:09.000Z"),
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

    expect(result.sessionTranscript.programClock).toMatchObject({
      authority: "reviewed-waveform-placement",
      waveformReviewRequired: false,
    });
    expect(
      result.segments.map((segment: any) => [
        segment.id,
        segment.programStartSeconds,
      ]),
    ).toEqual([
      ["coach-turn", 5],
      ["client-turn", 5.35],
    ]);
  });
});
