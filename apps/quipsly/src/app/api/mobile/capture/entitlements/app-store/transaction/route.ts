import { NextResponse } from "next/server";
import { z } from "zod";

import { getPrismaClient } from "@/lib/prisma";
import {
  applyVerifiedAppStoreTransaction,
  verifyAppStoreTransaction,
} from "@/lib/server/app-store-subscriptions";
import { getQuipslySessionFromRequest } from "@/lib/server/quipsly-session";
import {
  ensureQuipslyBillingContext,
  readQuipslyEntitlement,
} from "@/lib/server/subscription-entitlements";

export const runtime = "nodejs";

const requestSchema = z.object({
  signedTransactionInfo: z.string().min(100).max(100_000),
  environment: z.enum(["Production", "Sandbox"]).optional(),
});

export async function POST(request: Request) {
  const session = await getQuipslySessionFromRequest(request);
  if (!session?.user?.id) {
    return NextResponse.json({ ok: false, error: "Sign in before restoring or purchasing a Quipsly plan." }, { status: 401 });
  }
  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "A signed App Store transaction is required." }, { status: 400 });
  }
  const prisma = getPrismaClient();
  await ensureQuipslyBillingContext({
    prisma,
    user: { id: session.user.id, name: session.user.name },
  });
  try {
    const verified = await verifyAppStoreTransaction({
      signedTransactionInfo: parsed.data.signedTransactionInfo,
      environmentHint: parsed.data.environment,
    });
    await applyVerifiedAppStoreTransaction({
      prisma,
      transaction: verified.transaction,
      signedPayload: parsed.data.signedTransactionInfo,
      verificationEnvironment: verified.environment,
      expectedUserId: session.user.id,
    });
    return NextResponse.json({
      ok: true,
      entitlement: await readQuipslyEntitlement({ prisma, userId: session.user.id }),
    });
  } catch (error) {
    console.error("[app-store-subscription] Transaction verification failed", error);
    return NextResponse.json(
      { ok: false, error: "Quipsly could not verify this App Store transaction." },
      { status: 422 },
    );
  }
}
