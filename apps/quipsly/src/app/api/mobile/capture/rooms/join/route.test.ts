/** @jest-environment node */

import { getPrismaClient } from "@/lib/prisma";
import { createLiveKitJoinToken } from "@/lib/server/livekit-join-token";
import { getQuipslySessionFromRequest } from "@/lib/server/quipsly-session";

import { POST } from "./route";

jest.mock("@/lib/prisma", () => ({ getPrismaClient: jest.fn() }));
jest.mock("@/lib/server/livekit-join-token", () => ({
  createLiveKitJoinToken: jest.fn(),
}));
jest.mock("@/lib/server/quipsly-session", () => ({
  getQuipslySessionFromRequest: jest.fn(),
}));

const mockedPrisma = jest.mocked(getPrismaClient);
const mockedToken = jest.mocked(createLiveKitJoinToken);
const mockedSession = jest.mocked(getQuipslySessionFromRequest);

function joinRequest(callRoomId?: string) {
  return new Request("http://localhost/api/mobile/capture/rooms/join", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(callRoomId ? { callRoomId } : {}),
  });
}

function browserJoinRequest(callRoomId: string) {
  return new Request("http://localhost/api/mobile/capture/rooms/join", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      callRoomId,
      clientInstanceId: "web-device-1",
      clientKind: "web",
      deviceLabel: "Quipsly Web · macOS",
    }),
  });
}

function liveKitRoom(overrides: Record<string, unknown> = {}) {
  return {
    id: "room-1",
    createdByUserId: "user-1",
    title: "Reviewer coaching session",
    purpose: "COACHING",
    status: "PLANNED",
    provider: "livekit",
    providerRoomId: "provider-room-1",
    booking: null,
    participants: [
      {
        id: "participant-1",
        userId: "user-1",
        role: "HOST",
        displayName: "Reviewer",
        email: "reviewer@example.test",
      },
    ],
    recordingConsents: [],
    ...overrides,
  };
}

describe("mobile capture room join", () => {
  const findFirst = jest.fn();
  const createParticipant = jest.fn();
  const originalLiveKitUrl = process.env.LIVEKIT_URL;
  const originalLiveKitApiKey = process.env.LIVEKIT_API_KEY;
  const originalLiveKitApiSecret = process.env.LIVEKIT_API_SECRET;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.LIVEKIT_URL = "wss://livekit.example.test";
    process.env.LIVEKIT_API_KEY = "test-key";
    process.env.LIVEKIT_API_SECRET = "test-secret";
    mockedSession.mockResolvedValue({
      user: {
        id: "user-1",
        name: "Reviewer",
        primaryEmail: "reviewer@example.test",
        isStaff: false,
      },
    } as never);
    mockedPrisma.mockReturnValue({
      callRoom: { findFirst },
      callParticipant: { create: createParticipant },
    } as never);
    mockedToken.mockReturnValue({
      token: "signed-room-token",
      issuedAt: "2026-07-24T00:00:00.000Z",
      expiresAt: "2026-07-24T00:10:00.000Z",
      expiresInSeconds: 600,
      safeClaims: {
        identity: "participant-1",
        jti: "token-1",
        metadataKeys: ["callRoomId", "participantId", "purpose", "recordingConsentStatus", "userId"],
        roomName: "provider-room-1",
        roomJoin: true,
        canPublish: true,
        canPublishData: true,
        canSubscribe: true,
      },
    });
  });

  afterAll(() => {
    if (originalLiveKitUrl === undefined) delete process.env.LIVEKIT_URL;
    else process.env.LIVEKIT_URL = originalLiveKitUrl;
    if (originalLiveKitApiKey === undefined) delete process.env.LIVEKIT_API_KEY;
    else process.env.LIVEKIT_API_KEY = originalLiveKitApiKey;
    if (originalLiveKitApiSecret === undefined) delete process.env.LIVEKIT_API_SECRET;
    else process.env.LIVEKIT_API_SECRET = originalLiveKitApiSecret;
  });

  it("rejects signed-out requests before reading a private room", async () => {
    mockedSession.mockResolvedValue(null);

    const response = await POST(joinRequest("room-1"));

    expect(response.status).toBe(401);
    expect(mockedPrisma).not.toHaveBeenCalled();
    expect(mockedToken).not.toHaveBeenCalled();
  });

  it("requires an explicit room without touching Prisma", async () => {
    const response = await POST(joinRequest());

    expect(response.status).toBe(400);
    expect(mockedPrisma).not.toHaveBeenCalled();
  });

  it("mints a short-lived join packet without joining or recording", async () => {
    findFirst.mockResolvedValue(liveKitRoom());

    const response = await POST(joinRequest("room-1"));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toMatchObject({
      ok: true,
      canJoin: true,
      provider: "livekit",
      providerReadiness: "livekit-ready",
      participantToken: "signed-room-token",
      recordingConsentGranted: false,
      effects: {
        providerJoined: false,
        recordingStarted: false,
        providerRecordingStarted: false,
        tokenMinted: true,
        tokenReturned: true,
        stripeMutated: false,
        calendarMutated: false,
        mediaMutated: false,
        secretExposed: false,
      },
      recordingBoundary: {
        joiningStartsRecording: false,
        localRecordingRequiresConsent: true,
        providerRecordingRequiresAllParticipantConsent: true,
      },
    });
    expect(createParticipant).not.toHaveBeenCalled();
    expect(mockedToken).toHaveBeenCalledWith(
      expect.objectContaining({
        apiKey: "test-key",
        apiSecret: "test-secret",
        identity: "participant-1",
        roomName: "provider-room-1",
      }),
    );
  });

  it("uses a device-scoped media identity so browser and iPhone can join as one canonical person", async () => {
    findFirst.mockResolvedValue(liveKitRoom());

    const response = await POST(browserJoinRequest("room-1"));

    expect(response.status).toBe(200);
    expect(mockedToken).toHaveBeenCalledWith(
      expect.objectContaining({
        identity: "participant-1:web-device-1",
        metadata: expect.objectContaining({
          participantId: "participant-1",
          clientInstanceId: "web-device-1",
          clientKind: "web",
          deviceLabel: "Quipsly Web · macOS",
        }),
      }),
    );
  });

  it("fails closed on a paid coaching hold before creating or minting", async () => {
    findFirst.mockResolvedValue(
      liveKitRoom({
        booking: {
          status: "HOLDING_PAYMENT",
          paymentPolicy: "PAID_ONE_TO_ONE",
          paymentRecord: { status: "PENDING" },
        },
      }),
    );

    const response = await POST(joinRequest("room-1"));
    const payload = await response.json();

    expect(response.status).toBe(409);
    expect(payload).toMatchObject({
      ok: false,
      canJoin: false,
      providerReadiness: "payment-hold",
      effects: {
        participantCreated: false,
        providerJoined: false,
        recordingStarted: false,
        tokenMinted: false,
        tokenReturned: false,
        stripeMutated: false,
        calendarMutated: false,
      },
    });
    expect(createParticipant).not.toHaveBeenCalled();
    expect(mockedToken).not.toHaveBeenCalled();
  });
});
