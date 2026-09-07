import { isOriginalSessionRecordingAsset } from "../session-recording-sources";

type RecordingInput = {
  kind?: unknown;
  status?: unknown;
  verifiedAt?: unknown;
  durationSeconds?: unknown;
  segmentsJson?: unknown;
  localManifestJson?: unknown;
};

function object(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function positiveSeconds(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null;
}

function durationSeconds(asset: RecordingInput) {
  const duration = positiveSeconds(asset.durationSeconds);
  if (duration !== null) return duration;
  const segments = Array.isArray(asset.segmentsJson) ? asset.segmentsJson : [];
  const durations = segments.map(segment => positiveSeconds(object(segment).durationSeconds));
  // A partial set of segment durations cannot establish the total length.
  return durations.length > 0 && durations.every((value): value is number => value !== null)
    ? durations.reduce((total, value) => total + value, 0) : null;
}

/**
 * Uploaded-source summary, not a judgment of content value or release qualification.
 * Byte availability does not bypass protected playback, consent, or processing checks.
 */
export function recordingContentReadiness(recordingAssets: readonly RecordingInput[], _purpose?: string | null) {
  const assets = recordingAssets.filter(isOriginalSessionRecordingAsset);
  const evidence = assets.map(asset => {
    const status = String(asset.status).toUpperCase();
    const verified = Boolean(asset.verifiedAt && object(asset.localManifestJson).exactBytesVerified === true
      && ["VERIFIED", "HELD"].includes(status));
    return { duration: durationSeconds(asset), verified, uploaded: verified && status === "VERIFIED",
      attention: ["HELD", "FAILED", "CORRUPTED", "QUARANTINED"].includes(status) };
  });
  const durations = evidence.flatMap(item => item.duration === null ? [] : [item.duration]);
  const uploadedRecordingCount = evidence.filter(item => item.uploaded).length;
  const attentionRecordingCount = evidence.filter(item => item.attention).length;
  const pendingRecordingCount = evidence.filter(item => !item.uploaded && !item.attention).length;
  const status: "none" | "uploaded" | "uploading" | "attention" = uploadedRecordingCount > 0
    ? "uploaded" : attentionRecordingCount > 0 ? "attention" : assets.length > 0 ? "uploading" : "none";

  return {
    status,
    label: status === "uploaded" ? "Uploaded recordings"
      : status === "attention" ? "Recording needs attention"
        : status === "uploading" ? "Recording upload in progress" : "No uploaded recording",
    tone: status === "uploaded" ? "ready" : "attention",
    detail: status === "uploaded"
      ? `${uploadedRecordingCount} recording${uploadedRecordingCount === 1 ? " has" : "s have"} verified uploaded bytes. Short recordings are welcome.${attentionRecordingCount ? ` ${attentionRecordingCount} more need attention.` : ""}${pendingRecordingCount ? ` ${pendingRecordingCount} are still uploading or being verified.` : ""}`
      : status === "attention" ? "Recorded media is retained, but an upload or processing problem needs attention. Check the recording details."
        : status === "uploading" ? "The recording has not finished uploading and verification. Keep the recording device open until its upload finishes."
          : "Record or import audio or video to add it to this session.",
    nextAction: status === "uploaded" ? "Open recordings to listen, edit, or check individual upload and processing details."
      : status === "attention" ? "Open recording details to recover or retry."
        : status === "uploading" ? "Check upload progress on the recording device."
          : "Join the call, start a recording, or import an existing file.",
    captureAssetCount: assets.length,
    knownDurationSeconds: durations.reduce((total, duration) => total + duration, 0),
    longestKnownDurationSeconds: durations.length > 0 ? Math.max(...durations) : null,
    unknownDurationCount: evidence.filter(item => item.duration === null).length,
    verifiedCaptureCount: evidence.filter(item => item.verified).length,
    uploadedRecordingCount,
    attentionRecordingCount,
    pendingRecordingCount,
  };
}

export type RecordingContentReadiness = ReturnType<typeof recordingContentReadiness>;
