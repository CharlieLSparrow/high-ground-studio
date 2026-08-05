export type ProviderRecordingProjectionState =
  | "off"
  | "starting"
  | "recording"
  | "stopping"
  | "needs-review"
  | "held";

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function object(value: unknown): Record<string, any> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, any>
    : {};
}

export function projectProviderRecordingState(room: any) {
  const metadata = object(room?.metadataJson);
  const commands = Array.isArray(room?.providerRecordingCommands)
    ? room.providerRecordingCommands
    : [];
  const assets = Array.isArray(room?.recordingAssets) ? room.recordingAssets : [];
  const activeCommandId = text(metadata.activeProviderRecordingCommandId);
  const activeEgressId = text(metadata.activeLiveKitEgressId);
  const activeAssetId = text(metadata.activeProviderRecordingAssetId);
  const activeStart = commands.find((command: any) => (
    command.action === "START"
    && command.status === "APPLIED"
    && (
      command.id === activeCommandId
      || (activeEgressId && command.providerEgressId === activeEgressId)
    )
  ));
  const activeAsset = assets.find((asset: any) => (
    asset.id === activeAssetId
    || (
      asset.kind === "SERVER_MIX"
      && asset.status === "UPLOADING"
      && text(object(object(asset.localManifestJson).livekit).egressId) === activeEgressId
    )
  ));
  const heldAsset = assets.find((asset: any) => (
    asset.kind === "SERVER_MIX"
    && ["HELD", "FAILED"].includes(text(asset.status).toUpperCase())
    && text(object(asset.localManifestJson).source) !== "provider-recording-receipt-slot"
  ));
  const unresolved = commands.find((command: any) => (
    ["QUEUED", "PROCESSING", "RECONCILE_REQUIRED"].includes(command.status)
  ));
  const latest = commands[0] || null;
  const state: ProviderRecordingProjectionState = activeStart || activeAsset
    ? "recording"
    : unresolved?.status === "RECONCILE_REQUIRED"
      ? "needs-review"
      : unresolved?.action === "STOP"
        ? "stopping"
        : unresolved
          ? "starting"
          : latest?.status === "HELD"
            || heldAsset
            ? "held"
            : "off";
  const nextAction = state === "recording"
    ? "Provider safety copy is recording. Local protected sources remain the production and synchronization authority."
    : state === "needs-review"
      ? "Provider outcome is uncertain. Do not issue a new START; reconcile the durable command first."
      : state === "starting" || state === "stopping"
        ? "A durable provider command is being processed. Repeating the same request is safe; creating a second request is not necessary."
        : state === "held"
          ? latest?.errorMessage || text(heldAsset?.errorMessage) || "Provider evidence is held for review. Local protected masters and capture-group synchronization remain unaffected."
        : latest?.errorMessage
          || "Provider safety copy is off. This does not affect capture-group timing or protected local-source alignment.";

  return { state, activeStart, activeAsset, heldAsset, unresolved, latest, nextAction };
}
