import "server-only";

import {
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";

import {
  decryptGoogleDriveRefreshCredential,
  encryptGoogleDriveRefreshCredential,
  refreshGoogleDriveWorkerAccessToken,
} from "@high-ground/quipsly-media-processing/google-drive-provider-credential";

import { resolveCalendarPublicOrigin } from "@/lib/server/calendar-public-origin";

export const GOOGLE_DRIVE_FILE_SCOPE = "https://www.googleapis.com/auth/drive.file";
export const GOOGLE_DRIVE_OAUTH_SCOPES = ["openid", "email", GOOGLE_DRIVE_FILE_SCOPE] as const;
export const GOOGLE_DRIVE_OAUTH_COOKIE = "quipsly_google_drive_oauth";
export const GOOGLE_DRIVE_OAUTH_MAX_AGE_SECONDS = 10 * 60;

export type GoogleDriveOAuthConfig = {
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
  returnTo: string;
};

export class GoogleDriveOAuthError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly status = 400,
  ) {
    super(message);
    this.name = "GoogleDriveOAuthError";
  }
}

function required(environment: NodeJS.ProcessEnv, name: string) {
  const value = environment[name]?.trim();
  if (!value) {
    throw new GoogleDriveOAuthError(
      "Google Drive connection is not configured yet.",
      `missing-${name.toLowerCase().replaceAll("_", "-")}`,
      503,
    );
  }
  return value;
}

function encryptionKey(value: string) {
  const decoded = Buffer.from(value, "base64url");
  if (decoded.length !== 32) {
    throw new GoogleDriveOAuthError(
      "Google Drive credential protection is not configured correctly.",
      "invalid-drive-oauth-encryption-key",
      503,
    );
  }
  return decoded;
}

export function normalizeGoogleDriveReturnTo(value: string | null | undefined) {
  const candidate = value?.trim() || "/projects";
  const parsed = new URL(candidate, "https://nest.quipsly.com");
  const allowedPath = parsed.pathname === "/projects" || /^\/nests\/[^/]+\/story$/.test(parsed.pathname);
  if (
    !candidate.startsWith("/") ||
    candidate.startsWith("//") ||
    candidate.includes("\\") ||
    candidate.includes("\0") ||
    parsed.origin !== "https://nest.quipsly.com" ||
    parsed.hash ||
    !allowedPath
  ) {
    throw new GoogleDriveOAuthError("The return destination is invalid.", "invalid-return-to");
  }
  return `${parsed.pathname}${parsed.search}`.slice(0, 2_000);
}

export function getGoogleDriveOAuthConfig(
  requestUrl: string,
  environment: NodeJS.ProcessEnv = process.env,
): GoogleDriveOAuthConfig {
  const stateSecret = required(environment, "GOOGLE_DRIVE_OAUTH_STATE_SECRET");
  if (Buffer.byteLength(stateSecret) < 32) {
    throw new GoogleDriveOAuthError(
      "Google Drive connection state protection is not configured correctly.",
      "weak-drive-oauth-state-secret",
      503,
    );
  }
  return {
    clientId: required(environment, "GOOGLE_DRIVE_OAUTH_CLIENT_ID"),
    clientSecret: required(environment, "GOOGLE_DRIVE_OAUTH_CLIENT_SECRET"),
    redirectUri: new URL(
      "/api/media/connections/google-drive/callback",
      resolveCalendarPublicOrigin(requestUrl, environment),
    ).toString(),
    stateSecret,
    encryptionKey: encryptionKey(required(environment, "GOOGLE_DRIVE_OAUTH_TOKEN_ENCRYPTION_KEY")),
  };
}

export function getGoogleDrivePickerPublicConfig(environment: NodeJS.ProcessEnv = process.env) {
  return {
    apiKey: required(environment, "GOOGLE_DRIVE_PICKER_API_KEY"),
    appId: required(environment, "GOOGLE_DRIVE_PICKER_APP_ID"),
  };
}

function sign(value: string, secret: string) {
  return createHmac("sha256", secret).update(value).digest("base64url");
}

function equalSignatures(left: string, right: string) {
  const leftBytes = Buffer.from(left);
  const rightBytes = Buffer.from(right);
  return leftBytes.length === rightBytes.length && timingSafeEqual(leftBytes, rightBytes);
}

export function beginGoogleDriveOAuth(input: {
  userId: string;
  requestUrl: string;
  returnTo?: string | null;
  environment?: NodeJS.ProcessEnv;
  now?: Date;
}) {
  const config = getGoogleDriveOAuthConfig(input.requestUrl, input.environment);
  const nonce = randomBytes(24).toString("base64url");
  const verifier = randomBytes(48).toString("base64url");
  const payload: OAuthState = {
    version: 1,
    userId: input.userId,
    nonce,
    expiresAt: (input.now ?? new Date()).getTime() + GOOGLE_DRIVE_OAUTH_MAX_AGE_SECONDS * 1_000,
    returnTo: normalizeGoogleDriveReturnTo(input.returnTo),
  };
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const state = `${encoded}.${sign(encoded, config.stateSecret)}`;
  const cookieBody = `${nonce}.${verifier}`;
  const cookieValue = `${cookieBody}.${sign(cookieBody, config.stateSecret)}`;
  const authorizationUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  authorizationUrl.search = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    response_type: "code",
    scope: GOOGLE_DRIVE_OAUTH_SCOPES.join(" "),
    access_type: "offline",
    include_granted_scopes: "true",
    prompt: "consent select_account",
    state,
    code_challenge: createHash("sha256").update(verifier).digest("base64url"),
    code_challenge_method: "S256",
  }).toString();
  return { authorizationUrl, cookieValue };
}

