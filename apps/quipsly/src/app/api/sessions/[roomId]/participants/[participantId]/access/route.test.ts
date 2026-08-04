/** @jest-environment node */

import { getPrismaClient } from "@/lib/prisma";
import { getQuipslySessionFromRequest } from "@/lib/server/quipsly-session";

import { POST } from "./route";

jest.mock("server-only", () => ({}));
jest.mock("@/lib/prisma", () => ({ getPrismaClient: jest.fn() }));
jest.mock("@/lib/server/quipsly-session", () => ({
  getQuipslySessionFromRequest: jest.fn(),
}));
jest.mock("@/lib/server/session-participant-provider-access", () => ({
  reconcileRemovedParticipantProviderAccess: jest.fn(),
}));

const prisma = {
  callRoom: { findFirst: jest.fn() },
  callParticipant: { findFirst: jest.fn(), findUnique: jest.fn() },
  callParticipantAccessReceipt: { findUnique: jest.fn() },
};

const context = {
  params: Promise.resolve({ roomId: "room-1", participantId: "participant-1" }),
};
const body = {
  action: "REMOVE",
  requestId: "123e4567-e89b-42d3-a456-426614174000",
  expectedRevision: 0,
};

function request(value: unknown = body) {
  return new Request(
    "http://127.0.0.1:3012/api/sessions/room-1/participants/participant-1/access",
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(value),
    },
  );
}

function participant(overrides: Record<string, unknown> = {}) {
  return {
    id: "participant-1",
    roomId: "room-1",
    userId: "guest-1",
    email: "guest@example.test",
    displayName: "Guest",
    role: "CLIENT",
    accessStatus: "ACTIVE",
    accessRevision: 0,
    providerAccessStatus: "NOT_REQUIRED",
    user: { id: "guest-1", primaryEmail: "guest@example.test", roles: [] },
    acceptedInvitations: [{ id: "invite-1", participantCreated: true }],
    ...overrides,
  };
}

describe("Session participant access API", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(getPrismaClient).mockReturnValue(prisma as never);
    jest.mocked(getQuipslySessionFromRequest).mockResolvedValue({
      user: { id: "host-1", primaryEmail: "host@example.test", name: "Host" },
    } as never);
    prisma.callRoom.findFirst.mockResolvedValue({
      id: "room-1",
      title: "Coaching Session",
      purpose: "COACHING",
      provider: "livekit",
      providerRoomId: "provider-room-1",
      createdByUserId: "host-1",
      booking: null,
      project: { accessGrants: [] },
    });
    prisma.callParticipant.findFirst.mockResolvedValue(participant());
    prisma.callParticipantAccessReceipt.findUnique.mockResolvedValue(null);
  });

  it("does not reveal a room to an unsigned actor", async () => {
    jest.mocked(getQuipslySessionFromRequest).mockResolvedValue(null as never);
    const response = await POST(request(), context);
    expect(response.status).toBe(401);
    expect(prisma.callRoom.findFirst).not.toHaveBeenCalled();
  });

  it("refuses to overload an accepted invitation when another access source remains", async () => {
    prisma.callRoom.findFirst.mockResolvedValue({
      id: "room-1",
      title: "Coaching Session",
      purpose: "COACHING",
      provider: "livekit",
      providerRoomId: "provider-room-1",
      createdByUserId: "host-1",
      booking: { coachUserId: "host-1", clientUserId: "guest-1" },
      project: {
        accessGrants: [{ email: "guest@example.test", status: "ACTIVE" }],
      },
    });
    const response = await POST(request(), context);
    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      code: "OTHER_ACCESS_REMAINS",
      residualAccessReasons: expect.arrayContaining([
        "BOOKED_CLIENT",
        "ACTIVE_PROJECT_GRANT",
      ]),
    });
  });

  it("refuses self-removal even for invitation-owned access", async () => {
    prisma.callParticipant.findFirst.mockResolvedValue(
      participant({ userId: "host-1" }),
    );
    const response = await POST(request(), context);
    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      code: "SELF_REMOVAL_REFUSED",
    });
  });

  it("requires invitation ownership instead of mutating booking or project participants", async () => {
    prisma.callParticipant.findFirst.mockResolvedValue(
      participant({ acceptedInvitations: [] }),
    );
    const response = await POST(request(), context);
    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      code: "NOT_INVITATION_OWNED",
    });
  });

  it("binds an idempotency identity to the original actor and action", async () => {
    prisma.callParticipantAccessReceipt.findUnique.mockResolvedValue({
      requestId: body.requestId,
      roomId: "room-1",
      participantId: "participant-1",
      actorUserId: "another-host",
      action: "REMOVE",
    });
    const response = await POST(request(), context);
    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      code: "REQUEST_ID_CONFLICT",
    });
    expect(prisma.callParticipant.findUnique).not.toHaveBeenCalled();
  });

  it("holds restoration until provider removal has converged", async () => {
    prisma.callParticipant.findFirst.mockResolvedValue(
      participant({
        accessStatus: "REMOVED",
        accessRevision: 1,
        providerAccessStatus: "FAILED",
      }),
    );
    const response = await POST(
      request({
        ...body,
        action: "RESTORE",
        expectedRevision: 1,
      }),
      context,
    );
    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      code: "PROVIDER_RECONCILIATION_REQUIRED",
    });
  });
});
