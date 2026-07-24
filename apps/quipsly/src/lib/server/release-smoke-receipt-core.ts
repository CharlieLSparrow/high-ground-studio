import { createHmac, timingSafeEqual } from "node:crypto";

export const RELEASE_SMOKE_RECEIPT_VERSION = 1 as const;
export const RELEASE_SMOKE_RECEIPT_PREFIX = "qsr1";
export const RELEASE_SMOKE_RECEIPT_HEADER = "x-quipsly-release-smoke-receipt";
export const RELEASE_SMOKE_RECEIPT_MAX_AGE_MS = 5 * 60 * 1000;
export const RELEASE_SMOKE_RECEIPT_DEFAULT_TTL_MS = 2 * 60 * 1000;
export const RELEASE_SMOKE_RECEIPT_MAX_TOKEN_BYTES = 12_000;
export const RELEASE_SMOKE_RECEIPT_MIN_SECRET_BYTES = 32;
export const RELEASE_SMOKE_RECEIPT_MAX_SECRET_BYTES = 4_096;

export const RELEASE_SMOKE_REQUIRED_ROUTE_IDS = [
  "health.compatibility",
  "health.release",
  "schema.production-core",
  "auth.session-boundary",
  "auth.signed-in-journey",
  "nest.projects",
  "nest.index",
  "writing.create",
  "editor.timeline",
  "recording.capture",
  "research.library",
  "publishing.runway",
  "outputs.catalog",
  "art.foundry",
  "beta.dashboard",
] as const;

export const RELEASE_SMOKE_VERIFIED_CHECK_IDS = [
  "nest-project-system",
  "living-document-editor",
  "recording-editor-spine",
  "source-aware-research",
  "auth-session-boundary",
  "publishing-packets",
] as const;

const MAX_HOSTS = 8;
const MAX_ROUTE_IDS = 64;
const MAX_HOST_LENGTH = 253;
const MAX_ROUTE_ID_LENGTH = 200;
const MAX_REVISION_LENGTH = 128;
const HMAC_BYTES = 32;

export type ReleaseSmokeReceiptPayload = {
  version: typeof RELEASE_SMOKE_RECEIPT_VERSION;
  revision: string;
  checkedAt: string;
  expiresAt: string;
  hosts: string[];
  passedRouteIds: string[];
};

export type ReleaseSmokeReceiptValidation =
  | {
      ok: true;
      code: "RELEASE_SMOKE_RECEIPT_VALID";
      reason: string;
      payload: ReleaseSmokeReceiptPayload;
    }
  | {
      ok: false;
      code:
        | "RELEASE_SMOKE_RECEIPT_MISSING"
        | "RELEASE_SMOKE_SECRET_MISSING"
        | "RELEASE_SMOKE_SECRET_INVALID"
        | "RELEASE_SMOKE_CONTEXT_INVALID"
        | "RELEASE_SMOKE_RECEIPT_MALFORMED"
        | "RELEASE_SMOKE_RECEIPT_SIGNATURE_INVALID"
        | "RELEASE_SMOKE_RECEIPT_PAYLOAD_INVALID"
        | "RELEASE_SMOKE_RECEIPT_EXPIRED"
        | "RELEASE_SMOKE_RECEIPT_REVISION_MISMATCH"
        | "RELEASE_SMOKE_RECEIPT_HOST_MISMATCH"
        | "RELEASE_SMOKE_RECEIPT_ROUTES_INCOMPLETE";
      reason: string;
      payload: null;
    };

function failure(
  code: Exclude<ReleaseSmokeReceiptValidation, { ok: true }>["code"],
  reason: string,
): ReleaseSmokeReceiptValidation {
  return { ok: false, code, reason, payload: null };
}

function canonicalStrings(values: string[]) {
  return [...new Set(values)].sort((left, right) => (
    left < right ? -1 : left > right ? 1 : 0
  ));
}

