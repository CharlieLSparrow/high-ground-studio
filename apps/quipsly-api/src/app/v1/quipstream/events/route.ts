import { jsonError, jsonOk } from "@/lib/api";
import type { QuipStreamEventType, StreamMode } from "@high-ground/quipsly-domain";
import { createQuipStreamEvent } from "@high-ground/quipsly-domain";
import { coerceStreamMode } from "@/lib/api";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as
    | {
        readonly sessionId?: string;
        readonly type?: QuipStreamEventType;
        readonly mode?: StreamMode;
        readonly quoteId?: string;
        readonly dwellMs?: number;
        readonly metadata?: Record<string, string | number | boolean>;
      }
    | null;

  if (!body?.sessionId || !body.type) {
    return jsonError("sessionId and type are required.", 422);
  }

  const event = createQuipStreamEvent({
    sessionId: body.sessionId,
    type: body.type,
    mode: coerceStreamMode(body.mode ?? null),
    quoteId: body.quoteId,
    dwellMs: body.dwellMs,
    metadata: body.metadata,
  });

  return jsonOk(
    {
      accepted: true,
      event,
      persistence: "prototype-memory-only",
    },
    { status: 202 },
  );
}
