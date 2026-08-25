import { NextResponse } from "next/server";

import { buildNativeSessionContext } from "@/lib/server/native-session-context";
import { isFirebaseBearerAuthenticationError } from "@/lib/server/firebase-auth";
import { isDatabaseUnavailableError } from "@/lib/server/service-availability";

export async function GET(request: Request) {
  try {
    const context = await buildNativeSessionContext(request);
    return NextResponse.json(context);
  } catch (error) {
    console.warn("[api/mac/session-check] Native session check failed", {
      reason: error instanceof Error ? error.message : "unknown",
    });

    if (isFirebaseBearerAuthenticationError(error)) {
      return NextResponse.json(
        {
          ok: false,
          authenticated: false,
          code: "NATIVE_SESSION_AUTHENTICATION_REQUIRED",
          error: "Sign in to Quipsly, then try again.",
        },
        { status: 401 },
      );
    }

    if (isDatabaseUnavailableError(error)) {
      return NextResponse.json(
        {
          ok: false,
          authenticated: true,
          retryable: true,
          code: "QUIPSLY_SERVICE_UNAVAILABLE",
          error: "Quipsly is having trouble opening your account. Trying again should fix it.",
        },
        {
          status: 503,
          headers: { "Retry-After": "1" },
        },
      );
    }

    return NextResponse.json(
      {
        ok: false,
        authenticated: true,
        retryable: true,
        code: "NATIVE_SESSION_CHECK_FAILED",
        error: "Quipsly could not open your account right now. Try again in a moment.",
      },
      { status: 500 },
    );
  }
}
