import "server-only";

import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

import type { Prisma } from "@prisma/client";

import { adminAuth } from "@/lib/firebase/firebase-admin";
import { getPrismaClient } from "@/lib/prisma";
import { QUIPSLY_FIREBASE_IDENTITY_AUTHORITY } from "@/lib/server/studio-user-identity";

const AUTH_CODE_TTL_MS = 5 * 60 * 1_000;
const DEFAULT_CALLBACK_SCHEME = "quipslymac";
const STATE_PATTERN = /^[A-Za-z0-9_-]{43,128}$/;
const CODE_PATTERN = /^qmac_[A-Za-z0-9_-]{43,128}$/;

type BrowserIdentity = {
  id: string;
  firebaseUid: string;
  primaryEmail: string;
  name: string | null;
};

type HandoffMetadata = {
  schema: "quipsly-mac-firebase-handoff/v1";
  firebaseUid: string;
  codeChallenge: string;
  source: string;
  userAgent?: string;
};

export class MacFirebaseHandoffError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, message: string, status = 400) {
    super(message);
    this.name = "MacFirebaseHandoffError";
    this.code = code;
    this.status = status;
  }
}

function hashSecret(value: string) {
  return createHash("sha256").update(value).digest("base64url");
}

function randomCode() {
  return `qmac_${randomBytes(32).toString("base64url")}`;
}

function safeEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return (
    leftBuffer.length === rightBuffer.length
    && timingSafeEqual(leftBuffer, rightBuffer)
  );
}

export function allowedMacCallbackSchemes() {
  return new Set([
    DEFAULT_CALLBACK_SCHEME,
    ...(process.env.QUIPSLY_MAC_CALLBACK_SCHEMES ?? "")
      .split(",")
      .map((entry) => entry.trim().toLowerCase())
      .filter(Boolean),
  ]);
}

export function validateMacCallbackScheme(value: unknown) {
  const scheme = String(value ?? "").trim().toLowerCase();
  if (!allowedMacCallbackSchemes().has(scheme)) {
    throw new MacFirebaseHandoffError(
      "invalid-callback-scheme",
      "Quipsly Mac rejected an unrecognized callback target.",
    );
  }
  return scheme;
}

export function validateMacHandoffState(value: unknown) {
  const state = String(value ?? "").trim();
  if (!STATE_PATTERN.test(state)) {
    throw new MacFirebaseHandoffError(
      "invalid-state",
      "Start sign-in again from Quipsly Mac so it can create a fresh secure state.",
    );
  }
  return state;
}

export function validateMacCodeChallenge(value: unknown) {
  const challenge = String(value ?? "").trim();
  if (!STATE_PATTERN.test(challenge)) {
    throw new MacFirebaseHandoffError(
      "invalid-code-challenge",
      "Start sign-in again from Quipsly Mac so it can create fresh device proof.",
    );
  }
  return challenge;
}

export function validateMacCodeVerifier(value: unknown) {
  const verifier = String(value ?? "").trim();
  if (!STATE_PATTERN.test(verifier)) {
    throw new MacFirebaseHandoffError(
      "invalid-code-verifier",
      "This Mac could not prove that it started the browser sign-in.",
      401,
    );
  }
  return verifier;
}

export function validateMacHandoffCode(value: unknown) {
  const code = String(value ?? "").trim();
  if (!CODE_PATTERN.test(code)) {
    throw new MacFirebaseHandoffError(
      "invalid-code",
      "That Quipsly Mac sign-in code is not valid. Start sign-in again.",
      401,
    );
  }
  return code;
}

function cleanDeviceLabel(value: unknown) {
  const label = String(value ?? "")
    .replace(/[\u0000-\u001F\u007F]/g, " ")
    .trim()
    .slice(0, 120);
  return label || "Quipsly Studio for Mac";
}

