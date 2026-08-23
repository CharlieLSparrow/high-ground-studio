import { NextResponse } from "next/server";

import { getPrismaClient } from "@/lib/prisma";
import {
  buildCoachingTranscriptReport,
  coachingTranscriptReportFileName,
  CoachingTranscriptReportError,
  renderCoachingTranscriptReport,
} from "@/lib/server/coaching-transcript-report";
import { getQuipslySessionFromRequest } from "@/lib/server/quipsly-session";
import {
  readTranscriptCorrectionDesk,
  TranscriptCorrectionError,
} from "@/lib/server/transcript-corrections";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PRIVATE_HEADERS = {
  "Cache-Control": "private, no-store",
  Vary: "Authorization, Cookie",
  "X-Content-Type-Options": "nosniff",
};

function text(value: unknown, max = 240) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function privateJson(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: PRIVATE_HEADERS });
}

function contentDisposition(filename: string) {
  const ascii = filename.replace(/[^a-z0-9 ._-]+/gi, "").trim() || "Coaching Transcript.docx";
  return `attachment; filename="${ascii.replaceAll('"', "")}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}

export async function GET(request: Request, context: { params: Promise<{ roomId: string }> }) {
  const session = await getQuipslySessionFromRequest(request);
  if (!session?.user?.id) {
    return privateJson({ ok: false, code: "AUTH_REQUIRED", error: "Sign in before downloading a private coaching transcript." }, 401);
  }
  const { roomId: rawRoomId } = await context.params;
  const roomId = text(rawRoomId);
  const recordingAssetId = text(new URL(request.url).searchParams.get("recordingAssetId")) || null;
  if (!roomId) return privateJson({ ok: false, code: "ROOM_REQUIRED", error: "A Session is required." }, 400);

  try {
    const desk = await readTranscriptCorrectionDesk({
      prisma: getPrismaClient() as any,
      roomId,
      actor: {
        id: session.user.id,
        email: session.user.primaryEmail,
        isStaff: session.user.isStaff,
      },
      recordingAssetId,
    });
    if (desk.roomPurpose !== "COACHING") {
      throw new CoachingTranscriptReportError(
        "The mentor transcript format is available for coaching Sessions.",
        409,
        "REPORT_COACHING_REQUIRED",
      );
    }
    if (!desk.gate.allowed || !desk.transcriptJobId || !desk.recording?.id) {
      throw new CoachingTranscriptReportError(
        desk.gate.error || "A verified, consented recording transcript is required before export.",
        409,
        "REPORT_TRANSCRIPT_NOT_READY",
      );
    }
    const report = buildCoachingTranscriptReport({
      roomId: desk.roomId,
      title: desk.roomTitle || "Coaching Session",
      scheduledStart: desk.scheduledStart,
      generatedAt: new Date(),
      transcriptJobId: desk.transcriptJobId,
      recordingAssetId: desk.recording.id,
      sourceSha256: desk.sourceSha256,
      participants: desk.participants,
      speakerGroups: desk.speakerGroups,
      segments: desk.segments,
    });
    const document = await renderCoachingTranscriptReport(report);
    const filename = coachingTranscriptReportFileName(report);
    return new Response(new Uint8Array(document), {
      status: 200,
      headers: {
        ...PRIVATE_HEADERS,
        "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": contentDisposition(filename),
        "Content-Length": String(document.byteLength),
        "X-Quipsly-Transcript-Schema": report.schema,
      },
    });
  } catch (error) {
    if (error instanceof CoachingTranscriptReportError || error instanceof TranscriptCorrectionError) {
      return privateJson({ ok: false, code: error.code, error: error.message }, error.status);
    }
    console.error("[coaching-transcript-report] export failed", error);
    return privateJson({
      ok: false,
      code: "REPORT_UNAVAILABLE",
      error: "Quipsly could not prepare the private coaching transcript. Nothing was shared or changed.",
    }, 503);
  }
}
