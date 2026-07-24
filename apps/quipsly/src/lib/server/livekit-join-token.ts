import { createHmac, randomUUID } from "node:crypto";

export const LIVEKIT_JOIN_TOKEN_TTL_SECONDS = 10 * 60;

type CreateLiveKitJoinTokenInput = {
  apiKey: string;
  apiSecret: string;
  identity: string;
  name?: string | null;
  roomName: string;
  metadata: Record<string, unknown>;
  ttlSeconds?: number | null;
  nowSeconds?: number | null;
  jti?: string | null;
};

function base64url(value: Buffer | string) {
  return Buffer.from(value).toString("base64url");
}

function parseTtlSeconds(value: number | null | undefined) {
  if (!Number.isFinite(value) || !value) return LIVEKIT_JOIN_TOKEN_TTL_SECONDS;
  return Math.min(Math.max(Math.trunc(value), 60), 60 * 60);
}

function parseNowSeconds(value: number | null | undefined) {
  return Number.isFinite(value) && value ? Math.trunc(value) : Math.floor(Date.now() / 1000);
}

export function createLiveKitJoinToken(input: CreateLiveKitJoinTokenInput) {
  const ttlSeconds = parseTtlSeconds(input.ttlSeconds);
  const nowSeconds = parseNowSeconds(input.nowSeconds);
  const expiresAtSeconds = nowSeconds + ttlSeconds;
  const header = { alg: "HS256", typ: "JWT" };
  const payload = {
    exp: expiresAtSeconds,
    iat: nowSeconds,
    iss: input.apiKey,
    jti: input.jti || randomUUID(),
    metadata: JSON.stringify(input.metadata),
    name: input.name || input.identity,
    nbf: nowSeconds - 5,
    sub: input.identity,
    video: {
      canPublish: true,
      canPublishData: true,
      canSubscribe: true,
      room: input.roomName,
      roomJoin: true,
    },
  };
  const unsigned = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(payload))}`;
  const signature = createHmac("sha256", input.apiSecret).update(unsigned).digest();

  return {
    token: `${unsigned}.${base64url(signature)}`,
    issuedAt: new Date(nowSeconds * 1000).toISOString(),
    expiresAt: new Date(expiresAtSeconds * 1000).toISOString(),
    expiresInSeconds: ttlSeconds,
    safeClaims: {
      identity: input.identity,
      jti: payload.jti,
      metadataKeys: Object.keys(input.metadata).sort(),
      roomName: input.roomName,
      roomJoin: true,
      canPublish: true,
      canPublishData: true,
      canSubscribe: true,
    },
  };
}

export function decodeLiveKitJoinTokenPayloadForTest(token: string) {
  const [, payload] = token.split(".");
  if (!payload) throw new Error("LiveKit token is missing a payload segment.");
  return JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as Record<string, unknown>;
}
