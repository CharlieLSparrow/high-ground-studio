const DEFAULT_QUIPSLY_CALLBACK_URL = "/projects";
const QUIPSLY_INVITE_TOKEN_PATTERN = /^qinv_[A-Za-z0-9_-]+$/;

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

export function quipslyEmailActionSettings({
  origin,
  callbackUrl,
  inviteToken,
  action,
}: {
  origin: string;
  callbackUrl?: string | null;
  inviteToken?: string | null;
  action: "verify" | "reset";
}) {
  let safeOrigin = "https://nest.quipsly.com";
  try {
    const candidate = new URL(origin);
    if (candidate.protocol === "https:" || candidate.hostname === "localhost") {
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

  return {
    url: continueUrl.toString(),
    handleCodeInApp: false,
  };
}
