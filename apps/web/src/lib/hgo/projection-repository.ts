import { syntheticEpisodeProjections } from "./synthetic-episode-projection";
import {
  type HgoCitationState,
  type HgoContentScope,
  type HgoEpisodeProjection,
  type HgoProjectionStatus,
  getProjectionMapStats,
  isPublicSafeProjection,
} from "./projection-types";

const hgoProjectionStatuses: HgoProjectionStatus[] = [
  "synthetic",
  "staged",
  "live",
  "archived",
];

const hgoProjectionScopes: HgoContentScope[] = [
  "book-only",
  "episode-only",
  "book-and-episode",
  "internal",
];

const unresolvedCitationStates = new Set<HgoCitationState>([
  "needs-source",
  "needs-review",
  "do-not-use",
]);

export type HgoProjectionReadinessSummary = {
  unresolvedPullQuoteCount: number;
  needsSourceCount: number;
  needsReviewCount: number;
  doNotUseCount: number;
  isLiveSafe: boolean;
  warnings: string[];
};

export function listHgoEpisodeProjections(): HgoEpisodeProjection[] {
  return [...syntheticEpisodeProjections];
}

export function getHgoEpisodeProjectionBySlug(slug: string) {
  return listHgoEpisodeProjections().find(
    (projection) => projection.slug === slug,
  );
}

export function listHgoProjectionStatuses(): HgoProjectionStatus[] {
  return hgoProjectionStatuses;
}

export function listHgoProjectionScopes(): HgoContentScope[] {
  return hgoProjectionScopes;
}

export function summarizeHgoProjectionReadiness(
  projection: HgoEpisodeProjection,
): HgoProjectionReadinessSummary {
  const unresolvedPullQuoteCount = projection.pullQuotes.filter((quote) =>
    unresolvedCitationStates.has(quote.citationState),
  ).length;
  const needsSourceCount = projection.pullQuotes.filter(
    (quote) => quote.citationState === "needs-source",
  ).length;
  const needsReviewCount =
    projection.pullQuotes.filter(
      (quote) => quote.citationState === "needs-review",
    ).length +
    projection.sourceNotes.filter((note) => note.status === "needs-review")
      .length;
  const doNotUseCount =
    projection.pullQuotes.filter((quote) => quote.citationState === "do-not-use")
      .length +
    projection.sourceNotes.filter((note) => note.status === "do-not-use").length;
  const isLiveSafe = isPublicSafeProjection(projection);
  const warnings: string[] = [
    "Current staged repository data is synthetic fixture data only.",
  ];

  if (projection.status !== "live" || projection.visibility !== "public") {
    warnings.push(
      "This projection is staged or internal review material, not a live public page.",
    );
  }

  if (unresolvedPullQuoteCount) {
    warnings.push(
      `${unresolvedPullQuoteCount.toLocaleString()} pull quote${
        unresolvedPullQuoteCount === 1 ? "" : "s"
      } need source or citation review before live publication.`,
    );
  }

  if (needsSourceCount) {
    warnings.push(
      `${needsSourceCount.toLocaleString()} pull quote${
        needsSourceCount === 1 ? "" : "s"
      } still need source metadata.`,
    );
  }

  if (needsReviewCount) {
    warnings.push(
      `${needsReviewCount.toLocaleString()} quote or source note${
        needsReviewCount === 1 ? "" : "s"
      } need review before promotion.`,
    );
  }

  if (doNotUseCount) {
    warnings.push(
      `${doNotUseCount.toLocaleString()} quote or source note${
        doNotUseCount === 1 ? "" : "s"
      } are marked do-not-use and must block live publishing.`,
    );
  }

  if (projection.status === "live" && projection.visibility === "public" && !isLiveSafe) {
    warnings.push(
      "This projection claims live/public status but does not satisfy live-safe citation checks.",
    );
  }

  return {
    unresolvedPullQuoteCount,
    needsSourceCount,
    needsReviewCount,
    doNotUseCount,
    isLiveSafe,
    warnings,
  };
}

export function getHgoProjectionRepositoryStats() {
  return getProjectionMapStats(listHgoEpisodeProjections());
}