function arraysEqual(left: string[], right: string[]) {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function validHostname(host: string) {
  if (!host || host.length > MAX_HOST_LENGTH || host !== host.toLowerCase()) return false;
  if (host.includes("..") || host.startsWith(".") || host.endsWith(".")) return false;
  return host.split(".").every(
    (label) => label.length >= 1
      && label.length <= 63
      && /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(label),
  );
}

function validRouteId(routeId: string) {
  return routeId.length >= 1
    && routeId.length <= MAX_ROUTE_ID_LENGTH
    && /^[a-z0-9][a-z0-9._:/?=&-]*$/.test(routeId);
}

function validRevision(revision: string) {
  return revision.length >= 1
    && revision.length <= MAX_REVISION_LENGTH
    && /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(revision);
}

function validateSecret(secret: string | null | undefined) {
  if (!secret) {
    return failure(
      "RELEASE_SMOKE_SECRET_MISSING",
      "QUIPSLY_RELEASE_SMOKE_SECRET is not configured for receipt validation.",
    );
  }

  const byteLength = Buffer.byteLength(secret, "utf8");
  if (
    byteLength < RELEASE_SMOKE_RECEIPT_MIN_SECRET_BYTES
    || byteLength > RELEASE_SMOKE_RECEIPT_MAX_SECRET_BYTES
    || secret.trim() !== secret
    || /[\u0000-\u001f\u007f]/.test(secret)
  ) {
    return failure(
      "RELEASE_SMOKE_SECRET_INVALID",
      `QUIPSLY_RELEASE_SMOKE_SECRET must be ${RELEASE_SMOKE_RECEIPT_MIN_SECRET_BYTES}-${RELEASE_SMOKE_RECEIPT_MAX_SECRET_BYTES} UTF-8 bytes.`,
    );
  }

  return null;
}

export function isReleaseSmokeSecretValid(secret: string | null | undefined) {
  return validateSecret(secret) === null;
}

function validateCanonicalPayloadShape(value: unknown): ReleaseSmokeReceiptPayload | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const payload = value as Record<string, unknown>;
  const keys = Object.keys(payload).sort();
  const expectedKeys = [
    "checkedAt",
    "expiresAt",
    "hosts",
    "passedRouteIds",
    "revision",
    "version",
  ];
  if (!arraysEqual(keys, expectedKeys)) return null;
  if (payload.version !== RELEASE_SMOKE_RECEIPT_VERSION) return null;
  if (typeof payload.revision !== "string" || !validRevision(payload.revision)) return null;
  if (typeof payload.checkedAt !== "string" || typeof payload.expiresAt !== "string") return null;
  if (!Array.isArray(payload.hosts) || !Array.isArray(payload.passedRouteIds)) return null;
  if (payload.hosts.length < 1 || payload.hosts.length > MAX_HOSTS) return null;
  if (payload.passedRouteIds.length < 1 || payload.passedRouteIds.length > MAX_ROUTE_IDS) return null;
  if (!payload.hosts.every((host) => typeof host === "string" && validHostname(host))) return null;
  if (!payload.passedRouteIds.every((routeId) => typeof routeId === "string" && validRouteId(routeId))) return null;

  const hosts = payload.hosts as string[];
  const passedRouteIds = payload.passedRouteIds as string[];
  if (!arraysEqual(hosts, canonicalStrings(hosts))) return null;
  if (!arraysEqual(passedRouteIds, canonicalStrings(passedRouteIds))) return null;

  return {
    version: RELEASE_SMOKE_RECEIPT_VERSION,
    revision: payload.revision,
    checkedAt: payload.checkedAt,
    expiresAt: payload.expiresAt,
    hosts,
    passedRouteIds,
  };
}

function signatureFor(prefixAndPayload: string, secret: string) {
  return createHmac("sha256", secret).update(prefixAndPayload, "utf8").digest();
}

function constantTimeSignatureMatches(expected: Buffer, supplied: Buffer) {
  const fixedLengthSupplied = Buffer.alloc(HMAC_BYTES);
  supplied.copy(fixedLengthSupplied, 0, 0, Math.min(supplied.length, HMAC_BYTES));
  const bytesMatch = timingSafeEqual(expected, fixedLengthSupplied);
  return supplied.length === HMAC_BYTES && bytesMatch;
}

