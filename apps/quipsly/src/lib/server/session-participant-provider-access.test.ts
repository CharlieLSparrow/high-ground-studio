import { reconcileRemovedParticipantProviderAccess } from "./session-participant-provider-access";

jest.mock("livekit-server-sdk", () => ({
  RoomServiceClient: jest.fn(),
}));

const { RoomServiceClient } = jest.requireMock("livekit-server-sdk") as {
  RoomServiceClient: jest.Mock;
};

describe("removed Session participant provider reconciliation", () => {
  const original = { ...process.env };

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...original };
    delete process.env.LIVEKIT_URL;
    delete process.env.LIVEKIT_API_KEY;
    delete process.env.LIVEKIT_API_SECRET;
  });

  afterAll(() => {
    process.env = original;
  });

  it("keeps canonical removal truthful when provider admin is unavailable", async () => {
    const result = await reconcileRemovedParticipantProviderAccess({
      provider: "livekit",
      providerRoomId: "room-provider",
      participantId: "participant-1",
      grants: [],
    });
    expect(result.status).toBe("BLOCKED");
    expect(result.errorCode).toBe("LIVEKIT_ADMIN_NOT_CONFIGURED");
    expect(result.nextAction).toMatch(/Quipsly access is removed/i);
    expect(RoomServiceClient).not.toHaveBeenCalled();
  });

  it("removes every known and active per-device identity before claiming convergence", async () => {
    process.env.LIVEKIT_URL = "wss://project.livekit.cloud";
    process.env.LIVEKIT_API_KEY = "key";
    process.env.LIVEKIT_API_SECRET = "secret";
    const listParticipants = jest
      .fn()
      .mockResolvedValueOnce([
        { identity: "participant-1:web-one" },
        { identity: "other-participant:web" },
      ])
      .mockResolvedValueOnce([]);
    const removeParticipant = jest.fn().mockResolvedValue(undefined);
    RoomServiceClient.mockImplementation(() => ({
      listParticipants,
      removeParticipant,
    }));

    const result = await reconcileRemovedParticipantProviderAccess({
      provider: "livekit",
      providerRoomId: "room-provider",
      participantId: "participant-1",
      grants: [
        {
          providerIdentity: "participant-1:web-one",
          expiresAt: new Date("2026-08-04T20:00:00.000Z"),
        },
        {
          providerIdentity: "participant-1:ios-two",
          expiresAt: new Date("2026-08-04T20:10:00.000Z"),
        },
      ],
      now: new Date("2026-08-04T19:00:00.000Z"),
    });

    expect(RoomServiceClient).toHaveBeenCalledWith(
      "https://project.livekit.cloud",
      "key",
      "secret",
    );
    expect(removeParticipant.mock.calls.map((call) => call[1])).toEqual([
      "participant-1:ios-two",
      "participant-1:web-one",
    ]);
    expect(result).toEqual(
      expect.objectContaining({
        status: "CONVERGED",
        identityCount: 2,
        removedIdentityCount: 2,
        activeIdentityCountAfter: 0,
        tokenRevocationGuaranteed: true,
        latestGrantExpiry: "2026-08-04T20:10:00.000Z",
      }),
    );
  });
});
