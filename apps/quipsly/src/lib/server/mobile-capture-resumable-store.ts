import "server-only";

import { createHash, randomUUID } from "node:crypto";

import { getMediaBucket, requireMediaBucketName, toGcsUri } from "@/lib/server/gcs";
import {
  MOBILE_CAPTURE_RESUMABLE_CONTRACT_KIND,
  buildMobileCaptureResumableManifestObjectName,
  type MobileCaptureResumableImmutableBinding,
} from "@/lib/server/mobile-capture-security";
import {
  type MobileCaptureRoomReadinessEvaluation,
} from "@/lib/server/mobile-capture-room-readiness";
import { normalizeMobileCaptureResumableManifestForRead } from "@/lib/server/mobile-capture-resumable-manifest";
import type {
  LongSourceVerificationState,
} from "@high-ground/quipsly-capture-verification";
import {
  createLocalMobileCaptureUploadCapability,
  getMobileCaptureLocalVaultConfig,
  hashLocalMobileCaptureObject,
  loadLocalMobileCaptureManifest,
  loadLocalMobileCaptureObject,
  MOBILE_CAPTURE_LOCAL_VAULT_BUCKET,
  readLocalMobileCaptureObject,
  saveLocalMobileCaptureManifest,
} from "@/lib/server/mobile-capture-local-vault";

const RESUMABLE_URI_LIFETIME_MS = 6 * 24 * 60 * 60 * 1000;

export type MobileCaptureResumableStatus =
  | "uploading"
  | "verifying"
  | "verified"
  | "failed";

export type MobileCaptureConsentSnapshot = {
  id: string;
  status: string;
  canRecordAudio: boolean;
  canRecordVideo: boolean;
  canTranscribe: boolean;
  capturedAt: string;
};

export type MobileCaptureResumableFinalizationEvidence = {
  sourceId: string | null;
  mediaAssetId: string | null;
  roomId: string;
  participantId: string;
  consentId: string | null;
  consentStatus: string;
  recordingAssetId: string;
  recordingAssetStatus: string;
  transcriptJobId: string | null;
  transcriptJobStatus: string | null;
  processingDisposition: "HELD" | "RELEASED";
  holdReasonCode: string | null;
  holdReason: string | null;
  startReceiptId: string | null;
  consentVersion: string | null;
  transcriptDisposition: "HELD" | "RELEASED";
  transcriptHoldReasonCode: string | null;
  transcriptHoldReason: string | null;
  releasedByUserId?: string | null;
  releaseReason?: string | null;
  releasedAt?: string | null;
  transcriptReleasedByUserId?: string | null;
  transcriptReleaseReason?: string | null;
  transcriptReleasedAt?: string | null;
  legacyHistoricalEvidence?: {
    capturedAt: string;
    sourceId: string | null;
    mediaAssetId: string | null;
    recordingAssetId: string | null;
    recordingAssetStatus: string | null;
    transcriptJobId: string | null;
    transcriptJobStatus: string | null;
    claimedProcessingDisposition: string | null;
    claimedTranscriptDisposition: string | null;
  } | null;
};

export type MobileCaptureResumableManifest =
  MobileCaptureResumableImmutableBinding & {
    kind: typeof MOBILE_CAPTURE_RESUMABLE_CONTRACT_KIND;
    version: 2;
    status: MobileCaptureResumableStatus;
    bucketName: string;
    objectName: string;
    storageBackend: "gcs" | "local-development";
    storageUri: string;
    gcsUri: string | null;
    consentSnapshot: MobileCaptureConsentSnapshot;
    initialRoomReadiness: MobileCaptureRoomReadinessEvaluation;
    roomReadinessBindingVersion: 0 | 1;
    startReceiptId: string | null;
    consentVersion: string | null;
    processingDisposition: "eligible" | "preservation-only";
    uploadUri: string;
    localUploadTokenSha256: string | null;
    uploadUriCreatedAt: string;
    uploadUriExpiresAt: string;
    createdAt: string;
    updatedAt: string;
    longSourceVerification?: LongSourceVerificationState | null;
    finalizeLease?: {
      id: string;
      claimedAt: string;
      expiresAt: string;
    } | null;
    verification?: {
      expectedSha256: string;
      computedSha256: string;
      expectedSizeBytes: number;
      verifiedSizeBytes: number;
      generation: string;
      crc32c: string | null;
      md5Hash: string | null;
      verifiedAt: string;
    } | null;
    finalization?: MobileCaptureResumableFinalizationEvidence | null;
    failure?: {
      code: string;
      message: string;
      retryable: boolean;
      failedAt: string;
    } | null;
  };

