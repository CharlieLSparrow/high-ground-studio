import { NextResponse } from "next/server";

import { getPrismaClient } from "@/lib/prisma";
import {
  CoachingSessionPreparationError,
  readCoachingSessionPreparation,
  saveCoachingSessionPreparation,
} from "@/lib/server/coaching-session-preparation";
import { getQuipslySessionFromRequest } from "@/lib/server/quipsly-session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  context: { params: Promise<{ roomId: string }> },
) {
  const access = await authority(request, await context.params);
  if (!access.ok) return access.response;
  try {
    const preparation = await readCoachingSessionPreparation({
      prisma: access.prisma,
      roomId: access.roomId,
      actor: access.session.user,
    });
    return privateJson({ ok: true, preparation });
  } catch (error) {
    return preparationError(error);
  }
}

export async function PUT(
  request: Request,
  context: { params: Promise<{ roomId: string }> },
) {
  const access = await authority(request, await context.params);
  if (!access.ok) return access.response;
  let body: unknown = {};
  try {
    body = await request.json();
  } catch {
    // The domain parser returns the same calm invalid-operation response.
  }
  try {
    const result = await saveCoachingSessionPreparation({
      prisma: access.prisma,
      roomId: access.roomId,
      actor: access.session.user,
      body,
    });
    return privateJson({ ok: true, ...result });
  } catch (error) {
    return preparationError(error);
  }
}

async function authority(
  request: Request,
  params: { roomId: string },
) {
  const session = await getQuipslySessionFromRequest(request);
  if (!session?.user?.id) {
    return {
      ok: false as const,
      response: privateJson(
        {
          ok: false,
          code: "AUTH_REQUIRED",
          error: "Sign in to prepare this Session.",
        },
        401,
      ),
    };
  }
  const roomId = String(params.roomId || "").trim();
  if (!roomId || roomId.length > 240) {
    return {
      ok: false as const,
      response: privateJson(
        {
          ok: false,
          code: "PREPARATION_NOT_FOUND",
          error: "This private coaching Session is unavailable.",
        },
        404,
      ),
    };
  }
  return {
    ok: true as const,
    session,
    roomId,
    prisma: getPrismaClient() as any,
  };
}

function preparationError(error: unknown) {
  if (error instanceof CoachingSessionPreparationError) {
    return privateJson(
      { ok: false, code: error.code, error: error.message },
      error.status,
    );
  }
  console.error("coaching-session-preparation", error);
  return privateJson(
    {
      ok: false,
      code: "PREPARATION_SAVE_FAILED",
      error: "Preparation could not be saved. Your text is still here; try again.",
    },
    500,
  );
}

function privateJson(body: unknown, status = 200) {
  const response = NextResponse.json(body, { status });
  response.headers.set("Cache-Control", "private, no-store, max-age=0");
  return response;
}
