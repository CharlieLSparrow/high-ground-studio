import {
  CLOUD_SYNC_INPUT_ROLES,
  type CloudSyncInputRole,
  type CloudSyncReport,
  type SyncMap,
} from "@high-ground/studio-cut-schema";
import { CLOUD_SYNC_ROLE_LABELS } from "./cloudSync.ts";

export type SyncReviewReferenceSegment = {
  inputId: string;
  fileName: string;
  railStartMs: number;
  durationMs: number;
  confidence: number;
  warnings: string[];
};

export type SyncReviewOffsetDetail = {
  role: CloudSyncInputRole;
  roleLabel: string;
  inputId: string;
  fileName: string;
  estimatedOffsetMs: number;
  confidence: number;
  driftPpm?: number;
  anchorCount?: number;
  anchorAgreementMs?: number;
  warnings: string[];
  source: "syncReport" | "syncMap";
};

export type SyncReviewAssetDetail = {
  role: CloudSyncInputRole;
  roleLabel: string;
  inputId: string;
  fileName: string;
  timelineStartMs: number;
  assetStartMs: number;
  durationMs: number;
  confidence: number;
  warnings: string[];
};

export type SyncReviewWarningDetail = {
  source: string;
  message: string;
};

export type SyncReviewSummary = {
  timelineDurationMs: number;
  assetCount: number;
  referencePieceCount: number;
  trackOffsetCount: number;
  lowestConfidence: number;
  warningCount: number;
  roleSummary: string;
  referenceSegments: SyncReviewReferenceSegment[];
  offsetDetails: SyncReviewOffsetDetail[];
  assetDetails: SyncReviewAssetDetail[];
  warningDetails: SyncReviewWarningDetail[];
};

export function buildSyncReviewSummary(
  syncMap: SyncMap,
  syncReport?: CloudSyncReport,
): SyncReviewSummary {
  const referenceSegments = [...syncMap.referenceRail.segments]
    .sort(
      (left, right) =>
        left.railStartMs - right.railStartMs ||
        left.fileName.localeCompare(right.fileName) ||
        left.inputId.localeCompare(right.inputId),
    )
    .map((segment) => ({
      inputId: segment.inputId,
      fileName: segment.fileName,
      railStartMs: segment.railStartMs,
      durationMs: segment.durationMs,
      confidence: segment.confidence,
      warnings: segment.warnings,
    }));
  const assetDetails = [...syncMap.assets]
    .sort(
      (left, right) =>
        roleSortIndex(left.role) - roleSortIndex(right.role) ||
        left.timelineStartMs - right.timelineStartMs ||
        left.fileName.localeCompare(right.fileName) ||
        left.inputId.localeCompare(right.inputId),
    )
    .map((asset) => ({
      role: asset.role,
      roleLabel: CLOUD_SYNC_ROLE_LABELS[asset.role],
      inputId: asset.inputId,
      fileName: asset.fileName,
      timelineStartMs: asset.timelineStartMs,
      assetStartMs: asset.assetStartMs,
      durationMs: asset.durationMs,
      confidence: asset.confidence,
      warnings: asset.warnings,
    }));
  const offsetDetails =
    syncReport && syncReport.trackOffsets.length > 0
      ? [...syncReport.trackOffsets]
          .sort(
            (left, right) =>
              roleSortIndex(left.role) - roleSortIndex(right.role) ||
              left.estimatedOffsetMs - right.estimatedOffsetMs ||
              left.fileName.localeCompare(right.fileName) ||
              left.inputId.localeCompare(right.inputId),
          )
          .map((trackOffset) => ({
            role: trackOffset.role,
            roleLabel: CLOUD_SYNC_ROLE_LABELS[trackOffset.role],
            inputId: trackOffset.inputId,
            fileName: trackOffset.fileName,
            estimatedOffsetMs: trackOffset.estimatedOffsetMs,
            confidence: trackOffset.confidence,
            ...(trackOffset.driftPpm !== undefined
              ? { driftPpm: trackOffset.driftPpm }
              : {}),
            ...(trackOffset.anchorCount !== undefined
              ? { anchorCount: trackOffset.anchorCount }
              : {}),
            ...(trackOffset.anchorAgreementMs !== undefined
              ? { anchorAgreementMs: trackOffset.anchorAgreementMs }
              : {}),
            warnings: trackOffset.warnings,
            source: "syncReport" as const,
          }))
      : assetDetails
          .filter((asset) => asset.role !== "phoneReferenceAudio")
          .map((asset) => ({
            role: asset.role,
            roleLabel: asset.roleLabel,
            inputId: asset.inputId,
            fileName: asset.fileName,
            estimatedOffsetMs: asset.timelineStartMs,
            confidence: asset.confidence,
            warnings: asset.warnings,
            source: "syncMap" as const,
          }));
  const confidenceValues = [
    ...referenceSegments.map((segment) => segment.confidence),
    ...assetDetails.map((asset) => asset.confidence),
    ...offsetDetails.map((trackOffset) => trackOffset.confidence),
  ].filter((value) => Number.isFinite(value));
  const lowestConfidence =
    confidenceValues.length > 0 ? Math.min(...confidenceValues) : 0;
  const warningDetails = buildSyncReviewWarningDetails(syncMap, syncReport);

  return {
    timelineDurationMs: syncMap.canonicalTimeline.durationMs,
    assetCount: syncMap.assets.length,
    referencePieceCount: syncMap.referenceRail.segments.length,
    trackOffsetCount: offsetDetails.length,
    lowestConfidence,
    warningCount: warningDetails.length,
    roleSummary: buildSyncReviewRoleSummary(syncMap),
    referenceSegments,
    offsetDetails,
    assetDetails,
    warningDetails,
  };
}

