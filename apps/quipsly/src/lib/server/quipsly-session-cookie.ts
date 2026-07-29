import "server-only";

export const QUIPSLY_SESSION_COOKIE_DOMAIN = ".quipsly.com";

function normalizedRequestHost(request: Request) {
  const forwardedHost = request.headers
    .get("x-forwarded-host")
    ?.split(",")[0]
    ?.trim();
  const rawHost = forwardedHost || request.headers.get("host") || new URL(request.url).host;
  return rawHost.split(":")[0]?.toLowerCase() || "";
}

export function quipslySessionCookieDomain(request: Request) {
  const hostname = normalizedRequestHost(request);
  return hostname === "quipsly.com" || hostname.endsWith(".quipsly.com")
    ? QUIPSLY_SESSION_COOKIE_DOMAIN
    : undefined;
}

export function quipslySessionCookieOptions(
  request: Request,
  maxAge: number,
) {
  const domain = quipslySessionCookieDomain(request);
  return {
    maxAge,
    httpOnly: true,
    secure:
      process.env.NODE_ENV === "production"
      || new URL(request.url).protocol === "https:",
    path: "/",
    sameSite: "lax" as const,
    ...(domain ? { domain } : {}),
  };
}
