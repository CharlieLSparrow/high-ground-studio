import { NextResponse } from "next/server";
import { getPrismaClient } from "@/lib/prisma";
import { getQuipslySessionFromRequest } from "@/lib/server/quipsly-session";
import { readSessionRecordingEdit, saveSessionRecordingEdit } from "@/lib/server/session-recording-edit";
import { SessionRecordingShareError } from "@/lib/server/session-recording-share";

const headers = {"Cache-Control": "private, no-store", Vary: "Authorization, Cookie"};
const json = (body: unknown, status = 200) => NextResponse.json(body, {status, headers});
async function handle(request: Request, context: {params: Promise<{roomId: string}>}, save: boolean) {
  const session = await getQuipslySessionFromRequest(request);
  if (!session?.user?.id) return json({ok: false, error: "Sign in to resume your recording edit."}, 401);
  try {
    const roomId = (await context.params).roomId;
    const takeId = new URL(request.url).searchParams.get("takeId") || "";
    const input = {roomId, takeId, actor: session.user};
    let edit;
    if (save) {
      const raw = await request.text();
      if (raw.length > 256_000) return json({ok: false, error: "This edit is too large to save."}, 413);
      let body;
      try { body = JSON.parse(raw); } catch { return json({ok: false, error: "The edit could not be read."}, 400); }
      if (body?.actorUserId !== session.user.id) return json({ok: false, code: "AUTH_CONTEXT_CHANGED", error: "Your signed-in account changed. Reload before editing."}, 409);
      edit = await saveSessionRecordingEdit(getPrismaClient(), {...input, expectedRevision: body?.expectedRevision,
        clientRequestId: body?.clientRequestId ?? "", state: body?.state});
    } else edit = await readSessionRecordingEdit(getPrismaClient(), input);
    return json({ok: true, actorUserId: session.user.id, edit});
  } catch (error) {
    if (error instanceof SessionRecordingShareError) return json({ok: false, error: error.message, code: error.code, ...error.details}, error.status);
    console.error("[recording-edit] save/read failed", error);
    return json({ok: false, error: "Your edit could not sync. Please try again."}, 503);
  }
}
export const GET = (request: Request, context: {params: Promise<{roomId: string}>}) => handle(request, context, false);
export const PUT = (request: Request, context: {params: Promise<{roomId: string}>}) => handle(request, context, true);
