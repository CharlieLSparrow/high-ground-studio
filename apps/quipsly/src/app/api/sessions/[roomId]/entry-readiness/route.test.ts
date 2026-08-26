/** @jest-environment node */

import { getPrismaClient } from "@/lib/prisma";
import { getQuipslySessionFromRequest } from "@/lib/server/quipsly-session";

import { GET } from "./route";

jest.mock("@/lib/prisma", () => ({ getPrismaClient: jest.fn() }));
jest.mock("@/lib/server/quipsly-session", () => ({
  getQuipslySessionFromRequest: jest.fn(),
}));

const mockedPrisma = jest.mocked(getPrismaClient);
const mockedSession = jest.mocked(getQuipslySessionFromRequest);

function context(roomId = "room-1") {
  return { params: Promise.resolve({ roomId }) };
}

describe("Session entry readiness refresh", () => {
  const findFirst = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    mockedSession.mockResolvedValue({
      user: {
        id: "coach-1",
        name: "Coach",
        primaryEmail: "coach@example.test",
        isStaff: false,
      },
    } as never);
    mockedPrisma.mockReturnValue({ callRoom: { findFirst } } as never);
    findFirst.mockResolvedValue({
      id: "room-1",
      captureGroupId: "55555555-5555-4555-8555-555555555551",
      title: "Coaching Session",
      purpose: "COACHING",
      status: "PLANNED",
      provider: "livekit",
      providerRoomId: "provider-room-1",
      booking: null,
      project: { id: "project-1", name: "Coaching", slug: "coaching" },
      participants: [{
        id: "participant-coach",
        userId: "coach-1",
        role: "COACH",
        accessStatus: "ACTIVE",
        displayName: "Coach",
        email: "coach@example.test",
        user: { name: "Coach", primaryEmail: "coach@example.test" },
      }],
      recordingConsents: [],
    });
  });

  it("returns a private side-effect-free projection without minting or mutating", async () => {
    const response = await GET(
      new Request("http://localhost/api/sessions/room-1/entry-readiness"),
      context(),
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toMatch(/no-store/);
    expect(payload).toMatchObject({
      ok: true,
      roomId: "room-1",
      participantCount: 1,
      entryReadiness: {
        stage: "confirm-consent",
        permissions: {
          canStartAudioRecording: false,
        },
        participantProgress: {
          attached: 1,
          required: 2,
          complete: false,
        },
      },
      effects: {
        sideEffectFree: true,
        participantCreated: false,
        consentChanged: false,
        providerTokenMinted: false,
        providerJoined: false,
        recordingStarted: false,
        externalMutated: false,
      },
    });
    expect(findFirst).toHaveBeenCalledTimes(1);
  });

  it("does not reveal a Session outside the authenticated access boundary", async () => {
    findFirst.mockResolvedValue(null);

    const response = await GET(
      new Request("http://localhost/api/sessions/private-room/entry-readiness"),
      context("private-room"),
    );

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      code: "ROOM_ACCESS_DENIED",
    });
  });

  it("rejects signed-out polling before reading the room", async () => {
    mockedSession.mockResolvedValue(null);

    const response = await GET(
      new Request("http://localhost/api/sessions/room-1/entry-readiness"),
      context(),
    );

    expect(response.status).toBe(401);
    expect(findFirst).not.toHaveBeenCalled();
  });
});
