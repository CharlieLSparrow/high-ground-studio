import { jsonError, jsonOk } from "@/lib/api";
import { getMerchConceptByQuoteSlug } from "@high-ground/quipsly-domain/seed";

export async function GET(
  _request: Request,
  { params }: { readonly params: Promise<{ readonly slug: string }> },
) {
  const { slug } = await params;
  const merch = getMerchConceptByQuoteSlug(slug);

  if (!merch) {
    return jsonError("Merch concept not found.", 404);
  }

  return jsonOk({ merch });
}
