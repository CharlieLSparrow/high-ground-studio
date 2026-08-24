/** @jest-environment node */

const mockRecordingAssetFindMany = jest.fn();
jest.mock("@/lib/prisma", () => ({
  getPrismaClient: jest.fn(() => ({ recordingAsset: { findMany: mockRecordingAssetFindMany } })),
}));
jest.mock("@/lib/server/quipsly-session", () => ({ getQuipslySessionFromRequest: jest.fn() }));
jest.mock("@/lib/server/transcript-corrections", () => ({
  readTranscriptCorrectionDesk: jest.fn(),
  TranscriptCorrectionError: class TranscriptCorrectionError extends Error {},
}));

import { getQuipslySessionFromRequest } from "@/lib/server/quipsly-session";
import { readTranscriptCorrectionDesk } from "@/lib/server/transcript-corrections";
import { GET } from "./route";

const actor = {
  id: "coach-user",
  primaryEmail: "coach@example.test",
  isStaff: false,
};

function desk(overrides: Record<string, unknown> = {}) {
  return {
    ok: true,
    roomId: "room-1",
    roomTitle: "Certification Practice",
    roomPurpose: "COACHING",
    scheduledStart: "2026-08-23T16:00:00.000Z",
    transcriptJobId: "job-1",
    sourceSha256: "a".repeat(64),
    gate: { allowed: true },
    recording: { id: "recording-1" },
    participants: [
      { id: "coach", displayLabel: "Coach Example", role: "COACH" },
      { id: "client", displayLabel: "Client Example", role: "CLIENT" },
    ],
    speakerGroups: [
      { providerSpeakerLabel: "Speaker 0", attribution: { participantId: "coach" } },
      { providerSpeakerLabel: "Speaker 1", attribution: { participantId: "client" } },
    ],
    segments: [
      { id: "turn-1", startSeconds: 0, endSeconds: 4, text: "What matters today?", speakerLabel: "Coach Example", speakerAttribution: { participantId: "coach" }, acceptedVerification: { id: "verification-1" } },
      { id: "turn-2", startSeconds: 5, endSeconds: 9, text: "A clear next step.", speakerLabel: "Client Example", speakerAttribution: { participantId: "client" }, acceptedCorrection: { id: "correction-1" } },
    ],
    ...overrides,
  };
}

function alignment(start: string, uncertaintyMilliseconds: number) {
  return {
    schema: "quipsly-capture-alignment-proposal-v1",
    status: "proposal-ready",
    captureGroupId: "capture-group-1",
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

describe("coaching transcript report route", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (getQuipslySessionFromRequest as jest.Mock).mockResolvedValue({ user: actor });
    (readTranscriptCorrectionDesk as jest.Mock).mockResolvedValue(desk());
    mockRecordingAssetFindMany.mockReset();
  });

  it("returns a private source-bound Word report for an accessible coaching Session", async () => {
    const response = await GET(
      new Request("https://nest.quipsly.com/api/sessions/room-1/transcript-report"),
      { params: Promise.resolve({ roomId: "room-1" }) },
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toContain("openxmlformats");
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(response.headers.get("Content-Disposition")).toContain("Certification Practice Transcript.docx");
    expect(Buffer.from(await response.arrayBuffer()).subarray(0, 2).toString("utf8")).toBe("PK");
    expect(readTranscriptCorrectionDesk).toHaveBeenCalledWith(expect.objectContaining({
      roomId: "room-1",
      actor: { id: actor.id, email: actor.primaryEmail, isStaff: false },
    }));
  });

  it("does not make a podcast room look like a coaching mentor report", async () => {
    (readTranscriptCorrectionDesk as jest.Mock).mockResolvedValue(desk({ roomPurpose: "PODCAST" }));
    const response = await GET(
      new Request("https://nest.quipsly.com/api/sessions/room-1/transcript-report"),
      { params: Promise.resolve({ roomId: "room-1" }) },
    );

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual(expect.objectContaining({ code: "REPORT_COACHING_REQUIRED" }));
  });

  it("preserves unresolved speaker identity as a visible blocker", async () => {
    (readTranscriptCorrectionDesk as jest.Mock).mockResolvedValue(desk({
      speakerGroups: [],
      segments: [{ id: "turn-x", startSeconds: 8, endSeconds: 9, text: "Do not guess me.", speakerLabel: "Speaker 9" }],
    }));
    const response = await GET(
      new Request("https://nest.quipsly.com/api/sessions/room-1/transcript-report"),
      { params: Promise.resolve({ roomId: "room-1" }) },
    );

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual(expect.objectContaining({ code: "REPORT_SPEAKERS_UNRESOLVED" }));
  });

  it("assembles participant-isolated transcripts from the same coherent take", async () => {
    const startedAt = new Date("2026-08-23T16:00:00.000Z");
    const isolated = (participantId: string, recordingId: string, jobId: string, label: string, segmentId: string, text: string) => desk({
      transcriptJobId: jobId,
      sourceSha256: participantId === "coach" ? "a".repeat(64) : "b".repeat(64),
      processing: { routing: { sourceTopology: "participant-isolated", speakerAuthority: "source-binding" } },
      recording: { id: recordingId, participantId, recordedStartedAt: startedAt.toISOString() },
      speakerGroups: [],
      segments: [{ id: segmentId, startSeconds: participantId === "coach" ? 0 : 2, endSeconds: participantId === "coach" ? 1 : 3, text, speakerLabel: label }],
    });
    (readTranscriptCorrectionDesk as jest.Mock)
      .mockResolvedValueOnce(isolated("coach", "coach-source", "coach-job", "Coach Example", "coach-turn", "What matters today?"))
      .mockResolvedValueOnce(isolated("coach", "coach-source", "coach-job", "Coach Example", "coach-turn", "What matters today?"))
      .mockResolvedValueOnce(isolated("client", "client-source", "client-job", "Client Example", "client-turn", "A clear next step."));
    mockRecordingAssetFindMany.mockResolvedValue([
      {
        id: "coach-source",
        participantId: "coach",
        kind: "LOCAL_AUDIO",
        checksum: "a".repeat(64),
        recordedStartedAt: startedAt,
        localManifestJson: {
          captureGroupId: "capture-group-1",
          alignment: alignment("2026-08-23T16:00:00.000Z", 35),
        },
        transcriptJobs: [{ id: "coach-job", createdAt: startedAt }],
      },
      {
        id: "client-source",
        participantId: "client",
        kind: "LOCAL_AUDIO",
        checksum: "b".repeat(64),
        recordedStartedAt: new Date(startedAt.getTime() + 500),
        localManifestJson: {
          captureGroupId: "capture-group-1",
          alignment: alignment("2026-08-23T16:00:00.625Z", 48),
        },
        transcriptJobs: [{ id: "client-job", createdAt: startedAt }],
      },
    ]);

    const response = await GET(
      new Request("https://nest.quipsly.com/api/sessions/room-1/transcript-report?recordingAssetId=coach-source"),
      { params: Promise.resolve({ roomId: "room-1" }) },
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("X-Quipsly-Transcript-Schema")).toBe("quipsly-coaching-transcript-report-v2");
    expect(response.headers.get("X-Quipsly-Transcript-Source-Count")).toBe("2");
    expect(response.headers.get("X-Quipsly-Transcript-Timing")).toBe("capture-clock-proposal");
    expect(response.headers.get("X-Quipsly-Transcript-Waveform-Review")).toBe("required");
    expect(readTranscriptCorrectionDesk).toHaveBeenCalledTimes(3);
  });
});
