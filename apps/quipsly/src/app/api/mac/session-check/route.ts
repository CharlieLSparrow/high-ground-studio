import { NextResponse } from "next/server";

import { buildNativeSessionContext } from "@/lib/server/native-session-context";

export async function GET(request: Request) {
  try {
    const context = await buildNativeSessionContext(request);
    return NextResponse.json(context);
  } catch (error) {
    console.warn("[api/mac/session-check] Native session check failed", {
      reason: error instanceof Error ? error.message : "unknown",
    });

    return NextResponse.json(
      {
        ok: false,
        authenticated: false,
        error: "Sign in to Quipsly with Firebase, then try the native session check again.",
      },
      { status: 401 },
    );
  }
}
