import { getPrismaClient } from "@/lib/prisma";
import { getQuipslySessionFromRequest } from "@/lib/server/quipsly-session";
import {
  SessionAudioAuditionError,
  prepareSessionAudioAudition,
  reconcileSessionAudioAudition,
} from "@/lib/server/session-audio-audition";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function privateJson(body: Record<string, unknown>, status = 200) {
  return Response.json(body, {
    status,
    headers: {
      "Cache-Control": "private, no-store",
      Vary: "Authorization, Cookie",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

async function operation(
  request: Request,
  context: { params: Promise<{ roomId: string; recordingAssetId: string }> },
  prepare: boolean,
) {
  const session = await getQuipslySessionFromRequest(request);
  if (!session?.user?.id)
    return privateJson(
      {
        ok: false,
        code: "AUTH_REQUIRED",
        error: "Sign in before preparing private Session audio.",
      },
      401,
    );
  const { roomId, recordingAssetId } = await context.params;
  try {
    const actor = {
      id: session.user.id,
      email: session.user.email,
      primaryEmail: session.user.primaryEmail,
    };
    const state = prepare
      ? await prepareSessionAudioAudition({
          prisma: getPrismaClient() as any,
          roomId,
          recordingAssetId,
          actor,
        })
      : await reconcileSessionAudioAudition({
          prisma: getPrismaClient() as any,
          roomId,
          recordingAssetId,
          actor,
        });
    return privateJson({ ok: true, ...state });
  } catch (error) {
    if (error instanceof SessionAudioAuditionError)
      return privateJson(
        { ok: false, code: error.code, error: error.message },
        error.status,
      );
    console.error("[session-audio-audition] preparation failed", error);
    return privateJson(
      {
        ok: false,
        code: "AUDITION_UNAVAILABLE",
        error: "The compact audio review copy could not be prepared right now.",
      },
      503,
    );
  }
}

export async function POST(
  request: Request,
  context: { params: Promise<{ roomId: string; recordingAssetId: string }> },
) {
  return operation(request, context, true);
}

export async function GET(
  request: Request,
  context: { params: Promise<{ roomId: string; recordingAssetId: string }> },
) {
  return operation(request, context, false);
}
