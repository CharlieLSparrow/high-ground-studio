import type {
  HgoEpisodeProjection,
  HgoProjectionStatus,
  HgoProjectionVisibility,
} from "./projection-types";

export type HgoProjectionReviewIssueSeverity = "info" | "warning" | "blocker";

export type HgoProjectionReviewIssue = {
  id: string;
  severity: HgoProjectionReviewIssueSeverity;
  title: string;
  detail: string;
  blocksLivePromotion: boolean;
};

export type HgoProjectionReviewGate = {
  projection: {
    id: string;
    slug: string;
    title: string;
  };
  status: HgoProjectionStatus;
  visibility: HgoProjectionVisibility;
  isLiveSafe: boolean;
  canPromoteToLive: boolean;
  blockerCount: number;
  warningCount: number;
  issues: HgoProjectionReviewIssue[];
};

export type HgoProjectionReviewGroups = {
  blocked: HgoProjectionReviewGate[];
  needsReview: HgoProjectionReviewGate[];
  liveSafe: HgoProjectionReviewGate[];
};

function createIssue(
  issue: HgoProjectionReviewIssue,
): HgoProjectionReviewIssue {
  return issue;
}

function isSyntheticFixtureProjection(projection: HgoEpisodeProjection) {
  return (
    projection.id.startsWith("synthetic-") ||
    projection.slug.startsWith("synthetic-") ||
    projection.projectionSource?.bridgeVersion === "synthetic-fixture-v1"
  );
}

