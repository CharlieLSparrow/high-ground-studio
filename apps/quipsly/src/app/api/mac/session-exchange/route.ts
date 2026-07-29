import { NextResponse } from "next/server";

import {
  exchangeMacFirebaseHandoff,
  MacFirebaseHandoffError,
} from "@/lib/server/mac-firebase-handoff";

export const dynamic = "force-dynamic";

const MAX_EXCHANGE_BODY_BYTES = 16 * 1024;
const NO_STORE_HEADERS = {
  "cache-control": "no-store, max-age=0",
  "referrer-policy": "no-referrer",
  "x-content-type-options": "nosniff",
};

function errorResponse(code: string, error: string, status: number) {
  return NextResponse.json(
    { ok: false, code, error },
    { status, headers: NO_STORE_HEADERS },
  );
}

export async function POST(request: Request) {
  const contentType = request.headers.get("content-type") ?? "";
  if (
    contentType.split(";", 1)[0]?.trim().toLowerCase()
    !== "application/json"
  ) {
    return errorResponse(
      "json-required",
      "Quipsly Mac must send a JSON sign-in exchange.",
      415,
    );
  }

  const rawBody = await request.text();
  if (Buffer.byteLength(rawBody, "utf8") > MAX_EXCHANGE_BODY_BYTES) {
    return errorResponse(
      "exchange-too-large",
      "The Quipsly Mac sign-in exchange was unexpectedly large.",
      413,
    );
  }

  let body: unknown = null;
  try {
    body = JSON.parse(rawBody);
  } catch {
    // The common response below deliberately does not reflect parser details.
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return errorResponse(
      "invalid-json",
      "Quipsly Mac sent an unreadable sign-in exchange.",
      400,
    );
  }

  const input = body as Record<string, unknown>;
  try {
    const exchange = await exchangeMacFirebaseHandoff({
      code: input.code,
      state: input.state,
      codeVerifier: input.codeVerifier,
      deviceLabel: input.deviceLabel,
    });
    return NextResponse.json(
      {
        ok: true,
        customToken: exchange.customToken,
        user: exchange.user,
      },
      {
        headers: NO_STORE_HEADERS,
      },
    );
  } catch (error) {
    if (error instanceof MacFirebaseHandoffError) {
      return errorResponse(error.code, error.message, error.status);
    }

    console.error("Quipsly Mac Firebase handoff exchange failed", {
      reason: error instanceof Error ? error.message : "unknown",
    });
    return errorResponse(
      "session-exchange-failed",
      "Nest could not complete the Mac sign-in. Start sign-in again.",
      503,
    );
  }
}
