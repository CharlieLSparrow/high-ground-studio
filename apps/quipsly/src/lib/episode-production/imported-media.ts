type JsonRecord = Record<string, unknown>;

function record(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as JsonRecord
    : {};
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function rows(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is JsonRecord => (
        Boolean(item)
        && typeof item === "object"
        && !Array.isArray(item)
      ))
    : [];
}

function identityTokens(item: JsonRecord) {
  const metadata = record(item.metadata);
  const metadataRecording = record(metadata.recordingSync);
  const sync = record(item.sync);
  const syncRecording = record(sync.recordingSync);
  return [
    ["asset", text(item.id)],
    ["source", text(item.sourceId)],
    ["recording", text(item.recordingAssetId)
      || text(sync.recordingAssetId)
      || text(metadataRecording.recordingAssetId)
      || text(syncRecording.recordingAssetId)],
    ["upload", text(item.uploadSessionId)
      || text(metadataRecording.uploadSessionId)
      || text(syncRecording.uploadSessionId)],
    ["storage", text(item.storageUri) || text(item.gcsUri)],
  ]
    .filter(([, value]) => Boolean(value))
    .map(([kind, value]) => `${kind}:${value}`);
}

/**
 * `StudioEpisodeProduction.productionJson.importedMedia` is the canonical
 * episode-source projection. A short-lived Capture finalizer wrote the same
 * records into `timelineJson.importedMedia`; read-through keeps those immutable
 * source receipts discoverable until every affected row has been rewritten.
 */
export function canonicalEpisodeImportedMedia(
  productionJson: unknown,
  legacyTimelineJson?: unknown,
) {
  const canonical = rows(record(productionJson).importedMedia);
  const legacy = rows(record(legacyTimelineJson).importedMedia);
  const result: JsonRecord[] = [];
  const seen = new Set<string>();

  for (const item of [...canonical, ...legacy]) {
    const tokens = identityTokens(item);
    if (tokens.some((token) => seen.has(token))) continue;
    result.push(item);
    for (const token of tokens) seen.add(token);
  }

  return result;
}

export function canonicalEpisodeProductionJson(
  productionJson: unknown,
  legacyTimelineJson?: unknown,
) {
  const current = record(productionJson);
  const canonicalCount = rows(current.importedMedia).length;
  const importedMedia = canonicalEpisodeImportedMedia(
    productionJson,
    legacyTimelineJson,
  );
  const recoveredLegacyCount = Math.max(0, importedMedia.length - canonicalCount);

  return {
    ...current,
    importedMedia,
    importedMediaOwnership: {
      schema: "quipsly-episode-imported-media-v1",
      canonicalField:
        "StudioEpisodeProduction.productionJson.importedMedia",
      legacyTimelineReadThrough: recoveredLegacyCount > 0,
      recoveredLegacyCount,
    },
  };
}
