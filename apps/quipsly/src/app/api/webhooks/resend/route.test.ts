/** @jest-environment node */

import { getPrismaClient } from "@/lib/prisma";
import { recordResendDeliveryEvent } from "@/lib/server/resend-delivery-ledger";
import { verifyResendDeliveryWebhook } from "@/lib/server/resend-webhook";

import { POST } from "./route";

jest.mock("server-only", () => ({}));
jest.mock("@/lib/prisma", () => ({ getPrismaClient: jest.fn() }));
jest.mock("@/lib/server/resend-delivery-ledger", () => ({ recordResendDeliveryEvent: jest.fn() }));
jest.mock("@/lib/server/resend-webhook", () => ({ verifyResendDeliveryWebhook: jest.fn() }));

describe("Resend webhook route", () => {
  const originalSecret = process.env.QUIPSLY_RESEND_WEBHOOK_SECRET;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.QUIPSLY_RESEND_WEBHOOK_SECRET = "whsec_test";
    jest.mocked(getPrismaClient).mockReturnValue({} as never);
    jest.mocked(verifyResendDeliveryWebhook).mockReturnValue({
      providerEventId: "event-1",
      providerMessageId: "email-1",
      eventType: "email.delivered",
      recipientEmail: "client@example.com",
      occurredAt: new Date("2026-08-27T18:00:00.000Z"),
      payloadSha256: "a".repeat(64),
      diagnostic: {},
    });
    jest.mocked(recordResendDeliveryEvent).mockResolvedValue({
      duplicate: false,
      eventId: "saved-1",
      matched: true,
    });
  });

  afterAll(() => {
    if (originalSecret === undefined) delete process.env.QUIPSLY_RESEND_WEBHOOK_SECRET;
    else process.env.QUIPSLY_RESEND_WEBHOOK_SECRET = originalSecret;
  });

  it("reads the raw body, verifies provider headers, and stores the event", async () => {
    const response = await POST(new Request("https://nest.quipsly.com/api/webhooks/resend", {
      method: "POST",
      headers: {
        "svix-id": "event-1",
        "svix-timestamp": "123",
        "svix-signature": "v1,signed",
      },
      body: '{"type":"email.delivered"}',
    }));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true, duplicate: false, matched: true });
    expect(verifyResendDeliveryWebhook).toHaveBeenCalledWith(expect.objectContaining({
      rawBody: '{"type":"email.delivered"}',
      providerEventId: "event-1",
    }));
    expect(recordResendDeliveryEvent).toHaveBeenCalledTimes(1);
  });

  it("returns a retryable server error when persistence fails", async () => {
    jest.mocked(recordResendDeliveryEvent).mockRejectedValue(new Error("database unavailable"));
    const response = await POST(new Request("https://nest.quipsly.com/api/webhooks/resend", {
      method: "POST",
      body: "{}",
    }));
    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toMatchObject({ code: "WEBHOOK_PERSISTENCE_FAILED" });
  });
});
