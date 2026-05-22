import type { HgoProjectionReviewGate } from "./projection-review-gate";
import type {
  HgoEpisodeProjection,
  HgoProjectionStatus,
  HgoProjectionVisibility,
} from "./projection-types";
import { validateHgoEpisodeProjection } from "./projection-validation";

export type HgoProjectionBridgeVersion = NonNullable<
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

export type HgoStagedProjectionArtifactValidationResult = {
  ok: boolean;
  errors: string[];
  warnings: string[];
  artifact: HgoStagedProjectionArtifact | null;
};

export type HgoStagedProjectionArtifactImportSummary =
  HgoStagedProjectionArtifactSummary & {
    sourceKind: HgoStagedProjectionArtifact["source"]["sourceKind"];
    sourceBridgeVersion?: HgoProjectionBridgeVersion;
    projectionStatus: HgoProjectionStatus;
    projectionVisibility: HgoProjectionVisibility;
    containsRealContent: HgoStagedProjectionArtifact["safety"]["containsRealContent"];
    validationWarningCount: number;
    validationErrorCount: number;
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

const artifactStatusValues = new Set<HgoStagedProjectionArtifactStatus>([
  "draft",
  "review-blocked",
  "review-ready",
  "live-candidate",
]);

const artifactNextActionValues = new Set<HgoStagedProjectionArtifactNextAction>([
  "fix-blockers",
  "human-review",
  "candidate-for-future-staging",
  "do-not-use",
]);

const projectionStatusValues = new Set<HgoProjectionStatus>([
  "synthetic",
  "staged",
  "live",
  "archived",
]);

const projectionVisibilityValues = new Set<HgoProjectionVisibility>([
  "private",
  "staged",
  "public",
]);

function normalizeArtifactPart(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function addUnique(items: string[], item: string) {
  if (!items.includes(item)) {
    items.push(item);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function validateRequiredString(
  value: Record<string, unknown>,
  field: string,
  errors: string[],
  label = "Artifact",
) {
  if (!isNonEmptyString(value[field])) {
    errors.push(`${label} missing required string field: ${field}.`);
  }
}

function validateStringArray(
  value: Record<string, unknown>,
  field: string,
  errors: string[],
  label = "Artifact",
) {
  if (!Array.isArray(value[field])) {
    errors.push(`${label} missing required array field: ${field}.`);
    return;
  }

  const invalidIndex = value[field].findIndex(
    (item) => typeof item !== "string",
  );

  if (invalidIndex >= 0) {
    errors.push(
      `${label} field ${field} must contain only strings; item ${
        invalidIndex + 1
      } is invalid.`,
    );
  }
}

function hasBrowserStateOrSecretMarker(serialized: string) {
  return (
    /"(?:cookie|cookies|localStorage|sessionStorage|storageState|authorization|accessToken|refreshToken|idToken|password|clientSecret|apiKey|secret)"\s*:/i.test(
      serialized,
    ) || /document\.cookie|Bearer\s+[A-Za-z0-9._~+/=-]+/i.test(serialized)
  );
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

export function validateHgoStagedProjectionArtifact(
  input: unknown,
): HgoStagedProjectionArtifactValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  let serialized = "";

  try {
    serialized = JSON.stringify(input) ?? "";
  } catch {
    errors.push("Artifact JSON must be serializable.");
  }

  if (serialized && hasBrowserStateOrSecretMarker(serialized)) {
    errors.push(
      "Artifact JSON appears to contain browser storage, cookie, or credential-like keys.",
    );
  }

  if (!isRecord(input)) {
    return {
      ok: false,
      errors: [
        ...errors,
        "Artifact JSON must be an object using hgo-staged-artifact-v1.",
      ],
      warnings,
      artifact: null,
    };
  }

  if (input.artifactVersion !== "hgo-staged-artifact-v1") {
    errors.push("Artifact version must be hgo-staged-artifact-v1.");
  }

  validateRequiredString(input, "artifactId", errors);
  validateRequiredString(input, "createdAt", errors);

  if (!artifactStatusValues.has(input.status as HgoStagedProjectionArtifactStatus)) {
    errors.push("Artifact status is not a known staged artifact status.");
  }

  if (
    !artifactNextActionValues.has(
      input.recommendedNextAction as HgoStagedProjectionArtifactNextAction,
    )
  ) {
    errors.push("Artifact recommendedNextAction is not known.");
  }

  validateStringArray(input, "validationWarnings", errors);
  validateStringArray(input, "validationErrors", errors);

  const source = isRecord(input.source) ? input.source : null;
  const projection = isRecord(input.projection) ? input.projection : null;
  const reviewGate = isRecord(input.reviewGate) ? input.reviewGate : null;
  const safety = isRecord(input.safety) ? input.safety : null;

  if (!source) {
    errors.push("Artifact source must be an object.");
  } else {
    if (source.sourceKind !== "browser-import") {
      errors.push("Artifact source.sourceKind must be browser-import.");
    }

    validateRequiredString(source, "projectionId", errors, "Artifact source");
    validateRequiredString(source, "projectionSlug", errors, "Artifact source");

    if (
      !projectionStatusValues.has(source.projectionStatus as HgoProjectionStatus)
    ) {
      errors.push("Artifact source.projectionStatus is not known.");
    }

    if (
      !projectionVisibilityValues.has(
        source.projectionVisibility as HgoProjectionVisibility,
      )
    ) {
      errors.push("Artifact source.projectionVisibility is not known.");
    }

    if (source.sourceBridgeVersion === "studio-browser-v1") {
      addUnique(
        warnings,
        "Artifact was created from the Studio browser bridge and is suitable for staged review only.",
      );
    }
  }

  if (!projection) {
    errors.push("Artifact projection must be an object.");
  } else {
    const projectionValidation = validateHgoEpisodeProjection(projection);

    for (const error of projectionValidation.errors) {
      errors.push(`Projection validation: ${error}`);
    }

    for (const warning of projectionValidation.warnings) {
      addUnique(warnings, `Projection validation: ${warning}`);
    }
  }

  if (source && projection) {
    if (
      isNonEmptyString(source.projectionId) &&
      isNonEmptyString(projection.id) &&
      source.projectionId !== projection.id
    ) {
      errors.push("Artifact source.projectionId does not match projection.id.");
    }

    if (
      isNonEmptyString(source.projectionSlug) &&
      isNonEmptyString(projection.slug) &&
      source.projectionSlug !== projection.slug
    ) {
      errors.push(
        "Artifact source.projectionSlug does not match projection.slug.",
      );
    }

    if (
      projectionStatusValues.has(source.projectionStatus as HgoProjectionStatus) &&
      source.projectionStatus !== projection.status
    ) {
      errors.push(
        "Artifact source.projectionStatus does not match projection.status.",
      );
    }

    if (
      projectionVisibilityValues.has(
        source.projectionVisibility as HgoProjectionVisibility,
      ) &&
      source.projectionVisibility !== projection.visibility
    ) {
      errors.push(
        "Artifact source.projectionVisibility does not match projection.visibility.",
      );
    }
  }

  if (!reviewGate) {
    errors.push("Artifact reviewGate must be an object.");
  } else {
    const gateProjection = isRecord(reviewGate.projection)
      ? reviewGate.projection
      : null;

    if (!gateProjection) {
      errors.push("Artifact reviewGate.projection must be an object.");
    } else if (projection) {
      if (
        isNonEmptyString(gateProjection.id) &&
        isNonEmptyString(projection.id) &&
        gateProjection.id !== projection.id
      ) {
        errors.push("Artifact reviewGate projection id does not match projection.id.");
      }

      if (
        isNonEmptyString(gateProjection.slug) &&
        isNonEmptyString(projection.slug) &&
        gateProjection.slug !== projection.slug
      ) {
        errors.push(
          "Artifact reviewGate projection slug does not match projection.slug.",
        );
      }
    }

    if (typeof reviewGate.blockerCount !== "number") {
      errors.push("Artifact reviewGate.blockerCount must be a number.");
    }

    if (typeof reviewGate.warningCount !== "number") {
      errors.push("Artifact reviewGate.warningCount must be a number.");
    }

    if (!Array.isArray(reviewGate.issues)) {
      errors.push("Artifact reviewGate.issues must be an array.");
    }
  }

  if (!safety) {
    errors.push("Artifact safety must be an object.");
  } else {
    if (safety.persisted !== false) {
      errors.push("Artifact safety.persisted must be false.");
    }

    if (safety.published !== false) {
      errors.push("Artifact safety.published must be false.");
    }

    if (safety.containsRealContent !== "unknown") {
      errors.push("Artifact safety.containsRealContent must be unknown.");
    }

    validateRequiredString(safety, "operatorWarning", errors, "Artifact safety");
  }

  addUnique(
    warnings,
    "Artifact safety.containsRealContent is unknown. Treat imported artifact text as private/review-only until human review is complete.",
  );
  addUnique(
    warnings,
    "Browser artifact import is inspection only. It does not persist, stage, publish, or verify public safety.",
  );
  addUnique(
    warnings,
    "Artifact may contain private/review-only projection text and should not be pasted into public places.",
  );

  const artifact = errors.length
    ? null
    : (input as HgoStagedProjectionArtifact);

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    artifact,
  };
}

export function parseHgoStagedProjectionArtifactJson(
  json: string,
): HgoStagedProjectionArtifactValidationResult {
  if (!json.trim()) {
    return {
      ok: false,
      errors: [],
      warnings: [],
      artifact: null,
    };
  }

  try {
    return validateHgoStagedProjectionArtifact(JSON.parse(json) as unknown);
  } catch (error) {
    return {
      ok: false,
      errors: [
        error instanceof Error
          ? `Invalid JSON: ${error.message}`
          : "Invalid JSON.",
      ],
      warnings: [],
      artifact: null,
    };
  }
}

export function summarizeHgoStagedProjectionArtifactImport(
  artifact: HgoStagedProjectionArtifact,
): HgoStagedProjectionArtifactImportSummary {
  const summary: HgoStagedProjectionArtifactImportSummary = {
    ...summarizeHgoStagedProjectionArtifact(artifact),
    sourceKind: artifact.source.sourceKind,
    projectionStatus: artifact.source.projectionStatus,
    projectionVisibility: artifact.source.projectionVisibility,
    containsRealContent: artifact.safety.containsRealContent,
    validationWarningCount: artifact.validationWarnings.length,
    validationErrorCount: artifact.validationErrors.length,
  };

  if (artifact.source.sourceBridgeVersion) {
    summary.sourceBridgeVersion = artifact.source.sourceBridgeVersion;
  }

  return summary;
}
