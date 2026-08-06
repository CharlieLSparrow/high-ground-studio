import { createHash } from "node:crypto";

import {
  canonicalEpisodeImportedMedia,
  canonicalEpisodeProductionJson,
} from "@/lib/episode-production/imported-media";

type JsonRecord = Record<string, unknown>;

function record(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as JsonRecord
    : {};
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function stable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stable);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value as JsonRecord)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => [key, stable(item)]),
  );
}

export function captureSourceRecoveryRequestSha256(value: unknown) {
  return createHash("sha256").update(JSON.stringify(stable(value))).digest("hex");
}

/**
 * Derives distinct, replay-stable UUIDs for the three append-only recording
 * plan decisions owned by one recovery request. The source request remains the
 * public idempotency key; these UUIDs only satisfy the existing revision
 * ledger's one-request-per-decision contract.
 */
export function captureSourceRecoveryDecisionId(requestId: string, decision: "create" | "unbind" | "bind" | "capture" | "upload") {
  const bytes = createHash("sha256").update(`${requestId}:${decision}`).digest().subarray(0, 16);
  bytes[6] = (bytes[6]! & 0x0f) | 0x50;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function importedMediaRecordingAssetId(value: unknown) {
  const asset = record(value);
  const metadata = record(asset.metadata);
  const sync = record(asset.sync);
  const recordingSync = {
    ...record(metadata.recordingSync),
    ...record(sync.recordingSync),
  };
  return text(asset.recordingAssetId)
    || text(sync.recordingAssetId)
    || text(recordingSync.recordingAssetId);
}

export function importedMediaCaptureGroupId(value: unknown) {
  const asset = record(value);
  const metadata = record(asset.metadata);
  const sync = record(asset.sync);
  const recordingSync = {
    ...record(metadata.recordingSync),
    ...record(sync.recordingSync),
  };
  return text(asset.captureGroupId) || text(recordingSync.captureGroupId);
}

export function importedMediaRecoverySelection(value: unknown) {
  const asset = record(value);
  const metadata = record(asset.metadata);
  const sync = record(asset.sync);
  const recordingSync = {
    ...record(metadata.recordingSync),
    ...record(sync.recordingSync),
  };
  const recovery = record(recordingSync.recoverySelection);
  const status = text(recovery.status);
  if (status !== "active-replacement" && status !== "superseded-original") return null;
  return {
    status,
    originalRecordingAssetId: text(recovery.originalRecordingAssetId),
    selectedRecordingAssetId: text(recovery.selectedRecordingAssetId),
    expectationId: text(recovery.expectationId),
    requestId: text(recovery.requestId),
    decidedAt: text(recovery.decidedAt),
    reason: text(recovery.reason),
  };
}

export function activeCaptureImportedMedia(importedMedia: unknown[]) {
  return importedMedia.filter((asset) => importedMediaRecoverySelection(asset)?.status !== "superseded-original");
}

export function projectCaptureSourceRecovery(input: {
  productionJson: unknown;
  timelineJson?: unknown;
  projectSlug: string;
  episodeSlug: string;
  captureGroupId: string;
  originalRecordingAssetId: string;
  replacementRecordingAssetId: string;
  replacementMediaAssetId: string;
  replacementSourceId: string;
  expectationId: string;
  requestId: string;
  requestSha256: string;
  sourceSha256: string;
  storageGeneration: string;
  sourceLocator: string;
  reason: string;
  actorUserId: string;
  actorEmail: string;
  decidedAt: string;
}) {
  const canonical = canonicalEpisodeProductionJson(input.productionJson, input.timelineJson);
  const importedMedia = canonicalEpisodeImportedMedia(input.productionJson, input.timelineJson);
  let originalMatched = false;
  let replacementMatched = false;
  const selection = {
    schema: "quipsly-capture-source-recovery-selection-v1",
    originalRecordingAssetId: input.originalRecordingAssetId,
    selectedRecordingAssetId: input.replacementRecordingAssetId,
    expectationId: input.expectationId,
    requestId: input.requestId,
    requestSha256: input.requestSha256,
    reason: input.reason,
    actorUserId: input.actorUserId,
    actorEmail: input.actorEmail,
    decidedAt: input.decidedAt,
    originalSourceMediaUnchanged: true,
  };

  const nextImportedMedia = importedMedia.map((value) => {
    const asset = record(value);
    const metadata = record(asset.metadata);
    const sync = record(asset.sync);
    const metadataRecordingSync = record(metadata.recordingSync);
    const syncRecordingSync = record(sync.recordingSync);
    const recordingAssetId = importedMediaRecordingAssetId(asset);
    if (recordingAssetId === input.originalRecordingAssetId) {
      originalMatched = true;
      const recoverySelection = { ...selection, status: "superseded-original" };
      return {
        ...asset,
        metadata: {
          ...metadata,
          recordingSync: { ...metadataRecordingSync, recoverySelection },
        },
        sync: {
          ...sync,
          recordingSync: { ...syncRecordingSync, recoverySelection },
        },
      };
    }
    if (text(asset.id) === input.replacementMediaAssetId || text(asset.sourceId) === input.replacementSourceId) {
      replacementMatched = true;
      const recoverySelection = { ...selection, status: "active-replacement" };
      const recordingSync = {
        ...metadataRecordingSync,
        ...syncRecordingSync,
        recordingAssetId: input.replacementRecordingAssetId,
        captureGroupId: input.captureGroupId,
        expectedSha256: input.sourceSha256,
        storageGeneration: input.storageGeneration,
        sourceLocator: input.sourceLocator,
        recoverySelection,
      };
      return {
        ...asset,
        importRole: "recovered-master",
        metadata: { ...metadata, recordingSync },
        sync: {
          ...sync,
          status: "ready-to-sync",
          suggestedRole: "recovered-master",
          recordingSync,
          note: "Backup master adopted through an immutable, append-only recovery decision. Complete decode and reviewed sync remain required.",
        },
      };
    }
    return asset;
  });

  if (!originalMatched) throw new Error("The original retained source is no longer attached to this episode.");
  if (!replacementMatched) throw new Error("The imported backup is no longer attached to this episode.");

  return {
    ...canonical,
    projectSlug: input.projectSlug,
    episodeSlug: input.episodeSlug,
    importedMedia: nextImportedMedia,
    lastCaptureSourceRecovery: selection,
    lastMediaImportAt: input.decidedAt,
    source: "quipsly-capture-source-recovery",
  };
}

export function applyActiveRecoverySelections<T extends { recordingAssetId: string }>(
  sources: T[],
  expectations: Array<{ recordingAssetId?: string | null; status?: string; revisions?: Array<{ afterJson?: unknown }> }>,
) {
  const supersededRecordingAssetIds = new Set<string>();
  for (const expectation of expectations) {
    if (text(expectation.status).toUpperCase() !== "ACTIVE") continue;
    const selected = text(expectation.recordingAssetId);
    if (!selected) continue;
    for (const revision of expectation.revisions ?? []) {
      const historical = text(record(revision.afterJson).recordingAssetId);
      if (historical && historical !== selected) supersededRecordingAssetIds.add(historical);
    }
  }
  return sources.filter((source) => !supersededRecordingAssetIds.has(source.recordingAssetId));
}
