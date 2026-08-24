import { NextResponse } from "next/server";

import { getPrismaClient } from "@/lib/prisma";
import { getQuipslySessionFromRequest } from "@/lib/server/quipsly-session";
import {
  queueSessionSourceAlignment,
  decideSessionSourceAlignment,
  readSessionSourceAlignments,
  reconcileSessionSourceAlignment,
  SessionSourceAlignmentError,
} from "@/lib/server/session-source-alignment";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PRIVATE_HEADERS = {
  "Cache-Control": "private, no-store",
  Vary: "Authorization, Cookie",
  "X-Content-Type-Options": "nosniff",
};

function privateJson(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: PRIVATE_HEADERS });
}
function text(value: unknown, max = 240) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}
function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

async function actor(request: Request) {
  const session = await getQuipslySessionFromRequest(request);
  return session?.user?.id ? session.user : null;
}

function handled(error: unknown) {
  if (error instanceof SessionSourceAlignmentError) {
    return privateJson(
      { ok: false, code: error.code, error: error.message },
      error.status,
    );
  }
  console.error("[session-source-alignment] operation failed", error);
  return privateJson(
    {
      ok: false,
      code: "ALIGNMENT_UNAVAILABLE",
      error:
        "Quipsly could not verify this private alignment operation. Source timing and media were not changed.",
    },
    503,
  );
}

export async function GET(
  request: Request,
  context: { params: Promise<{ roomId: string }> },
) {
  const signedIn = await actor(request);
  if (!signedIn)
    return privateJson(
      {
        ok: false,
        code: "AUTH_REQUIRED",
        error: "Sign in before opening private Session sync evidence.",
      },
      401,
    );
  const roomId = text((await context.params).roomId);
  if (!roomId)
    return privateJson(
      {
        ok: false,
        code: "ROOM_REQUIRED",
        error: "Choose one Session before opening sync evidence.",
      },
      400,
    );
  try {
    return privateJson({
      ok: true,
      ...(await readSessionSourceAlignments({
        prisma: getPrismaClient() as any,
        roomId,
        actor: signedIn,
      })),
    });
  } catch (error) {
    return handled(error);
  }
}

export async function POST(
  request: Request,
  context: { params: Promise<{ roomId: string }> },
) {
  const signedIn = await actor(request);
  if (!signedIn)
    return privateJson(
      {
        ok: false,
        code: "AUTH_REQUIRED",
        error: "Sign in before requesting private Session sync evidence.",
      },
      401,
    );
  const roomId = text((await context.params).roomId);
  let body: Record<string, unknown> = {};
  try {
    body = object(await request.json());
  } catch {
    /* validated below */
  }
  const action = text(body.action, 40).toUpperCase();
  if (!roomId)
    return privateJson(
      {
        ok: false,
        code: "ROOM_REQUIRED",
        error: "Choose one Session before requesting sync evidence.",
      },
      400,
    );
  try {
    const prisma = getPrismaClient() as any;
    if (action === "QUEUE") {
      const result = await queueSessionSourceAlignment({
        prisma,
        roomId,
        spineRecordingAssetId: text(body.spineRecordingAssetId),
        targetRecordingAssetId: text(body.targetRecordingAssetId),
        actor: signedIn,
      });
      return privateJson({ ok: true, alignment: result });
    }
    if (action === "RECONCILE") {
      const result = await reconcileSessionSourceAlignment({
        prisma,
        roomId,
        jobId: text(body.jobId),
        actor: signedIn,
      });
      return privateJson({ ok: true, alignment: result });
    }
    if (action === "APPROVE" || action === "REVOKE") {
      const result = await decideSessionSourceAlignment({
        prisma,
        roomId,
        jobId: text(body.jobId),
        requestId: text(body.requestId, 80).toLowerCase(),
        expectedRevision: Number(body.expectedRevision),
        operation: action,
        reason: text(body.reason, 2_000),
        actor: signedIn,
      });
      return privateJson({ ok: true, alignment: result });
    }
    return privateJson(
      {
        ok: false,
        code: "ACTION_UNSUPPORTED",
        error:
          "Choose queue, reconcile, approve, or revoke for Session sync evidence.",
      },
      400,
    );
  } catch (error) {
    return handled(error);
  }
}
