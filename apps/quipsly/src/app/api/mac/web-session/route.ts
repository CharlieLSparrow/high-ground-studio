import { NextRequest, NextResponse } from "next/server";

import {
  consumeMacWebSessionLoginCode,
  createMacWebSessionLoginCode,
  MAC_WEB_SESSION_COOKIE_NAME,
  MacNativeSessionError,
  resolveMacSessionActor,
} from "@/lib/server/mac-session-token";

function requestMetadata(request: NextRequest) {
  return {
    source: "api/mac/web-session",
    userAgent: request.headers.get("user-agent") || "",
    forwardedFor: request.headers.get("x-forwarded-for") || "",
  };
}

function safeReturnTo(value: unknown, request: NextRequest) {
  const fallback = "/projects";
  const raw = String(value || "").trim();
  if (!raw) return fallback;

  try {
    const target = new URL(raw, request.nextUrl.origin);
    if (target.origin !== request.nextUrl.origin) return fallback;
    return `${target.pathname}${target.search}${target.hash}` || fallback;
  } catch {
    return fallback;
  }
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export async function POST(request: NextRequest) {
  const actor = resolveMacSessionActor(request);
  if (!actor) {
    return NextResponse.json({
      ok: false,
      code: "mac-session-required",
      error: "Open Nest Session in Quipsly Mac and connect a profile before loading the embedded editor.",
    }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const returnTo = safeReturnTo(body?.returnTo, request);

  try {
    const handoff = await createMacWebSessionLoginCode({
      actor,
      returnTo,
      metadataJson: requestMetadata(request),
    });

    const loginUrl = new URL("/api/mac/web-session", request.nextUrl.origin);
    loginUrl.searchParams.set("code", handoff.code);

    return NextResponse.json({
      ok: true,
      loginUrl: loginUrl.toString(),
      expiresAt: handoff.expiresAt,
      returnTo,
      user: handoff.user,
    });
  } catch (error) {
    if (error instanceof MacNativeSessionError) {
      return NextResponse.json({
        ok: false,
        code: error.code,
        error: error.message,
      }, { status: error.status });
    }

    console.error("Mac web-session bootstrap failed", error);
    return NextResponse.json({
      ok: false,
      code: "web-session-bootstrap-failed",
      error: "Quipsly could not prepare the embedded editor session. Try refreshing the Mac profile.",
    }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code") || "";

  try {
    const session = await consumeMacWebSessionLoginCode({ code });
    const returnTo = safeReturnTo(session.returnTo, request);
    const redirectUrl = new URL(returnTo, request.nextUrl.origin);

    const response = NextResponse.redirect(redirectUrl);
    response.cookies.set({
      name: MAC_WEB_SESSION_COOKIE_NAME,
      value: session.token,
      httpOnly: true,
      secure: request.nextUrl.protocol === "https:" || process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      expires: new Date(session.expiresAt),
    });
    return response;
  } catch (error) {
    const message = error instanceof MacNativeSessionError
      ? error.message
      : "Quipsly could not open the embedded editor session. Return to Quipsly Mac and reload.";

    return new NextResponse(
      `<!doctype html>
      <meta charset="utf-8" />
      <title>Quipsly Mac web session failed</title>
      <body style="font-family: ui-serif, Georgia, serif; margin: 40px; background: #fbf6e8; color: #3e3326;">
        <p style="letter-spacing: .18em; text-transform: uppercase; color: #9b6b37; font-weight: 800;">Quipsly Mac</p>
        <h1>Embedded editor session needs a refresh</h1>
        <p>${escapeHtml(message)}</p>
        <p>Back in Quipsly Mac, select <strong>Nest Session</strong>, confirm the active profile, then reload the Episode Editor.</p>
      </body>`,
      {
        status: error instanceof MacNativeSessionError ? error.status : 500,
        headers: { "content-type": "text/html; charset=utf-8" },
      },
    );
  }
}
