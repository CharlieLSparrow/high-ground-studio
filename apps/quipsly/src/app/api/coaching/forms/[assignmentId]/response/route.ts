import { NextResponse } from "next/server";

import { getPrismaClient } from "@/lib/prisma";
import {
  CoachingFormWorkflowError,
  saveCoachingFormResponse,
} from "@/lib/server/coaching-form-workflows";
import { getQuipslySessionFromRequest } from "@/lib/server/quipsly-session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function json(value: unknown, status = 200) {
  return NextResponse.json(value, {
    status,
    headers: { "Cache-Control": "private, no-store, max-age=0" },
  });
}

export async function PUT(
  request: Request,
  context: { params: Promise<{ assignmentId: string }> },
) {
  const session = await getQuipslySessionFromRequest(request);
  if (!session?.user)
    return json({ ok: false, error: "Sign in to complete this form." }, 401);
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, error: "The form answers are missing." }, 400);
  }
  try {
    const { assignmentId } = await context.params;
    const result = await saveCoachingFormResponse({
      prisma: getPrismaClient(),
      actor: session.user,
      assignmentId,
      body,
    });
    return json({ ok: true, result });
  } catch (error) {
    if (error instanceof CoachingFormWorkflowError) {
      return json(
        { ok: false, error: error.message, code: error.code },
        error.status,
      );
    }
    console.error("Coaching form response failed", error);
    return json(
      { ok: false, error: "Your answers could not be saved safely." },
      500,
    );
  }
}
