const DEFAULT_QUIPSLY_CALLBACK_URL = "/projects";
const QUIPSLY_INVITE_TOKEN_PATTERN = /^qinv_[A-Za-z0-9_-]+$/;
const SESSION_INVITE_TOKEN_PATTERN = /^qsinv_[A-Za-z0-9_-]{32,120}$/;

export function cleanQuipslyCallbackUrl(
  value: string | null | undefined,
) {
  const candidate = String(value || "").trim();
  if (
    !candidate.startsWith("/")
    || candidate.startsWith("//")
    || /[\\\u0000-\u001F\u007F]/.test(candidate)
  ) {
    return DEFAULT_QUIPSLY_CALLBACK_URL;
  }

  const base = new URL("https://quipsly.invalid");
  const parsed = new URL(candidate, base);
  if (parsed.origin !== base.origin) return DEFAULT_QUIPSLY_CALLBACK_URL;

  return `${parsed.pathname}${parsed.search}${parsed.hash}`;
}

export function cleanQuipslyInviteToken(
  value: string | null | undefined,
) {
  const candidate = String(value || "").trim();
  if (
    candidate.length > 160
    || !QUIPSLY_INVITE_TOKEN_PATTERN.test(candidate)
  ) {
    return "";
  }
  return candidate;
}

export function cleanSessionInviteToken(
  value: string | null | undefined,
) {
  const candidate = String(value || "").trim();
  if (
    candidate.length > 160
    || !SESSION_INVITE_TOKEN_PATTERN.test(candidate)
  ) {
    return "";
  }
  return candidate;
}

export function quipslyEmailActionSettings({
  origin,
  callbackUrl,
  inviteToken,
  sessionInviteToken,
  action,
}: {
  origin: string;
  callbackUrl?: string | null;
  inviteToken?: string | null;
  sessionInviteToken?: string | null;
  action: "verify" | "reset";
}) {
  let safeOrigin = "https://nest.quipsly.com";
  try {
    const candidate = new URL(origin);
    const isLoopbackHost = candidate.hostname === "localhost"
      || candidate.hostname === "127.0.0.1"
      || candidate.hostname === "[::1]";
    if (candidate.protocol === "https:" || (candidate.protocol === "http:" && isLoopbackHost)) {
      safeOrigin = candidate.origin;
    }
  } catch {
    // Keep the production Nest fallback.
  }

  const continueUrl = new URL("/login", safeOrigin);
  continueUrl.searchParams.set("emailAction", action);
  continueUrl.searchParams.set(
    "callbackUrl",
    cleanQuipslyCallbackUrl(callbackUrl),
  );
  const safeInviteToken = cleanQuipslyInviteToken(inviteToken);
  if (safeInviteToken) {
    continueUrl.searchParams.set("inviteToken", safeInviteToken);
  }
  const safeSessionInviteToken = cleanSessionInviteToken(sessionInviteToken);
  if (safeSessionInviteToken) {
    continueUrl.searchParams.set("sessionInviteToken", safeSessionInviteToken);
  }

  return {
    url: continueUrl.toString(),
    handleCodeInApp: false,
  };
}
