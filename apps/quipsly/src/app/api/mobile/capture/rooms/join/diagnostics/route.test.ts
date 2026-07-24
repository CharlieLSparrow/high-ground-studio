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

describe("mobile capture room join diagnostics", () => {
  const findFirst = jest.fn();
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
    } as never);
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

    const response = await GET(
      new Request("http://localhost/api/mobile/capture/rooms/join/diagnostics?callRoomId=room-1"),
    );

    expect(response.status).toBe(401);
    expect(mockedPrisma).not.toHaveBeenCalled();
  });

  it("requires an explicit room without touching Prisma", async () => {
    const response = await GET(
      new Request("http://localhost/api/mobile/capture/rooms/join/diagnostics"),
    );

    expect(response.status).toBe(400);
    expect(mockedPrisma).not.toHaveBeenCalled();
  });

  it("returns a side-effect-free diagnostic without a provider token", async () => {
    findFirst.mockResolvedValue({
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
    });

    const response = await GET(
      new Request("http://localhost/api/mobile/capture/rooms/join/diagnostics?callRoomId=room-1"),
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toMatchObject({
      ok: true,
      diagnosticOnly: true,
      callRoomId: "room-1",
      providerReadiness: "livekit-ready",
      canJoin: true,
      canMintJoinToken: true,
      serverUrlReturned: false,
      tokenReturned: false,
      effects: {
        sideEffectFree: true,
        participantCreated: false,
        providerJoined: false,
        recordingStarted: false,
        tokenMinted: false,
        tokenReturned: false,
        stripeMutated: false,
        calendarMutated: false,
        mediaMutated: false,
      },
      recordingBoundary: {
        recordingConsentGranted: false,
        joiningStartsRecording: false,
      },
    });
  });
});
