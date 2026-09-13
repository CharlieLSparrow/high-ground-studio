import { NextResponse } from "next/server";
import { getPrismaClient } from "@/lib/prisma";
import { getQuipslySessionFromRequest } from "@/lib/server/quipsly-session";
import { sessionAccessWhere } from "@/lib/server/session-access";
import { sessionAfterCall } from "@/lib/session-after-call";

export const runtime = "nodejs";
const headers = { "Cache-Control": "private, no-store" };

/** Shared across endpoints: leaving a browser call must also find phone uploads.
 * Return availability, never source bytes, transcript text, or private notes. */
export async function GET(request: Request, context: { params: Promise<{ roomId: string }> }) {
  const session = await getQuipslySessionFromRequest(request);
  if (!session?.user) return NextResponse.json({ ok: false, error: "Sign in to open this session." }, { status: 401, headers });
  const { roomId } = await context.params;
  if (!roomId.trim() || roomId.length > 240) return NextResponse.json({ ok: false, error: "Choose a session." }, { status: 400, headers });
  try {
    const room = await getPrismaClient().callRoom.findFirst({
      where: sessionAccessWhere(roomId, session.user),
      select: {
        id: true,
        recordingAssets: { select: { id: true, kind: true, status: true, verifiedAt: true, localManifestJson: true } },
        transcriptJobs: { orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          select: { assetId: true, status: true, _count: { select: { segments: true } } } },
      },
    });
    if (!room) return NextResponse.json({ ok: false, error: "This session isn't available to this account." }, { status: 404, headers });
    return NextResponse.json({ ok: true, summary: sessionAfterCall(room.id, room.recordingAssets, room.transcriptJobs) }, { headers });
  } catch {
    return NextResponse.json({ ok: false, error: "Session updates aren't available right now. Your recordings have not been changed." }, { status: 503, headers });
  }
}
