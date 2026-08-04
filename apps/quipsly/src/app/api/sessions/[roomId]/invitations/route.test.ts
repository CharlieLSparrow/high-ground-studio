/** @jest-environment node */

import { getPrismaClient } from "@/lib/prisma";
import { getQuipslySessionFromRequest } from "@/lib/server/quipsly-session";

import { DELETE, GET, POST } from "./route";

jest.mock("server-only", () => ({}));
jest.mock("@/lib/prisma", () => ({ getPrismaClient: jest.fn() }));
jest.mock("@/lib/server/quipsly-session", () => ({ getQuipslySessionFromRequest: jest.fn() }));

const now = new Date("2026-08-04T18:00:00.000Z");
const expiresAt = new Date("2026-08-11T18:00:00.000Z");
const prisma = {
  callRoom: { findFirst: jest.fn() },
  callParticipant: { findFirst: jest.fn() },
  callRoomInvitation: {
    findMany: jest.fn(),
    upsert: jest.fn(),
    updateMany: jest.fn(),
  },
};

function request(method: string, body?: unknown) {
  return new Request("http://127.0.0.1:3012/api/sessions/room-1/invitations", {
    method,
    headers: body ? { "content-type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
}

const context = { params: Promise.resolve({ roomId: "room-1" }) };

describe("Session invitation API", () => {
  const originalSecret = process.env.AUTH_SECRET;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.AUTH_SECRET = "session-invitation-route-test-secret";
    jest.mocked(getPrismaClient).mockReturnValue(prisma as never);
    jest.mocked(getQuipslySessionFromRequest).mockResolvedValue({
      user: {
        id: "host-1",
        primaryEmail: "host@example.test",
        name: "Host",
      },
    } as never);
    prisma.callRoom.findFirst.mockResolvedValue({
      id: "room-1",
      title: "Episode recording",
      purpose: "PODCAST",
      status: "OPEN",
    });
    prisma.callParticipant.findFirst.mockResolvedValue(null);
    prisma.callRoomInvitation.findMany.mockResolvedValue([]);
    prisma.callRoomInvitation.updateMany.mockResolvedValue({ count: 1 });
    prisma.callRoomInvitation.upsert.mockImplementation(async ({ create }: { create: Record<string, unknown> }) => ({
      id: "invite-1",
      email: create.email,
      displayName: create.displayName,
      role: create.role,
      status: "PENDING",
      expiresAt: create.expiresAt || expiresAt,
      acceptedAt: null,
      revokedAt: null,
      createdAt: now,
    }));
  });

  afterAll(() => {
    if (originalSecret === undefined) delete process.env.AUTH_SECRET;
    else process.env.AUTH_SECRET = originalSecret;
  });

  it("returns only safe invitation ledger fields", async () => {
    const response = await GET(request("GET"), context);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      boundaries: {
        sessionScoped: true,
        grantsNestAccess: false,
        emailSent: false,
      },
    });
  });

  it("creates an expiring email-bound link while persisting only its HMAC", async () => {
    const response = await POST(request("POST", {
      email: " Guest@Example.Test ",
      displayName: "Guest",
      role: "GUEST",
      expiresInHours: 168,
    }), context);
    expect(response.status).toBe(201);
    const packet = await response.json();
    expect(packet).toMatchObject({
      ok: true,
      invitation: { email: "guest@example.test", role: "GUEST", status: "PENDING" },
      boundaries: {
        sessionScoped: true,
        grantsNestAccess: false,
        oneTimeToken: true,
        emailSent: false,
        recordingStarted: false,
      },
    });
    expect(packet.invitePath).toMatch(/^\/sessions\/join\?token=qsinv_/);
    expect(JSON.stringify(packet)).not.toContain("tokenHash");
    expect(prisma.callRoomInvitation.upsert).toHaveBeenCalledWith(expect.objectContaining({
      create: expect.objectContaining({
        roomId: "room-1",
        email: "guest@example.test",
        tokenHash: expect.stringMatching(/^[a-f0-9]{64}$/),
      }),
    }));
    const stored = prisma.callRoomInvitation.upsert.mock.calls[0][0].create;
    expect(stored.tokenHash).not.toContain("qsinv_");
  });

  it("revokes only the unused link without claiming participant removal", async () => {
    const response = await DELETE(request("DELETE", { invitationId: "invite-1" }), context);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      boundaries: {
        pendingLinkRevoked: true,
        participantRemoved: false,
        providerConnectionChanged: false,
      },
    });
    expect(prisma.callRoomInvitation.updateMany).toHaveBeenCalledWith({
      where: { id: "invite-1", roomId: "room-1", status: "PENDING" },
      data: { status: "REVOKED", revokedAt: expect.any(Date), tokenHash: null },
    });
  });

  it("does not reveal whether a room exists to an unsigned actor", async () => {
    jest.mocked(getQuipslySessionFromRequest).mockResolvedValue(null as never);
    const response = await GET(request("GET"), context);
    expect(response.status).toBe(401);
    expect(prisma.callRoom.findFirst).not.toHaveBeenCalled();
  });
});
