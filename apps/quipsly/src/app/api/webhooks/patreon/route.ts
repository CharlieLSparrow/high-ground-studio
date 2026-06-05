import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { getPrismaClient } from "@/lib/prisma";
import { PatreonWebhookEventType } from "@/lib/patreon/types";

const PATREON_WEBHOOK_SECRET = process.env.PATREON_WEBHOOK_SECRET || "";

function verifyPatreonSignature(signature: string | null, rawBody: string): boolean {
  if (!signature || !PATREON_WEBHOOK_SECRET) return false;

  try {
    const hash = crypto
      .createHmac("md5", PATREON_WEBHOOK_SECRET)
      .update(rawBody)
      .digest("hex");

    const signatureBuffer = Buffer.from(signature);
    const hashBuffer = Buffer.from(hash);

    if (signatureBuffer.length !== hashBuffer.length) {
      return false;
    }

    return crypto.timingSafeEqual(signatureBuffer, hashBuffer);
  } catch (error) {
    console.error("[Patreon Webhook] Signature verification error:", error);
    return false;
  }
}

export async function POST(req: NextRequest) {
  try {
    const prisma = getPrismaClient(); // Must instantiate here or top level 
    const signature = req.headers.get("x-patreon-signature");
    const eventType = req.headers.get("x-patreon-event") as PatreonWebhookEventType;
    const patreonEventId = req.headers.get("x-patreon-event-id"); 
    
    const rawBody = await req.text();

    if (!verifyPatreonSignature(signature, rawBody)) {
      // @ts-ignore
      const ip = req.ip || req.headers.get("x-forwarded-for");
      console.warn(`[Patreon Webhook] Invalid signature from IP: ${ip || "unknown"}`);
      return NextResponse.json({ ok: true }, { status: 200 });
    }

    let payload: any;
    try {
      payload = JSON.parse(rawBody);
    } catch (err) {
      console.error("[Patreon Webhook] Malformed JSON payload:", err);
      return NextResponse.json({ ok: true }, { status: 200 });
    }

    const connection = await prisma.worldHubProviderConnection.findUnique({
      where: { providerKey: "patreon_main" }
    });

    if (!connection) {
      console.error("[Patreon Webhook] Patreon provider connection not found in DB.");
      return NextResponse.json({ error: "Configuration Error" }, { status: 500 });
    }

    try {
      await prisma.worldHubProviderEvent.create({
        data: {
          connectionId: connection.id,
          eventType: eventType || "unknown",
          externalEventId: payload.data?.id || null,
          idempotencyKey: patreonEventId || payload.data?.id || `fallback-${Date.now()}`,
          payloadSummaryJson: payload,
          processingStatus: "UNPROCESSED",
          verificationStatus: "verified",
        }
      });
      console.log(`[Patreon Webhook] Successfully ingested ${eventType} event.`);
    } catch (dbError: any) {
      if (dbError.code === 'P2002') {
        console.warn(`[Patreon Webhook] Duplicate event detected. Skipping. ID: ${patreonEventId}`);
        return NextResponse.json({ ok: true, note: "duplicate_skipped" });
      }
      throw dbError; 
    }

    return NextResponse.json({ ok: true });

  } catch (error) {
    console.error("[Patreon Webhook] Catastrophic failure in receiver:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
