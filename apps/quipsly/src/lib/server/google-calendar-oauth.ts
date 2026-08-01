import "server-only";

import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";

import { resolveCalendarPublicOrigin } from "@/lib/server/calendar-public-origin";

export const GOOGLE_CALENDAR_LIST_SCOPE =
  "https://www.googleapis.com/auth/calendar.calendarlist.readonly";
export const GOOGLE_OWNED_EVENTS_SCOPE =
  "https://www.googleapis.com/auth/calendar.events.owned";
export const GOOGLE_CALENDAR_OAUTH_SCOPES = [
  GOOGLE_CALENDAR_LIST_SCOPE,
  GOOGLE_OWNED_EVENTS_SCOPE,
] as const;

export const GOOGLE_CALENDAR_OAUTH_COOKIE = "quipsly_google_calendar_oauth";
export const GOOGLE_CALENDAR_OAUTH_MAX_AGE_SECONDS = 10 * 60;

type OAuthConfig = {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  stateSecret: string;
  encryptionKey: Buffer;
};

type OAuthState = {
  version: 1;
  userId: string;
  nonce: string;
  expiresAt: number;
  returnTo: "/schedule";
};

export type GoogleCalendarChoice = {
  id: string;
  summary: string;
  primary: boolean;
  accessRole: string;
  timeZone: string | null;
};

export class GoogleCalendarOAuthError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly status = 400,
  ) {
    super(message);
  }
}

function required(environment: NodeJS.ProcessEnv, name: string) {
  const value = environment[name]?.trim();
  if (!value) {
    throw new GoogleCalendarOAuthError(
      "Google Calendar connection is not configured yet.",
      `missing-${name.toLowerCase().replaceAll("_", "-")}`,
      503,
    );
  }
  return value;
}

function encryptionKey(value: string) {
  let decoded: Buffer;
  try {
    decoded = Buffer.from(value, "base64url");
  } catch {
    decoded = Buffer.alloc(0);
  }
  if (decoded.length !== 32) {
    throw new GoogleCalendarOAuthError(
      "Google Calendar credential protection is not configured correctly.",
      "invalid-calendar-oauth-encryption-key",
      503,
    );
  }
  return decoded;
}

export function getGoogleCalendarOAuthConfig(
  requestUrl: string,
  environment: NodeJS.ProcessEnv = process.env,
): OAuthConfig {
  const origin = resolveCalendarPublicOrigin(requestUrl, environment);
  const stateSecret = required(environment, "GOOGLE_CALENDAR_OAUTH_STATE_SECRET");
  if (Buffer.byteLength(stateSecret) < 32) {
    throw new GoogleCalendarOAuthError(
      "Google Calendar connection state protection is not configured correctly.",
      "weak-calendar-oauth-state-secret",
      503,
    );
  }
  return {
    clientId: required(environment, "GOOGLE_CALENDAR_OAUTH_CLIENT_ID"),
    clientSecret: required(environment, "GOOGLE_CALENDAR_OAUTH_CLIENT_SECRET"),
    redirectUri: new URL(
      "/api/calendar/connections/google/callback",
      origin,
    ).toString(),
    stateSecret,
    encryptionKey: encryptionKey(
      required(environment, "GOOGLE_CALENDAR_OAUTH_TOKEN_ENCRYPTION_KEY"),
    ),
  };
}

function sign(value: string, secret: string) {
  return createHmac("sha256", secret).update(value).digest("base64url");
}

function equalSignatures(left: string, right: string) {
  const leftBytes = Buffer.from(left);
  const rightBytes = Buffer.from(right);
  return (
    leftBytes.length === rightBytes.length &&
    timingSafeEqual(leftBytes, rightBytes)
  );
}

