import { NextResponse } from "next/server";

import { getPrismaClient } from "@/lib/prisma";
import { recordResendDeliveryEvent } from "@/lib/server/resend-delivery-ledger";
import { verifyResendDeliveryWebhook } from "@/lib/server/resend-webhook";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_WEBHOOK_BYTES = 256 * 1024;

export async function POST(request: Request) {
  const secret = (
    process.env.QUIPSLY_RESEND_WEBHOOK_SECRET ||
    process.env.RESEND_WEBHOOK_SECRET ||
    ""
  ).trim();
  if (!secret) {
    return NextResponse.json({ ok: false, code: "WEBHOOK_NOT_CONFIGURED" }, { status: 503 });
  }

  const rawBody = await request.text();
  if (Buffer.byteLength(rawBody, "utf8") > MAX_WEBHOOK_BYTES) {
    return NextResponse.json({ ok: false, code: "PAYLOAD_TOO_LARGE" }, { status: 413 });
  }

  try {
    const event = verifyResendDeliveryWebhook({
      rawBody,
      webhookSecret: secret,
      providerEventId: request.headers.get("svix-id"),
      timestamp: request.headers.get("svix-timestamp"),
      signature: request.headers.get("svix-signature"),
    });
    if (!event) return NextResponse.json({ ok: true, ignored: true });

    const result = await recordResendDeliveryEvent({
      prisma: getPrismaClient(),
      event,
    });
    return NextResponse.json({ ok: true, duplicate: result.duplicate, matched: result.matched });
  } catch (error) {
    const code = error instanceof Error ? error.message : "RESEND_WEBHOOK_INVALID";
    if (code.startsWith("RESEND_WEBHOOK_")) {
      return NextResponse.json({ ok: false, code }, { status: 400 });
    }
    console.error("Resend webhook persistence failed", error);
    return NextResponse.json({ ok: false, code: "WEBHOOK_PERSISTENCE_FAILED" }, { status: 500 });
  }
}
