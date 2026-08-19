/** @jest-environment node */

import { getPrismaClient } from "@/lib/prisma";
import { getQuipslySessionFromRequest } from "@/lib/server/quipsly-session";

import { POST } from "./route";

jest.mock("@/lib/prisma", () => ({ getPrismaClient: jest.fn() }));
jest.mock("@/lib/server/quipsly-session", () => ({
  getQuipslySessionFromRequest: jest.fn(),
}));

const roomId = "room-1";
const actor = { id: "coach-1", primaryEmail: "coach@example.test", isStaff: false };
const requestId = "18c70a70-521a-4d3f-9ec0-657ee72337d4";

function request(body: Record<string, unknown> = {}) {
  return new Request(`http://localhost/api/sessions/${roomId}/work`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      clientRequestId: requestId,
      kind: "TASK",
      title: "Send the reflection worksheet",
      body: "Share it before Friday.",
      visibility: "SESSION_SHARED",
      targetAt: null,
      ...body,
    }),
  });
}

describe("Session work creation", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(getQuipslySessionFromRequest).mockResolvedValue({ user: actor } as any);
  });

  it("creates one retry-safe shared task without external side effects", async () => {
    const now = new Date("2026-08-19T20:30:00.000Z");
    const prisma: any = {
      callRoom: { findFirst: jest.fn().mockResolvedValue({ id: roomId, projectId: "project-1" }) },
      actionItem: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({
          id: `session-task-${requestId}`,
          title: "Send the reflection worksheet",
          detail: "Share it before Friday.",
          status: "OPEN",
          createdAt: now,
          updatedAt: now,
        }),
      },
      goal: { findUnique: jest.fn(), create: jest.fn() },
    };
    prisma.$transaction = jest.fn((callback: (tx: any) => Promise<unknown>) => callback(prisma));
    jest.mocked(getPrismaClient).mockReturnValue(prisma);

    const response = await POST(request(), { params: Promise.resolve({ roomId }) });
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toMatchObject({
      ok: true,
      idempotentReplay: false,
      entry: { kind: "TASK", visibility: "SESSION_SHARED", ownedByCurrentActor: true },
      boundaries: {
        explicitHumanCapture: true,
        canonicalRecordCommitted: true,
        externalSideEffects: false,
        calendarMutated: false,
        reminderScheduled: false,
        messageSent: false,
        delivered: false,
        published: false,
      },
    });
    expect(prisma.actionItem.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        roomId,
        projectId: "project-1",
        assignedUserId: actor.id,
        sourceJson: expect.objectContaining({
          schema: "quipsly-session-work-entry-v1",
          surface: "web-session",
          visibility: "SESSION_SHARED",
          actorUserId: actor.id,
          requestFingerprint: expect.stringMatching(/^[0-9a-f]{64}$/),
          externalSideEffects: false,
        }),
      }),
    });
  });

  it("refuses a changed payload that reuses an existing retry identity", async () => {
    const now = new Date("2026-08-19T20:30:00.000Z");
    const prisma: any = {
      callRoom: { findFirst: jest.fn().mockResolvedValue({ id: roomId, projectId: "project-1" }) },
      actionItem: {
        findUnique: jest.fn().mockResolvedValue({
          id: `session-task-${requestId}`,
          title: "Original title",
          detail: null,
          status: "OPEN",
          createdAt: now,
          updatedAt: now,
          sourceJson: {
            schema: "quipsly-session-work-entry-v1",
            clientRequestId: requestId,
            requestFingerprint: "different-request-fingerprint",
            roomId,
            actorUserId: actor.id,
            visibility: "AUTHOR_PRIVATE",
          },
        }),
        create: jest.fn(),
      },
      goal: { findUnique: jest.fn(), create: jest.fn() },
    };
    prisma.$transaction = jest.fn((callback: (tx: any) => Promise<unknown>) => callback(prisma));
    jest.mocked(getPrismaClient).mockReturnValue(prisma);

    const response = await POST(request(), { params: Promise.resolve({ roomId }) });
    const payload = await response.json();

    expect(response.status).toBe(409);
    expect(payload.error).toMatch(/retry identity belongs to different Session work/i);
    expect(prisma.actionItem.create).not.toHaveBeenCalled();
  });

  it("writes nothing when Session mutation authority is unavailable", async () => {
    const prisma: any = {
      callRoom: { findFirst: jest.fn().mockResolvedValue(null) },
      actionItem: { findUnique: jest.fn(), create: jest.fn() },
      goal: { findUnique: jest.fn(), create: jest.fn() },
    };
    prisma.$transaction = jest.fn((callback: (tx: any) => Promise<unknown>) => callback(prisma));
    jest.mocked(getPrismaClient).mockReturnValue(prisma);

    const response = await POST(request(), { params: Promise.resolve({ roomId }) });
    const payload = await response.json();

    expect(response.status).toBe(404);
    expect(payload).toEqual({ ok: false, error: "This Session is unavailable or read-only for this account." });
    expect(prisma.actionItem.create).not.toHaveBeenCalled();
    expect(prisma.goal.create).not.toHaveBeenCalled();
  });

  it("creates a private goal with its target date on the canonical goal record", async () => {
    const now = new Date("2026-08-19T20:30:00.000Z");
    const prisma: any = {
      callRoom: { findFirst: jest.fn().mockResolvedValue({ id: roomId, projectId: "project-1" }) },
      actionItem: { findUnique: jest.fn(), create: jest.fn() },
      goal: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({
          id: `session-goal-${requestId}`,
          title: "Practice reflective listening",
          description: "Review progress together next Session.",
          status: "ACTIVE",
          createdAt: now,
          updatedAt: now,
        }),
      },
    };
    prisma.$transaction = jest.fn((callback: (tx: any) => Promise<unknown>) => callback(prisma));
    jest.mocked(getPrismaClient).mockReturnValue(prisma);

    const response = await POST(request({
      kind: "GOAL",
      title: "Practice reflective listening",
      body: "Review progress together next Session.",
      visibility: "AUTHOR_PRIVATE",
      targetAt: "2026-09-01T12:00:00.000Z",
    }), { params: Promise.resolve({ roomId }) });
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.entry).toMatchObject({
      kind: "GOAL",
      title: "Practice reflective listening",
      visibility: "AUTHOR_PRIVATE",
    });
    expect(prisma.goal.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        ownerUserId: actor.id,
        targetAt: new Date("2026-09-01T12:00:00.000Z"),
        sourceJson: expect.objectContaining({ visibility: "AUTHOR_PRIVATE" }),
      }),
    });
    expect(prisma.actionItem.create).not.toHaveBeenCalled();
  });
});
