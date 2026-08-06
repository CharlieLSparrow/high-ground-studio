import "server-only";

import path from "node:path";

import { getMediaBucket, parseGcsUri } from "@/lib/server/gcs";
import {
  MOBILE_CAPTURE_LOCAL_VAULT_BUCKET,
  writeLocalMobileCaptureObjectFromFile,
} from "@/lib/server/mobile-capture-local-vault";
import {
  getMobileCaptureObjectEvidence,
  mobileCaptureResumableStorageTarget,
} from "@/lib/server/mobile-capture-resumable-store";

type VerifiedImportedSource = {
  locator: string;
  generation: string;
  sizeBytes: number;
  sha256: string;
  contentType: string;
};

function safeSegment(value: string, fallback: string) {
  const safe = value.trim().replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
  return safe || fallback;
}

export function captureRecoveryObjectName(args: {
  roomId: string;
  participantId: string | null;
  requestId: string;
  mediaAssetId: string;
  filename: string;
}) {
  const extension = safeSegment(path.extname(args.filename).toLowerCase(), "");
  return [
    "media-vault",
    "recordings",
    "recovery",
    safeSegment(args.roomId, "room"),
    safeSegment(args.participantId || "unassigned", "unassigned"),
    safeSegment(args.requestId, "request"),
    `${safeSegment(args.mediaAssetId, "media")}${extension}`,
  ].join("/");
}

function isPreconditionFailure(error: unknown) {
  return typeof error === "object"
    && error !== null
    && "code" in error
    && Number((error as { code?: unknown }).code) === 412;
}

async function copyVerifiedGcsSource(args: {
  evidence: VerifiedImportedSource;
  destinationBucket: string;
  objectName: string;
  customMetadata: Record<string, string>;
}) {
  const source = parseGcsUri(args.evidence.locator);
  if (!source || !/^[1-9][0-9]*$/.test(args.evidence.generation)) {
    throw new Error("A production recovery source must identify one immutable GCS generation.");
  }
  const sourceFile = getMediaBucket(source.bucketName).file(source.objectName, {
    generation: args.evidence.generation,
  });
  const destination = getMediaBucket(args.destinationBucket).file(args.objectName);
  try {
    await sourceFile.copy(destination, {
      cacheControl: "private, no-store",
      contentType: args.evidence.contentType,
      metadata: args.customMetadata,
      preconditionOpts: { ifGenerationMatch: 0 },
    });
  } catch (error) {
    // The destination is deterministic. A response-loss retry is safe only
    // when the already-created object independently proves the same binding.
    if (!isPreconditionFailure(error)) throw error;
  }
}

/**
 * Promotes a verified imported backup into Capture-owned durable storage.
 * The imported original remains immutable; the RecordingAsset binds only to
 * this deterministic, exact-size, exact-SHA replica so downstream workers do
 * not need authority over the generic import vault.
 */
export async function materializeCaptureRecoveryStorage(args: {
  evidence: VerifiedImportedSource;
  objectName: string;
  uploadSessionId: string;
  roomId: string;
  actorUserId: string;
  projectId: string;
  projectSlug: string;
  captureId: string;
  startReceiptId: string | null;
  consentVersion: string | null;
}) {
  const target = mobileCaptureResumableStorageTarget(args.objectName);
  const customMetadata = {
    quipslyKind: "source-recording",
    quipslyContract: "quipsly-capture-source-recovery-v1",
    quipslyUploadSessionId: args.uploadSessionId,
    quipslyActorUserId: args.actorUserId,
    quipslyProjectId: args.projectId,
    quipslyProjectSlug: args.projectSlug,
    quipslyCaptureId: args.captureId,
    quipslyStartReceiptId: args.startReceiptId || "none",
    quipslyConsentVersion: args.consentVersion || "none",
    quipslyProcessingDisposition: "eligible",
    quipslyExpectedSizeBytes: String(args.evidence.sizeBytes),
    quipslyExpectedSha256: args.evidence.sha256,
    quipslyRecoverySourceGeneration: args.evidence.generation || "local",
  };

  if (target.storageBackend === "local-development") {
    if (parseGcsUri(args.evidence.locator)) {
      throw new Error("A local recovery must first import its source into the confined local media vault.");
    }
    await writeLocalMobileCaptureObjectFromFile({
      objectName: args.objectName,
      sourcePath: args.evidence.locator,
      sizeBytes: args.evidence.sizeBytes,
      sha256: args.evidence.sha256,
      contentType: args.evidence.contentType,
      customMetadata,
    });
  } else {
    await copyVerifiedGcsSource({
      evidence: args.evidence,
      destinationBucket: target.bucketName,
      objectName: args.objectName,
      customMetadata,
    });
  }

  const stored = await getMobileCaptureObjectEvidence(target.bucketName, args.objectName);
  if (
    !stored
    || stored.sizeBytes !== args.evidence.sizeBytes
    || stored.contentType !== args.evidence.contentType
    || stored.customMetadata.quipslyExpectedSizeBytes !== String(args.evidence.sizeBytes)
    || stored.customMetadata.quipslyExpectedSha256 !== args.evidence.sha256
    || !/^[1-9][0-9]*$/.test(stored.generation)
  ) {
    throw new Error("Capture recovery storage does not match the verified imported source binding.");
  }
  return {
    bucketName: target.bucketName || MOBILE_CAPTURE_LOCAL_VAULT_BUCKET,
    objectName: args.objectName,
    generation: stored.generation,
    storageBackend: stored.storageBackend,
  };
}
