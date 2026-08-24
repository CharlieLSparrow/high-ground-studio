/** @jest-environment node */

const mockSession = jest.fn();
const mockRead = jest.fn();
const mockQueue = jest.fn();
const mockReconcile = jest.fn();
const mockDecide = jest.fn();

jest.mock("@/lib/prisma", () => ({
  getPrismaClient: jest.fn(() => ({ marker: "prisma" })),
}));
jest.mock("@/lib/server/quipsly-session", () => ({
  getQuipslySessionFromRequest: (...args: unknown[]) => mockSession(...args),
}));
jest.mock("@/lib/server/session-source-alignment", () => {
  class SessionSourceAlignmentError extends Error {
    constructor(
      readonly status: number,
      readonly code: string,
      message: string,
    ) {
      super(message);
    }
  }
  return {
    readSessionSourceAlignments: (...args: unknown[]) => mockRead(...args),
    queueSessionSourceAlignment: (...args: unknown[]) => mockQueue(...args),
    reconcileSessionSourceAlignment: (...args: unknown[]) =>
      mockReconcile(...args),
    decideSessionSourceAlignment: (...args: unknown[]) => mockDecide(...args),
    SessionSourceAlignmentError,
  };
});

import { GET, POST } from "./route";

const context = { params: Promise.resolve({ roomId: "room-session-123" }) };

describe("Session source alignment route", () => {
  beforeEach(() => {
    jest.resetAllMocks();
    mockSession.mockResolvedValue({
      user: { id: "user-1", email: "coach@example.test", isStaff: false },
    });
  });

  it("keeps unauthenticated reads private", async () => {
    mockSession.mockResolvedValue(null);
    const response = await GET(
      new Request("https://nest.test/api/sessions/room/source-alignment"),
      context,
    );
    expect(response.status).toBe(401);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(mockRead).not.toHaveBeenCalled();
  });

  it("queues only the explicitly selected pair", async () => {
    mockQueue.mockResolvedValue({
      jobId: "session_alignment_12345678",
      status: "queued",
    });
    const response = await POST(
      new Request("https://nest.test/api/sessions/room/source-alignment", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "QUEUE",
          spineRecordingAssetId: "recording-a",
          targetRecordingAssetId: "recording-b",
          ignored: "no",
        }),
      }),
      context,
    );
    expect(response.status).toBe(200);
    expect(mockQueue).toHaveBeenCalledWith(
      expect.objectContaining({
        roomId: "room-session-123",
        spineRecordingAssetId: "recording-a",
        targetRecordingAssetId: "recording-b",
        actor: expect.objectContaining({ id: "user-1" }),
      }),
    );
  });

  it("reconciles by room-bound job identity", async () => {
    mockReconcile.mockResolvedValue({
      jobId: "session_alignment_12345678",
      status: "completed",
    });
    const response = await POST(
      new Request("https://nest.test/api/sessions/room/source-alignment", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "RECONCILE",
          jobId: "session_alignment_12345678",
        }),
      }),
      context,
    );
    expect(response.status).toBe(200);
    expect(mockReconcile).toHaveBeenCalledWith(
      expect.objectContaining({
        roomId: "room-session-123",
        jobId: "session_alignment_12345678",
      }),
    );
  });

  it("passes an optimistic reversible placement decision without extra fields", async () => {
    mockDecide.mockResolvedValue({
      jobId: "session_alignment_12345678",
      decision: { status: "approved", revision: 1 },
    });
    const requestId = "ddfbb57c-7b7e-4a38-83a7-46ab27b51d82";
    const response = await POST(
      new Request("https://nest.test/api/sessions/room/source-alignment", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "APPROVE",
          jobId: "session_alignment_12345678",
          requestId,
          expectedRevision: 0,
          reason: "",
          ignored: "no",
        }),
      }),
      context,
    );
    expect(response.status).toBe(200);
    expect(mockDecide).toHaveBeenCalledWith(
      expect.objectContaining({
        roomId: "room-session-123",
        jobId: "session_alignment_12345678",
        requestId,
        expectedRevision: 0,
        operation: "APPROVE",
      }),
    );
  });
});
