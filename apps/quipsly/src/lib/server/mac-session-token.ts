import "server-only";

import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

import type { Prisma } from "@prisma/client";
import type { Session } from "next-auth";
import type { NextRequest } from "next/server";

import { getPrismaClient } from "@/lib/prisma";

const LEGACY_TOKEN_VERSION = 1;
const LEGACY_TOKEN_SOURCE = "quipsly-mac-session-handoff";
const ACCESS_TOKEN_VERSION = 2;
const ACCESS_TOKEN_SOURCE = "quipsly-mac-access-token";

const LEGACY_TTL_MS = 12 * 60 * 60 * 1000;
const AUTH_CODE_TTL_MS = 5 * 60 * 1000;
const ACCESS_TOKEN_TTL_MS = 20 * 60 * 1000;
const REFRESH_TOKEN_TTL_MS = 45 * 24 * 60 * 60 * 1000;

export type MacSessionActor = {
  id: string;
  email: string;
  primaryEmail: string;
  name: string;
  roles: string[];
  source: "mac-access-token" | "mac-session-token";
  sessionId?: string;
  expiresAt?: number;
};

type LegacyMacSessionPayload = {
  v: number;
  source: string;
  sub: string;
  email: string;
  primaryEmail: string;
  name: string;
  roles: string[];
  iat: number;
  exp: number;
};

type MacAccessTokenPayload = LegacyMacSessionPayload & {
  sessionId: string;
};

type DeviceSessionBundle = {
  accessToken: string;
  refreshToken: string;
  accessTokenExpiresAt: string;
  refreshTokenExpiresAt: string;
  deviceSessionId: string;
  user: {
    id: string;
    email: string;
    primaryEmail: string;
    name: string;
    roles: string[];
  };
};

export class MacNativeSessionError extends Error {
  status: number;
  code: string;

  constructor(code: string, message: string, status = 400) {
    super(message);
    this.name = "MacNativeSessionError";
    this.code = code;
    this.status = status;
  }
}

function secret() {
  const value = process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET;
  if (!value) {
    throw new Error("Mac native sessions require AUTH_SECRET or NEXTAUTH_SECRET.");
  }
  return value;
}

