/** @jest-environment node */

import { getPrismaClient } from "@/lib/prisma";
import { buildSessionRecordingStatus } from "@/lib/session-recording-status";
import { getQuipslySessionFromRequest } from "@/lib/server/quipsly-session";
import { buildSessionReadinessTopology } from "@/lib/server/session-readiness-topology";

import { GET } from "./route";

jest.mock("server-only", () => ({}));
jest.mock("@/lib/prisma", () => ({ getPrismaClient: jest.fn() }));
jest.mock("@/lib/server/quipsly-session", () => ({ getQuipslySessionFromRequest: jest.fn() }));
jest.mock("@/lib/server/session-readiness-topology", () => ({ buildSessionReadinessTopology: jest.fn() }));
jest.mock("@/lib/session-recording-status", () => ({ buildSessionRecordingStatus: jest.fn() }));

const prisma = {
  callRoom: { findFirst: jest.fn() },
  mobileCaptureFinalizationReceipt: { findMany: jest.fn() },
};
const context = { params: Promise.resolve({ roomId: "room-1" }) };
const request = new Request("http://127.0.0.1:3012/api/sessions/room-1/recording-status");

describe("Session recording status route", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(getPrismaClient).mockReturnValue(prisma as never);
    jest.mocked(getQuipslySessionFromRequest).mockResolvedValue({ user: { id: "coach-1", name: "Coach", primaryEmail: "coach@example.test" } } as never);
    prisma.callRoom.findFirst.mockResolvedValue({
      id: "room-1",
      status: "RECORDING",
      participants: [{ id: "participant-1", userId: "coach-1", displayName: "Coach", email: "coach@example.test", role: "HOST", user: { name: "Coach", primaryEmail: "coach@example.test" } }],
      participantProviderGrants: [],
      participantPreflightReceipts: [],
      endpointQueueReceipts: [],
      expectedSources: [],
      recordingAssets: [],
      recordingConsents: [],
      stateReceipts: [],
    });
    prisma.mobileCaptureFinalizationReceipt.findMany.mockResolvedValue([]);
    jest.mocked(buildSessionReadinessTopology).mockReturnValue({ generatedAt: "2026-08-22T18:00:00.000Z" } as never);
    jest.mocked(buildSessionRecordingStatus).mockReturnValue({
      schema: "quipsly-session-recording-status-v1",
      generatedAt: "2026-08-22T18:00:00.000Z",
      roomId: "room-1",
      roomStatus: "RECORDING",
      state: "NOT_STARTED",
      label: "Recording has not started",
      detail: "No retained recording is visible yet.",
      safeToLeave: false,
      peopleRequiringRecordingCount: 0,
      peopleSafeCount: 0,
      people: [],
      technicalDetail: "No evidence.",
    });
  });

  it("returns a private, simple projection to an authorized participant", async () => {
    const response = await GET(request, context);
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(await response.json()).toMatchObject({
      ok: true,
      status: { state: "NOT_STARTED", safeToLeave: false },
      boundaries: { readOnly: true, privateSessionAccessRequired: true, providerPresenceIsNotRecordingProof: true },
    });
    expect(buildSessionReadinessTopology).toHaveBeenCalledWith(expect.objectContaining({
      participants: [expect.objectContaining({ id: "participant-1", isCurrentActor: true })],
    }));
    expect(buildSessionRecordingStatus).toHaveBeenCalledWith(expect.objectContaining({ roomId: "room-1", roomStatus: "RECORDING" }));
  });

  it("does not reveal whether an unauthorized room exists", async () => {
    prisma.callRoom.findFirst.mockResolvedValue(null);
    const response = await GET(request, context);
    expect(response.status).toBe(404);
    expect(prisma.mobileCaptureFinalizationReceipt.findMany).not.toHaveBeenCalled();
    expect(buildSessionReadinessTopology).not.toHaveBeenCalled();
  });

  it("authenticates before database access", async () => {
    jest.mocked(getQuipslySessionFromRequest).mockResolvedValue(null as never);
    const response = await GET(request, context);
    expect(response.status).toBe(401);
    expect(prisma.callRoom.findFirst).not.toHaveBeenCalled();
  });
});
