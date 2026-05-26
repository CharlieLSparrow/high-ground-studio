import { jsonError, jsonOk } from "@/lib/api";
import { getQuotePassportBySlug } from "@high-ground/quipsly-domain/seed";

export async function GET(
  _request: Request,
  { params }: { readonly params: Promise<{ readonly slug: string }> },
) {
  const { slug } = await params;
  const passport = getQuotePassportBySlug(slug);

  if (!passport) {
    return jsonError("Quote Passport not found.", 404);
  }

  return jsonOk(passport);
}
