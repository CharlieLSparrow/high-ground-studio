import { NextResponse } from "next/server";

import { getPrismaClient } from "@/lib/prisma";
import {
  GoogleCalendarPushError,
  receiveGoogleCalendarNotification,
} from "@/lib/server/google-calendar-push";

export const runtime = "nodejs";

const NO_STORE_HEADERS = { "Cache-Control": "no-store" };

export async function POST(request: Request) {
  const body = await request.text();
  if (body.length > 0) {
    return NextResponse.json(
      { ok: false, error: "Notification bodies are not accepted." },
      { status: 400, headers: NO_STORE_HEADERS },
    );
  }
  try {
    await receiveGoogleCalendarNotification({
      prisma: getPrismaClient() as any,
      channelId: request.headers.get("x-goog-channel-id")?.trim() || "",
      channelToken: request.headers.get("x-goog-channel-token") || "",
      resourceId: request.headers.get("x-goog-resource-id")?.trim() || "",
      resourceState: request.headers.get("x-goog-resource-state")?.trim() || "",
      messageNumber: request.headers.get("x-goog-message-number")?.trim() || "",
    });
    return new NextResponse(null, { status: 204, headers: NO_STORE_HEADERS });
  } catch (error) {
    const known = error instanceof GoogleCalendarPushError;
    return NextResponse.json(
      { ok: false, error: "Notification not accepted." },
      { status: known ? error.status : 503, headers: NO_STORE_HEADERS },
    );
  }
}
