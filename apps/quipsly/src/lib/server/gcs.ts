import { Storage } from "@google-cloud/storage";

// In production, this uses default credentials (e.g. from GCP metadata server or key.json in env)
// For local development, ensure GOOGLE_APPLICATION_CREDENTIALS is set in the environment.
const storage = new Storage();

const MEDIA_UPLOAD_RESUMABLE_THRESHOLD_BYTES = 8 * 1024 * 1024;

export const MEDIA_BUCKET_ENV_NAMES = [
  "QUIPSLY_MEDIA_BUCKET",
  "HIGH_GROUND_MEDIA_BUCKET",
  "GCS_BUCKET_NAME",
  "NEXT_PUBLIC_GCS_BUCKET",
] as const;

export const BUCKET_NAME =
  process.env.QUIPSLY_MEDIA_BUCKET ||
  process.env.HIGH_GROUND_MEDIA_BUCKET ||
  process.env.GCS_BUCKET_NAME ||
  process.env.NEXT_PUBLIC_GCS_BUCKET ||
  "";

export function requireMediaBucketName() {
  if (BUCKET_NAME) return BUCKET_NAME;

  throw new Error(
    `Missing media bucket. Set one of: ${MEDIA_BUCKET_ENV_NAMES.join(", ")}.`,
  );
}

export function getMediaBucket(bucketName = requireMediaBucketName()) {
  return storage.bucket(bucketName);
}

export function toGcsUri(bucketName: string, objectName: string) {
  return `gcs://${bucketName}/${objectName}`;
}

export function parseGcsUri(uri: string | null | undefined) {
  if (!uri) return null;
  const match = /^gcs:\/\/([^/]+)\/(.+)$/.exec(uri);
  if (!match) return null;
  return {
    bucketName: match[1],
    objectName: match[2],
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
    const file = bucket.file(`ingest/${Date.now()}-${fileName}`);

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
    // Return mock data if credentials aren't set during local development
    return {
      success: true,
      url: `/api/mock-upload?file=${encodeURIComponent(fileName)}`,
      destinationPath: `ingest/${Date.now()}-${fileName}`,
      mocked: true,
    };
  }
}