function readHandoffMetadata(value: Prisma.JsonValue | null): HandoffMetadata | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (
    record.schema !== "quipsly-mac-firebase-handoff/v1"
    || typeof record.firebaseUid !== "string"
    || !record.firebaseUid
    || typeof record.codeChallenge !== "string"
    || !STATE_PATTERN.test(record.codeChallenge)
  ) {
    return null;
  }
  return {
    schema: "quipsly-mac-firebase-handoff/v1",
    firebaseUid: record.firebaseUid,
    codeChallenge: record.codeChallenge,
    source: typeof record.source === "string" ? record.source : "unknown",
    userAgent:
      typeof record.userAgent === "string" ? record.userAgent : undefined,
  };
}

export async function createMacFirebaseHandoff(input: {
  user: BrowserIdentity;
  callbackScheme: unknown;
  state: unknown;
  codeChallenge: unknown;
  deviceLabel?: unknown;
  userAgent?: string | null;
}) {
  const callbackScheme = validateMacCallbackScheme(input.callbackScheme);
  const state = validateMacHandoffState(input.state);
  const codeChallenge = validateMacCodeChallenge(input.codeChallenge);

  if (!input.user.id || !input.user.firebaseUid || !input.user.primaryEmail) {
    throw new MacFirebaseHandoffError(
      "missing-browser-identity",
      "Sign in to Nest again before connecting Quipsly Mac.",
      401,
    );
  }

  const prisma = getPrismaClient();
  const matchingIdentity = await prisma.userAuthIdentity.findFirst({
    where: {
      userId: input.user.id,
      authority: QUIPSLY_FIREBASE_IDENTITY_AUTHORITY,
      subject: input.user.firebaseUid,
      emailVerifiedAt: { not: null },
    },
    select: { id: true },
  });
  if (!matchingIdentity) {
    throw new MacFirebaseHandoffError(
      "firebase-identity-mismatch",
      "Nest could not prove that this browser session belongs to the same Firebase identity. Sign out and choose the account again.",
      409,
    );
  }

  const code = randomCode();
  const expiresAt = new Date(Date.now() + AUTH_CODE_TTL_MS);
  const metadata: HandoffMetadata = {
    schema: "quipsly-mac-firebase-handoff/v1",
    firebaseUid: input.user.firebaseUid,
    codeChallenge,
    source: "api/mac/session-handoff",
    userAgent: input.userAgent?.slice(0, 300) || undefined,
  };

  // The expiry index keeps this opportunistic cleanup bounded. Native codes
  // are recovery credentials, not an audit log; durable auth/security events
  // belong in the normal application telemetry and identity ledgers.
  await prisma.studioNativeAuthCode.deleteMany({
    where: { expiresAt: { lte: new Date() } },
  });
  await prisma.studioNativeAuthCode.create({
    data: {
      codeHash: hashSecret(code),
      userId: input.user.id,
      callbackScheme,
      state,
      deviceLabel: cleanDeviceLabel(input.deviceLabel),
      expiresAt,
      metadataJson: metadata as Prisma.InputJsonValue,
    },
  });

  return {
    code,
    state,
    callbackScheme,
    expiresAt: expiresAt.toISOString(),
    user: {
      email: input.user.primaryEmail,
      name: input.user.name,
    },
  };
}

