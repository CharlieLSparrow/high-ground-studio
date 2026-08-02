import { NextResponse } from "next/server";

import { getPrismaClient } from "@/lib/prisma";
import {
  createProductionMilestone,
  ProductionMilestoneOperationError,
} from "@/lib/server/production-milestone-operation";
import { getQuipslySessionFromRequest } from "@/lib/server/quipsly-session";

export const runtime = "nodejs";

const PRIVATE_HEADERS = {
  "Cache-Control": "private, no-store",
  Vary: "Authorization, Cookie",
};

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: PRIVATE_HEADERS });
}

export async function POST(request: Request) {
  const session = await getQuipslySessionFromRequest(request);
  if (!session?.user?.id) return json({ ok: false, error: "Authentication required." }, 401);
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!body) return json({ ok: false, error: "Enter the production milestone details before saving." }, 400);
  try {
    const result = await createProductionMilestone({
      prisma: getPrismaClient() as any,
      actor: session.user,
      body,
    });
    return json({ ok: true, result }, result.idempotentReplay ? 200 : 201);
  } catch (error) {
    const known = error instanceof ProductionMilestoneOperationError;
    if (!known) console.error("[production-milestone] Create failed", error);
    return json({
      ok: false,
      error: known ? error.message : "The production milestone could not be saved safely.",
      code: known ? error.code : "production-milestone-create-failed",
      externalSideEffects: false,
    }, known ? error.status : 503);
  }
}
