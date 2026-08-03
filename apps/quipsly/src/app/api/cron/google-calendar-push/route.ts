import { NextResponse } from "next/server";

import { getPrismaClient } from "@/lib/prisma";
import {
  authorizeGoogleCalendarPushWorker,
  runGoogleCalendarPushMaintenance,
} from "@/lib/server/google-calendar-push-worker";

export const runtime = "nodejs";
export const maxDuration = 60;

const NO_STORE_HEADERS = { "Cache-Control": "no-store" };

export async function POST(request: Request) {
  const authorization = await authorizeGoogleCalendarPushWorker({
    authorization: request.headers.get("authorization"),
  });
  if (authorization === "not-configured") {
    return NextResponse.json(
      { ok: false, error: "Google Calendar push maintenance is not configured." },
      { status: 503, headers: NO_STORE_HEADERS },
    );
  }
  if (authorization !== "authorized") {
    return NextResponse.json(
      { ok: false, error: "Unauthorized." },
      { status: 401, headers: NO_STORE_HEADERS },
    );
  }
  try {
    const result = await runGoogleCalendarPushMaintenance({
      prisma: getPrismaClient() as any,
      requestUrl: request.url,
    });
    return NextResponse.json({ ok: true, result }, { headers: NO_STORE_HEADERS });
  } catch {
    return NextResponse.json(
      { ok: false, error: "Google Calendar push maintenance did not complete." },
      { status: 503, headers: NO_STORE_HEADERS },
    );
  }
}
