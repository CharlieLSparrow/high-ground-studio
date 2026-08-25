import "server-only";

import type { AudioMasterySourceBinding } from "@high-ground/quipsly-media-processing";

export const SESSION_PROVIDER_REFERENCE_SCHEMA =
  "quipsly-session-provider-reference-v1" as const;

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function exactSha256(value: unknown) {
  const normalized = text(value).toLowerCase();
  return /^[0-9a-f]{64}$/.test(normalized) ? normalized : null;
}

function exactGeneration(value: unknown) {
  const normalized = text(value);
  return /^[1-9][0-9]*$/.test(normalized) ? normalized : null;
}

function positiveSafeInteger(value: unknown) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

function positiveNumber(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function iso(value: unknown) {
  const date = value instanceof Date ? value : new Date(text(value));
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

export type SessionProviderReferenceBinding = {
  schema: typeof SESSION_PROVIDER_REFERENCE_SCHEMA;
  roomId: string;
  captureGroupId: string;
  mode: "audio-reference" | "video-composite";
  source: AudioMasterySourceBinding;
  recordedStartedAt: string;
  durationSeconds: number;
  boundaries: {
    participantMastersRemainAuthoritative: true;
    providerReferenceIsOptionalWitness: true;
    exactGenerationReadAndHashed: true;
    referenceCannotReplaceParticipantMaster: true;
  };
};

/**
 * A provider room witness has a different provenance chain from a Capture
 * master. It is admitted only after the durable provider command, unchanged
 * consent snapshot, exact GCS generation, byte count, and SHA-256 all agree.
 */
export function sessionProviderReferenceBinding(input: {
  roomId: string;
  captureGroupId: string;
  asset: any;
}): SessionProviderReferenceBinding | null {
  const asset = input.asset;
  const manifest = object(asset?.localManifestJson);
  const verification = object(manifest.verification);
  const metadata = object(verification.metadata);
  const mode =
    manifest.providerRecordingMode === "video-composite"
      ? ("video-composite" as const)
      : manifest.providerRecordingMode === "audio-reference"
        ? ("audio-reference" as const)
        : null;
  const assetSha256 = exactSha256(asset?.checksum);
  const verifiedSha256 = exactSha256(verification.sha256);
  const generation = exactGeneration(manifest.storageGeneration);
  const verifiedGeneration = exactGeneration(metadata.generation);
  const byteSize = positiveSafeInteger(asset?.byteSize);
  const verifiedByteSize = positiveSafeInteger(metadata.size);
  const durationSeconds = positiveNumber(asset?.durationSeconds);
  const recordedStartedAt = iso(asset?.recordedStartedAt);
  const bucketName = text(asset?.storageBucket);
  const objectName = text(asset?.storageObjectPath);
  const contentType = text(asset?.contentType).toLowerCase();
  const valid =
    text(asset?.id).length > 0 &&
    text(asset?.roomId) === input.roomId &&
    String(asset?.kind) === "SERVER_MIX" &&
    String(asset?.status) === "VERIFIED" &&
    Boolean(asset?.verifiedAt) &&
    manifest.schema === "quipsly-provider-recording-command-v1" &&
    manifest.source === "provider-recording-command-reservation" &&
    manifest.provider === "livekit" &&
    text(manifest.captureGroupId) === input.captureGroupId &&
    manifest.providerRecordingIsOptionalWitness === true &&
    manifest.localProtectedMastersRemainAuthoritative === true &&
    manifest.providerProcessingDisposition === "RELEASED" &&
    manifest.exactBytesVerified === true &&
    mode !== null &&
    verification.status === "verified" &&
    verification.exactGenerationRead === true &&
    text(verification.storageBucket) === bucketName &&
    text(verification.storageObjectPath) === objectName &&
    assetSha256 !== null &&
    assetSha256 === verifiedSha256 &&
    generation !== null &&
    generation === verifiedGeneration &&
    byteSize !== null &&
    byteSize === verifiedByteSize &&
    durationSeconds !== null &&
    recordedStartedAt !== null &&
    bucketName.length > 0 &&
    objectName.startsWith("media-vault/recordings/livekit/") &&
    /^(audio|video)\/[a-z0-9.+-]+$/.test(contentType);
  if (!valid) return null;

  return {
    schema: SESSION_PROVIDER_REFERENCE_SCHEMA,
    roomId: input.roomId,
    captureGroupId: input.captureGroupId,
    mode,
    source: {
      assetId: text(asset.id),
      provider: "gcs",
      locator: `gcs://${bucketName}/${objectName}?generation=${generation}`,
      generation,
      sha256: assetSha256,
      sizeBytes: byteSize,
      contentType,
    },
    recordedStartedAt,
    durationSeconds,
    boundaries: {
      participantMastersRemainAuthoritative: true,
      providerReferenceIsOptionalWitness: true,
      exactGenerationReadAndHashed: true,
      referenceCannotReplaceParticipantMaster: true,
    },
  };
}