export function beginGoogleCalendarOAuth(input: {
  userId: string;
  requestUrl: string;
  environment?: NodeJS.ProcessEnv;
  now?: Date;
}) {
  const config = getGoogleCalendarOAuthConfig(
    input.requestUrl,
    input.environment,
  );
  const nonce = randomBytes(24).toString("base64url");
  const verifier = randomBytes(48).toString("base64url");
  const statePayload: OAuthState = {
    version: 1,
    userId: input.userId,
    nonce,
    expiresAt:
      (input.now ?? new Date()).getTime() +
      GOOGLE_CALENDAR_OAUTH_MAX_AGE_SECONDS * 1000,
    returnTo: "/schedule",
  };
  const encodedState = Buffer.from(JSON.stringify(statePayload)).toString(
    "base64url",
  );
  const state = `${encodedState}.${sign(encodedState, config.stateSecret)}`;
  const cookieBody = `${nonce}.${verifier}`;
  const cookieValue = `${cookieBody}.${sign(cookieBody, config.stateSecret)}`;
  const challenge = createHash("sha256")
    .update(verifier)
    .digest("base64url");
  const authorizationUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  authorizationUrl.search = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    response_type: "code",
    scope: GOOGLE_CALENDAR_OAUTH_SCOPES.join(" "),
    access_type: "offline",
    include_granted_scopes: "true",
    prompt: "consent select_account",
    state,
    code_challenge: challenge,
    code_challenge_method: "S256",
  }).toString();
  return { authorizationUrl, cookieValue };
}

export function validateGoogleCalendarOAuthCallback(input: {
  state: string;
  cookieValue: string;
  userId: string;
  requestUrl: string;
  environment?: NodeJS.ProcessEnv;
  now?: Date;
}) {
  const config = getGoogleCalendarOAuthConfig(
    input.requestUrl,
    input.environment,
  );
  const [encodedState, stateSignature, ...stateRemainder] = input.state.split(".");
  if (
    !encodedState ||
    !stateSignature ||
    stateRemainder.length > 0 ||
    !equalSignatures(sign(encodedState, config.stateSecret), stateSignature)
  ) {
    throw new GoogleCalendarOAuthError(
      "The Google Calendar connection request could not be verified.",
      "invalid-oauth-state",
    );
  }
  let payload: OAuthState;
  try {
    payload = JSON.parse(
      Buffer.from(encodedState, "base64url").toString("utf8"),
    ) as OAuthState;
  } catch {
    throw new GoogleCalendarOAuthError(
      "The Google Calendar connection request could not be verified.",
      "invalid-oauth-state",
    );
  }
  const cookieParts = input.cookieValue.split(".");
  if (cookieParts.length !== 3) {
    throw new GoogleCalendarOAuthError(
      "The Google Calendar connection request expired. Start again from Calendar.",
      "missing-oauth-verifier",
    );
  }
  const [nonce, verifier, cookieSignature] = cookieParts;
  const cookieBody = `${nonce}.${verifier}`;
  if (
    payload.version !== 1 ||
    payload.returnTo !== "/schedule" ||
    payload.userId !== input.userId ||
    payload.nonce !== nonce ||
    payload.expiresAt < (input.now ?? new Date()).getTime() ||
    !equalSignatures(sign(cookieBody, config.stateSecret), cookieSignature)
  ) {
    throw new GoogleCalendarOAuthError(
      "The Google Calendar connection request expired or changed accounts. Start again from Calendar.",
      "invalid-oauth-verifier",
    );
  }
  return { config, verifier };
}

async function googleJson<T>(url: string, init: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const body = (await response.json().catch(() => null)) as
    | (T & { error?: unknown; error_description?: unknown })
    | null;
  if (!response.ok || !body) {
    const providerCode =
      body && typeof body.error === "string" ? body.error : "provider-error";
    throw new GoogleCalendarOAuthError(
      providerCode === "invalid_grant"
        ? "Google Calendar access expired or was revoked. Connect it again."
        : "Google Calendar could not verify the connection.",
      providerCode,
      providerCode === "invalid_grant" ? 409 : 502,
    );
  }
  return body;
}

export async function exchangeGoogleCalendarCode(input: {
  code: string;
  verifier: string;
  config: OAuthConfig;
}) {
  const token = await googleJson<{
    access_token: string;
    refresh_token?: string;
    expires_in?: number;
    scope?: string;
    token_type?: string;
  }>("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code: input.code,
      client_id: input.config.clientId,
      client_secret: input.config.clientSecret,
      redirect_uri: input.config.redirectUri,
      grant_type: "authorization_code",
      code_verifier: input.verifier,
    }),
  });
  if (!token.refresh_token) {
    throw new GoogleCalendarOAuthError(
      "Google did not return durable Calendar access. Reconnect and approve offline access.",
      "missing-refresh-token",
      409,
    );
  }
  const grantedScopes = new Set((token.scope ?? "").split(/\s+/).filter(Boolean));
  if (
    grantedScopes.size > 0 &&
    GOOGLE_CALENDAR_OAUTH_SCOPES.some((scope) => !grantedScopes.has(scope))
  ) {
    throw new GoogleCalendarOAuthError(
      "Both requested Calendar permissions are required to finish this connection.",
      "calendar-scopes-denied",
      403,
    );
  }
  return {
    accessToken: token.access_token,
    refreshToken: token.refresh_token,
    grantedScopes: grantedScopes.size > 0
      ? [...grantedScopes]
      : [...GOOGLE_CALENDAR_OAUTH_SCOPES],
  };
}

