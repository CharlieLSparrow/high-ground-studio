import { NextResponse } from "next/server";

import { getPrismaClient } from "@/lib/prisma";
import { createQuipslyCoachingCheckoutSession } from "@/lib/server/coaching-stripe";
import { getQuipslySessionFromRequest } from "@/lib/server/quipsly-session";

export const runtime = "nodejs";

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

async function readJson(request: Request) {
  try {
    const value = await request.json();
    return isObject(value) ? value : {};
  } catch {
    return {};
  }
}

function errorStatus(message: string) {
  if (message.includes("not configured")) return 503;
  if (message.includes("disabled") || message.includes("only") || message.includes("part of")) return 403;
  if (message.includes("not found")) return 404;
  return 400;
}

export async function POST(request: Request) {
  const session = await getQuipslySessionFromRequest(request);

  if (!session?.user) {
    return NextResponse.json(
      { ok: false, error: "Sign in before creating coaching checkout evidence." },
      { status: 401 },
    );
  }

  const body = await readJson(request);
  const bookingId = text(body.bookingId);
  if (!bookingId) {
    return NextResponse.json(
      { ok: false, error: "bookingId is required before creating coaching checkout evidence." },
      { status: 400 },
    );
  }

  try {
    const prisma = getPrismaClient() as any;
    const result = await createQuipslyCoachingCheckoutSession({
      prisma,
      bookingId,
      actorUserId: session.user.id,
      actorIsStaff: session.user.isStaff,
      successUrl: text(body.successUrl) || undefined,
      cancelUrl: text(body.cancelUrl) || undefined,
    });

    return NextResponse.json({ ok: true, result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Coaching checkout could not be created.";
    return NextResponse.json({ ok: false, error: message }, { status: errorStatus(message) });
  }
}
