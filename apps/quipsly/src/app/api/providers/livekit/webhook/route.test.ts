/** @jest-environment node */
import { createHash } from "node:crypto";
import { AccessToken } from "livekit-server-sdk";
import { POST } from "./route";
import { applyLiveKitProviderWebhook } from "@/lib/server/provider-recording-command";
import { reconcileLiveKitParticipantJoin } from "@/lib/server/session-access-reconciliation";

jest.mock("server-only", () => ({}));
jest.mock("@/lib/server/provider-recording-command", () => ({
  getProviderRecordingEnvironment: () => ({
    apiKey: "test-key",
    apiSecret: "synthetic-webhook-secret",
  }),
  applyLiveKitProviderWebhook: jest.fn(),
  ProviderRecordingCommandError: class extends Error {},
}));
jest.mock("@/lib/server/session-access-reconciliation", () => ({
  reconcileLiveKitParticipantJoin: jest.fn(),
}));

async function request(event: string, tamper = false) {
  const raw = JSON.stringify({
    id: "event",
    event,
    room: { name: "provider-room" },
    participant: { identity: "participant:device" },
  });
  const token = new AccessToken("test-key", "synthetic-webhook-secret");
  token.sha256 = createHash("sha256").update(raw).digest("base64");
  return new Request("https://nest.example/api/providers/livekit/webhook", {
    method: "POST",
    headers: {
      "Content-Type": "application/webhook+json",
      Authorization: await token.toJwt(),
    },
    body: tamper ? raw.replace("participant:device", "another:device") : raw,
  });
}
beforeEach(() => jest.clearAllMocks());

it("verifies the signed body before dispatching participant access work", async () => {
  expect((await POST(await request("participant_joined", true))).status).toBe(
    401,
  );
  expect(reconcileLiveKitParticipantJoin).not.toHaveBeenCalled();
  jest
    .mocked(reconcileLiveKitParticipantJoin)
    .mockResolvedValue({ status: "NOT_REQUIRED" });
  expect((await POST(await request("participant_joined"))).status).toBe(200);
  expect(reconcileLiveKitParticipantJoin).toHaveBeenCalledWith(
    expect.objectContaining({
      eventType: "participant_joined",
      raw: expect.objectContaining({
        room: expect.objectContaining({ name: "provider-room" }),
      }),
    }),
  );
  expect(applyLiveKitProviderWebhook).not.toHaveBeenCalled();
});

it("distinguishes retryable processing failure from a rejected signature", async () => {
  jest
    .mocked(reconcileLiveKitParticipantJoin)
    .mockRejectedValue(new Error("database unavailable"));
  const response = await POST(await request("participant_joined"));
  expect(response.status).toBe(503);
  expect(await response.json()).toMatchObject({
    code: "LIVEKIT_WEBHOOK_RETRY",
  });
});

it("keeps egress delivery on its existing application service", async () => {
  jest.mocked(reconcileLiveKitParticipantJoin).mockResolvedValue(null);
  jest
    .mocked(applyLiveKitProviderWebhook)
    .mockResolvedValue({ ok: true } as never);
  expect((await POST(await request("egress_started"))).status).toBe(200);
  expect(applyLiveKitProviderWebhook).toHaveBeenCalledTimes(1);
});
