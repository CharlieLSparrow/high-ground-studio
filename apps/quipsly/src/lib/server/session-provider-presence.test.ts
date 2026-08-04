import {
  projectSessionProviderPresence,
  readSessionProviderPresence,
} from "./session-provider-presence";

jest.mock("server-only", () => ({}));
jest.mock("livekit-server-sdk", () => ({
  RoomServiceClient: jest.fn(),
  TrackType: { AUDIO: 0, VIDEO: 1 },
}));

const { RoomServiceClient } = jest.requireMock("livekit-server-sdk") as {
  RoomServiceClient: jest.Mock;
};

describe("Session provider presence", () => {
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

  it("matches current provider devices to canonical participants without exposing identity", () => {
    const result = projectSessionProviderPresence({
      providerRoomId: "provider-room",
      observedAt: new Date("2026-08-04T20:00:00.000Z"),
      participants: [
        {
          id: "participant-1",
          displayName: "Scott Sparrow",
          role: "GUEST",
          accessStatus: "ACTIVE",
        },
      ],
      grants: [
        {
          participantId: "participant-1",
          providerIdentity: "participant-1:ios-device-secret",
          clientKind: "ios",
          deviceLabel: "Quipsly Capture · iPhone 16",
          issuedAt: new Date("2026-08-04T19:55:00.000Z"),
        },
      ],
      activeParticipants: [
        {
          identity: "participant-1:ios-device-secret",
          joinedAtMs: BigInt(Date.parse("2026-08-04T19:58:00.000Z")),
          tracks: [
            { type: 0, muted: false },
            { type: 1, muted: true },
          ],
        },
      ],
    });

    expect(result).toMatchObject({
      connectedDeviceCount: 1,
      connectedParticipantCount: 1,
      unknownDeviceCount: 0,
      attentionCount: 0,
      devices: [
        {
          participantId: "participant-1",
          participantLabel: "Scott Sparrow",
          deviceLabel: "Quipsly Capture · iPhone 16",
          audio: { published: true, muted: false },
          video: { published: true, muted: true },
          matchedToCanonicalParticipant: true,
        },
      ],
    });
    expect(JSON.stringify(result)).not.toContain("ios-device-secret");
  });

  it("counts an unmatched provider device without exposing its identity or name", () => {
    const result = projectSessionProviderPresence({
      providerRoomId: "provider-room",
      participants: [],
      grants: [],
      activeParticipants: [
        {
          identity: "untrusted-provider-identity",
          tracks: [{ type: 0, muted: false }],
        },
      ],
    });
    expect(result).toMatchObject({
      unknownDeviceCount: 1,
      attentionCount: 1,
      devices: [
        {
          participantId: null,
          participantLabel: "Unmatched provider device",
          matchedToCanonicalParticipant: false,
        },
      ],
    });
    expect(JSON.stringify(result)).not.toContain("untrusted-provider-identity");
  });

  it("refuses to infer presence when provider administration is unavailable", async () => {
    const result = await readSessionProviderPresence({
      provider: "livekit",
      providerRoomId: "provider-room",
      participants: [],
      grants: [],
    });
    expect(result).toMatchObject({
      status: "UNAVAILABLE",
      connectedDeviceCount: null,
      boundaries: {
        providerReadbackAttempted: false,
        joinKeyLeaseUsedAsPresence: false,
      },
    });
    expect(RoomServiceClient).not.toHaveBeenCalled();
  });

  it("returns a current empty observation after an authoritative provider read", async () => {
    process.env.LIVEKIT_URL = "wss://project.livekit.cloud";
    process.env.LIVEKIT_API_KEY = "key";
    process.env.LIVEKIT_API_SECRET = "secret";
    const listParticipants = jest.fn().mockResolvedValue([]);
    RoomServiceClient.mockImplementation(() => ({ listParticipants }));
    const result = await readSessionProviderPresence({
      provider: "livekit",
      providerRoomId: "provider-room",
      participants: [],
      grants: [],
      observedAt: new Date("2026-08-04T20:00:00.000Z"),
    });
    expect(result).toMatchObject({
      status: "EMPTY",
      connectedDeviceCount: 0,
      observedAt: "2026-08-04T20:00:00.000Z",
      boundaries: { providerReadbackAttempted: true },
    });
    expect(RoomServiceClient).toHaveBeenCalledWith(
      "https://project.livekit.cloud",
      "key",
      "secret",
    );
  });
});
