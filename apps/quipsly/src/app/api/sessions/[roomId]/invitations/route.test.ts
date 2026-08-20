/** @jest-environment node */

import { getPrismaClient } from "@/lib/prisma";
import { getQuipslySessionFromRequest } from "@/lib/server/quipsly-session";
import { sendSessionInvitationEmail } from "@/lib/server/session-invitation-email";

import { DELETE, GET, POST } from "./route";

jest.mock("server-only", () => ({}));
jest.mock("@/lib/prisma", () => ({ getPrismaClient: jest.fn() }));
jest.mock("@/lib/server/quipsly-session", () => ({
  getQuipslySessionFromRequest: jest.fn(),
}));
jest.mock("@/lib/server/session-invitation-email", () => ({
  sessionInvitationJoinUrl: jest.fn(
    () => "http://127.0.0.1:3012/sessions/join?token=qsinv_test",
  ),
  sendSessionInvitationEmail: jest.fn(),
}));

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
  callRoomInvitationDeliveryReceipt: {
    findFirst: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
  callParticipantAccessReceipt: { findMany: jest.fn() },
  callParticipantProviderGrantReceipt: { findMany: jest.fn() },
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
    prisma.callParticipantAccessReceipt.findMany.mockResolvedValue([]);
    prisma.callParticipantProviderGrantReceipt.findMany.mockResolvedValue([]);
    prisma.callRoomInvitation.updateMany.mockResolvedValue({ count: 1 });
    prisma.callRoomInvitationDeliveryReceipt.findFirst.mockResolvedValue(null);
    prisma.callRoomInvitationDeliveryReceipt.create.mockResolvedValue({
      id: "delivery-1",
      invitationId: "invite-1",
      requestId: "123e4567-e89b-42d3-a456-426614174000",
      channel: "EMAIL",
      status: "PENDING",
      requestedAt: now,
      completedAt: null,
      errorCode: null,
      errorMessage: null,
    });
    prisma.callRoomInvitationDeliveryReceipt.update.mockImplementation(
      async ({ data }: { data: Record<string, unknown> }) => ({
        id: "delivery-1",
        channel: "EMAIL",
        requestedAt: now,
        completedAt: data.completedAt,
        errorCode: data.errorCode,
        errorMessage: data.errorMessage,
        ...data,
      }),
    );
    jest.mocked(sendSessionInvitationEmail).mockResolvedValue({
      ok: true,
      provider: "resend",
      providerMessageId: "provider-email-1",
    });
    prisma.callRoomInvitation.upsert.mockImplementation(
      async ({ create }: { create: Record<string, unknown> }) => ({
        id: "invite-1",
        email: create.email,
        displayName: create.displayName,
        role: create.role,
        status: "PENDING",
        expiresAt: create.expiresAt || expiresAt,
        acceptedAt: null,
        revokedAt: null,
        createdAt: now,
      }),
    );
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
        emailDeliveryRecorded: true,
      },
      collaboration: {
        activity: [],
        joinKeyLeases: [],
        boundaries: {
          appendOnlyAccessHistory: true,
          joinKeyLeaseIsPresenceProof: false,
          providerIdentitiesExposed: false,
          credentialsExposed: false,
        },
      },
    });
  });

  it("projects access history and safe join-key leases without provider identities or credentials", async () => {
    prisma.callRoomInvitation.findMany.mockResolvedValue([
      {
        id: "invite-1",
        email: "guest@example.test",
        displayName: "Guest",
        role: "GUEST",
        status: "ACCEPTED",
        expiresAt,
        acceptedAt: new Date("2026-08-04T17:00:00.000Z"),
        revokedAt: null,
        createdAt: new Date("2026-08-04T16:00:00.000Z"),
        participantCreated: true,
        participant: {
          id: "participant-1",
          accessStatus: "REMOVED",
          accessRevision: 1,
          providerAccessStatus: "CONVERGED",
          providerAccessErrorCode: null,
        },
        createdBy: { name: "Host", primaryEmail: "host@example.test" },
        acceptedBy: { name: "Guest", primaryEmail: "guest@example.test" },
      },
    ]);
    prisma.callParticipantAccessReceipt.findMany.mockResolvedValue([
      {
        id: "receipt-1",
        action: "PROVIDER_RECONCILE",
        providerStatus: "CONVERGED",
        createdAt: new Date("2026-08-04T17:30:00.000Z"),
        actor: { name: "Host", primaryEmail: "host@example.test" },
        participant: { displayName: "Guest", email: "guest@example.test" },
      },
    ]);
    prisma.callParticipantProviderGrantReceipt.findMany.mockResolvedValue([
      {
        id: "lease-1",
        participantId: "participant-1",
        clientInstanceId: "web-device",
        clientKind: "web",
        deviceLabel: "Quipsly Web · MacIntel",
        issuedAt: new Date(Date.now() - 60_000),
        expiresAt: new Date(Date.now() + 600_000),
        participant: { displayName: "Guest", email: "guest@example.test" },
      },
    ]);

    const response = await GET(request("GET"), context);
    const packet = await response.json();
    expect(packet.collaboration).toMatchObject({
      activity: expect.arrayContaining([
        expect.objectContaining({
          kind: "PROVIDER_RECONCILIATION",
          participantLabel: "Guest",
        }),
      ]),
      joinKeyLeases: [
        expect.objectContaining({
          id: "lease-1",
          deviceLabel: "Quipsly Web · MacIntel",
        }),
      ],
    });
    expect(JSON.stringify(packet)).not.toContain("providerIdentity");
    expect(JSON.stringify(packet)).not.toContain("tokenJti");
  });

  it("creates an expiring email-bound link while persisting only its HMAC", async () => {
    const response = await POST(
      request("POST", {
        email: " Guest@Example.Test ",
        displayName: "Guest",
        role: "GUEST",
        expiresInHours: 168,
      }),
      context,
    );
    expect(response.status).toBe(201);
    const packet = await response.json();
    expect(packet).toMatchObject({
      ok: true,
      invitation: {
        email: "guest@example.test",
        role: "GUEST",
        status: "PENDING",
      },
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
    expect(prisma.callRoomInvitation.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          roomId: "room-1",
          email: "guest@example.test",
          tokenHash: expect.stringMatching(/^[a-f0-9]{64}$/),
        }),
      }),
    );
    const stored = prisma.callRoomInvitation.upsert.mock.calls[0][0].create;
    expect(stored.tokenHash).not.toContain("qsinv_");
  });

  it("can deliver the handoff to an already provisioned active coaching participant", async () => {
    prisma.callParticipant.findFirst.mockResolvedValue({
      id: "client-participant",
      accessStatus: "ACTIVE",
    });
    const response = await POST(
      request("POST", {
        email: "client@example.test",
        displayName: "Client",
        role: "CLIENT",
        delivery: "EMAIL",
        requestId: "123e4567-e89b-42d3-a456-426614174000",
      }),
      context,
    );

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      delivery: { status: "SENT" },
    });
    expect(prisma.callRoomInvitation.upsert).toHaveBeenCalledTimes(1);
    expect(prisma.callParticipant.findFirst).toHaveBeenCalledTimes(1);
  });

  it("sends explicitly and records provider delivery separately from acceptance", async () => {
    const response = await POST(
      request("POST", {
        email: "client@example.test",
        displayName: "Client",
        role: "CLIENT",
        expiresInHours: 720,
        delivery: "EMAIL",
        requestId: "123e4567-e89b-42d3-a456-426614174000",
      }),
      context,
    );
    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      delivery: { status: "SENT", errorCode: null },
      boundaries: {
        emailSent: true,
        emailBound: true,
        recordingStarted: false,
      },
    });
    expect(
      prisma.callRoomInvitationDeliveryReceipt.create,
    ).toHaveBeenCalledWith({
      data: expect.objectContaining({
        invitationId: "invite-1",
        requestId: "123e4567-e89b-42d3-a456-426614174000",
        recipientEmail: "client@example.test",
        status: "PENDING",
      }),
    });
    expect(sendSessionInvitationEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        recipientEmail: "client@example.test",
        idempotencyKey: "session-invitation/delivery-1",
      }),
    );
  });

  it("revokes only the unused link without claiming participant removal", async () => {
    const response = await DELETE(
      request("DELETE", { invitationId: "invite-1" }),
      context,
    );
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