export function createReleaseSmokeReceiptToken(options: {
  secret: string | null | undefined;
  revision: string;
  hosts: string[];
  passedRouteIds: string[];
  checkedAt?: Date;
  ttlMs?: number;
}) {
  const secretFailure = validateSecret(options.secret);
  if (secretFailure) throw new Error(secretFailure.reason);
  if (!validRevision(options.revision)) throw new Error("Release-smoke revision is invalid.");

  const hosts = canonicalStrings(options.hosts);
  const passedRouteIds = canonicalStrings(options.passedRouteIds);
  if (hosts.length < 1 || hosts.length > MAX_HOSTS || !hosts.every(validHostname)) {
    throw new Error("Release-smoke hosts are invalid or exceed the receipt bound.");
  }
  if (
    passedRouteIds.length < 1
    || passedRouteIds.length > MAX_ROUTE_IDS
    || !passedRouteIds.every(validRouteId)
  ) {
    throw new Error("Release-smoke route IDs are invalid or exceed the receipt bound.");
  }

  const ttlMs = options.ttlMs ?? RELEASE_SMOKE_RECEIPT_DEFAULT_TTL_MS;
  if (!Number.isInteger(ttlMs) || ttlMs < 1_000 || ttlMs > RELEASE_SMOKE_RECEIPT_MAX_AGE_MS) {
    throw new Error("Release-smoke receipt TTL is outside the allowed bound.");
  }
  const checkedAt = options.checkedAt ?? new Date();
  if (!Number.isFinite(checkedAt.getTime())) throw new Error("Release-smoke checkedAt is invalid.");

  const payload: ReleaseSmokeReceiptPayload = {
    version: RELEASE_SMOKE_RECEIPT_VERSION,
    revision: options.revision,
    checkedAt: checkedAt.toISOString(),
    expiresAt: new Date(checkedAt.getTime() + ttlMs).toISOString(),
    hosts,
    passedRouteIds,
  };
  const payloadSegment = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const signedContent = `${RELEASE_SMOKE_RECEIPT_PREFIX}.${payloadSegment}`;
  const signatureSegment = signatureFor(signedContent, options.secret as string).toString("base64url");
  const token = `${signedContent}.${signatureSegment}`;
  if (Buffer.byteLength(token, "utf8") > RELEASE_SMOKE_RECEIPT_MAX_TOKEN_BYTES) {
    throw new Error("Release-smoke receipt exceeds the token-size bound.");
  }
  return token;
}

