import { NextResponse } from "next/server";

import { getPrismaClient } from "@/lib/prisma";
import { getQuipslySessionFromRequest } from "@/lib/server/quipsly-session";
import {
  ensureQuipslyBillingContext,
  readQuipslyEntitlement,
} from "@/lib/server/subscription-entitlements";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const session = await getQuipslySessionFromRequest(request);
  if (!session?.user?.id) {
    return NextResponse.json({ ok: false, error: "Sign in to view your Quipsly plan." }, { status: 401 });
  }
  const entitlement = await readQuipslyEntitlement({
    prisma: getPrismaClient(),
    userId: session.user.id,
  });
  return NextResponse.json({ ok: true, entitlement });
}

export async function POST(request: Request) {
  const session = await getQuipslySessionFromRequest(request);
  if (!session?.user?.id) {
    return NextResponse.json({ ok: false, error: "Sign in to manage your Quipsly plan." }, { status: 401 });
  }
  const entitlement = await ensureQuipslyBillingContext({
    prisma: getPrismaClient(),
    user: { id: session.user.id, name: session.user.name },
  });
  return NextResponse.json({ ok: true, entitlement });
}
