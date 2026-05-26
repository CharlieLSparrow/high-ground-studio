import { jsonError, jsonOk } from "@/lib/api";
import { getQuoteStoryBySlug } from "@high-ground/quipsly-domain/seed";

export async function GET(
  _request: Request,
  { params }: { readonly params: Promise<{ readonly slug: string }> },
) {
  const { slug } = await params;
  const story = getQuoteStoryBySlug(slug);

  if (!story) {
    return jsonError("Quote story not found.", 404);
  }

  return jsonOk({ story });
}
