import { NextResponse } from "next/server";
import type { Session } from "next-auth";

import { auth } from "@/auth";
import { createMacNativeAuthCode } from "@/lib/server/mac-session-token";

const DEFAULT_CALLBACK_SCHEME = "quipslymac";

function htmlEscape(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function wantsJson(request: Request) {
  return (request.headers.get("accept") || "").includes("application/json");
}

function allowedCallbackSchemes() {
  return [
    DEFAULT_CALLBACK_SCHEME,
    ...(process.env.QUIPSLY_MAC_CALLBACK_SCHEMES || "")
      .split(",")
      .map((entry) => entry.trim().toLowerCase())
      .filter(Boolean),
  ];
}

function requestedCallbackScheme(request: Request) {
  const url = new URL(request.url);
  const scheme = (url.searchParams.get("callbackScheme") || "").trim().toLowerCase();
  if (!scheme) return null;
  return allowedCallbackSchemes().includes(scheme) ? scheme : null;
}

function requestedState(request: Request) {
  const url = new URL(request.url);
  return (url.searchParams.get("state") || "").trim();
}

function requestedDeviceLabel(request: Request) {
  const url = new URL(request.url);
  return (url.searchParams.get("deviceLabel") || "").trim();
}

function isNativeHandoff(request: Request) {
  const url = new URL(request.url);
  return url.searchParams.get("native") === "1" && Boolean(requestedCallbackScheme(request));
}

function publicBaseUrl(request: Request) {
  const configured = (process.env.AUTH_URL || process.env.NEXTAUTH_URL || "https://nest.quipsly.com").trim();
  const fallback = "https://nest.quipsly.com";

  try {
    const configuredUrl = new URL(configured || fallback);
    if (configuredUrl.hostname !== "0.0.0.0" && configuredUrl.hostname !== "localhost") {
      return configuredUrl.origin;
    }
  } catch {
    // Fall through to request-derived host.
  }

  const requestUrl = new URL(request.url);
  const forwardedHost = request.headers.get("x-forwarded-host") || request.headers.get("host") || requestUrl.host;
  const forwardedProto = request.headers.get("x-forwarded-proto") || requestUrl.protocol.replace(/:$/, "") || "https";
  const host = forwardedHost.split(",")[0]?.trim() || "nest.quipsly.com";

  if (host === "0.0.0.0:8080" || host.startsWith("0.0.0.0") || host.startsWith("localhost")) {
    return fallback;
  }

  return `${forwardedProto}://${host}`;
}

function nativeCallbackUrl(
  request: Request,
  handoff: Awaited<ReturnType<typeof createMacNativeAuthCode>>,
  session: Session,
) {
  const scheme = requestedCallbackScheme(request);
  if (!scheme) return null;

  const fragment = new URLSearchParams({
    code: handoff.code,
    expiresAt: handoff.expiresAt,
    email: session?.user?.primaryEmail || session?.user?.email || "",
    name: session?.user?.name || "",
    state: handoff.state || "",
  });

  const callback = new URL(`${scheme}://auth/session`);
  callback.hash = fragment.toString();
  return callback;
}

function signInResponse(request: Request) {
  const native = isNativeHandoff(request);
  const requestUrl = new URL(request.url);
  const publicOrigin = publicBaseUrl(request);
  const callbackPath = native
    ? `/api/mac/session-handoff?native=1&callbackScheme=${encodeURIComponent(requestUrl.searchParams.get("callbackScheme") || DEFAULT_CALLBACK_SCHEME)}&state=${encodeURIComponent(requestedState(request))}&deviceLabel=${encodeURIComponent(requestedDeviceLabel(request))}`
    : "/api/mac/session-handoff";
  const callbackUrl = new URL(callbackPath, publicOrigin);
  const signInUrl = new URL("/api/auth/signin", publicOrigin);
  signInUrl.searchParams.set("callbackUrl", callbackUrl.toString());

  if (wantsJson(request)) {
    return NextResponse.json({
      ok: false,
      error: "Sign in to create a one-time Quipsly Mac connection code.",
      signInUrl: signInUrl.toString(),
    }, { status: 401 });
  }

  if (native) {
    return NextResponse.redirect(signInUrl);
  }

  return new NextResponse(
    `<!doctype html>
    <meta charset="utf-8" />
    <title>Quipsly Mac sign-in needed</title>
    <body style="font-family: ui-serif, Georgia, serif; margin: 40px; background: #fbf6e8; color: #3e3326;">
      <h1>Sign in to connect Quipsly Mac</h1>
      <p>Open the normal Nest sign-in first. After sign-in, this page will create a one-time Mac connection code.</p>
      <p><a href="${htmlEscape(signInUrl.toString())}" style="font-weight: 800;">Sign in with Nest</a></p>
    </body>`,
    { status: 401, headers: { "content-type": "text/html; charset=utf-8" } },
  );
}

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return signInResponse(request);

  const callbackScheme = requestedCallbackScheme(request) || DEFAULT_CALLBACK_SCHEME;
  const handoff = await createMacNativeAuthCode(session, {
    callbackScheme,
    state: requestedState(request),
    deviceLabel: requestedDeviceLabel(request),
    metadataJson: {
      source: "api/mac/session-handoff",
      native: isNativeHandoff(request),
      userAgent: request.headers.get("user-agent") || "",
    },
  });
  const nativeUrl = nativeCallbackUrl(request, handoff, session);

  if (nativeUrl) {
    return new NextResponse(null, {
      status: 302,
      headers: { Location: nativeUrl.toString() },
    });
  }

  if (wantsJson(request)) {
    return NextResponse.json({
      ok: true,
      code: handoff.code,
      expiresAt: handoff.expiresAt,
      user: {
        email: session.user.primaryEmail || session.user.email,
        name: session.user.name,
      },
    });
  }

  return new NextResponse(
    `<!doctype html>
    <meta charset="utf-8" />
    <title>Connect Quipsly Mac</title>
    <body style="font-family: ui-serif, Georgia, serif; margin: 40px; max-width: 900px; background: #fbf6e8; color: #3e3326;">
      <p style="letter-spacing: .18em; text-transform: uppercase; color: #9b6b37; font-weight: 800;">Quipsly Mac handoff</p>
      <h1>Copy this one-time code into Quipsly Mac</h1>
      <p>This code lets the native Mac app create a revocable device session. It expires at <strong>${htmlEscape(handoff.expiresAt)}</strong> and can only be used once.</p>
      <textarea id="token" style="width: 100%; min-height: 130px; border-radius: 16px; padding: 16px; font: 13px ui-monospace, SFMono-Regular, Menlo, monospace;">${htmlEscape(handoff.code)}</textarea>
      <p>
        <button onclick="navigator.clipboard.writeText(document.getElementById('token').value)" style="padding: 12px 18px; border-radius: 999px; border: 0; background: #4a3824; color: white; font-weight: 800;">Copy code</button>
      </p>
      <p>Back in Quipsly Mac, open <strong>Nest Session</strong>, paste the code, exchange it, then click <strong>Check connection</strong>.</p>
    </body>`,
    { headers: { "content-type": "text/html; charset=utf-8" } },
  );
}
