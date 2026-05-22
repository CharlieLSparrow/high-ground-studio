import type { HgoProjectionReviewGate } from "./projection-review-gate";
import type {
  HgoEpisodeProjection,
  HgoProjectionStatus,
  HgoProjectionVisibility,
} from "./projection-types";

type HgoProjectionBridgeVersion = NonNullable<
  HgoEpisodeProjection["projectionSource"]
>["bridgeVersion"];

export type HgoStagedProjectionArtifactStatus =
  | "draft"
  | "review-blocked"
  | "review-ready"
  | "live-candidate";

export type HgoStagedProjectionArtifactNextAction =
  | "fix-blockers"
  | "human-review"
  | "candidate-for-future-staging"
  | "do-not-use";

export type HgoStagedProjectionArtifact = {
  artifactVersion: "hgo-staged-artifact-v1";
  artifactId: string;
  createdAt: string;
  status: HgoStagedProjectionArtifactStatus;
  source: {
    sourceKind: "browser-import";
    sourceBridgeVersion?: HgoProjectionBridgeVersion;
    projectionId: string;
    projectionSlug: string;
    projectionStatus: HgoProjectionStatus;
    projectionVisibility: HgoProjectionVisibility;
  };
  projection: HgoEpisodeProjection;
  reviewGate: HgoProjectionReviewGate;
  validationWarnings: string[];
  validationErrors: string[];
  safety: {
    persisted: false;
    published: false;
    containsRealContent: "unknown";
    operatorWarning: string;
  };
  recommendedNextAction: HgoStagedProjectionArtifactNextAction;
};

export type HgoStagedProjectionArtifactSummary = {
  artifactId: string;
  artifactVersion: HgoStagedProjectionArtifact["artifactVersion"];
  createdAt: string;
  status: HgoStagedProjectionArtifactStatus;
  projectionId: string;
  projectionSlug: string;
  projectionTitle: string;
  blockerCount: number;
  warningCount: number;
  recommendedNextAction: HgoStagedProjectionArtifactNextAction;
  persisted: false;
  published: false;
};

export type HgoStagedProjectionArtifactSafetyResult = {
  ok: boolean;
  errors: string[];
};

export type CreateHgoStagedProjectionArtifactInput = {
  projection: HgoEpisodeProjection;
  reviewGate: HgoProjectionReviewGate;
  validationWarnings: string[];
  validationErrors: string[];
  createdAt: string;
  artifactId?: string;
};

const artifactOperatorWarning =
  "Real projection drafts may contain private/review-only content. This browser artifact is not published, not persisted by HGO, and must stay private until human review is complete.";

function normalizeArtifactPart(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function createArtifactId(projection: HgoEpisodeProjection, createdAt: string) {
  const slug = normalizeArtifactPart(projection.slug || projection.id);
  const timestamp = normalizeArtifactPart(createdAt);

  return `hgo-stage-${slug || "projection"}-${timestamp || "artifact"}`;
}

function getArtifactStatus({
  projection,
  reviewGate,
  validationErrors,
}: {
  projection: HgoEpisodeProjection;
  reviewGate: HgoProjectionReviewGate;
  validationErrors: string[];
}): HgoStagedProjectionArtifactStatus {
  if (validationErrors.length) {
    return "draft";
  }

  if (reviewGate.blockerCount > 0) {
    return "review-blocked";
  }

  if (
    reviewGate.canPromoteToLive &&
    projection.status === "live" &&
    projection.visibility === "public"
  ) {
    return "live-candidate";
  }

  return "review-ready";
}

function getRecommendedNextAction({
  artifactStatus,
  reviewGate,
}: {
  artifactStatus: HgoStagedProjectionArtifactStatus;
  reviewGate: HgoProjectionReviewGate;
}): HgoStagedProjectionArtifactNextAction {
  const hasDoNotUseIssue = reviewGate.issues.some((issue) =>
    issue.id.includes("do-not-use"),
  );
  const isArchived = reviewGate.issues.some(
    (issue) => issue.id === "status-archived",
  );

  if (hasDoNotUseIssue || isArchived) {
    return "do-not-use";
  }

  if (artifactStatus === "draft" || artifactStatus === "review-blocked") {
    return "fix-blockers";
  }

  if (artifactStatus === "live-candidate") {
    return "candidate-for-future-staging";
  }

  return "human-review";
}

export function createHgoStagedProjectionArtifact({
  projection,
  reviewGate,
  validationWarnings,
  validationErrors,
  createdAt,
  artifactId,
}: CreateHgoStagedProjectionArtifactInput): HgoStagedProjectionArtifact {
  const status = getArtifactStatus({
    projection,
    reviewGate,
    validationErrors,
  });

  return {
    artifactVersion: "hgo-staged-artifact-v1",
    artifactId: artifactId ?? createArtifactId(projection, createdAt),
    createdAt,
    status,
    source: {
      sourceKind: "browser-import",
      sourceBridgeVersion: projection.projectionSource?.bridgeVersion,
      projectionId: projection.id,
      projectionSlug: projection.slug,
      projectionStatus: projection.status,
      projectionVisibility: projection.visibility,
    },
    projection,
    reviewGate,
    validationWarnings: [...validationWarnings],
    validationErrors: [...validationErrors],
    safety: {
      persisted: false,
      published: false,
      containsRealContent: "unknown",
      operatorWarning: artifactOperatorWarning,
    },
    recommendedNextAction: getRecommendedNextAction({
      artifactStatus: status,
      reviewGate,
    }),
  };
}

export function summarizeHgoStagedProjectionArtifact(
  artifact: HgoStagedProjectionArtifact,
): HgoStagedProjectionArtifactSummary {
  return {
    artifactId: artifact.artifactId,
    artifactVersion: artifact.artifactVersion,
    createdAt: artifact.createdAt,
    status: artifact.status,
    projectionId: artifact.projection.id,
    projectionSlug: artifact.projection.slug,
    projectionTitle: artifact.projection.title,
    blockerCount: artifact.reviewGate.blockerCount,
    warningCount: artifact.reviewGate.warningCount,
    recommendedNextAction: artifact.recommendedNextAction,
    persisted: artifact.safety.persisted,
    published: artifact.safety.published,
  };
}

export function createHgoStagedProjectionArtifactFileName(
  artifact: HgoStagedProjectionArtifact,
) {
  const slug = normalizeArtifactPart(artifact.source.projectionSlug);
  const timestamp = normalizeArtifactPart(artifact.createdAt);

  return `${slug || "hgo-projection"}-${timestamp || "staged-artifact"}.hgo-staged-artifact.json`;
}

export function assertHgoStagedProjectionArtifactIsBrowserOnlySafe(
  artifact: HgoStagedProjectionArtifact,
): HgoStagedProjectionArtifactSafetyResult {
  const errors: string[] = [];

  if (artifact.artifactVersion !== "hgo-staged-artifact-v1") {
    errors.push("Artifact version is not hgo-staged-artifact-v1.");
  }

  if (artifact.source.sourceKind !== "browser-import") {
    errors.push("Artifact source must be browser-import for this contract.");
  }

  if (artifact.safety.persisted !== false) {
    errors.push("Artifact safety.persisted must be false.");
  }

  if (artifact.safety.published !== false) {
    errors.push("Artifact safety.published must be false.");
  }

  if (artifact.safety.containsRealContent !== "unknown") {
    errors.push("Artifact safety.containsRealContent must remain unknown.");
  }

  return {
    ok: errors.length === 0,
    errors,
  };
}
