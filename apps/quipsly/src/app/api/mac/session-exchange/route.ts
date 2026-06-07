import { NextRequest, NextResponse } from "next/server";

import { exchangeMacNativeAuthCode, MacNativeSessionError } from "@/lib/server/mac-session-token";

function requestMetadata(request: NextRequest) {
  return {
    source: "api/mac/session-exchange",
    userAgent: request.headers.get("user-agent") || "",
    forwardedFor: request.headers.get("x-forwarded-for") || "",
  };
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));

  try {
    const bundle = await exchangeMacNativeAuthCode({
      code: body?.code,
      deviceLabel: body?.deviceLabel,
      metadataJson: requestMetadata(request),
    });

    return NextResponse.json({ ok: true, ...bundle });
  } catch (error) {
    if (error instanceof MacNativeSessionError) {
      return NextResponse.json({
        ok: false,
        code: error.code,
        error: error.message,
      }, { status: error.status });
    }

    console.error("Mac session exchange failed", error);
    return NextResponse.json({
      ok: false,
      code: "session-exchange-failed",
      error: "Quipsly could not exchange that Mac sign-in code. Try signing in again.",
    }, { status: 500 });
  }
}