export type StoredMobileCaptureResumableManifest = {
  manifest: MobileCaptureResumableManifest;
  generation: string;
};

export type MobileCaptureObjectEvidence = {
  bucketName: string;
  objectName: string;
  generation: string;
  metageneration: string;
  sizeBytes: number;
  contentType: string;
  crc32c: string | null;
  md5Hash: string | null;
  customMetadata: Record<string, string>;
  storageBackend: "gcs" | "local-development";
  localFilePath: string | null;
};

export class MobileCaptureResumableStoreError extends Error {
  readonly code: "not-found" | "conflict" | "invalid-manifest";

  constructor(
    message: string,
    code: "not-found" | "conflict" | "invalid-manifest",
  ) {
    super(message);
    this.name = "MobileCaptureResumableStoreError";
    this.code = code;
  }
}

function errorCode(error: unknown) {
  if (!error || typeof error !== "object") return null;
  const candidate = error as { code?: unknown; status?: unknown; response?: { status?: unknown } };
  return Number(candidate.code ?? candidate.status ?? candidate.response?.status);
}

function isNotFound(error: unknown) {
  return errorCode(error) === 404;
}

function isPreconditionFailure(error: unknown) {
  return errorCode(error) === 409 || errorCode(error) === 412;
}

function parseManifest(raw: Buffer, expectedSessionId: string) {
  let value: unknown;
  try {
    value = JSON.parse(raw.toString("utf8"));
  } catch {
    throw new MobileCaptureResumableStoreError(
      "The durable upload manifest is not valid JSON.",
      "invalid-manifest",
    );
  }

  const manifest = value as Partial<MobileCaptureResumableManifest>;
  if (
    manifest.kind !== MOBILE_CAPTURE_RESUMABLE_CONTRACT_KIND ||
    manifest.version !== 2 ||
    manifest.uploadSessionId !== expectedSessionId
  ) {
    throw new MobileCaptureResumableStoreError(
      "The durable upload manifest does not match the requested capture session.",
      "invalid-manifest",
    );
  }

  return normalizeMobileCaptureResumableManifestForRead(manifest, expectedSessionId);
}

export function mobileCaptureUploadUriIsExpired(
  manifest: MobileCaptureResumableManifest,
  now = new Date(),
) {
  const expiresAt = new Date(manifest.uploadUriExpiresAt);
  return Number.isNaN(expiresAt.getTime()) || expiresAt.getTime() <= now.getTime();
}

export async function loadMobileCaptureResumableManifest(
  uploadSessionId: string,
): Promise<StoredMobileCaptureResumableManifest | null> {
  if (getMobileCaptureLocalVaultConfig()) {
    const stored = await loadLocalMobileCaptureManifest<MobileCaptureResumableManifest>(uploadSessionId);
    return stored
      ? { manifest: parseManifest(Buffer.from(JSON.stringify(stored.manifest)), uploadSessionId), generation: stored.generation }
      : null;
  }
  const bucket = getMediaBucket(requireMediaBucketName());
  const objectName = buildMobileCaptureResumableManifestObjectName(uploadSessionId);
  const file = bucket.file(objectName);

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const [metadata] = await file.getMetadata();
      const generation = String(metadata.generation ?? "");
      if (!generation) {
        throw new MobileCaptureResumableStoreError(
          "The durable upload manifest is missing its GCS generation.",
          "invalid-manifest",
        );
      }
      const [raw] = await bucket.file(objectName, { generation }).download({
        validation: "crc32c",
      });
      return {
        manifest: parseManifest(raw, uploadSessionId),
        generation,
      };
    } catch (error) {
      if (!isNotFound(error)) throw error;
      if (attempt === 2) return null;
    }
  }
  return null;
}

