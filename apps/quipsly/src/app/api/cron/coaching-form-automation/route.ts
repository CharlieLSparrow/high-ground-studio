import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";

import { getPrismaClient } from "@/lib/prisma";
import { reconcileCoachingFormAutomation } from "@/lib/server/coaching-form-automation";

export const runtime = "nodejs";
export const maxDuration = 60;

const HEADERS = { "Cache-Control": "private, no-store, max-age=0" };

function authorized(request: Request) {
  const configured =
    process.env.QUIPSLY_COACHING_FORM_AUTOMATION_SECRET?.trim();
  if (!configured) return "NOT_CONFIGURED" as const;
  const supplied =
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") || "";
  const expectedBuffer = Buffer.from(configured);
  const suppliedBuffer = Buffer.from(supplied);
  return expectedBuffer.length === suppliedBuffer.length &&
    timingSafeEqual(expectedBuffer, suppliedBuffer)
    ? ("AUTHORIZED" as const)
    : ("UNAUTHORIZED" as const);
}

export async function POST(request: Request) {
  const authorization = authorized(request);
  if (authorization === "NOT_CONFIGURED") {
    return NextResponse.json(
      { ok: false, error: "Coaching form automation is not configured." },
      { status: 503, headers: HEADERS },
    );
  }
  if (authorization !== "AUTHORIZED") {
    return NextResponse.json(
      { ok: false, error: "Unauthorized." },
      { status: 401, headers: HEADERS },
    );
  }
  try {
    const result = await reconcileCoachingFormAutomation({
      prisma: getPrismaClient(),
      limit: 500,
    });
    return NextResponse.json({ ok: true, result }, { headers: HEADERS });
  } catch (error) {
    console.error("Coaching form automation reconciliation failed", error);
    return NextResponse.json(
      { ok: false, error: "Coaching form automation did not complete." },
      { status: 503, headers: HEADERS },
    );
  }
}
