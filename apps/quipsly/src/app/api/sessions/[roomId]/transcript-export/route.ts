import { NextResponse } from "next/server";
import { getPrismaClient } from "@/lib/prisma";
import { getQuipslySessionFromRequest } from "@/lib/server/quipsly-session";
import { readSessionTranscriptCorrectionDesk } from "@/lib/server/session-transcript-correction-desk";
import { TranscriptCorrectionError } from "@/lib/server/transcript-corrections";
import { createTranscriptExport, transcriptHasSubtitleTiming, type TranscriptExportFormat } from "@/lib/transcript-export";

export const dynamic = "force-dynamic";
const headers = {"Cache-Control": "private, no-store", Vary: "Authorization, Cookie", "X-Content-Type-Options": "nosniff"};
const json = (error: string, status: number) => NextResponse.json({ok: false, error}, {status, headers});

export async function GET(request: Request, context: {params: Promise<{roomId: string}>}) {
  const session = await getQuipslySessionFromRequest(request);
  if (!session?.user) return json("Sign in to export this transcript.", 401);
  const {roomId} = await context.params;
  const query = new URL(request.url).searchParams;
  const format = query.get("format") ?? "txt";
  if (!["txt", "md", "srt", "vtt"].includes(format)) return json("Choose TXT, Markdown, SRT, or WebVTT.", 400);
  try {
    const desk = await readSessionTranscriptCorrectionDesk({
      prisma: getPrismaClient(), roomId,
      actor: {id: session.user.id, email: session.user.primaryEmail, isStaff: session.user.isStaff},
      recordingAssetId: query.get("recordingAssetId") || null,
      transcriptJobId: query.get("transcriptJobId") || null,
    });
    if (!desk.gate.allowed || !desk.segments.length) return json("The transcript isn’t available to export yet.", 409);
    if ((format === "srt" || format === "vtt") && !transcriptHasSubtitleTiming(desk.segments)) return json("Subtitle timing is unavailable. Download a text transcript instead.", 409);
    const output = createTranscriptExport({title: desk.roomTitle || "Quipsly session", segments: desk.segments,
      format: format as TranscriptExportFormat, timestamps: query.get("timestamps") !== "false", speakers: query.get("speakers") !== "false"});
    return new Response(output.content, {headers: {...headers, "Content-Type": output.mimeType,
      "Content-Disposition": `attachment; filename="${output.filename}"`,
      "X-Quipsly-Transcript-Passages": String(desk.segments.length),
    }});
  } catch (error) {
    if (error instanceof TranscriptCorrectionError) return json(error.message, error.status);
    console.error("[transcript-export] export failed", error);
    return json("The transcript couldn’t be exported. Please try again.", 503);
  }
}
