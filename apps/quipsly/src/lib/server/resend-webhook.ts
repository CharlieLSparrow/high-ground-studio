import "server-only";

import { createHash, createHmac, timingSafeEqual } from "node:crypto";

import type { CallRoomInvitationDeliveryStatus, EmailRecipientDeliveryStatus } from "@prisma/client";

import { normalizeEmail } from "@/lib/server/studio-user-identity";

export const RESEND_DELIVERY_EVENT_TYPES = [
  "email.sent",
  "email.delivered",
  "email.delivery_delayed",
  "email.failed",
  "email.bounced",
  "email.complained",
  "email.suppressed",
] as const;

export type ResendDeliveryEventType = (typeof RESEND_DELIVERY_EVENT_TYPES)[number];

export type VerifiedResendDeliveryEvent = {
  providerEventId: string;
  providerMessageId: string;
  eventType: ResendDeliveryEventType;
  recipientEmail: string | null;
  occurredAt: Date;
  payloadSha256: string;
  diagnostic: Record<string, string>;
};

const DELIVERY_TYPES = new Set<string>(RESEND_DELIVERY_EVENT_TYPES);
const MAX_CLOCK_SKEW_SECONDS = 5 * 60;

function compact(value: unknown, max = 500) {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, max) : "";
}

function verifiedSignature(input: {
  rawBody: string;
  webhookSecret: string;
  providerEventId: string;
  timestamp: string;
  signature: string;
  now: Date;
}) {
  const seconds = Number(input.timestamp);
  if (!Number.isInteger(seconds)) return false;
  if (Math.abs(input.now.getTime() / 1000 - seconds) > MAX_CLOCK_SKEW_SECONDS) return false;

  const encodedSecret = input.webhookSecret.startsWith("whsec_")
    ? input.webhookSecret.slice("whsec_".length)
    : input.webhookSecret;
  let key: Buffer;
  try {
    key = Buffer.from(encodedSecret, "base64");
  } catch {
    return false;
  }
  if (!key.length) return false;

  const expected = createHmac("sha256", key)
    .update(`${input.providerEventId}.${input.timestamp}.${input.rawBody}`)
    .digest();

  return input.signature.split(/\s+/).some((candidate) => {
    const [version, signature] = candidate.split(",", 2);
    if (version !== "v1" || !signature) return false;
    let received: Buffer;
    try {
      received = Buffer.from(signature, "base64");
    } catch {
      return false;
    }
    return received.length === expected.length && timingSafeEqual(received, expected);
  });
}

export function verifyResendDeliveryWebhook(input: {
  rawBody: string;
  webhookSecret: string;
  providerEventId: string | null;
  timestamp: string | null;
  signature: string | null;
  now?: Date;
}): VerifiedResendDeliveryEvent | null {
  const providerEventId = compact(input.providerEventId, 240);
  const timestamp = compact(input.timestamp, 40);
  const signature = compact(input.signature, 2_000);
  const webhookSecret = input.webhookSecret.trim();
  if (!providerEventId || !timestamp || !signature || !webhookSecret) {
    throw new Error("RESEND_WEBHOOK_HEADERS_INVALID");
  }
  if (!verifiedSignature({
    rawBody: input.rawBody,
    webhookSecret,
    providerEventId,
    timestamp,
    signature,
    now: input.now ?? new Date(),
  })) {
    throw new Error("RESEND_WEBHOOK_SIGNATURE_INVALID");
  }

  let payload: unknown;
  try {
    payload = JSON.parse(input.rawBody);
  } catch {
    throw new Error("RESEND_WEBHOOK_JSON_INVALID");
  }
  if (!payload || typeof payload !== "object") throw new Error("RESEND_WEBHOOK_PAYLOAD_INVALID");
  const packet = payload as Record<string, unknown>;
  const eventType = compact(packet.type, 80);
  if (!DELIVERY_TYPES.has(eventType)) return null;
  const data = packet.data && typeof packet.data === "object"
    ? packet.data as Record<string, unknown>
    : {};
  const providerMessageId = compact(data.email_id, 240);
  const occurredAt = new Date(compact(packet.created_at, 80));
  if (!providerMessageId || Number.isNaN(occurredAt.getTime())) {
    throw new Error("RESEND_WEBHOOK_PAYLOAD_INVALID");
  }

  const to = Array.isArray(data.to) ? data.to : [];
  const recipientCandidate = normalizeEmail(compact(to[0], 320));
  const recipientEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipientCandidate)
    ? recipientCandidate
    : null;
  const bounce = data.bounce && typeof data.bounce === "object"
    ? data.bounce as Record<string, unknown>
    : {};
  const failed = data.failed && typeof data.failed === "object"
    ? data.failed as Record<string, unknown>
    : {};
  const diagnostic = Object.fromEntries(Object.entries({
    bounceType: compact(bounce.type, 120),
    bounceSubType: compact(bounce.subType, 120),
    message: compact(bounce.message || failed.message || data.reason, 700),
  }).filter(([, value]) => Boolean(value)));

  return {
    providerEventId,
    providerMessageId,
    eventType: eventType as ResendDeliveryEventType,
    recipientEmail,
    occurredAt,
    payloadSha256: createHash("sha256").update(input.rawBody).digest("hex"),
    diagnostic,
  };
}

export function deliveryStatusForResendEvent(
  eventType: ResendDeliveryEventType,
): CallRoomInvitationDeliveryStatus {
  const statuses: Record<ResendDeliveryEventType, CallRoomInvitationDeliveryStatus> = {
    "email.sent": "SENT",
    "email.delivered": "DELIVERED",
    "email.delivery_delayed": "DELIVERY_DELAYED",
    "email.failed": "FAILED",
    "email.bounced": "BOUNCED",
    "email.complained": "COMPLAINED",
    "email.suppressed": "SUPPRESSED",
  };
  return statuses[eventType];
}

export function recipientStatusForResendEvent(
  eventType: ResendDeliveryEventType,
): EmailRecipientDeliveryStatus | null {
  if (eventType === "email.delivered") return "DELIVERABLE";
  if (eventType === "email.bounced") return "BOUNCED";
  if (eventType === "email.complained") return "COMPLAINED";
  if (eventType === "email.suppressed") return "SUPPRESSED";
  return null;
}
