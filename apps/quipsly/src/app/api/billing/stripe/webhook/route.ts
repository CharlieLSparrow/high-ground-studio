import { NextResponse } from "next/server";

import { getPrismaClient } from "@/lib/prisma";
import { recordQuipslySubscriptionWebhook } from "@/lib/server/saas-stripe";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const rawBody = await request.text();
  try {
    const result = await recordQuipslySubscriptionWebhook({
      prisma: getPrismaClient(),
      rawBody,
      signature: request.headers.get("stripe-signature"),
    });
    return NextResponse.json({ ok: true, result });
  } catch (error) {
    console.error("[stripe-saas] Webhook processing failed", error);
    const message = error instanceof Error ? error.message : "Stripe subscription webhook could not be processed.";
    return NextResponse.json({ ok: false, error: message }, { status: message.includes("not configured") ? 503 : 400 });
  }
}
