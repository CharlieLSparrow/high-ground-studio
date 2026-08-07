import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
} from "node:crypto";

const TOKEN_AAD = Buffer.from(
  "quipsly-google-drive-refresh-token-v1",
  "utf8",
);

export function encryptGoogleDriveRefreshCredential(
  refreshToken: string,
  key: Buffer,
) {
  if (!refreshToken.trim() || key.length !== 32) {
    throw new Error("Google Drive refresh credential input is invalid.");
  }
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(TOKEN_AAD);
  const ciphertext = Buffer.concat([
    cipher.update(
      JSON.stringify({ version: 1, refreshToken: refreshToken.trim() }),
      "utf8",
    ),
    cipher.final(),
  ]);
  return [
    "drive-v1",
    iv.toString("base64url"),
    cipher.getAuthTag().toString("base64url"),
    ciphertext.toString("base64url"),
  ].join(".");
}

export function decryptGoogleDriveRefreshCredential(
  payload: string,
  key: Buffer,
) {
  const [version, iv, tag, ciphertext, ...remainder] = payload.split(".");
  if (
    key.length !== 32 ||
    version !== "drive-v1" ||
    !iv ||
    !tag ||
    !ciphertext ||
    remainder.length
  ) {
    throw new Error("Google Drive refresh credential is invalid.");
  }
  try {
    const decipher = createDecipheriv(
      "aes-256-gcm",
      key,
      Buffer.from(iv, "base64url"),
    );
    decipher.setAAD(TOKEN_AAD);
    decipher.setAuthTag(Buffer.from(tag, "base64url"));
    const decoded = JSON.parse(
      Buffer.concat([
        decipher.update(Buffer.from(ciphertext, "base64url")),
        decipher.final(),
      ]).toString("utf8"),
    ) as { version?: number; refreshToken?: string };
    if (decoded.version !== 1 || !decoded.refreshToken?.trim()) {
      throw new Error("invalid");
    }
    return decoded.refreshToken.trim();
  } catch {
    throw new Error("Google Drive refresh credential is invalid.");
  }
}

export async function refreshGoogleDriveWorkerAccessToken(input: {
  refreshToken: string;
  clientId: string;
  clientSecret: string;
  fetchImpl?: typeof fetch;
}) {
  if (
    !input.refreshToken.trim() ||
    !input.clientId.trim() ||
    !input.clientSecret.trim()
  ) {
    throw new Error("Google Drive worker OAuth configuration is incomplete.");
  }
  const response = await (input.fetchImpl ?? fetch)(
    "https://oauth2.googleapis.com/token",
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        refresh_token: input.refreshToken,
        client_id: input.clientId,
        client_secret: input.clientSecret,
        grant_type: "refresh_token",
      }),
    },
  );
  const body = (await response.json().catch(() => null)) as {
    access_token?: unknown;
    expires_in?: unknown;
    error?: unknown;
  } | null;
  if (!response.ok || typeof body?.access_token !== "string") {
    const providerCode =
      typeof body?.error === "string" ? body.error : `google-http-${response.status}`;
    throw new Error(`Google Drive token refresh failed: ${providerCode}`);
  }
  return {
    accessToken: body.access_token,
    expiresIn:
      Number.isSafeInteger(Number(body.expires_in)) && Number(body.expires_in) > 0
        ? Number(body.expires_in)
        : 3_600,
  };
}
