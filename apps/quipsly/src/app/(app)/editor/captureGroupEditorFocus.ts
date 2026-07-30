type JsonRecord = Record<string, unknown>;

export type CaptureGroupFocusableAsset = {
  id: string;
  sourceId?: string;
  originalName?: string;
  kind?: string;
  contentType?: string;
  importRole?: string;
  importedAt?: string;
  metadata?: unknown;
  sync?: unknown;
};

export type CaptureGroupEditorFocusPlan = {
  requestedCaptureGroupId: string;
  matched: boolean;
  sourceCount: number;
  assetIds: string[];
  spineAssetId: string | null;
  targetAssetId: string | null;
  message: string;
};

function record(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as JsonRecord
    : {};
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export function normalizeCaptureGroupFocusId(value: unknown) {
  const candidate = text(value).toLowerCase();
  if (
    !candidate
    || candidate.length > 128
    || !/^[a-z0-9][a-z0-9._:-]*$/.test(candidate)
  ) {
    return "";
  }
  return candidate;
}

export function importedAssetCaptureGroupId(asset: unknown) {
  const row = record(asset);
  const metadata = record(row.metadata);
  const sync = record(row.sync);
  const metadataRecording = record(metadata.recordingSync);
  const syncRecording = record(sync.recordingSync);
  const alignment = Object.keys(record(sync.alignment)).length > 0
    ? record(sync.alignment)
    : Object.keys(record(syncRecording.alignment)).length > 0
      ? record(syncRecording.alignment)
      : record(metadataRecording.alignment);
  return normalizeCaptureGroupFocusId(
    syncRecording.captureGroupId
      || metadataRecording.captureGroupId
      || alignment.captureGroupId,
  );
}

export function importedAssetRecordingId(asset: unknown) {
  const row = record(asset);
  const metadata = record(row.metadata);
  const sync = record(row.sync);
  const metadataRecording = record(metadata.recordingSync);
  const syncRecording = record(sync.recordingSync);
  return text(
    sync.recordingAssetId
      || syncRecording.recordingAssetId
      || metadataRecording.recordingAssetId,
  );
}

function baselineRecordingId(asset: unknown) {
  const row = record(asset);
  const metadata = record(row.metadata);
  const sync = record(row.sync);
  const metadataRecording = record(metadata.recordingSync);
  const syncRecording = record(sync.recordingSync);
  const alignment = Object.keys(record(sync.alignment)).length > 0
    ? record(sync.alignment)
    : Object.keys(record(syncRecording.alignment)).length > 0
      ? record(syncRecording.alignment)
      : record(metadataRecording.alignment);
  return text(record(alignment.captureGroup).baselineRecordingAssetId);
}

function isAudio(asset: CaptureGroupFocusableAsset) {
  return text(asset.kind).toLowerCase() === "audio"
    || text(asset.contentType).toLowerCase().startsWith("audio/")
    || text(asset.importRole).toLowerCase().includes("audio");
}

function isVideo(asset: CaptureGroupFocusableAsset) {
  return text(asset.kind).toLowerCase() === "video"
    || text(asset.contentType).toLowerCase().startsWith("video/")
    || text(asset.importRole).toLowerCase().includes("camera");
}

/**
 * Chooses only the initial editor focus for a phone-reviewed capture group.
 *
 * This never changes the persisted episode spine, writes timeline placement,
 * or treats device-clock evidence as reviewed synchronization. It puts the
 * exact group in front of the existing waveform/drift/human-approval wizard.
 */
export function captureGroupEditorFocusPlan(
  assets: CaptureGroupFocusableAsset[],
  requestedCaptureGroupId: unknown,
): CaptureGroupEditorFocusPlan | null {
  const captureGroupId = normalizeCaptureGroupFocusId(
    requestedCaptureGroupId,
  );
  if (!captureGroupId) return null;

  const groupAssets = assets
    .filter(
      (asset) => importedAssetCaptureGroupId(asset) === captureGroupId,
    )
    .sort((left, right) => (
      text(left.importedAt).localeCompare(text(right.importedAt))
      || left.id.localeCompare(right.id)
    ));
  if (groupAssets.length === 0) {
    return {
      requestedCaptureGroupId: captureGroupId,
      matched: false,
      sourceCount: 0,
      assetIds: [],
      spineAssetId: null,
      targetAssetId: null,
      message:
        "This capture group is not attached to the current episode yet. Refresh the iPhone Session and complete Studio handoff before reviewing sync.",
    };
  }

  const proposedBaselineRecordingId = groupAssets
    .map(baselineRecordingId)
    .find(Boolean) || "";
  const proposedBaselineAsset = proposedBaselineRecordingId
    ? groupAssets.find(
        (asset) =>
          importedAssetRecordingId(asset) === proposedBaselineRecordingId,
      ) ?? null
    : null;
  const spine =
    (
      proposedBaselineAsset
      && isAudio(proposedBaselineAsset)
        ? proposedBaselineAsset
        : null
    )
    || groupAssets.find(isAudio)
    || null;
  const target =
    groupAssets.find(
      (asset) => asset.id !== spine?.id && isVideo(asset),
    )
    || groupAssets.find((asset) => asset.id !== spine?.id)
    || null;

  return {
    requestedCaptureGroupId: captureGroupId,
    matched: true,
    sourceCount: groupAssets.length,
    assetIds: groupAssets.map((asset) => asset.id),
    spineAssetId: spine?.id ?? null,
    targetAssetId: target?.id ?? null,
    message:
      `${groupAssets.length} verified capture ${groupAssets.length === 1 ? "source is" : "sources are"} focused for review. No placement or episode-spine decision has been made.`,
  };
}