export function validateGoogleDriveOAuthCallback(input: {
  state: string;
  cookieValue: string;
  userId: string;
  requestUrl: string;
  environment?: NodeJS.ProcessEnv;
  now?: Date;
}) {
  const config = getGoogleDriveOAuthConfig(input.requestUrl, input.environment);
  const [encoded, stateSignature, ...stateRemainder] = input.state.split(".");
  if (!encoded || !stateSignature || stateRemainder.length || !equalSignatures(sign(encoded, config.stateSecret), stateSignature)) {
    throw new GoogleDriveOAuthError("The Google Drive connection request could not be verified.", "invalid-oauth-state");
  }
  let payload: OAuthState;
  try {
    payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as OAuthState;
  } catch {
    throw new GoogleDriveOAuthError("The Google Drive connection request could not be verified.", "invalid-oauth-state");
  }
  const [nonce, verifier, cookieSignature, ...cookieRemainder] = input.cookieValue.split(".");
  const cookieBody = `${nonce}.${verifier}`;
  if (
    !nonce ||
    !verifier ||
    !cookieSignature ||
    cookieRemainder.length ||
    payload.version !== 1 ||
    payload.userId !== input.userId ||
    payload.nonce !== nonce ||
    payload.expiresAt < (input.now ?? new Date()).getTime() ||
    !equalSignatures(sign(cookieBody, config.stateSecret), cookieSignature)
  ) {
    throw new GoogleDriveOAuthError("The Google Drive connection request expired or changed accounts.", "invalid-oauth-verifier");
  }
  return { config, verifier, returnTo: normalizeGoogleDriveReturnTo(payload.returnTo) };
}

async function googleJson<T>(url: string, init: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const body = await response.json().catch(() => null) as (T & { error?: unknown; error_description?: unknown }) | null;
  if (!response.ok || !body) {
    const code = body && typeof body.error === "string" ? body.error : `google-http-${response.status}`;
    throw new GoogleDriveOAuthError(
      code === "invalid_grant" ? "Google Drive access expired or was revoked. Connect it again." : "Google Drive could not verify the connection.",
      code,
      code === "invalid_grant" ? 409 : 502,
    );
  }
  return body;
}

export async function exchangeGoogleDriveCode(input: {
  code: string;
  verifier: string;
  config: GoogleDriveOAuthConfig;
}) {
  const token = await googleJson<{
    access_token: string;
    refresh_token?: string;
    expires_in?: number;
    scope?: string;
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
    throw new GoogleDriveOAuthError("Google did not return durable Drive access. Reconnect and approve offline access.", "missing-refresh-token", 409);
  }
  const grantedScopes = new Set((token.scope ?? "").split(/\s+/).filter(Boolean));
  if (grantedScopes.size && !grantedScopes.has(GOOGLE_DRIVE_FILE_SCOPE)) {
    throw new GoogleDriveOAuthError("The selected-file Drive permission is required.", "drive-scope-denied", 403);
  }
  return {
    accessToken: token.access_token,
    refreshToken: token.refresh_token,
    expiresIn: token.expires_in ?? 3_600,
    grantedScopes: grantedScopes.size ? [...grantedScopes] : [...GOOGLE_DRIVE_OAUTH_SCOPES],
  };
}

export async function fetchGoogleDriveIdentity(accessToken: string) {
  const identity = await googleJson<{ sub?: string; email?: string; email_verified?: boolean; name?: string }>(
    "https://openidconnect.googleapis.com/v1/userinfo",
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  if (!identity.sub || !identity.email || identity.email_verified !== true) {
    throw new GoogleDriveOAuthError("Google did not return a verified account identity.", "unverified-google-identity", 409);
  }
  return {
    subject: identity.sub,
    email: identity.email.trim().toLowerCase(),
    displayName: identity.name?.trim() || null,
  };
}

export function googleDriveProviderAccountKey(subject: string) {
  return `google-drive:${createHash("sha256").update(subject).digest("hex")}`;
}

export function encryptGoogleDriveRefreshToken(refreshToken: string, key: Buffer) {
  return encryptGoogleDriveRefreshCredential(refreshToken, key);
}

export function decryptGoogleDriveRefreshToken(payload: string, key: Buffer) {
  try {
    return decryptGoogleDriveRefreshCredential(payload, key);
  } catch {
    throw new GoogleDriveOAuthError("The saved Google Drive credential could not be read.", "invalid-encrypted-credential", 503);
  }
}

export async function refreshGoogleDriveAccess(input: {
  refreshToken: string;
  config: GoogleDriveOAuthConfig;
}) {
  try {
    return await refreshGoogleDriveWorkerAccessToken({
      refreshToken: input.refreshToken,
      clientId: input.config.clientId,
      clientSecret: input.config.clientSecret,
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : "";
    const invalidGrant = detail.includes("invalid_grant");
    throw new GoogleDriveOAuthError(
      invalidGrant
        ? "Google Drive access expired or was revoked. Connect it again."
        : "Google Drive could not verify the connection.",
      invalidGrant ? "invalid_grant" : "drive-token-refresh-failed",
      invalidGrant ? 409 : 502,
    );
  }
}

export async function revokeGoogleDriveToken(token: string) {
  const response = await fetch("https://oauth2.googleapis.com/revoke", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ token }),
  });
  if (response.ok) return "revoked" as const;
  if (response.status === 400) return "already-invalid" as const;
  throw new GoogleDriveOAuthError("Google Drive could not confirm revocation. Nothing was deleted in Quipsly.", "provider-revocation-failed", 502);
}
