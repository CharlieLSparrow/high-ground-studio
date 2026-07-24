import { Storage } from "@google-cloud/storage";
import {
  buildMediaVaultObjectName,
  chooseConfiguredMediaVaultBucket,
  MEDIA_VAULT_BUCKET_ENV_NAMES,
  MEDIA_VAULT_PREFIXES,
  requireMediaVaultBucketName,
} from "@/lib/server/media-vault";

// In production, this uses default credentials (e.g. from GCP metadata server or key.json in env)
// For local development, ensure GOOGLE_APPLICATION_CREDENTIALS is set in the environment.
const storage = new Storage();

const MEDIA_UPLOAD_RESUMABLE_THRESHOLD_BYTES = 8 * 1024 * 1024;

export const MEDIA_BUCKET_ENV_NAMES = [
  ...MEDIA_VAULT_BUCKET_ENV_NAMES,
] as const;

export const BUCKET_NAME = chooseConfiguredMediaVaultBucket().bucketName;

export const requireMediaBucketName = requireMediaVaultBucketName;

export function mockMediaUploadsAllowed() {
  return process.env.QUIPSLY_ALLOW_MOCK_UPLOADS === "true" && process.env.NODE_ENV !== "production";
}

export function getMediaBucket(bucketName = requireMediaBucketName()) {
  return storage.bucket(bucketName);
}

export function toGcsUri(bucketName: string, objectName: string, generation?: string | null) {
  const base = `gcs://${bucketName}/${objectName}`;
  return generation ? `${base}?generation=${encodeURIComponent(generation)}` : base;
}

export function parseGcsUri(uri: string | null | undefined) {
  if (!uri) return null;
  const match = /^gcs:\/\/([^/]+)\/(.+?)(?:\?generation=([0-9]+))?$/.exec(uri);
  if (!match) return null;
  return {
    bucketName: match[1],
    objectName: match[2],
    generation: match[3] || null,
  };
}

export async function uploadMediaBuffer(args: {
  objectName: string;
  buffer: Buffer;
  contentType: string;
  metadata?: Record<string, string | null | undefined>;
}) {
  const bucketName = requireMediaBucketName();
  const bucket = getMediaBucket(bucketName);
  const file = bucket.file(args.objectName);

  await file.save(args.buffer, {
    resumable: args.buffer.byteLength >= MEDIA_UPLOAD_RESUMABLE_THRESHOLD_BYTES,
    contentType: args.contentType,
    metadata: {
      cacheControl: "private, max-age=31536000",
      metadata: Object.fromEntries(
        Object.entries(args.metadata ?? {}).filter((entry): entry is [string, string] => typeof entry[1] === "string"),
      ),
    },
  });

  const [metadata] = await file.getMetadata();

  return {
    bucketName,
    objectName: args.objectName,
    uri: toGcsUri(bucketName, args.objectName),
    sizeBytes: Number(metadata.size ?? args.buffer.byteLength),
    contentType: metadata.contentType || args.contentType,
    generation: String(metadata.generation ?? ""),
    metageneration: String(metadata.metageneration ?? ""),
  };
}

export async function generateUploadSignedUrl(fileName: string, contentType: string) {
  try {
    const bucket = getMediaBucket();
    const file = bucket.file(buildMediaVaultObjectName({
      directory: MEDIA_VAULT_PREFIXES.raw,
      contextSlug: "direct-upload",
      assetId: `${Date.now()}`,
      filename: fileName,
    }));

    // Generate a V4 signed URL that expires in 15 minutes
    const [url] = await file.getSignedUrl({
      version: "v4",
      action: "write",
      expires: Date.now() + 15 * 60 * 1000,
      contentType,
    });

    return {
      success: true,
      url,
      destinationPath: file.name,
    };
  } catch (error: any) {
    console.error("Error generating signed URL:", error);
    if (!mockMediaUploadsAllowed()) {
      throw error;
    }

    // Explicit local-only fallback. Production paths must fail loudly instead
    // of returning a pretend upload URL that looks like durable storage.
    return {
      success: true,
      url: `/api/mock-upload?file=${encodeURIComponent(fileName)}`,
      destinationPath: `ingest/${Date.now()}-${fileName}`,
      mocked: true,
      localOnly: true,
      warning:
        "Mock upload URL created because QUIPSLY_ALLOW_MOCK_UPLOADS=true outside production.",
    };
  }
}
