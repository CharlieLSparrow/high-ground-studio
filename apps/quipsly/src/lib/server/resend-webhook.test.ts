/** @jest-environment node */

import { createHmac } from "node:crypto";

import {
  deliveryStatusForResendEvent,
  recipientStatusForResendEvent,
  verifyResendDeliveryWebhook,
} from "./resend-webhook";

jest.mock("server-only", () => ({}));

const secretBytes = Buffer.from("quipsly-resend-webhook-test-secret");
const webhookSecret = `whsec_${secretBytes.toString("base64")}`;
const now = new Date("2026-08-27T18:30:00.000Z");
const timestamp = String(Math.floor(now.getTime() / 1000));
const providerEventId = "msg_resend_event_1";

function signed(rawBody: string, at = timestamp) {
  const value = createHmac("sha256", secretBytes)
    .update(`${providerEventId}.${at}.${rawBody}`)
    .digest("base64");
  return `v1,${value}`;
}

function payload(type = "email.bounced") {
  return JSON.stringify({
    type,
    created_at: "2026-08-27T18:29:30.000Z",
    data: {
      email_id: "email_provider_1",
      to: [" Client@Example.com "],
      subject: "Never persist this subject",
      bounce: {
        type: "Permanent",
        subType: "Suppressed",
        message: "Mailbox rejected the message",
      },
    },
  });
}

describe("Resend delivery webhooks", () => {
  it("verifies the raw body and projects only delivery-safe fields", () => {
    const rawBody = payload();
    expect(verifyResendDeliveryWebhook({
      rawBody,
      webhookSecret,
      providerEventId,
      timestamp,
      signature: signed(rawBody),
      now,
    })).toMatchObject({
      providerEventId,
      providerMessageId: "email_provider_1",
      eventType: "email.bounced",
      recipientEmail: "client@example.com",
      payloadSha256: expect.stringMatching(/^[a-f0-9]{64}$/),
      diagnostic: {
        bounceType: "Permanent",
        bounceSubType: "Suppressed",
        message: "Mailbox rejected the message",
      },
    });
  });

  it("rejects body tampering and stale signatures", () => {
    const rawBody = payload();
    expect(() => verifyResendDeliveryWebhook({
      rawBody: `${rawBody} `,
      webhookSecret,
      providerEventId,
      timestamp,
      signature: signed(rawBody),
      now,
    })).toThrow("RESEND_WEBHOOK_SIGNATURE_INVALID");

    const stale = String(Math.floor(now.getTime() / 1000) - 301);
    expect(() => verifyResendDeliveryWebhook({
      rawBody,
      webhookSecret,
      providerEventId,
      timestamp: stale,
      signature: signed(rawBody, stale),
      now,
    })).toThrow("RESEND_WEBHOOK_SIGNATURE_INVALID");
  });

  it("ignores engagement tracking events and maps delivery outcomes", () => {
    const rawBody = payload("email.opened");
    expect(verifyResendDeliveryWebhook({
      rawBody,
      webhookSecret,
      providerEventId,
      timestamp,
      signature: signed(rawBody),
      now,
    })).toBeNull();

    expect(deliveryStatusForResendEvent("email.delivered")).toBe("DELIVERED");
    expect(deliveryStatusForResendEvent("email.complained")).toBe("COMPLAINED");
    expect(recipientStatusForResendEvent("email.delivered")).toBe("DELIVERABLE");
    expect(recipientStatusForResendEvent("email.suppressed")).toBe("SUPPRESSED");
    expect(recipientStatusForResendEvent("email.sent")).toBeNull();
  });
});
