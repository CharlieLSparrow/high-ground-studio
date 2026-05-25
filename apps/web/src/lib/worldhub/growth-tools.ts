export type GrowthChecklistStatus = "ready" | "warning" | "missing";

export type GrowthChecklistItem = {
  id: string;
  label: string;
  status: GrowthChecklistStatus;
  detail: string;
};

export type SeoBriefDraft = {
  title: string;
  targetPath?: string | null;
  primaryKeyword?: string | null;
  secondaryKeywords?: string[];
  metaTitle?: string | null;
  metaDescription?: string | null;
  canonicalUrl?: string | null;
  structuredDataType?: string | null;
};

export type AnalyticsMetricInput = {
  pageViews?: string | number | null;
  sessions?: string | number | null;
  users?: string | number | null;
  clicks?: string | number | null;
  impressions?: string | number | null;
  conversions?: string | number | null;
  revenueCents?: string | number | null;
};

export type AnalyticsMetrics = {
  pageViews?: number;
  sessions?: number;
  users?: number;
  clicks?: number;
  impressions?: number;
  conversions?: number;
  revenueCents?: number;
  clickThroughRate?: number;
  conversionRate?: number;
};

const MAX_META_TITLE_LENGTH = 60;
const MIN_META_DESCRIPTION_LENGTH = 120;
const MAX_META_DESCRIPTION_LENGTH = 160;

export const DEFAULT_AFFILIATE_DISCLOSURE =
  "Some links may be affiliate links, which means High Ground Odyssey may earn a commission if you buy through them.";

