import { NextResponse } from "next/server";

import { getPrismaClient } from "@/lib/prisma";
import {
  ProductionMilestoneOperationError,
  reviseProductionMilestone,
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

export async function PATCH(
  request: Request,
  context: { params: Promise<{ milestoneId: string }> },
) {
  const session = await getQuipslySessionFromRequest(request);
  if (!session?.user?.id) return json({ ok: false, error: "Authentication required." }, 401);
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!body) return json({ ok: false, error: "Choose an explicit milestone change." }, 400);
  try {
    const { milestoneId } = await context.params;
    const result = await reviseProductionMilestone({
      prisma: getPrismaClient() as any,
      actor: session.user,
      milestoneId,
      body,
    });
    return json({ ok: true, result });
  } catch (error) {
    const known = error instanceof ProductionMilestoneOperationError;
    if (!known) console.error("[production-milestone] Revision failed", error);
    return json({
      ok: false,
      error: known ? error.message : "The production milestone could not be revised safely.",
      code: known ? error.code : "production-milestone-update-failed",
      externalSideEffects: false,
    }, known ? error.status : 503);
  }
}
