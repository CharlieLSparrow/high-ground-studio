import { NextResponse } from "next/server";

// Firebase-first auth owns Quipsly login now.
// This catch-all route remains only as a legacy Auth.js trap so stale links,
// bookmarks, or old callback attempts cannot hijack sign-in. Keep it boring:
// sanitize any callback and send the user back through /login.
function requestPublicOrigin(request: Request) {
  const url = new URL(request.url);
  const forwardedProto = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
  const forwardedHost = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  const host = forwardedHost || request.headers.get("host") || url.host;
  const proto = forwardedProto || url.protocol.replace(/:$/, "") || "https";

  return `${proto}://${host}`;
}

function firebaseLoginRedirect(request: Request) {
  const url = new URL(request.url);
  const callbackUrl = url.searchParams.get("callbackUrl") || "/projects";
  const target = new URL("/login", requestPublicOrigin(request));
  target.searchParams.set(
    "callbackUrl",
    callbackUrl.startsWith("/") && !callbackUrl.startsWith("//")
      ? callbackUrl
      : "/projects",
  );

  return NextResponse.redirect(target, { status: 303 });
}

export function GET(request: Request) {
  return firebaseLoginRedirect(request);
}

export function POST(request: Request) {
  return firebaseLoginRedirect(request);
}