function buildSyncReviewRoleSummary(syncMap: SyncMap) {
  const roleCounts = syncMap.assets.reduce(
    (counts, asset) => ({
      ...counts,
      [asset.role]: (counts[asset.role] ?? 0) + 1,
    }),
    {} as Partial<Record<CloudSyncInputRole, number>>,
  );

  return (
    CLOUD_SYNC_INPUT_ROLES.filter((role) => roleCounts[role])
      .map((role) => `${CLOUD_SYNC_ROLE_LABELS[role]} x${roleCounts[role]}`)
      .join(", ") || "No assets"
  );
}

function buildSyncReviewWarningDetails(
  syncMap: SyncMap,
  syncReport?: CloudSyncReport,
) {
  const warnings: SyncReviewWarningDetail[] = [
    ...syncMap.globalWarnings.map((message) => ({
      source: "Sync Map",
      message,
    })),
    ...syncMap.referenceRail.warnings.map((message) => ({
      source: "Reference rail",
      message,
    })),
  ];

  for (const segment of syncMap.referenceRail.segments) {
    warnings.push(
      ...segment.warnings.map((message) => ({
        source: `Reference ${segment.fileName}`,
        message,
      })),
    );
  }

  for (const asset of syncMap.assets) {
    warnings.push(
      ...asset.warnings.map((message) => ({
        source: `${CLOUD_SYNC_ROLE_LABELS[asset.role]} ${asset.fileName}`,
        message,
      })),
    );
  }

  if (syncReport) {
    warnings.push(
      ...syncReport.globalWarnings.map((message) => ({
        source: "Sync report",
        message,
      })),
      ...syncReport.referenceRail.warnings.map((message) => ({
        source: "Sync report reference rail",
        message,
      })),
    );

    for (const trackOffset of syncReport.trackOffsets) {
      warnings.push(
        ...trackOffset.warnings.map((message) => ({
          source: `${CLOUD_SYNC_ROLE_LABELS[trackOffset.role]} offset`,
          message,
        })),
      );
    }
  }

  return warnings;
}

function roleSortIndex(role: CloudSyncInputRole) {
  const index = CLOUD_SYNC_INPUT_ROLES.indexOf(role);
  return index === -1 ? CLOUD_SYNC_INPUT_ROLES.length : index;
}