export async function saveMobileCaptureResumableManifest(
  manifest: MobileCaptureResumableManifest,
  ifGenerationMatch: string | number,
) {
  if (manifest.storageBackend === "local-development") {
    const stored = await saveLocalMobileCaptureManifest(
      manifest.uploadSessionId,
      manifest,
      ifGenerationMatch,
    );
    return {
      manifest: parseManifest(Buffer.from(JSON.stringify(stored.manifest)), manifest.uploadSessionId),
      generation: stored.generation,
    };
  }
  const bucket = getMediaBucket(manifest.bucketName);
  const objectName = buildMobileCaptureResumableManifestObjectName(manifest.uploadSessionId);
  const file = bucket.file(objectName);

  await file.save(JSON.stringify(manifest), {
    resumable: false,
    validation: "crc32c",
    contentType: "application/json; charset=utf-8",
    metadata: {
      cacheControl: "private, no-store",
      metadata: {
        quipslyKind: "mobile-capture-resumable-control",
        quipslyContract: MOBILE_CAPTURE_RESUMABLE_CONTRACT_KIND,
        quipslyUploadSessionId: manifest.uploadSessionId,
        quipslyActorUserId: manifest.actorUserId,
        quipslyProjectId: manifest.projectId,
      },
    },
    preconditionOpts: { ifGenerationMatch },
  });

  const stored = await loadMobileCaptureResumableManifest(manifest.uploadSessionId);
  if (!stored) {
    throw new MobileCaptureResumableStoreError(
      "The durable upload manifest could not be read after its write.",
      "invalid-manifest",
    );
  }
  return stored;
}

async function createUploadUri(manifest: {
  storageBackend: "gcs" | "local-development";
  bucketName: string;
  objectName: string;
  uploadSessionId: string;
  actorUserId: string;
  projectId: string;
  projectSlug: string;
  recordingConsentId: string;
  captureId: string;
  startReceiptId: string | null;
  consentVersion: string | null;
  processingDisposition: "eligible" | "preservation-only";
  roomReadinessBindingVersion: 0 | 1;
  expectedSizeBytes: number;
  sha256: string;
  contentType: string;
  fileName: string;
}) {
  if (manifest.storageBackend === "local-development") {
    const capability = createLocalMobileCaptureUploadCapability(manifest.uploadSessionId);
    if (!capability) throw new Error("Local Capture vault is not configured.");
    return capability;
  }
  const bucket = getMediaBucket(manifest.bucketName);
  const destination = bucket.file(manifest.objectName);
  const [uri] = await destination.createResumableUpload({
    // Privacy is enforced by the bucket's uniform IAM policy. Asking the GCS
    // client for a per-object "private" ACL is both redundant and invalid on a
    // uniform-bucket-level-access media vault.
    preconditionOpts: { ifGenerationMatch: 0 },
    metadata: {
      contentLength: manifest.expectedSizeBytes,
      contentType: manifest.contentType,
      cacheControl: "private, no-store",
      contentDisposition: `attachment; filename="${manifest.fileName.replace(/["\\\r\n]/g, "_")}"`,
      metadata: {
        ...mobileCaptureObjectCustomMetadata(manifest),
      },
    },
  });
  return { url: uri, tokenSha256: null };
}

