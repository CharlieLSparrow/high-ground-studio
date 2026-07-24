import { NextResponse } from "next/server";

import {
  getHgoCoachingApiHandoff,
  isHgoLegacyCoachingApiEnabled,
} from "@/lib/hgo/coaching-handoff";
import { createCoachingBookingDraft } from "@/lib/server/coaching/bookings";

export async function POST(request: Request) {
  if (!isHgoLegacyCoachingApiEnabled()) {
    return NextResponse.json(getHgoCoachingApiHandoff("create-booking-draft"), { status: 409 });
  }

  try {
    const body = await request.json();
    const booking = await createCoachingBookingDraft(body);
    return NextResponse.json({ ok: true, booking });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to create coaching booking draft.";
    const gated = message.includes("Coaching booking writes are disabled");

    return NextResponse.json(
      {
        ok: false,
        error: message,
      },
      { status: gated ? 403 : 400 },
    );
  }
}
