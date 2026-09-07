/** Original session media excludes provider placeholders and derived share outputs.
 * Edited outputs are read through their own recipient-scoped sharing boundary.
 */
export function isOriginalSessionRecordingAsset(asset: { kind?: unknown; localManifestJson?: unknown }) {
  const manifest = typeof asset.localManifestJson === "object" && asset.localManifestJson !== null
    ? asset.localManifestJson as Record<string, unknown> : {};
  return ["LOCAL_AUDIO", "LOCAL_VIDEO", "SERVER_MIX"].includes(String(asset.kind).toUpperCase())
    && manifest.source !== "provider-recording-receipt-slot"
    && manifest.source !== "session-recording-share";
}
