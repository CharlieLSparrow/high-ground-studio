const SUBSTANTIAL_RECORDING_SECONDS = 60;

function text(value: unknown) {
  return typeof value === "string" ? value : null;
}

function object(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function positiveSeconds(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null;
}

function recordingSegments(value: unknown) {
  return Array.isArray(value) ? value.map(object) : [];
}

function recordingDurationSeconds(asset: any) {
  const assetDuration = positiveSeconds(asset?.durationSeconds);
  if (assetDuration !== null) return assetDuration;
  const segmentDurations = recordingSegments(asset?.segmentsJson)
    .map((segment) => positiveSeconds(segment.durationSeconds))
    .filter((duration): duration is number => duration !== null);
  return segmentDurations.length > 0
    ? segmentDurations.reduce((total, duration) => total + duration, 0)
    : null;
}

function simulatorRecordingAsset(asset: any) {
  const manifest = object(asset?.localManifestJson);
  const deviceLabels = [
    ...recordingSegments(asset?.segmentsJson).flatMap((segment) => [segment.deviceKind, segment.deviceName]),
    manifest.deviceKind,
    manifest.deviceName,
    manifest.deviceModel,
  ].filter((value): value is string => typeof value === "string");
  if (manifest.simulator === true || manifest.isSimulator === true) return true;
  return deviceLabels.some((value) => /\bsimulator\b/i.test(value) || /^clone\s+\d+\s+of\s+iphone\b/i.test(value.trim()));
}

function sourceMediaRecordingAsset(asset: any) {
  return ["LOCAL_AUDIO", "LOCAL_VIDEO", "SERVER_MIX"].includes(text(asset?.kind)?.toUpperCase() || "");
}

function providerRecordingReceiptSlot(asset: any) {
  return asset?.kind === "SERVER_MIX" && object(asset?.localManifestJson).source === "provider-recording-receipt-slot";
}

/**
 * Product-readiness evidence only. This deliberately does not alter consent,
 * upload-integrity, media-processing, or transcription policy gates.
 */
export function recordingContentReadiness(recordingAssets: any[], purpose?: string | null) {
  const assets = (Array.isArray(recordingAssets) ? recordingAssets : [])
    .filter((asset) => !providerRecordingReceiptSlot(asset) && sourceMediaRecordingAsset(asset));
  const evidence = assets.map((asset) => ({
    durationSeconds: recordingDurationSeconds(asset),
    simulator: simulatorRecordingAsset(asset),
    verified: text(asset?.status)?.toUpperCase() === "VERIFIED",
  }));
  const knownDurations = evidence.flatMap((item) => item.durationSeconds === null ? [] : [item.durationSeconds]);
  const knownDurationSeconds = knownDurations.reduce((total, duration) => total + duration, 0);
  const longestKnownDurationSeconds = knownDurations.length > 0 ? Math.max(...knownDurations) : null;
  const simulatorCaptureCount = evidence.filter((item) => item.simulator).length;
  const shortCaptureCount = evidence.filter((item) => item.durationSeconds !== null && item.durationSeconds < SUBSTANTIAL_RECORDING_SECONDS).length;
  const unknownDurationCount = evidence.filter((item) => item.durationSeconds === null).length;
  const verifiedCaptureCount = evidence.filter((item) => item.verified).length;
  const substantialRecordingCount = evidence.filter((item) => (
    item.verified
    && !item.simulator
    && item.durationSeconds !== null
    && item.durationSeconds >= SUBSTANTIAL_RECORDING_SECONDS
  )).length;
  const isPodcast = text(purpose)?.toUpperCase() === "PODCAST";
  const contentNoun = isPodcast ? "episode" : "session";

  if (assets.length === 0) {
    return {
      status: "none" as const,
      label: "No uploaded recording",
      tone: "attention",
      detail: `No source-media recording exists yet. Quipsly cannot claim usable ${contentNoun} content from a room or capture receipt alone.`,
      nextAction: `Record a consented ${contentNoun} take, keep the local source, and finish a verified upload.`,
      captureAssetCount: 0,
      knownDurationSeconds: 0,
      longestKnownDurationSeconds: null,
      shortCaptureCount: 0,
      simulatorCaptureCount: 0,
      unknownDurationCount: 0,
      verifiedCaptureCount: 0,
      substantialRecordingCount: 0,
      substantialThresholdSeconds: SUBSTANTIAL_RECORDING_SECONDS,
    };
  }

  if (substantialRecordingCount === 0) {
    const evidenceDetail = verifiedCaptureCount === 0
      ? "None of the source-media records has verified uploaded bytes."
      : simulatorCaptureCount === assets.length
        ? "All source-media assets are marked as simulator captures."
        : shortCaptureCount + unknownDurationCount === assets.length
          ? "Every known take is under one minute or has no trustworthy duration."
          : "No non-simulator take reaches the minimum substantial-content threshold.";
    return {
      status: "capture-proof-only" as const,
      label: "Capture plumbing proven",
      tone: "attention",
      detail: `${assets.length} source-media asset${assets.length === 1 ? "" : "s"} reached Nest, but this is not usable ${contentNoun} evidence. ${evidenceDetail}`,
      nextAction: `Record a consented production ${contentNoun} take on a physical device before treating this workflow as content-ready.`,
      captureAssetCount: assets.length,
      knownDurationSeconds,
      longestKnownDurationSeconds,
      shortCaptureCount,
      simulatorCaptureCount,
      unknownDurationCount,
      verifiedCaptureCount,
      substantialRecordingCount: 0,
      substantialThresholdSeconds: SUBSTANTIAL_RECORDING_SECONDS,
    };
  }

  return {
    status: "substantial" as const,
    label: "Substantial recording found",
    tone: "ready",
    detail: `${substantialRecordingCount} non-simulator source recording${substantialRecordingCount === 1 ? "" : "s"} has at least one minute of known content. This proves substantial capture, not editorial or release readiness.`,
    nextAction: "Review playback and consent release, then continue transcription or Studio handoff from the exact source.",
    captureAssetCount: assets.length,
    knownDurationSeconds,
    longestKnownDurationSeconds,
    shortCaptureCount,
    simulatorCaptureCount,
    unknownDurationCount,
    verifiedCaptureCount,
    substantialRecordingCount,
    substantialThresholdSeconds: SUBSTANTIAL_RECORDING_SECONDS,
  };
}
