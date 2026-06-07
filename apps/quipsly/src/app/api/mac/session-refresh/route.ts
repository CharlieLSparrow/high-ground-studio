import { NextRequest, NextResponse } from "next/server";

import { MacNativeSessionError, refreshMacNativeDeviceSession } from "@/lib/server/mac-session-token";

function requestMetadata(request: NextRequest) {
  return {
    source: "api/mac/session-refresh",
    userAgent: request.headers.get("user-agent") || "",
    forwardedFor: request.headers.get("x-forwarded-for") || "",
  };
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));

  try {
    const bundle = await refreshMacNativeDeviceSession({
      refreshToken: body?.refreshToken,
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

    console.error("Mac session refresh failed", error);
    return NextResponse.json({
      ok: false,
      code: "session-refresh-failed",
      error: "Quipsly could not refresh this Mac profile. Sign in again.",
    }, { status: 500 });
  }
}
