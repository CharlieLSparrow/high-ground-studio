/** @jest-environment node */

jest.mock("@/lib/prisma", () => ({ getPrismaClient: jest.fn() }));
jest.mock("@/lib/server/quipsly-session", () => ({
  getQuipslySessionFromRequest: jest.fn(),
}));
jest.mock("@/lib/server/session-continuity", () => {
  const actual = jest.requireActual("@/lib/server/session-continuity");
  return { ...actual, saveSessionContinuityBrief: jest.fn() };
});

import { getPrismaClient } from "@/lib/prisma";
import {
  saveSessionContinuityBrief,
  SessionContinuityError,
} from "@/lib/server/session-continuity";
import { getQuipslySessionFromRequest } from "@/lib/server/quipsly-session";

import { POST } from "./route";

const mockedPrisma = jest.mocked(getPrismaClient);
const mockedSave = jest.mocked(saveSessionContinuityBrief);
const mockedSession = jest.mocked(getQuipslySessionFromRequest);
const ACTOR = {
  id: "actor-1",
  email: "actor@example.com",
  primaryEmail: "actor@example.com",
  isStaff: false,
};

function request(body: unknown) {
  return new Request("http://localhost/api/sessions/room-1/continuity-brief", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("Session continuity brief route", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedPrisma.mockReturnValue({ marker: "prisma" } as never);
    mockedSession.mockResolvedValue({ user: ACTOR } as never);
  });

  it("requires authentication before reading Prisma or the request body", async () => {
    mockedSession.mockResolvedValue(null);

    const response = await POST(request({}), {
      params: Promise.resolve({ roomId: "room-1" }),
    });

    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({
      ok: false,
      code: "UNAUTHORIZED",
    });
    expect(mockedPrisma).not.toHaveBeenCalled();
    expect(mockedSave).not.toHaveBeenCalled();
  });

  it("returns durable readback and an explicit no-side-effect boundary", async () => {
    mockedSave.mockResolvedValue({
      brief: {
        id: "brief-1",
        title: "Next-session brief",
        body: "Saved body",
        snapshotSha256: "a".repeat(64),
        createdAt: "2026-07-24T18:00:00.000Z",
      },
      idempotentReplay: false,
      state: { saved: [{ id: "brief-1" }] },
    } as never);

    const response = await POST(request({
      clientRequestId: "41b1e8d2-9c4c-430d-af2e-8c912c127193",
      expectedSnapshotSha256: "a".repeat(64),
    }), {
      params: Promise.resolve({ roomId: "room-1" }),
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      ok: true,
      state: "persisted",
      idempotentReplay: false,
      externalSideEffects: false,
      brief: { id: "brief-1" },
    });
    expect(mockedSave).toHaveBeenCalledWith({
      prisma: { marker: "prisma" },
      actor: ACTOR,
      roomId: "room-1",
      clientRequestId: "41b1e8d2-9c4c-430d-af2e-8c912c127193",
      expectedSnapshotSha256: "a".repeat(64),
    });
  });

  it("projects a stale current state without claiming a save", async () => {
    mockedSave.mockRejectedValue(new SessionContinuityError(
      "The Session changed after this continuity preview loaded.",
      409,
      "STALE_SNAPSHOT",
      { current: { snapshotSha256: "b".repeat(64) } } as never,
    ));

    const response = await POST(request({
      clientRequestId: "41b1e8d2-9c4c-430d-af2e-8c912c127193",
      expectedSnapshotSha256: "a".repeat(64),
    }), {
      params: Promise.resolve({ roomId: "room-1" }),
    });
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body).toMatchObject({
      ok: false,
      code: "STALE_SNAPSHOT",
      externalSideEffects: false,
      continuity: { current: { snapshotSha256: "b".repeat(64) } },
    });
  });
});
