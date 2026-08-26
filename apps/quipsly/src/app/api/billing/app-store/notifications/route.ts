import { NextResponse } from "next/server";
import { z } from "zod";

import { getPrismaClient } from "@/lib/prisma";
import {
  applyVerifiedAppStoreNotification,
  verifyAppStoreNotification,
} from "@/lib/server/app-store-subscriptions";

export const runtime = "nodejs";

const requestSchema = z.object({ signedPayload: z.string().min(100).max(250_000) });

export async function POST(request: Request) {
  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false }, { status: 400 });
  try {
    const verified = await verifyAppStoreNotification({ signedPayload: parsed.data.signedPayload });
    const result = await applyVerifiedAppStoreNotification({
      prisma: getPrismaClient(),
      notification: verified.notification,
      signedPayload: parsed.data.signedPayload,
      verificationEnvironment: verified.environment,
    });
    return NextResponse.json({ ok: true, result });
  } catch (error) {
    console.error("[app-store-subscription] Notification verification failed", error);
    return NextResponse.json({ ok: false }, { status: 400 });
  }
}
