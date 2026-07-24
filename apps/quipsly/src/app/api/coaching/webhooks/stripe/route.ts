import { NextResponse } from "next/server";

import { getPrismaClient } from "@/lib/prisma";
import { recordQuipslyCoachingStripeWebhook } from "@/lib/server/coaching-stripe";

export const runtime = "nodejs";

function errorStatus(message: string) {
  if (message.includes("not configured")) return 503;
  return 400;
}

export async function POST(request: Request) {
  const rawBody = await request.text();
  const signature = request.headers.get("stripe-signature");

  try {
    const prisma = getPrismaClient() as any;
    const result = await recordQuipslyCoachingStripeWebhook({
      prisma,
      rawBody,
      signature,
    });

    return NextResponse.json({ ok: true, result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Stripe coaching webhook could not be recorded.";
    return NextResponse.json({ ok: false, error: message }, { status: errorStatus(message) });
  }
}
