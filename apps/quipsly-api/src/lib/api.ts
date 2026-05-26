import { NextResponse } from "next/server";
import type { StreamMode, VerificationStatus } from "@high-ground/quipsly-domain";

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type,Authorization,X-Quipsly-Client",
  "Access-Control-Max-Age": "86400",
} as const;

export function withCorsInit(init?: ResponseInit): ResponseInit {
  const headers = new Headers(init?.headers);

  Object.entries(corsHeaders).forEach(([key, value]) => {
    headers.set(key, value);
  });

  return {
    ...init,
    headers,
  };
}

export function optionsResponse() {
  return new NextResponse(null, withCorsInit({ status: 204 }));
}

export const streamModes = [
  "for-you",
  "verified",
  "by-theme",
  "by-person",
  "by-source",
  "lorelist-builder",
  "story-trail",
  "newly-reviewed",
  "curator-picks",
] as const satisfies readonly StreamMode[];

export const verificationStatuses = [
  "verified",
  "attributed",
  "variant",
  "disputed",
  "misattributed",
  "needs-source",
  "needs-review",
] as const satisfies readonly VerificationStatus[];

export function jsonOk<T>(data: T, init?: ResponseInit) {
  return NextResponse.json(
    {
      data,
      meta: {
        service: "quipsly-api",
        prototype: true,
      },
    },
    withCorsInit(init),
  );
}

export function jsonError(message: string, status = 400) {
  return NextResponse.json(
    {
      error: {
        message,
      },
      meta: {
        service: "quipsly-api",
        prototype: true,
      },
    },
    withCorsInit({ status }),
  );
}

export function coerceStreamMode(value: string | null): StreamMode {
  if (value && streamModes.includes(value as StreamMode)) {
    return value as StreamMode;
  }

  return "for-you";
}

export function coerceLimit(value: string | null, fallback = 8): number {
  const parsed = value ? Number.parseInt(value, 10) : fallback;

  if (Number.isFinite(parsed) && parsed > 0) {
    return Math.min(parsed, 50);
  }

  return fallback;
}

export function coerceVerificationStatus(
  value: string | null,
): VerificationStatus | undefined {
  if (value && verificationStatuses.includes(value as VerificationStatus)) {
    return value as VerificationStatus;
  }

  return undefined;
}
