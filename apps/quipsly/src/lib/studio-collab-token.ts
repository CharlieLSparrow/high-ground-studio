import { createHmac, timingSafeEqual } from "node:crypto";

export type StudioCollabActorId = "charlie" | "homer";

export type StudioCollabTokenPayload = {
  roomName: string;
  email: string;
  actorId: StudioCollabActorId;
  displayName: string;
  role: "editor";
  iat: number;
  exp: number;
};

function base64UrlEncode(value: string | Buffer) {
  return Buffer.from(value)
    .toString("base64url")
    .replace(/=+$/g, "");
}

function base64UrlJson(value: unknown) {
  return base64UrlEncode(JSON.stringify(value));
}

function signPayload(input: string, secret: string) {
  return createHmac("sha256", secret).update(input).digest("base64url");
}

export function signStudioCollabToken(
  payload: StudioCollabTokenPayload,
  secret: string,
) {
  const header = base64UrlJson({ alg: "HS256", typ: "JWT" });
  const body = base64UrlJson(payload);
  const unsigned = `${header}.${body}`;
  const signature = signPayload(unsigned, secret);

  return `${unsigned}.${signature}`;
}

export function verifyStudioCollabToken(
  token: string,
  secret: string,
  nowMs = Date.now(),
): StudioCollabTokenPayload | null {
  const parts = token.split(".");

  if (parts.length !== 3) {
    return null;
  }

  const [header, body, signature] = parts;
  const expected = signPayload(`${header}.${body}`, secret);
  const expectedBuffer = Buffer.from(expected);
  const signatureBuffer = Buffer.from(signature);

  if (
    expectedBuffer.length !== signatureBuffer.length ||
    !timingSafeEqual(expectedBuffer, signatureBuffer)
  ) {
    return null;
  }

  let payload: StudioCollabTokenPayload;

  try {
    payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
  } catch {
    return null;
  }

  if (
    typeof payload.roomName !== "string" ||
    typeof payload.email !== "string" ||
    (payload.actorId !== "charlie" && payload.actorId !== "homer") ||
    typeof payload.displayName !== "string" ||
    payload.role !== "editor" ||
    typeof payload.iat !== "number" ||
    typeof payload.exp !== "number"
  ) {
    return null;
  }

  if (payload.exp * 1000 <= nowMs) {
    return null;
  }

  return payload;
}

export function getStudioCollabActorForEmail(email: string): {
  actorId: StudioCollabActorId;
  displayName: string;
  color: string;
} {
  const normalized = email.trim().toLowerCase();

  if (
    normalized === "shomers@gmail.com" ||
    normalized === "homer@highgroundodyssey.com"
  ) {
    return {
      actorId: "homer",
      displayName: "Homer / Scott",
      color: "#94d47d",
    };
  }

  return {
    actorId: "charlie",
    displayName: "Charlie",
    color: "#74d4f6",
  };
}
