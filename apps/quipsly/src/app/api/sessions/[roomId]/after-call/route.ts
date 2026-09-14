import { NextResponse } from "next/server";
import { getPrismaClient } from "@/lib/prisma";
import { getQuipslySessionFromRequest } from "@/lib/server/quipsly-session";
import { sessionAccessWhere } from "@/lib/server/session-access";
import { sessionAfterCall } from "@/lib/session-after-call";
import { isOriginalSessionRecordingAsset } from "@/lib/session-recording-sources";
import { readSessionRecordingAttempts } from "@/lib/server/session-recording-attempts";
import { selectSessionTranscriptRecordingLanes, selectSessionTranscriptTake } from "@/lib/server/session-transcript-source-selection";
import { loadSessionAfterCallWork } from "@/lib/server/session-after-call-work";

export const runtime = "nodejs";
const headers = { "Cache-Control": "private, no-store" };

/** Shared across endpoints: leaving a browser call must also find phone uploads.
 * Media availability and ordinary visible work use their canonical scopes. */
export async function GET(request: Request, context: { params: Promise<{ roomId: string }> }) {
  const session = await getQuipslySessionFromRequest(request);
  if (!session?.user) return NextResponse.json({ ok: false, error: "Sign in to open this session." }, { status: 401, headers });
  const { roomId } = await context.params;
  if (!roomId.trim() || roomId.length > 240) return NextResponse.json({ ok: false, error: "Choose a session." }, { status: 400, headers });
  try {
    const prisma = getPrismaClient();
    const room = await prisma.callRoom.findFirst({
      where: sessionAccessWhere(roomId, session.user),
      select: {
        id: true,
        recordingAssets: { select: { id: true, kind: true, status: true, verifiedAt: true, localManifestJson: true,
          participantId: true, recordedStartedAt: true, recordedStoppedAt: true } },
        transcriptJobs: { orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          select: { id: true, createdAt: true, assetId: true, status: true, _count: { select: { segments: true } } } },
      },
    });
    if (!room) return NextResponse.json({ ok: false, error: "This session isn't available to this account." }, { status: 404, headers });
    const originals = room.recordingAssets.filter(isOriginalSessionRecordingAsset);
    const candidates = originals.flatMap(asset => {
      if (!asset.participantId || !asset.recordedStartedAt || !["LOCAL_AUDIO", "LOCAL_VIDEO"].includes(asset.kind)) return [];
      const job = asset.status === "VERIFIED" ? room.transcriptJobs.find(job =>
        job.assetId === asset.id && job.status === "COMPLETED" && job._count.segments > 0) : null;
      return [{...asset, recordedStartedAt: asset.recordedStartedAt,
        transcriptJobs: job ? [{id: job.id, createdAt: job.createdAt}] : []}];
    });
    // The handoff and the transcript reader must describe the same take. A
    // completed older recording must not make a new pending take look ready.
    const selection = {rows: candidates, attempts: candidates.length ? await readSessionRecordingAttempts(prisma, room.id, candidates) : []};
    const take = selectSessionTranscriptTake(selection);
    const lanes = new Set(selectSessionTranscriptRecordingLanes(selection).flatMap(source => source ? [source.id] : []));
    const current = take.length ? take : originals;
    const jobs = take.length ? room.transcriptJobs.filter(job => job.assetId && lanes.has(job.assetId)) : room.transcriptJobs;
    const summary = sessionAfterCall(room.id, current, jobs);
    summary.recordingSourceId = lanes.values().next().value ?? current[0]?.id ?? null;
    const other = originals.length - current.length;
    if (other > 0) summary.otherRecordingCount = other;
    // A temporary work-query failure must not hide upload recovery or playback.
    summary.followThrough = await loadSessionAfterCallWork({ prisma, roomId: room.id, actor: session.user,
      sourceIds: lanes.size ? [...lanes] : current.map(asset => asset.id) }).catch(() => null);
    return NextResponse.json({ ok: true, summary }, { headers });
  } catch {
    return NextResponse.json({ ok: false, error: "Session updates aren't available right now. Your recordings have not been changed." }, { status: 503, headers });
  }
}
