import { NextResponse } from "next/server";
import { z } from "zod";

import { getPrismaClient } from "@/lib/prisma";
import { createQuipslySubscriptionCheckout } from "@/lib/server/saas-stripe";
import { getQuipslySessionFromRequest } from "@/lib/server/quipsly-session";
import { ensureQuipslyBillingContext, QUIPSLY_COACH_PLAN_KEYS } from "@/lib/server/subscription-entitlements";

export const runtime = "nodejs";

const requestSchema = z.object({
  plan: z.enum([QUIPSLY_COACH_PLAN_KEYS.monthly, QUIPSLY_COACH_PLAN_KEYS.annual]),
});

function statusFor(message: string) {
  if (message.includes("not configured")) return 503;
  if (message.includes("already has")) return 409;
  return 400;
}

export async function POST(request: Request) {
  const session = await getQuipslySessionFromRequest(request);
  if (!session?.user?.id || !session.user.primaryEmail) {
    return NextResponse.json({ ok: false, error: "Sign in before starting a Quipsly subscription." }, { status: 401 });
  }
  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "Choose a monthly or annual Quipsly plan." }, { status: 400 });
  }
  try {
    const prisma = getPrismaClient();
    await ensureQuipslyBillingContext({
      prisma,
      user: { id: session.user.id, name: session.user.name },
    });
    const checkout = await createQuipslySubscriptionCheckout({
      prisma,
      userId: session.user.id,
      email: session.user.primaryEmail,
      planKey: parsed.data.plan,
    });
    return NextResponse.json({ ok: true, checkout });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Quipsly subscription checkout could not be started.";
    return NextResponse.json({ ok: false, error: message }, { status: statusFor(message) });
  }
}
