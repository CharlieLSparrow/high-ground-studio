import { jsonError, jsonOk } from "@/lib/api";
import {
  getPersonBySlug,
  getPersonThemes,
  getQuotesForPersonSlug,
  getRelatedPeople,
} from "@high-ground/quipsly-domain/seed";

export async function GET(
  _request: Request,
  { params }: { readonly params: Promise<{ readonly slug: string }> },
) {
  const { slug } = await params;
  const person = getPersonBySlug(slug);

  if (!person) {
    return jsonError("Person not found.", 404);
  }

  return jsonOk({
    person,
    themes: getPersonThemes(person),
    quotes: getQuotesForPersonSlug(person.slug),
    relatedPeople: getRelatedPeople(person),
  });
}
