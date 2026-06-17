import { createHmac, timingSafeEqual } from "node:crypto";

type ImageProxyTokenValidationOptions = {
  nowMs?: number;
  ttlSeconds?: number;
};

function resolveImageProxyTokenSecret() {
  return process.env.REEFBALL_IMAGE_PROXY_TOKEN_SECRET?.trim() || "";
}

function formatPayload(projectSlug: string, expiryUnixSeconds: string) {
  return `${projectSlug}|${expiryUnixSeconds}`;
}

function buildSignature(message: string, secret: string) {
  return createHmac("sha256", secret).update(message).digest("hex");
}

export function createImageProxyToken(
  projectSlug: string,
  options: ImageProxyTokenValidationOptions = {},
) {
  const secret = resolveImageProxyTokenSecret();
  if (!secret) return "";
  const nowSeconds = Math.floor((options.nowMs ?? Date.now()) / 1000);
  const ttlSeconds = options.ttlSeconds ?? 60 * 60 * 12;
  const expiryUnixSeconds = String(nowSeconds + ttlSeconds);
  const payload = formatPayload(projectSlug, expiryUnixSeconds);
  const signature = buildSignature(payload, secret);
  return `${payload}|${signature}`;
}

export function isImageProxyTokenValid(
  projectSlug: string,
  token: string | null | undefined,
  options: ImageProxyTokenValidationOptions = {},
) {
  const secret = resolveImageProxyTokenSecret();
  if (!secret || !token) return false;
  const parts = token.split("|");
  if (parts.length !== 3) return false;

  const [tokenSlug, tokenExpiry, signature] = parts;
  if (tokenSlug !== projectSlug || !tokenExpiry || !signature) return false;

  const expiry = Number.parseInt(tokenExpiry, 10);
  if (!Number.isFinite(expiry)) return false;
  const nowSeconds = Math.floor((options.nowMs ?? Date.now()) / 1000);
  if (expiry < nowSeconds) return false;

  const expected = buildSignature(formatPayload(tokenSlug, tokenExpiry), secret);
  if (expected.length !== signature.length) return false;
  return timingSafeEqual(
    Buffer.from(expected, "hex"),
    Buffer.from(signature, "hex"),
  );
}