export function mobileCaptureObjectCustomMetadata(manifest: {
  uploadSessionId: string;
  actorUserId: string;
  projectId: string;
  projectSlug: string;
  recordingConsentId: string;
  captureId: string;
  startReceiptId: string | null;
  consentVersion: string | null;
  processingDisposition: "eligible" | "preservation-only";
  roomReadinessBindingVersion: 0 | 1;
  expectedSizeBytes: number;
  sha256: string;
}) {
  return {
    quipslyKind: "source-recording",
    quipslyContract: MOBILE_CAPTURE_RESUMABLE_CONTRACT_KIND,
    quipslyUploadSessionId: manifest.uploadSessionId,
    quipslyActorUserId: manifest.actorUserId,
    quipslyProjectId: manifest.projectId,
    quipslyProjectSlug: manifest.projectSlug,
    quipslyRecordingConsentId: manifest.recordingConsentId,
    quipslyCaptureId: manifest.captureId,
    quipslyStartReceiptId: manifest.startReceiptId || "none",
    quipslyConsentVersion: manifest.consentVersion || "none",
    quipslyProcessingDisposition: manifest.processingDisposition,
    quipslyRoomReadinessBindingVersion: String(manifest.roomReadinessBindingVersion),
    quipslyExpectedSizeBytes: String(manifest.expectedSizeBytes),
    quipslyExpectedSha256: manifest.sha256,
  };
}

export function mobileCaptureResumableStorageTarget(objectName: string) {
  const local = getMobileCaptureLocalVaultConfig();
  if (local) {
    return {
      bucketName: local.bucketName,
      storageBackend: "local-development" as const,
      storageUri: `local-vault://${local.bucketName}/${objectName}`,
      gcsUri: null,
    };
  }
  const bucketName = requireMediaBucketName();
  const gcsUri = toGcsUri(bucketName, objectName);
  return { bucketName, storageBackend: "gcs" as const, storageUri: gcsUri, gcsUri };
}

export async function createMobileCaptureResumableManifest(
  input: Omit<
    MobileCaptureResumableManifest,
    | "kind"
    | "version"
    | "status"
    | "uploadUri"
    | "localUploadTokenSha256"
    | "uploadUriCreatedAt"
    | "uploadUriExpiresAt"
    | "createdAt"
    | "updatedAt"
    | "finalizeLease"
    | "verification"
    | "finalization"
    | "failure"
  >,
) {
  const destination = await getMobileCaptureObjectEvidence(
    input.bucketName,
    input.objectName,
  );
  if (destination) {
    throw new MobileCaptureResumableStoreError(
      "The destination object already exists without a recoverable upload manifest.",
      "conflict",
    );
  }

  const uploadCapability = await createUploadUri(input);
  const now = new Date();
  const manifest: MobileCaptureResumableManifest = {
    ...input,
    kind: MOBILE_CAPTURE_RESUMABLE_CONTRACT_KIND,
    version: 2,
    status: "uploading",
    uploadUri: uploadCapability.url,
    localUploadTokenSha256: uploadCapability.tokenSha256,
    uploadUriCreatedAt: now.toISOString(),
    uploadUriExpiresAt: new Date(now.getTime() + RESUMABLE_URI_LIFETIME_MS).toISOString(),
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    finalizeLease: null,
    verification: null,
    finalization: null,
    failure: null,
  };

  try {
    return {
      stored: await saveMobileCaptureResumableManifest(manifest, 0),
      created: true,
    };
  } catch (error) {
    if (!isPreconditionFailure(error)) throw error;
    const existing = await loadMobileCaptureResumableManifest(input.uploadSessionId);
    if (!existing) throw error;
    return { stored: existing, created: false };
  }
}

export async function refreshMobileCaptureResumableUploadUri(
  stored: StoredMobileCaptureResumableManifest,
) {
  const object = await getMobileCaptureObjectEvidence(
    stored.manifest.bucketName,
    stored.manifest.objectName,
  );
  if (object) return stored;

  const uploadCapability = await createUploadUri(stored.manifest);
  const now = new Date();
  const refreshed: MobileCaptureResumableManifest = {
    ...stored.manifest,
    status: "uploading",
    uploadUri: uploadCapability.url,
    localUploadTokenSha256: uploadCapability.tokenSha256,
    uploadUriCreatedAt: now.toISOString(),
    uploadUriExpiresAt: new Date(now.getTime() + RESUMABLE_URI_LIFETIME_MS).toISOString(),
    updatedAt: now.toISOString(),
    finalizeLease: null,
    failure: null,
  };

  try {
    return await saveMobileCaptureResumableManifest(refreshed, stored.generation);
  } catch (error) {
    if (!isPreconditionFailure(error)) throw error;
    const winner = await loadMobileCaptureResumableManifest(stored.manifest.uploadSessionId);
    if (!winner) throw error;
    return winner;
  }
}

