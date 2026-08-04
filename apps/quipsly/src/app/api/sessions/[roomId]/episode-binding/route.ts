import { NextResponse } from "next/server";

import { getPrismaClient } from "@/lib/prisma";
import { getQuipslySessionFromRequest } from "@/lib/server/quipsly-session";
import { SessionEpisodeBindingError } from "@/lib/server/session-episode-binding";
import {
  repairSessionEpisodeBinding,
  SessionEpisodeBindingRepairError,
} from "@/lib/server/session-episode-binding-repair";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function privateJson(value: unknown, status = 200) {
  return NextResponse.json(value, {
    status,
    headers: {
      "Cache-Control": "private, no-store",
      Vary: "Authorization, Cookie",
    },
  });
}

async function requestBody(request: Request) {
  try {
    const value = await request.json();
    return value && typeof value === "object" && !Array.isArray(value)
      ? value as Record<string, unknown>
      : {};
  } catch {
    return {};
  }
}

export async function PUT(
  request: Request,
  context: { params: Promise<{ roomId: string }> },
) {
  const session = await getQuipslySessionFromRequest(request);
  if (!session?.user?.id) {
    return privateJson({
      ok: false,
      code: "AUTH_REQUIRED",
      error: "Sign in before repairing a Session Episode relationship.",
    }, 401);
  }
  const [{ roomId }, body] = await Promise.all([context.params, requestBody(request)]);
  try {
    const result = await repairSessionEpisodeBinding({
      prisma: getPrismaClient(),
      actor: session.user,
      roomId,
      episodeSlug: body.episodeSlug,
      requestId: body.requestId,
      expectedRoomUpdatedAt: body.expectedRoomUpdatedAt,
      confirmRebind: body.confirmRebind,
      reason: body.reason,
    });
    return privateJson({ ok: true, ...result });
  } catch (error) {
    if (error instanceof SessionEpisodeBindingRepairError) {
      return privateJson({
        ok: false,
        code: error.code,
        error: error.message,
        ...error.details,
      }, error.status);
    }
    if (error instanceof SessionEpisodeBindingError) {
      return privateJson({
        ok: false,
        code: "EPISODE_BINDING_INVALID",
        error: error.message,
      }, error.status);
    }
    console.error("Session Episode relationship repair failed", error);
    return privateJson({
      ok: false,
      code: "EPISODE_BINDING_REPAIR_FAILED",
      error: "Quipsly could not repair this Episode relationship.",
    }, 500);
  }
}
