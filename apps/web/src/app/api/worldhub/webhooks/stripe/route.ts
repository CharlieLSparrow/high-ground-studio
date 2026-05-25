import { NextResponse } from "next/server";

import { recordWorldHubProviderEvent } from "@/lib/server/worldhub-provider-events";
import { verifyStripeWebhookSignature } from "@/lib/worldhub/webhook-signatures";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function eventDate(value: unknown) {
  return typeof value === "number" ? new Date(value * 1000) : null;
}

export async function POST(request: Request) {
  const payloadText = await request.text();
  const verification = verifyStripeWebhookSignature({
    payload: payloadText,
    signatureHeader: request.headers.get("stripe-signature"),
    endpointSecret: process.env.STRIPE_WEBHOOK_SECRET,
  });

  if (!verification.ok) {
    const status = verification.reason.includes("not configured") ? 503 : 400;

    return NextResponse.json({ ok: false, error: verification.reason }, { status });
  }

  let payloadJson: unknown;

  try {
    payloadJson = JSON.parse(payloadText);
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON payload." }, { status: 400 });
  }

  const payload = payloadJson as {
    id?: string;
    type?: string;
    created?: unknown;
  };
  const eventType = payload.type || "stripe.event";

  await recordWorldHubProviderEvent({
    providerKey: "stripe",
    eventType,
    externalEventId: payload.id || null,
    idempotencyKey: payload.id ? `stripe:${payload.id}` : null,
    verificationStatus: "verified",
    processingStatus: "received",
    payloadText,
    payloadJson,
    occurredAt: eventDate(payload.created),
  });

  return NextResponse.json({ ok: true, received: true });
}
