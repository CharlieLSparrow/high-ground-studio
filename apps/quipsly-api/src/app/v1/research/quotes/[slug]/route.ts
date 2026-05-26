import { jsonError, jsonOk } from "@/lib/api";
import { getResearchPacketByQuoteSlug } from "@high-ground/quipsly-domain/seed";

export async function GET(
  _request: Request,
  { params }: { readonly params: Promise<{ readonly slug: string }> },
) {
  const { slug } = await params;
  const packet = getResearchPacketByQuoteSlug(slug);

  if (!packet) {
    return jsonError("Research packet not found.", 404);
  }

  return jsonOk({ packet });
}
