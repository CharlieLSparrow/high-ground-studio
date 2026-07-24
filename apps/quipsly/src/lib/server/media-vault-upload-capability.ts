import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";

export const MEDIA_VAULT_UPLOAD_CAPABILITY_KIND = "quipsly-media-vault-upload-v1" as const;

export type MediaVaultUploadCapabilityPayload = {
  kind: typeof MEDIA_VAULT_UPLOAD_CAPABILITY_KIND;
  reservationId: string;
  requestId: string;
  actorUserId: string;
  actorEmail: string;
  projectId: string;
  projectSlug: string;
  bucketName: string;
  objectPath: string;
  contentType: string;
  expectedSizeBytes: number;
  expiresAt: number;
};

function capabilitySecret() {
  const secret = String(
    process.env.MEDIA_VAULT_UPLOAD_CAPABILITY_SECRET
      || process.env.AUTH_SECRET
      || process.env.NEXTAUTH_SECRET
      || "",
  );
  if (secret.length < 32) {
    throw new Error("A 32-character AUTH_SECRET or MEDIA_VAULT_UPLOAD_CAPABILITY_SECRET is required.");
  }
  return secret;
}

function signature(encodedPayload: string) {
  return createHmac("sha256", capabilitySecret())
    .update(encodedPayload)
    .digest("base64url");
}

export function issueMediaVaultUploadCapability(
  payload: Omit<MediaVaultUploadCapabilityPayload, "kind">,
) {
  const encodedPayload = Buffer.from(JSON.stringify({
    kind: MEDIA_VAULT_UPLOAD_CAPABILITY_KIND,
    ...payload,
    actorEmail: payload.actorEmail.trim().toLowerCase(),
  } satisfies MediaVaultUploadCapabilityPayload)).toString("base64url");
  return `${encodedPayload}.${signature(encodedPayload)}`;
}

export function verifyMediaVaultUploadCapability(input: {
  capability: string;
  actorUserId: string;
  actorEmail: string;
  projectId: string;
  projectSlug: string;
  bucketName: string;
  objectPath: string;
  expectedSizeBytes: number;
  now?: number;
}) {
  const [encodedPayload, suppliedSignature, ...extra] = input.capability.split(".");
  if (!encodedPayload || !suppliedSignature || extra.length > 0) {
    return { ok: false as const, error: "Upload capability is malformed." };
  }

  let expectedSignature: string;
  try {
    expectedSignature = signature(encodedPayload);
  } catch (error) {
    return {
      ok: false as const,
      error: error instanceof Error ? error.message : "Upload capability signing is unavailable.",
    };
  }
  const supplied = Buffer.from(suppliedSignature);
  const expected = Buffer.from(expectedSignature);
  if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) {
    return { ok: false as const, error: "Upload capability signature is invalid." };
  }

  let payload: MediaVaultUploadCapabilityPayload;
  try {
    payload = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8"));
  } catch {
    return { ok: false as const, error: "Upload capability payload is invalid." };
  }
  const now = input.now ?? Date.now();
  const matches =
    payload.kind === MEDIA_VAULT_UPLOAD_CAPABILITY_KIND
    && typeof payload.reservationId === "string"
    && /^[a-z0-9_-]{8,128}$/i.test(payload.reservationId)
    && typeof payload.requestId === "string"
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(payload.requestId)
    && payload.actorUserId === input.actorUserId
    && payload.actorEmail === input.actorEmail.trim().toLowerCase()
    && payload.projectId === input.projectId
    && payload.projectSlug === input.projectSlug
    && payload.bucketName === input.bucketName
    && payload.objectPath === input.objectPath
    && Number.isSafeInteger(payload.expectedSizeBytes)
    && payload.expectedSizeBytes > 0
    && payload.expectedSizeBytes === input.expectedSizeBytes
    && Number.isFinite(payload.expiresAt)
    && payload.expiresAt >= now
    && payload.expiresAt <= now + 60 * 60 * 1_000;
  if (!matches) {
    return { ok: false as const, error: "Upload capability does not match this actor, Nest, object, or validity window." };
  }
  return { ok: true as const, payload };
}
