import { NextResponse } from "next/server";

import {
  getHgoCoachingApiHandoff,
  isHgoLegacyCoachingApiEnabled,
} from "@/lib/hgo/coaching-handoff";
import { createCoachingCheckoutSession } from "@/lib/server/coaching/stripe";

export async function POST(request: Request) {
  if (!isHgoLegacyCoachingApiEnabled()) {
    return NextResponse.json(getHgoCoachingApiHandoff("create-stripe-checkout"), { status: 409 });
  }

  try {
    const body = await request.json();

    if (!body?.bookingId || typeof body.bookingId !== "string") {
      return NextResponse.json(
        { ok: false, error: "A coaching booking ID is required before checkout." },
        { status: 400 },
      );
    }

    const checkout = await createCoachingCheckoutSession({
      bookingId: body.bookingId,
      successUrl: typeof body.successUrl === "string" ? body.successUrl : undefined,
      cancelUrl: typeof body.cancelUrl === "string" ? body.cancelUrl : undefined,
    });

    return NextResponse.json({ ok: true, checkout });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Unable to create coaching checkout.",
      },
      { status: 400 },
    );
  }
}