export async function getMobileCaptureObjectEvidence(
  bucketName: string,
  objectName: string,
): Promise<MobileCaptureObjectEvidence | null> {
  if (bucketName === MOBILE_CAPTURE_LOCAL_VAULT_BUCKET) {
    const object = await loadLocalMobileCaptureObject(objectName);
    return object ? {
      bucketName,
      objectName,
      generation: object.generation,
      metageneration: "1",
      sizeBytes: object.sizeBytes,
      contentType: object.contentType,
      crc32c: null,
      md5Hash: null,
      customMetadata: object.customMetadata,
      storageBackend: "local-development",
      localFilePath: object.objectPath,
    } : null;
  }
  const file = getMediaBucket(bucketName).file(objectName);
  try {
    const [metadata] = await file.getMetadata();
    const sizeBytes = Number(metadata.size);
    if (!Number.isSafeInteger(sizeBytes) || sizeBytes < 0) {
      throw new MobileCaptureResumableStoreError(
        "The completed GCS object has an invalid size.",
        "invalid-manifest",
      );
    }
    return {
      bucketName,
      objectName,
      generation: String(metadata.generation ?? ""),
      metageneration: String(metadata.metageneration ?? ""),
      sizeBytes,
      contentType: String(metadata.contentType ?? "application/octet-stream"),
      crc32c: typeof metadata.crc32c === "string" ? metadata.crc32c : null,
      md5Hash: typeof metadata.md5Hash === "string" ? metadata.md5Hash : null,
      customMetadata:
        metadata.metadata && typeof metadata.metadata === "object"
          ? Object.fromEntries(
              Object.entries(metadata.metadata).filter(
                (entry): entry is [string, string] => typeof entry[1] === "string",
              ),
            )
            : {},
      storageBackend: "gcs",
      localFilePath: null,
    };
  } catch (error) {
    if (isNotFound(error)) return null;
    throw error;
  }
}

export async function computeMobileCaptureObjectSha256(
  evidence: MobileCaptureObjectEvidence,
) {
  if (evidence.storageBackend === "local-development") {
    return hashLocalMobileCaptureObject(evidence.objectName);
  }
  const hash = createHash("sha256");
  let streamedBytes = 0;
  const file = getMediaBucket(evidence.bucketName).file(evidence.objectName, {
    generation: evidence.generation,
  });
  const stream = file.createReadStream({ validation: "crc32c" });

  for await (const chunk of stream) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    streamedBytes += bytes.byteLength;
    hash.update(bytes);
  }

  return {
    sha256: hash.digest("hex"),
    streamedBytes,
  };
}

export async function readMobileCaptureObjectBytes(args: { bucketName: string; objectName: string }) {
  const { bucketName, objectName } = args;
  if (bucketName === MOBILE_CAPTURE_LOCAL_VAULT_BUCKET) {
    return readLocalMobileCaptureObject(objectName);
  }
  const [buffer] = await getMediaBucket(bucketName).file(objectName).download();
  return buffer;
}

// Keep the claim longer than the route's 60-minute maximum so two server
// requests cannot finalize the same object concurrently at the timeout edge.
export function newMobileCaptureFinalizeLease(minutes = 65) {
  const now = new Date();
  return {
    id: randomUUID(),
    claimedAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + minutes * 60 * 1000).toISOString(),
  };
}

export function mobileCaptureFinalizeLeaseIsActive(
  manifest: MobileCaptureResumableManifest,
  now = new Date(),
) {
  if (manifest.status !== "verifying" || !manifest.finalizeLease) return false;
  const expiresAt = new Date(manifest.finalizeLease.expiresAt);
  return !Number.isNaN(expiresAt.getTime()) && expiresAt.getTime() > now.getTime();
}

export function mobileCaptureResumableGcsUri(manifest: MobileCaptureResumableManifest) {
  return manifest.gcsUri || manifest.storageUri;
}
