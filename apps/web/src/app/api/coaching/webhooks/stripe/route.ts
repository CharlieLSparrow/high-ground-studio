import { NextResponse } from "next/server";

import {
  getHgoCoachingApiHandoff,
  isHgoLegacyCoachingApiEnabled,
} from "@/lib/hgo/coaching-handoff";
import { recordCoachingStripeWebhook } from "@/lib/server/coaching/stripe";

export async function POST(request: Request) {
  if (!isHgoLegacyCoachingApiEnabled()) {
    return NextResponse.json(getHgoCoachingApiHandoff("stripe-webhook"), { status: 409 });
  }

  const rawBody = await request.text();
  const signature = request.headers.get("stripe-signature");

  try {
    const result = await recordCoachingStripeWebhook(rawBody, signature);
    return NextResponse.json({ ok: true, result });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Unable to process coaching Stripe webhook.",
      },
      { status: 400 },
    );
  }
}
