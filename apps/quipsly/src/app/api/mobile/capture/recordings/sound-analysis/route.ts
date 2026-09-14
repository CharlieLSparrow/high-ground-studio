import { getPrismaClient } from "@/lib/prisma";
import { getQuipslySessionFromRequest } from "@/lib/server/quipsly-session";
import { attachRecordingSoundAnalysis, RecordingSoundAnalysisError } from "@/lib/server/recording-sound-analysis";

export const runtime = "nodejs";
const MAX_BYTES = 512 * 1024;
const headers = { "Cache-Control": "private, no-store" };

export async function POST(request: Request) {
  const session = await getQuipslySessionFromRequest(request);
  if (!session?.user) return Response.json({ ok: false, code: "UNAUTHORIZED" }, { status: 401, headers });
  try {
    const reader = request.body?.getReader();
    if (!reader) throw new RecordingSoundAnalysisError(400, "INVALID_BODY", "Missing sound analysis.");
    const chunks: Uint8Array[] = [];
    let length = 0;
    try {
      while (true) {
        const part = await reader.read();
        if (part.done) break;
        length += part.value.byteLength;
        if (length > MAX_BYTES) {
          await reader.cancel();
          throw new RecordingSoundAnalysisError(413, "ANALYSIS_TOO_LARGE", "Sound analysis is too large.");
        }
        chunks.push(part.value);
      }
    } finally { reader.releaseLock(); }
    let body;
    try { body = JSON.parse(Buffer.concat(chunks).toString("utf8")); }
    catch { throw new RecordingSoundAnalysisError(400, "INVALID_BODY", "Invalid sound analysis."); }
    if (typeof body?.recordingAssetId !== "string" || !/^[A-Za-z0-9_-]{1,256}$/.test(body.recordingAssetId)) {
      throw new RecordingSoundAnalysisError(400, "INVALID_RECORDING", "Choose an exact recording.");
    }
    return Response.json(await attachRecordingSoundAnalysis({
      prisma: getPrismaClient(), actor: session.user, recordingAssetId: body.recordingAssetId, analysis: body.analysis,
    }), { headers });
  } catch (error) {
    if (error instanceof RecordingSoundAnalysisError) {
      return Response.json({ ok: false, code: error.code, error: error.message }, { status: error.status, headers });
    }
    console.error("[recording-sound-analysis] delivery failed", error);
    return Response.json({ ok: false, code: "ANALYSIS_SYNC_UNAVAILABLE" }, { status: 503, headers });
  }
}
