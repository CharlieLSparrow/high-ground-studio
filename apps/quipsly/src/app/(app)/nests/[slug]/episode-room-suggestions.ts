export function sourceEpisodeNumber(sourceLabel: string | null, title: string) {
  const labelMatch = String(sourceLabel ?? "").match(/hgo-podcast-ep:(\d+)/i);
  const titleMatch = title.match(/(?:podcast\s+)?ep(?:isode)?\s*(\d+)/i);
  const value = Number(labelMatch?.[1] || titleMatch?.[1]);
  return Number.isInteger(value) && value > 0 ? value : null;
}

export function suggestedEpisodeTitle(sourceTitle: string, episodeNumber: number | null) {
  const cleaned = sourceTitle
    .replace(/^Podcast\s+Ep(?:isode)?\s*\d+\s*:\s*/i, "")
    .replace(/^[A-Z][a-z]{2}\s+\d{1,2}\s*[-–—]\s*/i, "")
    .trim();
  return episodeNumber ? `Episode ${episodeNumber}: ${cleaned || sourceTitle}` : cleaned || sourceTitle;
}

export function suggestedEpisodeSlug(title: string, episodeNumber: number | null) {
  const withoutEpisodePrefix = episodeNumber
    ? title.replace(new RegExp(`^Episode\\s+${episodeNumber}\\s*:\\s*`, "i"), "")
    : title;
  const label = withoutEpisodePrefix
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 72);
  return episodeNumber ? `episode-${episodeNumber}-${label}`.slice(0, 100).replace(/-+$/g, "") : label;
}
