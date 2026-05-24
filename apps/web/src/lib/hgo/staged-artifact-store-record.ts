import type { Prisma } from "@prisma/client";

import {
  createEmptyHgoStagedArtifactStoreLabState,
  importHgoArtifactIntoStoreLab,
  type HgoStagedArtifactPromotionReadiness,
  type HgoStagedArtifactReviewStatus,
  type HgoStagedArtifactStoreEvent,
} from "./staged-artifact-store-lab";
import type {
  HgoStagedProjectionArtifact,
  HgoStagedProjectionArtifactImportSummary,
  HgoStagedProjectionArtifactNextAction,
  HgoStagedProjectionArtifactStatus,
} from "./staged-projection-artifact";

export type HgoStagedArtifactStoreRecordInput = {
  ownerUserId?: string;
  ownerEmail: string;
  recordId: string;
  artifactVersion: HgoStagedProjectionArtifact["artifactVersion"];
  artifactId: string;
  projectionId: string;
  projectionSlug: string;
  projectionTitle: string;
  projectionStatus: string;
  projectionVisibility: string;
  sourceBridgeVersion?: string;
  artifactStatus: HgoStagedProjectionArtifactStatus;
  recommendedNextAction: HgoStagedProjectionArtifactNextAction;
  reviewStatus: HgoStagedArtifactReviewStatus;
  promotionReadiness: HgoStagedArtifactPromotionReadiness;
  artifactHash: string;
  artifactJson: Prisma.InputJsonValue;
  artifactSummaryJson: Prisma.InputJsonValue;
  eventLogJson: Prisma.InputJsonValue;
  blockerCount: number;
  warningCount: number;
  containsRealContent: string;
  note: string;
};

export type HgoStagedArtifactStoreRecordBuildResult =
  | {
      ok: true;
      record: HgoStagedArtifactStoreRecordInput;
      warnings: string[];
    }
  | {
      ok: false;
      errors: string[];
      warnings: string[];
    };

function toJsonValue(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

export function buildHgoStagedArtifactStoreRecordInput({
  artifactJson,
  ownerEmail,
  ownerUserId,
  note,
  now,
}: {
  artifactJson: string;
  ownerEmail: string;
  ownerUserId?: string;
  note?: string;
  now?: string;
}): HgoStagedArtifactStoreRecordBuildResult {
  const imported = importHgoArtifactIntoStoreLab(
    createEmptyHgoStagedArtifactStoreLabState({ now }),
    artifactJson,
    {
      now,
      note:
        note ||
        "Saved to private HGO staged artifact store. No public publishing occurred.",
    },
  );

  if (!imported.ok || !imported.record) {
    return {
      ok: false,
      errors: imported.errors.length
        ? imported.errors
        : ["Artifact JSON did not produce a staged artifact store record."],
      warnings: imported.warnings,
    };
  }

  const { record } = imported;
  const artifact = record.artifact;
  const summary =
    record.artifactSummary as HgoStagedProjectionArtifactImportSummary;

  return {
    ok: true,
    record: {
      ownerEmail,
      ownerUserId,
      recordId: record.recordId,
      artifactVersion: artifact.artifactVersion,
      artifactId: artifact.artifactId,
      projectionId: artifact.projection.id,
      projectionSlug: artifact.projection.slug,
      projectionTitle: artifact.projection.title,
      projectionStatus: artifact.projection.status,
      projectionVisibility: artifact.projection.visibility,
      sourceBridgeVersion: summary.sourceBridgeVersion,
      artifactStatus: artifact.status,
      recommendedNextAction: artifact.recommendedNextAction,
      reviewStatus: record.reviewStatus,
      promotionReadiness: record.promotionReadiness,
      artifactHash: record.artifactHash,
      artifactJson: toJsonValue(artifact),
      artifactSummaryJson: toJsonValue(summary),
      eventLogJson: toJsonValue(record.events satisfies HgoStagedArtifactStoreEvent[]),
      blockerCount: artifact.reviewGate.blockerCount,
      warningCount:
        artifact.reviewGate.warningCount + artifact.validationWarnings.length,
      containsRealContent: artifact.safety.containsRealContent,
      note: record.note,
    },
    warnings: imported.warnings,
  };
}
