import { NextResponse } from "next/server";

import {
  getHgoCoachingApiHandoff,
  isHgoLegacyCoachingApiEnabled,
} from "@/lib/hgo/coaching-handoff";
import { createCoachingCustomerPortalSession } from "@/lib/server/coaching/stripe";

export async function POST(request: Request) {
  if (!isHgoLegacyCoachingApiEnabled()) {
    return NextResponse.json(getHgoCoachingApiHandoff("create-customer-portal"), { status: 409 });
  }

  try {
    const body = await request.json();
    const portal = await createCoachingCustomerPortalSession({
      userId: typeof body?.userId === "string" ? body.userId : undefined,
      stripeCustomerId: typeof body?.stripeCustomerId === "string" ? body.stripeCustomerId : undefined,
      returnUrl: typeof body?.returnUrl === "string" ? body.returnUrl : undefined,
    });

    return NextResponse.json({ ok: true, portal });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to create coaching customer portal session.";
    const gated = message.includes("Coaching customer portal is disabled");

    return NextResponse.json(
      {
        ok: false,
        error: message,
      },
      { status: gated ? 403 : 400 },
    );
  }
}
