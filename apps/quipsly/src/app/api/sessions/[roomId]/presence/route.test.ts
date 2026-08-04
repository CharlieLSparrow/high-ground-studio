/** @jest-environment node */

import { getPrismaClient } from "@/lib/prisma";
import { getQuipslySessionFromRequest } from "@/lib/server/quipsly-session";
import { readSessionProviderPresence } from "@/lib/server/session-provider-presence";

import { GET } from "./route";

jest.mock("server-only", () => ({}));
jest.mock("@/lib/prisma", () => ({ getPrismaClient: jest.fn() }));
jest.mock("@/lib/server/quipsly-session", () => ({
  getQuipslySessionFromRequest: jest.fn(),
}));
jest.mock("@/lib/server/session-provider-presence", () => ({
  readSessionProviderPresence: jest.fn(),
}));

const prisma = {
  callRoom: { findFirst: jest.fn() },
  callParticipantProviderGrantReceipt: { findMany: jest.fn() },
};
const context = { params: Promise.resolve({ roomId: "room-1" }) };
const request = new Request(
  "http://127.0.0.1:3012/api/sessions/room-1/presence",
);

describe("Session provider presence route", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(getPrismaClient).mockReturnValue(prisma as never);
    jest.mocked(getQuipslySessionFromRequest).mockResolvedValue({
      user: {
        id: "host-1",
        name: "Host",
        primaryEmail: "host@example.test",
      },
    } as never);
    prisma.callRoom.findFirst.mockResolvedValue({
      id: "room-1",
      provider: "livekit",
      providerRoomId: "provider-room",
      participants: [
        {
          id: "participant-1",
          displayName: "Guest",
          role: "GUEST",
          accessStatus: "ACTIVE",
        },
      ],
    });
    prisma.callParticipantProviderGrantReceipt.findMany.mockResolvedValue([
      {
        participantId: "participant-1",
        providerIdentity: "participant-1:web-secret",
        clientKind: "web",
        deviceLabel: "Quipsly Web · MacIntel",
        issuedAt: new Date("2026-08-04T20:00:00.000Z"),
      },
    ]);
    jest.mocked(readSessionProviderPresence).mockResolvedValue({
      status: "LIVE",
      errorCode: null,
      observedAt: "2026-08-04T20:00:01.000Z",
      provider: "livekit",
      connectedDeviceCount: 1,
      connectedParticipantCount: 1,
      unknownDeviceCount: 0,
      attentionCount: 0,
      devices: [
        {
          id: "presence-safe",
          participantId: "participant-1",
          participantLabel: "Guest",
          role: "GUEST",
          canonicalAccessStatus: "ACTIVE",
          clientKind: "web",
          deviceLabel: "Quipsly Web · MacIntel",
          joinedAt: "2026-08-04T20:00:00.000Z",
          audio: { published: true, muted: false },
          video: { published: false, muted: null },
          matchedToCanonicalParticipant: true,
        },
      ],
      nextAction: "Current provider observation.",
      boundaries: {
        providerReadbackAttempted: true,
        currentObservationNotHistory: true,
        joinKeyLeaseUsedAsPresence: false,
        providerIdentitiesExposed: false,
        credentialsExposed: false,
        recordingStateChanged: false,
      },
    });
  });

  it("returns only the safe current provider projection to an authorized manager", async () => {
    const response = await GET(request, context);
    expect(response.status).toBe(200);
    const packet = await response.json();
    expect(packet).toMatchObject({
      ok: true,
      presence: {
        status: "LIVE",
        connectedDeviceCount: 1,
        boundaries: {
          currentObservationNotHistory: true,
          joinKeyLeaseUsedAsPresence: false,
          providerIdentitiesExposed: false,
        },
      },
      boundaries: {
        sessionManagerOnly: true,
        providerReadOnly: true,
        participantAccessChanged: false,
        recordingChanged: false,
      },
    });
    expect(readSessionProviderPresence).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: "livekit",
        providerRoomId: "provider-room",
        participants: [expect.objectContaining({ id: "participant-1" })],
        grants: [expect.objectContaining({ clientKind: "web" })],
      }),
    );
    expect(JSON.stringify(packet)).not.toContain("web-secret");
  });

  it("does not reveal room existence to an unauthorized actor", async () => {
    prisma.callRoom.findFirst.mockResolvedValue(null);
    const response = await GET(request, context);
    expect(response.status).toBe(404);
    expect(readSessionProviderPresence).not.toHaveBeenCalled();
  });

  it("authenticates before database or provider access", async () => {
    jest.mocked(getQuipslySessionFromRequest).mockResolvedValue(null as never);
    const response = await GET(request, context);
    expect(response.status).toBe(401);
    expect(prisma.callRoom.findFirst).not.toHaveBeenCalled();
    expect(readSessionProviderPresence).not.toHaveBeenCalled();
  });
});
