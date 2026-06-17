import { NextResponse } from "next/server";

import { requestEmailSignInCode } from "@/lib/server/email-signin-code";

export async function POST(request: Request) {
  let payload: { email?: string; callbackUrl?: string } = {};

  try {
    payload = await request.json();
  } catch {
    payload = {};
  }

  const result = await requestEmailSignInCode({
    email: String(payload.email || ""),
    callbackUrl: typeof payload.callbackUrl === "string" ? payload.callbackUrl : null,
  });

  return NextResponse.json({
    ok: true,
    sent: result.sent,
    message: result.message,
    devCode: result.devCode,
    reason: result.reason === "not-eligible" ? undefined : result.reason,
  });
}
