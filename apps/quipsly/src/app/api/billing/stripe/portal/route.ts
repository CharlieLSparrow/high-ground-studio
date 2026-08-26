import { NextResponse } from "next/server";

import { getPrismaClient } from "@/lib/prisma";
import { createQuipslySubscriptionPortal } from "@/lib/server/saas-stripe";
import { getQuipslySessionFromRequest } from "@/lib/server/quipsly-session";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const session = await getQuipslySessionFromRequest(request);
  if (!session?.user?.id) {
    return NextResponse.json({ ok: false, error: "Sign in before managing your Quipsly subscription." }, { status: 401 });
  }
  try {
    const portal = await createQuipslySubscriptionPortal({
      prisma: getPrismaClient(),
      userId: session.user.id,
    });
    return NextResponse.json({ ok: true, portal });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Quipsly subscription management could not be opened.";
    return NextResponse.json({ ok: false, error: message }, { status: message.includes("not configured") ? 503 : 400 });
  }
}