export function slugifyGrowthText(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/['"]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

export function normalizeGrowthSlug(value: string, fallback: string) {
  return slugifyGrowthText(value) || slugifyGrowthText(fallback) || "growth-item";
}

export function splitKeywordList(value: string) {
  const seen = new Set<string>();

  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
    .filter((item) => {
      const key = item.toLowerCase();

      if (seen.has(key)) {
        return false;
      }

      seen.add(key);
      return true;
    })
    .slice(0, 12);
}

export function splitResearchList(value: string, limit = 8) {
  const seen = new Set<string>();

  return value
    .split(/\n|;/g)
    .map((item) => item.trim().replace(/^[-*]\s*/, ""))
    .filter(Boolean)
    .filter((item) => {
      const key = item.toLowerCase();

      if (seen.has(key)) {
        return false;
      }

      seen.add(key);
      return true;
    })
    .slice(0, limit);
}

export function normalizeSourceUrl(value: string) {
  const trimmed = value.trim();

  if (!trimmed) {
    return null;
  }

  try {
    return new URL(trimmed).toString();
  } catch {
    return null;
  }
}

export function normalizeContentPath(value: string) {
  const trimmed = value.trim();

  if (!trimmed) {
    return null;
  }

  if (/^https?:\/\//i.test(trimmed)) {
    try {
      const url = new URL(trimmed);
      return `${url.pathname}${url.search}` || "/";
    } catch {
      return null;
    }
  }

  return trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
}

function item(
  id: string,
  label: string,
  status: GrowthChecklistStatus,
  detail: string,
): GrowthChecklistItem {
  return { id, label, status, detail };
}

export function buildSeoChecklist(draft: SeoBriefDraft) {
  const secondaryKeywords = draft.secondaryKeywords ?? [];
  const metaTitle = draft.metaTitle?.trim() ?? "";
  const metaDescription = draft.metaDescription?.trim() ?? "";

  return [
    item(
      "target",
      "Target page",
      draft.targetPath || draft.canonicalUrl ? "ready" : "missing",
      draft.targetPath || draft.canonicalUrl
        ? "Brief is tied to a page or canonical URL."
        : "Add a path or canonical URL before this becomes actionable.",
    ),
    item(
      "primary-keyword",
      "Primary keyword",
      draft.primaryKeyword?.trim() ? "ready" : "missing",
      draft.primaryKeyword?.trim()
        ? "Primary search phrase is named."
        : "Pick one main phrase so the brief has a center of gravity.",
    ),
    item(
      "secondary-keywords",
      "Secondary keywords",
      secondaryKeywords.length > 0 ? "ready" : "warning",
      secondaryKeywords.length > 0
        ? `${secondaryKeywords.length} supporting phrase${
            secondaryKeywords.length === 1 ? "" : "s"
          } recorded.`
        : "Add related phrases after the primary target is clear.",
    ),
    item(
      "meta-title",
      "Meta title",
      metaTitle && metaTitle.length <= MAX_META_TITLE_LENGTH
        ? "ready"
        : metaTitle
          ? "warning"
          : "missing",
      metaTitle
        ? `${metaTitle.length}/${MAX_META_TITLE_LENGTH} characters.`
        : "Write a search-result title.",
    ),
    item(
      "meta-description",
      "Meta description",
      metaDescription.length >= MIN_META_DESCRIPTION_LENGTH &&
        metaDescription.length <= MAX_META_DESCRIPTION_LENGTH
        ? "ready"
        : metaDescription
          ? "warning"
          : "missing",
      metaDescription
        ? `${metaDescription.length} characters; aim for ${MIN_META_DESCRIPTION_LENGTH}-${MAX_META_DESCRIPTION_LENGTH}.`
        : "Write a short search-result description.",
    ),
    item(
      "structured-data",
      "Structured data",
      draft.structuredDataType?.trim() ? "ready" : "warning",
      draft.structuredDataType?.trim()
        ? `${draft.structuredDataType} marked as intended schema.`
        : "Choose article, podcast episode, book, organization, FAQ, or none.",
    ),
  ];
}

export function scoreSeoChecklist(items: GrowthChecklistItem[]) {
  if (items.length === 0) {
    return 0;
  }

  const points = items.reduce((total, current) => {
    if (current.status === "ready") {
      return total + 1;
    }

    if (current.status === "warning") {
      return total + 0.45;
    }

    return total;
  }, 0);

  return Math.round((points / items.length) * 100);
}

function parseMetric(value: string | number | null | undefined) {
  if (value === null || value === undefined || value === "") {
    return undefined;
  }

  const parsed =
    typeof value === "number" ? value : Number.parseFloat(String(value));

  if (!Number.isFinite(parsed) || parsed < 0) {
    return undefined;
  }

  return Math.round(parsed);
}

export function buildAnalyticsMetrics(
  input: AnalyticsMetricInput,
): AnalyticsMetrics {
  const metrics: AnalyticsMetrics = {
    pageViews: parseMetric(input.pageViews),
    sessions: parseMetric(input.sessions),
    users: parseMetric(input.users),
    clicks: parseMetric(input.clicks),
    impressions: parseMetric(input.impressions),
    conversions: parseMetric(input.conversions),
    revenueCents: parseMetric(input.revenueCents),
  };

  if (metrics.clicks !== undefined && metrics.impressions) {
    metrics.clickThroughRate = Number(
      (metrics.clicks / metrics.impressions).toFixed(4),
    );
  }

  if (metrics.conversions !== undefined && metrics.sessions) {
    metrics.conversionRate = Number(
      (metrics.conversions / metrics.sessions).toFixed(4),
    );
  }

  return Object.fromEntries(
    Object.entries(metrics).filter(([, value]) => value !== undefined),
  ) as AnalyticsMetrics;
}

export function buildMonetizationMetadata({
  affiliateProgram,
  productAuthor,
  productIsbn,
  adSlot,
  sponsorCategory,
}: {
  affiliateProgram?: string | null;
  productAuthor?: string | null;
  productIsbn?: string | null;
  adSlot?: string | null;
  sponsorCategory?: string | null;
}) {
  return Object.fromEntries(
    Object.entries({
      affiliateProgram: affiliateProgram?.trim() || undefined,
      productAuthor: productAuthor?.trim() || undefined,
      productIsbn: productIsbn?.trim() || undefined,
      adSlot: adSlot?.trim() || undefined,
      sponsorCategory: sponsorCategory?.trim() || undefined,
    }).filter(([, value]) => value !== undefined),
  );
}
