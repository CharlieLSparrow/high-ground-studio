import { NextResponse } from "next/server";
import { getPrismaClient } from "@/lib/prisma";
import { getQuipslySessionFromRequest } from "@/lib/server/quipsly-session";
import { readSessionRecordingShareTranscript, SessionRecordingShareError } from "@/lib/server/session-recording-share";
import { createTranscriptExport, type TranscriptExportFormat } from "@/lib/transcript-export";

export const dynamic = "force-dynamic";
const headers = {"Cache-Control": "private, no-store", Vary: "Authorization, Cookie", "X-Content-Type-Options": "nosniff"};
const fail = (error: string, status: number) => NextResponse.json({ok: false, error}, {status, headers});

export async function GET(request: Request, context: {params: Promise<{roomId: string; outputId: string}>}) {
  const session = await getQuipslySessionFromRequest(request);
  if (!session?.user?.id) return fail("Sign in to export this recording’s transcript.", 401);
  const query = new URL(request.url).searchParams;
  const format = query.get("format") || "txt";
  if (!["txt", "md", "srt", "vtt", "json"].includes(format)) return fail("Choose TXT, Markdown, SRT, or WebVTT.", 400);
  try {
    const projection = await readSessionRecordingShareTranscript(getPrismaClient(), {...await context.params, actor: session.user});
    const notice = [projection.omittedBoundaryPassages ? "Some words cut at a boundary were omitted because their remaining timing is uncertain." : "",
      projection.untranscribedSources ? "Some recording tracks do not have a transcript yet." : ""].filter(Boolean).join(" ");
    const partial = projection.omittedBoundaryPassages > 0 || projection.untranscribedSources > 0;
    if (format === "json") return NextResponse.json({ok: true, ...projection, notice, partial}, {headers});
    if (!projection.segments.length) return fail("No transcribed speech is available in this edited recording yet.", 409);
    const output = createTranscriptExport({title: projection.title, segments: projection.segments, format: format as TranscriptExportFormat,
      timestamps: query.get("timestamps") !== "false", speakers: query.get("speakers") !== "false", partial, notice});
    return new Response(output.content, {headers: {...headers, "Content-Type": output.mimeType,
      "Content-Disposition": `attachment; filename="${output.filename}"`,
      "X-Quipsly-Transcript-Passages": String(projection.segments.length),
      "X-Quipsly-Omitted-Boundary-Passages": String(projection.omittedBoundaryPassages),
      "X-Quipsly-Untranscribed-Sources": String(projection.untranscribedSources),
    }});
  } catch (error) {
    if (error instanceof SessionRecordingShareError) return fail(error.message, error.status);
    console.error("[recording-transcript-export] export failed", error);
    return fail("The recording transcript couldn’t be exported. Please try again.", 503);
  }
}
