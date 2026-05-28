import { createQuipStreamSession } from "@high-ground/quipsly-domain";
import { coerceStreamMode, jsonOk } from "@/lib/api";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as {
    readonly mode?: string;
    readonly entrySurface?: string;
    readonly anonymous?: boolean;
  };

  const session = createQuipStreamSession({
    mode: coerceStreamMode(body.mode ?? null),
    entrySurface: body.entrySurface ?? "api",
    anonymous: body.anonymous ?? true,
  });

  return jsonOk(session, { status: 201 });
}
