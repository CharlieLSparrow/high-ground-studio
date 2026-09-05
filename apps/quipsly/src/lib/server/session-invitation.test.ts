/** @jest-environment node */

jest.mock("server-only", () => ({}));
jest.mock("@/lib/prisma", () => ({ getPrismaClient: jest.fn() }));

import { getPrismaClient } from "@/lib/prisma";

import {
  acceptSessionInvitation,
  cleanSessionInvitationToken,
  createSessionInvitationToken,
  hashSessionInvitationToken,
  inspectSessionInvitation,
  maskInvitationEmail,
  replayableSessionInvitationToken,
  sessionInvitationExpiry,
  sessionInvitationRole,
} from "./session-invitation";

describe("Session invitation token policy", () => {
  const originalAuthSecret = process.env.AUTH_SECRET;

  beforeEach(() => { process.env.AUTH_SECRET = "unit-test-session-invitation-secret"; });
  afterAll(() => {
    if (originalAuthSecret === undefined) delete process.env.AUTH_SECRET;
    else process.env.AUTH_SECRET = originalAuthSecret;
  });

  it("creates opaque invitation material and stores only a stable HMAC", () => {
    const invitation = createSessionInvitationToken();
    expect(invitation.token).toMatch(/^qsinv_[A-Za-z0-9_-]+$/);
    expect(invitation.tokenHash).toMatch(/^[a-f0-9]{64}$/);
    expect(invitation.tokenHash).toBe(hashSessionInvitationToken(invitation.token));
    expect(invitation.tokenHash).not.toContain(invitation.token);
  });

  it("reconstructs one opaque link for email, copy, and share without storing it", () => {
    const input = {
      roomId: "room-1",
      email: " Guest@Example.Test ",
      expiresAt: new Date("2026-09-01T18:00:00.000Z"),
    };
    const first = replayableSessionInvitationToken(input);
    const repeated = replayableSessionInvitationToken({
      ...input,
      email: "guest@example.test",
    });
    const otherRoom = replayableSessionInvitationToken({
      ...input,
      roomId: "room-2",
    });

    expect(first).toEqual(repeated);
    expect(first.token).toMatch(/^qsinv_[A-Za-z0-9_-]+$/);
    expect(first.tokenHash).toBe(hashSessionInvitationToken(first.token));
    expect(otherRoom.token).not.toBe(first.token);
  });

  it("rejects malformed and oversized token input", () => {
    expect(cleanSessionInvitationToken("qsinv_short")).toBe("");
    expect(cleanSessionInvitationToken("qsinv_bad token________________________________")).toBe("");
    expect(cleanSessionInvitationToken(`qsinv_${"a".repeat(180)}`)).toBe("");
  });

  it("uses purpose-aware safe roles and bounded expirations", () => {
    expect(sessionInvitationRole("HOST", "PODCAST")).toBe("GUEST");
    expect(sessionInvitationRole("", "COACHING")).toBe("CLIENT");
    expect(sessionInvitationRole("PRODUCER", "PODCAST")).toBe("PRODUCER");
    const now = new Date("2026-08-04T12:00:00.000Z");
    expect(sessionInvitationExpiry(0, now).toISOString()).toBe("2026-08-04T13:00:00.000Z");
    expect(sessionInvitationExpiry(10000, now).toISOString()).toBe("2026-09-03T12:00:00.000Z");
  });

  it("masks recipient identity in the lobby", () => {
    expect(maskInvitationEmail("Scott.Homer@example.test")).toBe("s••••••@example.test");
  });

  it("recognizes an accepted link only as a route to active canonical access", async () => {
    const { token, tokenHash } = createSessionInvitationToken();
    jest.mocked(getPrismaClient).mockReturnValue({
      callRoomInvitation: {
        findFirst: jest.fn().mockResolvedValue({
          id: "invite-1",
          email: "coach@example.test",
          displayName: "Coach",
          role: "CLIENT",
          status: "ACCEPTED",
          expiresAt: new Date("2026-08-01T12:00:00.000Z"),
          acceptedByUserId: "user-1",
          participant: { id: "participant-1", userId: "user-1", accessStatus: "ACTIVE" },
          room: {
            id: "room-1",
            title: "Coaching Session",
            purpose: "COACHING",
            status: "OPEN",
            scheduledStart: null,
            scheduledEnd: null,
            createdByUser: { name: "Homer" },
          },
        }),
      },
    } as never);

    const inspected = await inspectSessionInvitation(token);

    expect(inspected).toEqual(expect.objectContaining({
      status: "ACCEPTED",
      available: false,
      reentryAvailable: true,
      acceptedByUserId: "user-1",
      participant: expect.objectContaining({ accessStatus: "ACTIVE" }),
    }));
    expect(jest.mocked(getPrismaClient)().callRoomInvitation.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { OR: [{ tokenHash }, { acceptedTokenHash: tokenHash }] } }),
    );
  });

  it("lets only the accepting account reuse a link with active participant access", async () => {
    const { token, tokenHash } = createSessionInvitationToken();
    const findParticipant = jest.fn().mockResolvedValue({
      id: "participant-1",
      userId: "user-1",
      accessStatus: "ACTIVE",
      role: "CLIENT",
    });
    jest.mocked(getPrismaClient).mockReturnValue({
      callRoomInvitation: {
        findFirst: jest.fn().mockResolvedValue({
          id: "invite-1",
          roomId: "room-1",
          email: "coach@example.test",
          status: "ACCEPTED",
          acceptedTokenHash: tokenHash,
          acceptedByUserId: "user-1",
          participantId: "participant-1",
          revokedAt: null,
          expiresAt: new Date("2026-08-01T12:00:00.000Z"),
          room: { id: "room-1", title: "Coaching Session", purpose: "COACHING", status: "OPEN" },
        }),
      },
      callParticipant: { findUnique: findParticipant },
    } as never);

    await expect(acceptSessionInvitation({
      token,
      actor: { id: "user-1", email: "coach@example.test" },
    })).resolves.toEqual(expect.objectContaining({
      roomId: "room-1",
      participantId: "participant-1",
      participantCreated: false,
    }));
    expect(findParticipant).toHaveBeenCalledWith({ where: { id: "participant-1" } });
  });

  it("turns a matching fresh-user invitation into active participant access in one transaction", async () => {
    const { token, tokenHash } = createSessionInvitationToken();
    const claimed = jest.fn().mockResolvedValue({ count: 1 });
    const findParticipant = jest.fn().mockResolvedValue(null);
    const createParticipant = jest.fn().mockResolvedValue({
      id: "participant-new",
      userId: "user-new",
      role: "CLIENT",
      accessStatus: "ACTIVE",
    });
    const attachParticipant = jest.fn().mockResolvedValue({ id: "invite-new" });
    const transaction = jest.fn(async (operation: (tx: unknown) => unknown) => operation({
      callRoomInvitation: {
        updateMany: claimed,
        update: attachParticipant,
      },
      callParticipant: {
        findFirst: findParticipant,
        create: createParticipant,
      },
    }));
    const createProductEvent = jest.fn().mockResolvedValue({ id: "event-1" });
    jest.mocked(getPrismaClient).mockReturnValue({
      callRoomInvitation: {
        findFirst: jest.fn().mockResolvedValue({
          id: "invite-new",
          roomId: "room-new",
          email: "new.client@example.test",
          displayName: null,
          role: "CLIENT",
          status: "PENDING",
          tokenHash,
          acceptedTokenHash: null,
          acceptedByUserId: null,
          participantId: null,
          revokedAt: null,
          expiresAt: new Date(Date.now() + 60_000),
          room: {
            id: "room-new",
            title: "First coaching Session",
            purpose: "COACHING",
            status: "PLANNED",
          },
        }),
      },
      $transaction: transaction,
      userEvent: { create: createProductEvent },
    } as never);

    await expect(acceptSessionInvitation({
      token,
      actor: {
        id: "user-new",
        email: "NEW.CLIENT@example.test",
        name: "New Client",
      },
    })).resolves.toEqual({
      roomId: "room-new",
      roomTitle: "First coaching Session",
      purpose: "COACHING",
      participantId: "participant-new",
      participantRole: "CLIENT",
      participantCreated: true,
    });
    expect(claimed).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ tokenHash, status: "PENDING" }),
      data: expect.objectContaining({
        status: "ACCEPTED",
        acceptedTokenHash: tokenHash,
        tokenHash: null,
        acceptedByUserId: "user-new",
      }),
    }));
    expect(createParticipant).toHaveBeenCalledWith({
      data: expect.objectContaining({
        roomId: "room-new",
        userId: "user-new",
        email: "new.client@example.test",
        role: "CLIENT",
      }),
    });
    expect(attachParticipant).toHaveBeenCalledWith({
      where: { id: "invite-new" },
      data: { participantId: "participant-new", participantCreated: true },
    });
    expect(transaction).toHaveBeenCalledWith(
      expect.any(Function),
      expect.objectContaining({ isolationLevel: "Serializable" }),
    );
    expect(createProductEvent).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        userId: "user-new",
        eventName: "Product: invitation_accepted",
      }),
    }));
  });
});