export async function exchangeMacFirebaseHandoff(input: {
  code: unknown;
  state: unknown;
  codeVerifier: unknown;
  deviceLabel?: unknown;
}) {
  const code = validateMacHandoffCode(input.code);
  const state = validateMacHandoffState(input.state);
  const codeVerifier = validateMacCodeVerifier(input.codeVerifier);
  const codeHash = hashSecret(code);
  const now = new Date();
  const prisma = getPrismaClient();

  const identity = await prisma.$transaction(async (tx) => {
    const authCode = await tx.studioNativeAuthCode.findUnique({
      where: { codeHash },
      include: {
        user: {
          include: {
            authIdentities: {
              where: {
                authority: QUIPSLY_FIREBASE_IDENTITY_AUTHORITY,
                emailVerifiedAt: { not: null },
              },
            },
          },
        },
      },
    });

    if (!authCode) {
      throw new MacFirebaseHandoffError(
        "invalid-code",
        "That Quipsly Mac sign-in code was not found. Start sign-in again.",
        401,
      );
    }
    if (!allowedMacCallbackSchemes().has(authCode.callbackScheme)) {
      throw new MacFirebaseHandoffError(
        "callback-mismatch",
        "That sign-in code was issued for a different app callback.",
        401,
      );
    }
    if (!authCode.state || !safeEqual(authCode.state, state)) {
      throw new MacFirebaseHandoffError(
        "state-mismatch",
        "The browser response did not match the sign-in started by this Mac.",
        401,
      );
    }
    if (authCode.consumedAt) {
      throw new MacFirebaseHandoffError(
        "code-consumed",
        "That sign-in response has already been used. Start sign-in again.",
        409,
      );
    }
    if (authCode.expiresAt.getTime() <= now.getTime()) {
      throw new MacFirebaseHandoffError(
        "code-expired",
        "That sign-in response expired. Start sign-in again.",
        401,
      );
    }

    const metadata = readHandoffMetadata(authCode.metadataJson);
    const firebaseIdentity = metadata
      ? authCode.user.authIdentities.find(
          (candidate) => candidate.subject === metadata.firebaseUid,
        )
      : null;
    if (!metadata || !firebaseIdentity) {
      throw new MacFirebaseHandoffError(
        "firebase-identity-mismatch",
        "The one-time code no longer resolves to the browser's verified Firebase identity.",
        409,
      );
    }
    const presentedChallenge = createHash("sha256")
      .update(codeVerifier)
      .digest("base64url");
    if (!safeEqual(metadata.codeChallenge, presentedChallenge)) {
      throw new MacFirebaseHandoffError(
        "device-proof-mismatch",
        "This Mac could not prove that it started the browser sign-in.",
        401,
      );
    }

    // Conditional consumption is the replay boundary. Two concurrent exchange
    // attempts can both read the row, but only one can move consumedAt from
    // null to a timestamp.
    const consumed = await tx.studioNativeAuthCode.updateMany({
      where: {
        id: authCode.id,
        consumedAt: null,
        expiresAt: { gt: now },
      },
      data: {
        consumedAt: now,
        deviceLabel: cleanDeviceLabel(input.deviceLabel),
      },
    });
    if (consumed.count !== 1) {
      throw new MacFirebaseHandoffError(
        "code-consumed",
        "That sign-in response has already been used. Start sign-in again.",
        409,
      );
    }

    return {
      firebaseUid: firebaseIdentity.subject,
      userId: authCode.userId,
      email: authCode.user.primaryEmail,
    };
  });

  let firebaseUser: Awaited<ReturnType<typeof adminAuth.getUser>>;
  try {
    firebaseUser = await adminAuth.getUser(identity.firebaseUid);
  } catch {
    throw new MacFirebaseHandoffError(
      "firebase-identity-unavailable",
      "Firebase no longer recognizes the Google identity used by this Nest session. Sign in to Nest again before reconnecting the Mac.",
      409,
    );
  }
  if (
    firebaseUser.disabled
    || firebaseUser.emailVerified !== true
    || !firebaseUser.email
  ) {
    throw new MacFirebaseHandoffError(
      "firebase-identity-unavailable",
      "The Firebase identity used by this Nest session is disabled or no longer verified. Sign in to Nest again before reconnecting the Mac.",
      409,
    );
  }

  // The custom token contains the existing Firebase UID; it does not create a
  // parallel Quipsly or Firebase person. Firebase exchanges it for the same
  // normal ID/refresh-token pair used by Capture and the Nest APIs.
  const customToken = await adminAuth.createCustomToken(identity.firebaseUid);

  return {
    customToken,
    user: {
      id: identity.userId,
      email: identity.email,
    },
  };
}
