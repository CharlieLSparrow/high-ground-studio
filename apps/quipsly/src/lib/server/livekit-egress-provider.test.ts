/** @jest-environment node */

jest.mock("server-only", () => ({}));

import { createHash, randomUUID } from "node:crypto";

import { AccessToken } from "livekit-server-sdk";

import {
  liveKitRoomCompositeProfile,
  liveKitEgressMatchesObject,
  verifyLiveKitWebhook,
} from "@/lib/server/livekit-egress-provider";

describe("LiveKit egress provider evidence", () => {
  const apiKey = "quipsly-test-key";
  const apiSecret = "quipsly-test-secret-with-enough-entropy";

  async function signed(body: string) {
    const token = new AccessToken(apiKey, apiSecret);
    token.sha256 = createHash("sha256").update(body).digest("base64");
    return token.toJwt();
  }

  it("defaults the synchronization witness to audio-only while retaining explicit video composite support", () => {
    expect(liveKitRoomCompositeProfile("audio-reference")).toMatchObject({
      audioOnly: true,
      layout: null,
      purpose: "shared-sync-and-recovery-reference",
    });
    expect(liveKitRoomCompositeProfile("video-composite")).toMatchObject({
      audioOnly: false,
      layout: "speaker",
      purpose: "shareable-room-video-composite",
    });
  });

  it("verifies the raw signed webhook and extracts the deterministic object path", async () => {
    const eventId = randomUUID();
    const body = JSON.stringify({
      id: eventId,
      event: "egress_started",
      createdAt: 1785960000,
      egressInfo: {
        egressId: "EG_quipsly_test",
        roomName: "episode-9-room",
        status: "EGRESS_ACTIVE",
        startedAt: "1785960000000000000",
        fileResults: [
          {
            filename:
              "media-vault/recordings/livekit/room/commands/request-room-composite.mp4",
            startedAt: "1785960000000000000",
          },
        ],
      },
    });
    const evidence = await verifyLiveKitWebhook({
      rawBody: body,
      authorization: await signed(body),
      apiKey,
      apiSecret,
    });
    expect(evidence).toMatchObject({
      eventId,
      eventType: "egress_started",
      egress: {
        egressId: "EG_quipsly_test",
        roomName: "episode-9-room",
        status: "EGRESS_ACTIVE",
        startedAt: "2026-08-05T20:00:00.000Z",
      },
    });
    expect(
      liveKitEgressMatchesObject(
        evidence.egress!,
        "media-vault/recordings/livekit/room/commands/request-room-composite.mp4",
      ),
    ).toBe(true);
  });

  it("rejects a body changed after signing", async () => {
    const original = JSON.stringify({
      id: randomUUID(),
      event: "egress_started",
      egressInfo: { egressId: "EG_original", roomName: "room" },
    });
    const authorization = await signed(original);
    const tampered = original.replace("EG_original", "EG_tampered");
    await expect(
      verifyLiveKitWebhook({
        rawBody: tampered,
        authorization,
        apiKey,
        apiSecret,
      }),
    ).rejects.toThrow(/sha256|checksum|verify|signature/i);
  });

  it("does not confuse a different output path with the durable command", () => {
    expect(
      liveKitEgressMatchesObject(
        {
          egressId: "EG_other",
          roomName: "episode-9-room",
          status: "EGRESS_ACTIVE",
          startedAt: null,
          endedAt: null,
          outputPaths: ["media-vault/recordings/livekit/room/other.mp4"],
          raw: {},
        },
        "media-vault/recordings/livekit/room/commands/request-room-composite.mp4",
      ),
    ).toBe(false);
  });
});
