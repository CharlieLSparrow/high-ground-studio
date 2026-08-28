import { NextResponse } from "next/server";

import { getQuipslySessionFromRequest } from "@/lib/server/quipsly-session";
import {
  buildVoiceWritingDocxDocument,
  renderVoiceWritingDocx,
  voiceWritingDocxFileName,
  VoiceWritingDocxError,
} from "@/lib/server/voice-writing-docx";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PRIVATE_HEADERS = {
  "Cache-Control": "private, no-store",
  Vary: "Authorization, Cookie",
  "X-Content-Type-Options": "nosniff",
};

function privateJson(body: unknown, status: number) {
  return NextResponse.json(body, { status, headers: PRIVATE_HEADERS });
}

function contentDisposition(filename: string) {
  const ascii = filename.replace(/[^a-z0-9 ._()-]+/gi, "").trim() || "Voice note.docx";
  return `attachment; filename="${ascii.replaceAll('"', "")}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}

export async function POST(request: Request) {
  const session = await getQuipslySessionFromRequest(request);
  const actorUserId = String(session?.user?.id || "").trim();
  if (!actorUserId) {
    return privateJson(
      { ok: false, code: "AUTH_REQUIRED", error: "Sign in before sharing private writing." },
      401,
    );
  }
  try {
    const input = await request.json();
    const document = buildVoiceWritingDocxDocument(input);
    const buffer = await renderVoiceWritingDocx(document);
    const filename = voiceWritingDocxFileName(document);
    return new Response(new Uint8Array(buffer), {
      status: 200,
      headers: {
        ...PRIVATE_HEADERS,
        "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": contentDisposition(filename),
        "Content-Length": String(buffer.byteLength),
        "X-Quipsly-Writing-Schema": document.schema,
      },
    });
  } catch (error) {
    if (error instanceof VoiceWritingDocxError) {
      return privateJson({ ok: false, code: error.code, error: error.message }, error.status);
    }
    if (error instanceof SyntaxError) {
      return privateJson(
        { ok: false, code: "VOICE_WRITING_EXPORT_INVALID", error: "The writing is not valid JSON." },
        400,
      );
    }
    console.error("[voice-writing-export] failed", { actorUserId, error });
    return privateJson(
      { ok: false, code: "VOICE_WRITING_EXPORT_FAILED", error: "The Word document could not be created yet." },
      500,
    );
  }
}