export async function refreshGoogleCalendarAccess(input: {
  refreshToken: string;
  config: OAuthConfig;
}) {
  const token = await googleJson<{ access_token: string }>(
    "https://oauth2.googleapis.com/token",
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        refresh_token: input.refreshToken,
        client_id: input.config.clientId,
        client_secret: input.config.clientSecret,
        grant_type: "refresh_token",
      }),
    },
  );
  return token.access_token;
}

export async function listOwnedGoogleCalendars(accessToken: string) {
  const result = await googleJson<{
    items?: Array<{
      id?: string;
      summary?: string;
      primary?: boolean;
      accessRole?: string;
      timeZone?: string;
      deleted?: boolean;
    }>;
  }>("https://www.googleapis.com/calendar/v3/users/me/calendarList?minAccessRole=owner&showDeleted=false", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  return (result.items ?? []).flatMap((calendar): GoogleCalendarChoice[] => {
    if (
      calendar.deleted ||
      !calendar.id ||
      !calendar.summary ||
      calendar.accessRole !== "owner"
    ) return [];
    return [{
      id: calendar.id,
      summary: calendar.summary,
      primary: calendar.primary === true,
      accessRole: calendar.accessRole,
      timeZone: calendar.timeZone?.trim() || null,
    }];
  }).sort((left, right) => Number(right.primary) - Number(left.primary) || left.summary.localeCompare(right.summary));
}

export function googleProviderAccountKey(primaryCalendarId: string) {
  return `google:${createHash("sha256").update(primaryCalendarId.trim().toLowerCase()).digest("hex")}`;
}

export function encryptGoogleRefreshToken(
  refreshToken: string,
  key: Buffer,
) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([
    cipher.update(JSON.stringify({ version: 1, refreshToken }), "utf8"),
    cipher.final(),
  ]);
  return [
    "v1",
    iv.toString("base64url"),
    cipher.getAuthTag().toString("base64url"),
    ciphertext.toString("base64url"),
  ].join(".");
}

export function decryptGoogleRefreshToken(payload: string, key: Buffer) {
  const [version, iv, authTag, ciphertext, ...remainder] = payload.split(".");
  if (version !== "v1" || !iv || !authTag || !ciphertext || remainder.length) {
    throw new GoogleCalendarOAuthError(
      "The saved Google Calendar credential could not be read.",
      "invalid-encrypted-credential",
      503,
    );
  }
  try {
    const decipher = createDecipheriv(
      "aes-256-gcm",
      key,
      Buffer.from(iv, "base64url"),
    );
    decipher.setAuthTag(Buffer.from(authTag, "base64url"));
    const decoded = JSON.parse(
      Buffer.concat([
        decipher.update(Buffer.from(ciphertext, "base64url")),
        decipher.final(),
      ]).toString("utf8"),
    ) as { version?: number; refreshToken?: string };
    if (decoded.version !== 1 || !decoded.refreshToken) throw new Error("invalid");
    return decoded.refreshToken;
  } catch {
    throw new GoogleCalendarOAuthError(
      "The saved Google Calendar credential could not be read.",
      "invalid-encrypted-credential",
      503,
    );
  }
}

export async function revokeGoogleCalendarToken(token: string) {
  const response = await fetch("https://oauth2.googleapis.com/revoke", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ token }),
  });
  if (response.ok) return "revoked" as const;
  // Google returns 400 when a token is already invalid. Local credential
  // deletion is still the correct completion of an explicit disconnect.
  if (response.status === 400) return "already-invalid" as const;
  {
    throw new GoogleCalendarOAuthError(
      "Google Calendar could not confirm revocation. Nothing was deleted in Quipsly.",
      "provider-revocation-failed",
      502,
    );
  }
}