function base64UrlJson(value: unknown) {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

function decodeBase64UrlJson<T>(value: string): T | null {
  try {
    return JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as T;
  } catch {
    return null;
  }
}

function sign(unsigned: string) {
  return createHmac("sha256", secret()).update(unsigned).digest("base64url");
}

function safeEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

function hashSecret(value: string) {
  return createHash("sha256").update(value).digest("base64url");
}

function randomSecret(prefix: string) {
  return `${prefix}_${randomBytes(32).toString("base64url")}`;
}

function normalizeEmail(value: unknown) {
  return String(value ?? "").trim().toLowerCase();
}

function sessionRoles(session: Session) {
  return Array.isArray(session.user?.roles)
    ? session.user.roles.map((role) => String(role))
    : [];
}

function userRoles(user: { roles?: Array<{ role?: unknown }> }) {
  return Array.isArray(user.roles)
    ? user.roles.map((role) => String(role.role ?? "")).filter(Boolean)
    : [];
}

function encodeSignedToken(payload: LegacyMacSessionPayload | MacAccessTokenPayload) {
  const encodedPayload = base64UrlJson(payload);
  return `${encodedPayload}.${sign(encodedPayload)}`;
}

function verifySignedPayload<T extends { v: number; source: string; exp: number }>(
  token: string | null | undefined,
): T | null {
  const raw = String(token ?? "").trim();
  const [encodedPayload, signature, extra] = raw.split(".");
  if (!encodedPayload || !signature || extra !== undefined) return null;
  if (!safeEqual(sign(encodedPayload), signature)) return null;

  const payload = decodeBase64UrlJson<T>(encodedPayload);
  if (!payload?.exp || payload.exp < Date.now()) return null;
  return payload;
}

export function createMacSessionToken(session: Session, ttlMs = LEGACY_TTL_MS) {
  const user = session.user;
  const id = String(user?.id || "");
  const email = normalizeEmail(user?.primaryEmail || user?.email);

  if (!id || !email) {
    throw new Error("Cannot create a Mac session token without a signed-in app user id and email.");
  }

  const now = Date.now();
  return encodeSignedToken({
    v: LEGACY_TOKEN_VERSION,
    source: LEGACY_TOKEN_SOURCE,
    sub: id,
    email,
    primaryEmail: normalizeEmail(user?.primaryEmail || email),
    name: String(user?.name || email),
    roles: sessionRoles(session),
    iat: now,
    exp: now + ttlMs,
  });
}

export function verifyMacSessionToken(token: string | null | undefined): MacSessionActor | null {
  const payload = verifySignedPayload<LegacyMacSessionPayload>(token);
  if (!payload) return null;
  if (payload.v !== LEGACY_TOKEN_VERSION || payload.source !== LEGACY_TOKEN_SOURCE) return null;
  if (!payload.sub || !payload.email) return null;

  return {
    id: payload.sub,
    email: payload.email,
    primaryEmail: payload.primaryEmail || payload.email,
    name: payload.name || payload.email,
    roles: Array.isArray(payload.roles) ? payload.roles : [],
    source: "mac-session-token",
    expiresAt: payload.exp,
  };
}

function createMacAccessToken(input: {
  userId: string;
  email: string;
  primaryEmail: string;
  name: string;
  roles: string[];
  sessionId: string;
}) {
  const now = Date.now();
  const exp = now + ACCESS_TOKEN_TTL_MS;
  const token = encodeSignedToken({
    v: ACCESS_TOKEN_VERSION,
    source: ACCESS_TOKEN_SOURCE,
    sub: input.userId,
    email: input.email,
    primaryEmail: input.primaryEmail,
    name: input.name,
    roles: input.roles,
    sessionId: input.sessionId,
    iat: now,
    exp,
  });

  return { token, expiresAt: new Date(exp).toISOString() };
}

export function verifyMacAccessToken(token: string | null | undefined): MacSessionActor | null {
  const payload = verifySignedPayload<MacAccessTokenPayload>(token);
  if (!payload) return null;
  if (payload.v !== ACCESS_TOKEN_VERSION || payload.source !== ACCESS_TOKEN_SOURCE) return null;
  if (!payload.sub || !payload.email || !payload.sessionId) return null;

  return {
    id: payload.sub,
    email: payload.email,
    primaryEmail: payload.primaryEmail || payload.email,
    name: payload.name || payload.email,
    roles: Array.isArray(payload.roles) ? payload.roles : [],
    source: "mac-access-token",
    sessionId: payload.sessionId,
    expiresAt: payload.exp,
  };
}

export function readBearerToken(request: Request | NextRequest) {
  const header = request.headers.get("authorization") || "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || null;
}

export function resolveMacSessionActor(request: Request | NextRequest) {
  const token = readBearerToken(request);
  return verifyMacAccessToken(token) || verifyMacSessionToken(token);
}

export function macSessionExpiresAt(token: string) {
  const [encodedPayload] = token.split(".");
  const payload = decodeBase64UrlJson<{ exp?: number }>(encodedPayload || "");
  return payload?.exp ? new Date(payload.exp).toISOString() : null;
}

export async function createMacNativeAuthCode(session: Session, options: {
  callbackScheme: string;
  state?: string | null;
  deviceLabel?: string | null;
  metadataJson?: Record<string, unknown> | null;
}) {
  const userId = String(session.user?.id || "");
  const email = normalizeEmail(session.user?.primaryEmail || session.user?.email);
  if (!userId || !email) {
    throw new MacNativeSessionError(
      "missing-user",
      "Sign in to Nest before connecting Quipsly Mac.",
      401,
    );
  }

  const code = randomSecret("qmac_code");
  const expiresAt = new Date(Date.now() + AUTH_CODE_TTL_MS);
  const prisma = getPrismaClient();

  await prisma.studioNativeAuthCode.create({
    data: {
      codeHash: hashSecret(code),
      userId,
      callbackScheme: options.callbackScheme,
      state: options.state?.trim() || null,
      deviceLabel: options.deviceLabel?.trim() || null,
      expiresAt,
      metadataJson: options.metadataJson as Prisma.InputJsonValue | undefined,
    },
  });

  return {
    code,
    expiresAt: expiresAt.toISOString(),
    state: options.state?.trim() || "",
    user: {
      id: userId,
      email,
      primaryEmail: normalizeEmail(session.user?.primaryEmail || email),
      name: String(session.user?.name || email),
      roles: sessionRoles(session),
    },
  };
}

function bundleDeviceSession(deviceSession: {
  id: string;
  expiresAt: Date;
  user: {
    id: string;
    primaryEmail: string;
    name: string | null;
    roles?: Array<{ role?: unknown }>;
  };
}, refreshToken: string): DeviceSessionBundle {
  const email = normalizeEmail(deviceSession.user.primaryEmail);
  const roles = userRoles(deviceSession.user);
  const access = createMacAccessToken({
    userId: deviceSession.user.id,
    email,
    primaryEmail: email,
    name: deviceSession.user.name || email,
    roles,
    sessionId: deviceSession.id,
  });

  return {
    accessToken: access.token,
    refreshToken,
    accessTokenExpiresAt: access.expiresAt,
    refreshTokenExpiresAt: deviceSession.expiresAt.toISOString(),
    deviceSessionId: deviceSession.id,
    user: {
      id: deviceSession.user.id,
      email,
      primaryEmail: email,
      name: deviceSession.user.name || email,
      roles,
    },
  };
}

export async function exchangeMacNativeAuthCode(input: {
  code: string;
  deviceLabel?: string | null;
  metadataJson?: Record<string, unknown> | null;
}) {
  const code = String(input.code || "").trim();
  if (!code) {
    throw new MacNativeSessionError("missing-code", "A one-time Mac sign-in code is required.");
  }

  const prisma = getPrismaClient();
  const codeHash = hashSecret(code);
  const now = new Date();
  const refreshToken = randomSecret("qmac_refresh");
  const refreshTokenHash = hashSecret(refreshToken);
  const refreshExpiresAt = new Date(now.getTime() + REFRESH_TOKEN_TTL_MS);

  const deviceSession = await prisma.$transaction(async (tx) => {
    const authCode = await tx.studioNativeAuthCode.findUnique({
      where: { codeHash },
      include: { user: { include: { roles: true } } },
    });

    if (!authCode) {
      throw new MacNativeSessionError("invalid-code", "That Mac sign-in code was not found.", 401);
    }
    if (authCode.consumedAt) {
      throw new MacNativeSessionError("code-consumed", "That Mac sign-in code has already been used.", 401);
    }
    if (authCode.expiresAt.getTime() < now.getTime()) {
      throw new MacNativeSessionError("code-expired", "That Mac sign-in code expired. Start sign-in again.", 401);
    }

    await tx.studioNativeAuthCode.update({
      where: { id: authCode.id },
      data: { consumedAt: now },
    });

    return tx.studioNativeDeviceSession.create({
      data: {
        userId: authCode.userId,
        deviceLabel: input.deviceLabel?.trim() || authCode.deviceLabel || null,
        refreshTokenHash,
        lastUsedAt: now,
        expiresAt: refreshExpiresAt,
        metadataJson: {
          ...(authCode.metadataJson && typeof authCode.metadataJson === "object" ? authCode.metadataJson as Record<string, unknown> : {}),
          ...(input.metadataJson ?? {}),
          createdFromAuthCodeId: authCode.id,
        } as Prisma.InputJsonValue,
      },
      include: { user: { include: { roles: true } } },
    });
  });

  return bundleDeviceSession(deviceSession, refreshToken);
}

export async function refreshMacNativeDeviceSession(input: {
  refreshToken: string;
  deviceLabel?: string | null;
  metadataJson?: Record<string, unknown> | null;
}) {
  const refreshToken = String(input.refreshToken || "").trim();
  if (!refreshToken) {
    throw new MacNativeSessionError("missing-refresh-token", "A Mac refresh token is required.", 401);
  }

  const prisma = getPrismaClient();
  const now = new Date();
  const currentHash = hashSecret(refreshToken);
  const nextRefreshToken = randomSecret("qmac_refresh");
  const nextHash = hashSecret(nextRefreshToken);
  const refreshExpiresAt = new Date(now.getTime() + REFRESH_TOKEN_TTL_MS);

  const current = await prisma.studioNativeDeviceSession.findUnique({
    where: { refreshTokenHash: currentHash },
    include: { user: { include: { roles: true } } },
  });

  if (!current || current.revokedAt) {
    throw new MacNativeSessionError("invalid-refresh-token", "This Mac profile is no longer authorized. Sign in again.", 401);
  }
  if (current.expiresAt.getTime() < now.getTime()) {
    throw new MacNativeSessionError("refresh-token-expired", "This Mac profile expired. Sign in again.", 401);
  }

  const updated = await prisma.studioNativeDeviceSession.update({
    where: { id: current.id },
    data: {
      refreshTokenHash: nextHash,
      deviceLabel: input.deviceLabel?.trim() || current.deviceLabel,
      lastUsedAt: now,
      expiresAt: refreshExpiresAt,
      metadataJson: {
        ...(current.metadataJson && typeof current.metadataJson === "object" ? current.metadataJson as Record<string, unknown> : {}),
        ...(input.metadataJson ?? {}),
      } as Prisma.InputJsonValue,
    },
    include: { user: { include: { roles: true } } },
  });

  return bundleDeviceSession(updated, nextRefreshToken);
}
