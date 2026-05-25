import { createHmac, timingSafeEqual } from "node:crypto";

const STRIPE_DEFAULT_TOLERANCE_SECONDS = 5 * 60;

export type WebhookSignatureResult =
  | {
      ok: true;
    }
  | {
      ok: false;
      reason: string;
    };

function safeEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left, "utf8");
  const rightBuffer = Buffer.from(right, "utf8");

  return (
    leftBuffer.length === rightBuffer.length &&
    timingSafeEqual(leftBuffer, rightBuffer)
  );
}

function hmacHex(algorithm: string, secret: string, payload: string) {
  return createHmac(algorithm, secret).update(payload, "utf8").digest("hex");
}

function parseStripeSignatureHeader(header: string) {
  const parts = header.split(",").map((part) => part.trim());
  const timestampPart = parts.find((part) => part.startsWith("t="));
  const signatures = parts
    .filter((part) => part.startsWith("v1="))
    .map((part) => part.slice(3))
    .filter(Boolean);
  const timestamp = timestampPart ? Number(timestampPart.slice(2)) : NaN;

  return {
    timestamp,
    signatures,
  };
}

export function verifyStripeWebhookSignature({
  payload,
  signatureHeader,
  endpointSecret,
  nowMs = Date.now(),
  toleranceSeconds = STRIPE_DEFAULT_TOLERANCE_SECONDS,
}: {
  payload: string;
  signatureHeader: string | null;
  endpointSecret: string | undefined;
  nowMs?: number;
  toleranceSeconds?: number;
}): WebhookSignatureResult {
  if (!endpointSecret?.trim()) {
    return { ok: false, reason: "STRIPE_WEBHOOK_SECRET is not configured." };
  }

  if (!signatureHeader?.trim()) {
    return { ok: false, reason: "Missing Stripe-Signature header." };
  }

  const parsed = parseStripeSignatureHeader(signatureHeader);

  if (!Number.isFinite(parsed.timestamp) || parsed.signatures.length === 0) {
    return { ok: false, reason: "Stripe-Signature header is malformed." };
  }

  const ageSeconds = Math.abs(Math.floor(nowMs / 1000) - parsed.timestamp);
  if (ageSeconds > toleranceSeconds) {
    return { ok: false, reason: "Stripe-Signature timestamp is outside tolerance." };
  }

  const signedPayload = `${parsed.timestamp}.${payload}`;
  const expected = hmacHex("sha256", endpointSecret, signedPayload);
  const hasMatch = parsed.signatures.some((signature) =>
    safeEqual(expected, signature),
  );

  return hasMatch
    ? { ok: true }
    : { ok: false, reason: "Stripe webhook signature did not match." };
}

export function verifyPatreonWebhookSignature({
  payload,
  signatureHeader,
  webhookSecret,
}: {
  payload: string;
  signatureHeader: string | null;
  webhookSecret: string | undefined;
}): WebhookSignatureResult {
  if (!webhookSecret?.trim()) {
    return { ok: false, reason: "PATREON_WEBHOOK_SECRET is not configured." };
  }

  if (!signatureHeader?.trim()) {
    return { ok: false, reason: "Missing X-Patreon-Signature header." };
  }

  const expected = hmacHex("md5", webhookSecret, payload);

  return safeEqual(expected, signatureHeader.trim().toLowerCase())
    ? { ok: true }
    : { ok: false, reason: "Patreon webhook signature did not match." };
}
