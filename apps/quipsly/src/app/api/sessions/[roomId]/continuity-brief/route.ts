import { NextResponse } from "next/server";

import { getPrismaClient } from "@/lib/prisma";
import {
  saveSessionContinuityBrief,
  SessionContinuityError,
} from "@/lib/server/session-continuity";
import { getQuipslySessionFromRequest } from "@/lib/server/quipsly-session";

export const runtime = "nodejs";

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

async function requestBody(request: Request) {
  try {
    return record(await request.json());
  } catch {
    return {};
  }
}

export async function POST(
  request: Request,
  context: { params: Promise<{ roomId: string }> },
) {
  const session = await getQuipslySessionFromRequest(request);
  if (!session?.user) {
    return NextResponse.json(
      {
        ok: false,
        code: "UNAUTHORIZED",
        error: "Sign in before saving a private next-session brief.",
      },
      { status: 401 },
    );
  }

  const [{ roomId }, body] = await Promise.all([context.params, requestBody(request)]);
  try {
    const result = await saveSessionContinuityBrief({
      prisma: getPrismaClient(),
      actor: session.user,
      roomId,
      clientRequestId: String(body.clientRequestId || ""),
      expectedSnapshotSha256: String(body.expectedSnapshotSha256 || ""),
    });
    return NextResponse.json({
      ok: true,
      state: "persisted",
      idempotentReplay: result.idempotentReplay,
      brief: result.brief,
      continuity: result.state,
      externalSideEffects: false,
      nextAction: result.idempotentReplay
        ? "This exact private brief already existed. Quipsly reused it without creating a duplicate."
        : "Review the private brief before the next Session. Its task, goal, note, and focus-block identities remain canonical.",
    });
  } catch (error) {
    if (error instanceof SessionContinuityError) {
      return NextResponse.json(
        {
          ok: false,
          code: error.code,
          error: error.message,
          ...(error.state ? { continuity: error.state } : {}),
          externalSideEffects: false,
        },
        { status: error.status },
      );
    }
    console.error("[session-continuity] save failed", error);
    return NextResponse.json(
      {
        ok: false,
        code: "PERSISTENCE_UNAVAILABLE",
        error: "Quipsly could not save the private continuity brief. No Session work or external system changed.",
        externalSideEffects: false,
      },
      { status: 503 },
    );
  }
}
