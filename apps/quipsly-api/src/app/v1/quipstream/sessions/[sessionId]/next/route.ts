import { coerceLimit, coerceStreamMode, jsonOk } from "@/lib/api";
import { getQuipStreamCards } from "@high-ground/quipsly-domain/seed";

export async function GET(
  request: Request,
  { params }: { readonly params: Promise<{ readonly sessionId: string }> },
) {
  const { sessionId } = await params;
  const url = new URL(request.url);
  const mode = coerceStreamMode(url.searchParams.get("mode"));
  const limit = coerceLimit(url.searchParams.get("limit"), 5);

  return jsonOk({
    sessionId,
    mode,
    candidates: getQuipStreamCards(mode).slice(0, limit),
  });
}