export function validateReleaseSmokeReceiptToken(options: {
  token: string | null | undefined;
  secret: string | null | undefined;
  expectedRevision: string | null | undefined;
  expectedHosts: string[];
  requiredRouteIds?: readonly string[];
  now?: Date;
}): ReleaseSmokeReceiptValidation {
  if (!options.token) {
    return failure("RELEASE_SMOKE_RECEIPT_MISSING", "No release-smoke receipt header was supplied.");
  }
  const secretFailure = validateSecret(options.secret);
  if (secretFailure) return secretFailure;
  if (!options.expectedRevision || !validRevision(options.expectedRevision)) {
    return failure(
      "RELEASE_SMOKE_CONTEXT_INVALID",
      "The serving runtime does not expose a valid revision for receipt binding.",
    );
  }

  const expectedHosts = canonicalStrings(options.expectedHosts);
  if (
    expectedHosts.length < 1
    || expectedHosts.length > MAX_HOSTS
    || !expectedHosts.every(validHostname)
  ) {
    return failure(
      "RELEASE_SMOKE_CONTEXT_INVALID",
      "The serving runtime does not expose a valid configured host set.",
    );
  }
  const requiredRouteIds = canonicalStrings([
    ...(options.requiredRouteIds ?? RELEASE_SMOKE_REQUIRED_ROUTE_IDS),
    ...expectedHosts.map((host) => `public-host:${host}`),
  ]);
  if (requiredRouteIds.length > MAX_ROUTE_IDS || !requiredRouteIds.every(validRouteId)) {
    return failure(
      "RELEASE_SMOKE_CONTEXT_INVALID",
      "The serving runtime has an invalid required route set.",
    );
  }

  if (Buffer.byteLength(options.token, "utf8") > RELEASE_SMOKE_RECEIPT_MAX_TOKEN_BYTES) {
    return failure("RELEASE_SMOKE_RECEIPT_MALFORMED", "Release-smoke receipt is malformed or too large.");
  }
  const segments = options.token.split(".");
  if (
    segments.length !== 3
    || segments[0] !== RELEASE_SMOKE_RECEIPT_PREFIX
    || !/^[A-Za-z0-9_-]+$/.test(segments[1] ?? "")
    || !/^[A-Za-z0-9_-]+$/.test(segments[2] ?? "")
  ) {
    return failure("RELEASE_SMOKE_RECEIPT_MALFORMED", "Release-smoke receipt is malformed.");
  }

  const signedContent = `${segments[0]}.${segments[1]}`;
  let suppliedSignature: Buffer;
  try {
    suppliedSignature = Buffer.from(segments[2], "base64url");
  } catch {
    return failure("RELEASE_SMOKE_RECEIPT_MALFORMED", "Release-smoke receipt signature is malformed.");
  }
  const expectedSignature = signatureFor(signedContent, options.secret as string);
  if (!constantTimeSignatureMatches(expectedSignature, suppliedSignature)) {
    return failure(
      "RELEASE_SMOKE_RECEIPT_SIGNATURE_INVALID",
      "Release-smoke receipt signature is invalid.",
    );
  }

  let decodedPayload: unknown;
  try {
    decodedPayload = JSON.parse(Buffer.from(segments[1], "base64url").toString("utf8"));
  } catch {
    return failure("RELEASE_SMOKE_RECEIPT_PAYLOAD_INVALID", "Release-smoke receipt payload is invalid.");
  }
  const payload = validateCanonicalPayloadShape(decodedPayload);
  if (!payload) {
    return failure("RELEASE_SMOKE_RECEIPT_PAYLOAD_INVALID", "Release-smoke receipt payload is invalid.");
  }
  const canonicalPayloadSegment = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  if (segments[1] !== canonicalPayloadSegment) {
    return failure(
      "RELEASE_SMOKE_RECEIPT_PAYLOAD_INVALID",
      "Release-smoke receipt payload is not canonically encoded.",
    );
  }

  const nowMs = (options.now ?? new Date()).getTime();
  const checkedAtMs = Date.parse(payload.checkedAt);
  const expiresAtMs = Date.parse(payload.expiresAt);
  if (
    !Number.isFinite(nowMs)
    || !Number.isFinite(checkedAtMs)
    || !Number.isFinite(expiresAtMs)
    || new Date(checkedAtMs).toISOString() !== payload.checkedAt
    || new Date(expiresAtMs).toISOString() !== payload.expiresAt
    || checkedAtMs > nowMs + 60_000
    || expiresAtMs <= checkedAtMs
    || expiresAtMs - checkedAtMs > RELEASE_SMOKE_RECEIPT_MAX_AGE_MS
    || nowMs >= expiresAtMs
    || nowMs - checkedAtMs > RELEASE_SMOKE_RECEIPT_MAX_AGE_MS
  ) {
    return failure("RELEASE_SMOKE_RECEIPT_EXPIRED", "Release-smoke receipt is expired or outside its time bound.");
  }
  if (payload.revision !== options.expectedRevision) {
    return failure(
      "RELEASE_SMOKE_RECEIPT_REVISION_MISMATCH",
      "Release-smoke receipt does not match the serving revision.",
    );
  }
  if (!arraysEqual(payload.hosts, expectedHosts)) {
    return failure(
      "RELEASE_SMOKE_RECEIPT_HOST_MISMATCH",
      "Release-smoke receipt does not match the configured host set.",
    );
  }
  const passedRoutes = new Set(payload.passedRouteIds);
  if (requiredRouteIds.some((routeId) => !passedRoutes.has(routeId))) {
    return failure(
      "RELEASE_SMOKE_RECEIPT_ROUTES_INCOMPLETE",
      "Release-smoke receipt does not include every required route and public-host check.",
    );
  }

  return {
    ok: true,
    code: "RELEASE_SMOKE_RECEIPT_VALID",
    reason: "A fresh HMAC-signed release-smoke receipt matches this revision, host set, and required route set.",
    payload,
  };
}
