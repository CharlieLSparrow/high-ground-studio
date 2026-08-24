export const SESSION_PROTECTED_PLAYBACK_SCHEMA =
  "quipsly-session-protected-playback-v1" as const;

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function positiveSafeInteger(value: unknown) {
  const parsed = typeof value === "bigint" ? Number(value) : Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

function exactSha256(value: unknown) {
  const normalized = text(value).toLowerCase();
  return /^[0-9a-f]{64}$/.test(normalized) ? normalized : null;
}

function exactGeneration(value: unknown) {
  const normalized = text(value);
  return /^[1-9][0-9]*$/.test(normalized) ? normalized : null;
}

function mediaContentType(value: unknown) {
  const normalized = text(value).toLowerCase();
  return /^(audio|video)\/[a-z0-9.+-]+$/.test(normalized) ? normalized : null;
}

export type SessionProtectedPlaybackBinding = {
  schema: typeof SESSION_PROTECTED_PLAYBACK_SCHEMA;
  roomId: string;
  recordingAssetId: string;
  url: string;
  sha256: string;
  byteSize: number;
  bucketName: string;
  objectName: string;
  generation: string;
  contentType: string;
  kind: "audio" | "video";
};

export function sessionProtectedPlaybackReceiptReleased(input: {
  roomId: string;
  recordingAssetId: string;
  receipt: any;
}) {
  return Boolean(
    input.receipt
    && text(input.receipt.roomId) === input.roomId
    && text(input.receipt.recordingAssetId) === input.recordingAssetId
    && text(input.receipt.uploadSessionId)
    && text(input.receipt.processingDisposition).toUpperCase() === "RELEASED",
  );
}

/**
 * Proves the exact immutable RecordingAsset generation that an authenticated
 * Session player may read. All callers use this one binding so inventory,
 * transcript review, native preparation, and the byte-serving route cannot
 * independently loosen or drift from the retained-source contract.
 */
export function sessionProtectedPlaybackBinding(input: {
  roomId: string;
  asset: any;
  receipt: any;
}): SessionProtectedPlaybackBinding | null {
  const recordingAssetId = text(input.asset?.id);
  if (
    !recordingAssetId
    || text(input.asset?.roomId) !== input.roomId
    || !sessionProtectedPlaybackReceiptReleased({
      roomId: input.roomId,
      recordingAssetId,
      receipt: input.receipt,
    })
  ) return null;

  const manifest = object(input.asset?.localManifestJson);
  const receiptMetadata = object(input.receipt?.metadataJson);
  const immutableBinding = object(receiptMetadata.immutableUploadBinding);
  const durableRecoveryReplica = object(
    object(receiptMetadata.recoveryAuthority).durableCaptureReplica,
  );
  const durableRecoveryStorage = object(
    object(manifest.captureSourceRecovery).durableStorage,
  );
  const byteSize = positiveSafeInteger(input.asset?.byteSize);
  const bindingByteSize = positiveSafeInteger(immutableBinding.sizeBytes);
  const sha256 = exactSha256(input.asset?.checksum);
  const bindingSha256 = exactSha256(immutableBinding.sha256);
  const bucketName = text(input.asset?.storageBucket);
  const objectName = text(input.asset?.storageObjectPath);
  const generation =
    exactGeneration(immutableBinding.generation)
    ?? exactGeneration(durableRecoveryReplica.generation);
  const manifestGeneration =
    exactGeneration(manifest.storageGeneration)
    ?? exactGeneration(durableRecoveryStorage.generation);
  const contentType = mediaContentType(input.asset?.contentType);
  const exactBinding =
    text(input.asset?.status).toUpperCase() === "VERIFIED"
    && Boolean(input.asset?.verifiedAt)
    && manifest.exactBytesVerified === true
    && text(immutableBinding.roomId) === input.roomId
    && byteSize !== null
    && byteSize === bindingByteSize
    && sha256 !== null
    && sha256 === bindingSha256
    && bucketName.length > 0
    && bucketName === text(immutableBinding.bucketName)
    && objectName.length > 0
    && objectName === text(immutableBinding.objectName)
    && generation !== null
    && generation === manifestGeneration
    && contentType !== null;
  if (!exactBinding) return null;

  return {
    schema: SESSION_PROTECTED_PLAYBACK_SCHEMA,
    roomId: input.roomId,
    recordingAssetId,
    url: `/api/sessions/${encodeURIComponent(input.roomId)}/recordings/${encodeURIComponent(recordingAssetId)}/media`,
    sha256,
    byteSize,
    bucketName,
    objectName,
    generation,
    contentType,
    kind: contentType.startsWith("video/") ? "video" : "audio",
  };
}
