import { NextResponse } from "next/server";

import { getPrismaClient } from "@/lib/prisma";
import { createQuipslyCoachingCustomerPortalSession } from "@/lib/server/coaching-stripe";
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
  if (message.includes("not configured") || message.includes("requires existing")) return 503;
  if (message.includes("disabled") || message.includes("only open your own")) return 403;
  if (message.includes("not found")) return 404;
  return 400;
}

export async function POST(request: Request) {
  const session = await getQuipslySessionFromRequest(request);

  if (!session?.user) {
    return NextResponse.json(
      { ok: false, error: "Sign in before opening coaching billing evidence." },
      { status: 401 },
    );
  }

  const body = await readJson(request);

  try {
    const prisma = getPrismaClient() as any;
    const result = await createQuipslyCoachingCustomerPortalSession({
      prisma,
      actorUserId: session.user.id,
      actorIsStaff: session.user.isStaff,
      userId: text(body.userId) || undefined,
      stripeCustomerId: text(body.stripeCustomerId) || undefined,
      returnUrl: text(body.returnUrl) || undefined,
    });

    return NextResponse.json({ ok: true, result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Coaching billing portal could not be opened.";
    return NextResponse.json({ ok: false, error: message }, { status: errorStatus(message) });
  }
}
