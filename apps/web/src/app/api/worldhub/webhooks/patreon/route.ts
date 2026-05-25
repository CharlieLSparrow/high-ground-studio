import { NextResponse } from "next/server";

import { recordWorldHubProviderEvent } from "@/lib/server/worldhub-provider-events";
import { verifyPatreonWebhookSignature } from "@/lib/worldhub/webhook-signatures";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function eventId(payloadJson: unknown) {
  if (!payloadJson || typeof payloadJson !== "object") {
    return null;
  }

  const data = (payloadJson as { data?: unknown }).data;
  if (!data || typeof data !== "object") {
    return null;
  }

  const id = (data as { id?: unknown }).id;

  return typeof id === "string" ? id : null;
}

export async function POST(request: Request) {
  const payloadText = await request.text();
  const verification = verifyPatreonWebhookSignature({
    payload: payloadText,
    signatureHeader: request.headers.get("x-patreon-signature"),
    webhookSecret: process.env.PATREON_WEBHOOK_SECRET,
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

  const eventType =
    request.headers.get("x-patreon-event")?.trim() || "patreon.webhook";
  const externalEventId = eventId(payloadJson);

  await recordWorldHubProviderEvent({
    providerKey: "patreon",
    eventType,
    externalEventId,
    idempotencyKey: externalEventId
      ? `patreon:${eventType}:${externalEventId}`
      : null,
    verificationStatus: "verified",
    processingStatus: "received",
    payloadText,
    payloadJson,
  });

  return NextResponse.json({ ok: true, received: true });
}