export function listHgoProjectionReviewIssues(
  projection: HgoEpisodeProjection,
): HgoProjectionReviewIssue[] {
  const issues: HgoProjectionReviewIssue[] = [];

  if (!projection.title.trim()) {
    issues.push(
      createIssue({
        id: "missing-title",
        severity: "blocker",
        title: "Missing title",
        detail: "A projection must have a title before it can be reviewed for live promotion.",
        blocksLivePromotion: true,
      }),
    );
  }

  if (!projection.slug.trim()) {
    issues.push(
      createIssue({
        id: "missing-slug",
        severity: "blocker",
        title: "Missing slug",
        detail: "A projection must have an addressable slug before it can be reviewed for live promotion.",
        blocksLivePromotion: true,
      }),
    );
  }

  if (projection.status === "archived") {
    issues.push(
      createIssue({
        id: "status-archived",
        severity: "blocker",
        title: "Archived projection",
        detail: "Archived projections are out of the release path and must not be promoted to live.",
        blocksLivePromotion: true,
      }),
    );
  }

  projection.pullQuotes.forEach((quote, index) => {
    const number = index + 1;

    if (quote.citationState === "needs-source") {
      issues.push(
        createIssue({
          id: `pull-quote-${number}-needs-source`,
          severity: "blocker",
          title: "Pull quote needs source",
          detail: `Pull quote ${number.toLocaleString()} is marked needs-source and must receive source metadata before live promotion.`,
          blocksLivePromotion: true,
        }),
      );
    }

    if (quote.citationState === "needs-review") {
      issues.push(
        createIssue({
          id: `pull-quote-${number}-needs-review`,
          severity: "blocker",
          title: "Pull quote needs review",
          detail: `Pull quote ${number.toLocaleString()} is marked needs-review and must pass citation/public-safety review before live promotion.`,
          blocksLivePromotion: true,
        }),
      );
    }

    if (quote.citationState === "do-not-use") {
      issues.push(
        createIssue({
          id: `pull-quote-${number}-do-not-use`,
          severity: "blocker",
          title: "Pull quote marked do-not-use",
          detail: `Pull quote ${number.toLocaleString()} is marked do-not-use and must block live promotion.`,
          blocksLivePromotion: true,
        }),
      );
    }
  });

  projection.sourceNotes.forEach((sourceNote, index) => {
    const number = index + 1;

    if (sourceNote.status === "needs-review") {
      issues.push(
        createIssue({
          id: `source-note-${number}-needs-review`,
          severity: "blocker",
          title: "Source note needs review",
          detail: `Source note ${number.toLocaleString()} is marked needs-review and must pass review before live promotion.`,
          blocksLivePromotion: true,
        }),
      );
    }

    if (sourceNote.status === "do-not-use") {
      issues.push(
        createIssue({
          id: `source-note-${number}-do-not-use`,
          severity: "blocker",
          title: "Source note marked do-not-use",
          detail: `Source note ${number.toLocaleString()} is marked do-not-use and must block live promotion.`,
          blocksLivePromotion: true,
        }),
      );
    }
  });

  const hasLiveBlockingIssue = issues.some((issue) => issue.blocksLivePromotion);

  if (
    projection.status === "live" &&
    projection.visibility === "public" &&
    hasLiveBlockingIssue
  ) {
    issues.push(
      createIssue({
        id: "live-public-not-live-safe",
        severity: "blocker",
        title: "Live/public projection is not live-safe",
        detail: "This projection claims live/public status but still has issues that block live promotion.",
        blocksLivePromotion: true,
      }),
    );
  }

  if (isSyntheticFixtureProjection(projection)) {
    issues.push(
      createIssue({
        id: "synthetic-fixture-data",
        severity: "warning",
        title: "Synthetic fixture data",
        detail: "This projection is fake fixture data for staged review testing, not real HGO content.",
        blocksLivePromotion: false,
      }),
    );
  }

  if (projection.visibility === "staged" || projection.visibility === "private") {
    issues.push(
      createIssue({
        id: `visibility-${projection.visibility}`,
        severity: "warning",
        title: "Not public visibility",
        detail: `Visibility is ${projection.visibility}. Future promotion must explicitly move approved projections to public visibility.`,
        blocksLivePromotion: false,
      }),
    );
  }

  if (projection.pullQuotes.length) {
    issues.push(
      createIssue({
        id: "pull-quotes-present",
        severity: "warning",
        title: "Pull quotes present",
        detail: "Pull quote text requires citation and public-safety review before any real projection can go live.",
        blocksLivePromotion: false,
      }),
    );
  }

  if (projection.audio.state !== "published") {
    issues.push(
      createIssue({
        id: "audio-not-published",
        severity: "warning",
        title: "Audio not published",
        detail: `Audio state is ${projection.audio.state}. Future live episode promotion may need a published audio asset or an intentional book-only exception.`,
        blocksLivePromotion: false,
      }),
    );
  }

  if (projection.projectionSource?.bridgeVersion === "studio-browser-v1") {
    issues.push(
      createIssue({
        id: "studio-browser-bridge",
        severity: "warning",
        title: "Studio browser bridge draft",
        detail: "Studio browser bridge projections are suitable for staged review, not live publication.",
        blocksLivePromotion: false,
      }),
    );
  }

  issues.push(
    createIssue({
      id: "publish-action-deferred",
      severity: "info",
      title: "No publish action exists",
      detail: "Promote to live will require a later approved workflow.",
      blocksLivePromotion: false,
    }),
  );

  return issues;
}

export function createHgoProjectionReviewGate(
  projection: HgoEpisodeProjection,
): HgoProjectionReviewGate {
  const issues = listHgoProjectionReviewIssues(projection);
  const blockerCount = issues.filter((issue) => issue.severity === "blocker")
    .length;
  const warningCount = issues.filter((issue) => issue.severity === "warning")
    .length;
  const isLiveSafe = blockerCount === 0;
  const canPromoteToLive = isLiveSafe;

  return {
    projection: {
      id: projection.id,
      slug: projection.slug,
      title: projection.title,
    },
    status: projection.status,
    visibility: projection.visibility,
    isLiveSafe,
    canPromoteToLive,
    blockerCount,
    warningCount,
    issues,
  };
}

export function groupHgoProjectionsByReviewState(
  projections: HgoEpisodeProjection[],
): HgoProjectionReviewGroups {
  const groups: HgoProjectionReviewGroups = {
    blocked: [],
    needsReview: [],
    liveSafe: [],
  };

  for (const projection of projections) {
    const gate = createHgoProjectionReviewGate(projection);

    if (gate.blockerCount > 0) {
      groups.blocked.push(gate);
    } else if (gate.isLiveSafe) {
      groups.liveSafe.push(gate);
    } else {
      groups.needsReview.push(gate);
    }
  }

  return groups;
}
