import { NextResponse } from "next/server";

import { getPrismaClient } from "@/lib/prisma";
import { getQuipslySessionFromRequest } from "@/lib/server/quipsly-session";
import {
  prepareSessionRecordingShare,
  readSessionRecordingShare,
  SessionRecordingShareError,
  transitionSessionRecordingShare,
} from "@/lib/server/session-recording-share";

export const runtime = "nodejs";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PRIVATE_HEADERS = { "Cache-Control": "private, no-store", Vary: "Authorization, Cookie" };

function privateJson(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: PRIVATE_HEADERS });
}

function object(value: unknown): Record<string, any> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, any> : {};
}

function text(value: unknown, max = 240) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

async function actor(request: Request) {
  const session = await getQuipslySessionFromRequest(request);
  return session?.user?.id ? session.user : null;
}

function handled(error: unknown) {
  if (error instanceof SessionRecordingShareError) {
    return privateJson({ ok: false, code: error.code, error: error.message, ...(error.details || {}) }, error.status);
  }
  console.error("[session-recording-share] operation failed", error);
  return privateJson({ ok: false, code: "RECORDING_SHARE_UNAVAILABLE", error: "Quipsly could not verify this private recording decision. Nothing was released or changed." }, 503);
}

export async function GET(request: Request, context: { params: Promise<{ roomId: string }> }) {
  const signedIn = await actor(request);
  if (!signedIn) return privateJson({ ok: false, code: "AUTH_REQUIRED", error: "Sign in before opening a Session recording." }, 401);
  const roomId = text((await context.params).roomId);
  if (!roomId) return privateJson({ ok: false, code: "ROOM_REQUIRED", error: "Choose one Session before opening its recording." }, 400);
  try {
    return privateJson({ ok: true, ...await readSessionRecordingShare(getPrismaClient() as any, { roomId, actor: signedIn }) });
  } catch (error) {
    return handled(error);
  }
}

export async function POST(request: Request, context: { params: Promise<{ roomId: string }> }) {
  const signedIn = await actor(request);
  if (!signedIn) return privateJson({ ok: false, code: "AUTH_REQUIRED", error: "Sign in before changing a Session recording." }, 401);
  const roomId = text((await context.params).roomId);
  let body: Record<string, any> = {};
  try { body = object(await request.json()); } catch { /* handled below */ }
  const action = text(body.action, 40).toUpperCase();
  const clientRequestId = text(body.clientRequestId, 80).toLowerCase();
  if (!roomId) return privateJson({ ok: false, code: "ROOM_REQUIRED", error: "Choose one Session before changing its recording." }, 400);
  if (!UUID.test(clientRequestId)) return privateJson({ ok: false, code: "REQUEST_ID_REQUIRED", error: "A stable request identity is required for this recording decision." }, 400);
  const prisma = getPrismaClient() as any;
  try {
    if (action === "PREPARE") {
      const result = await prepareSessionRecordingShare(prisma, {
        roomId,
        actor: signedIn,
        clientRequestId,
        title: text(body.title, 500),
        sourceIds: Array.isArray(body.sourceIds) ? body.sourceIds.map((value: unknown) => text(value)).filter(Boolean) : [],
        startSeconds: Number(body.startSeconds),
        endSeconds: Number(body.endSeconds),
      });
      return privateJson({ ok: true, ...result, boundaries: { sourceFilesMutated: false, releasedToClient: false, externalMessageSent: false } });
    }
    if (action !== "RELEASE" && action !== "REVOKE") {
      return privateJson({ ok: false, code: "ACTION_UNSUPPORTED", error: "Choose prepare, release, or revoke." }, 400);
    }
    const outputId = text(body.outputId);
    const expectedRevision = Number(body.expectedRevision);
    if (!outputId || !Number.isSafeInteger(expectedRevision) || expectedRevision < 1) {
      return privateJson({ ok: false, code: "CURRENT_RECORDING_REQUIRED", error: "Refresh and review the current prepared recording before changing its visibility." }, 400);
    }
    const result = await transitionSessionRecordingShare(prisma, { roomId, outputId, actor: signedIn, clientRequestId, expectedRevision, action });
    return privateJson({ ok: true, ...result, boundaries: { sourceFilesMutated: false, releasedToClient: action === "RELEASE", externalMessageSent: false } });
  } catch (error) {
    return handled(error);
  }
}
