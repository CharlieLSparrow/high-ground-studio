import { coerceLimit, coerceVerificationStatus, jsonOk } from "@/lib/api";
import {
  getAllQuipCards,
  themes,
} from "@high-ground/quipsly-domain/seed";

export function GET(request: Request) {
  const url = new URL(request.url);
  const query = url.searchParams.get("q")?.trim().toLowerCase();
  const status = coerceVerificationStatus(url.searchParams.get("status"));
  const themeSlug = url.searchParams.get("theme");
  const limit = coerceLimit(url.searchParams.get("limit"));
  const theme = themeSlug
    ? themes.find((candidate) => candidate.slug === themeSlug)
    : undefined;

  const cards = getAllQuipCards()
    .filter((card) => {
      if (status && card.quote.verificationStatus !== status) {
        return false;
      }

      if (theme && !card.quote.themeIds.includes(theme.id)) {
        return false;
      }

      if (!query) {
        return true;
      }

      const haystack = [
        card.quote.text,
        card.person.displayName,
        card.sourceWork.title,
        ...card.themes.map((cardTheme) => cardTheme.label),
      ]
        .join(" ")
        .toLowerCase();

      return haystack.includes(query);
    })
    .slice(0, limit);

  return jsonOk({
    results: cards,
    count: cards.length,
    query: query ?? null,
    status: status ?? null,
    theme: theme?.slug ?? null,
  });
}
