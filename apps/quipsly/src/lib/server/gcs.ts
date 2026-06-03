import { Storage } from "@google-cloud/storage";

// In production, this uses default credentials (e.g. from GCP metadata server or key.json in env)
// For local development, ensure GOOGLE_APPLICATION_CREDENTIALS is set in the environment.
const storage = new Storage();

// The user-defined bucket for the massive media vault
export const BUCKET_NAME =
  process.env.QUIPSLY_MEDIA_BUCKET ||
  process.env.HIGH_GROUND_MEDIA_BUCKET ||
  "high-ground-media-vault";

export function getMediaBucket(bucketName = BUCKET_NAME) {
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
  const bucket = getMediaBucket();
  const file = bucket.file(args.objectName);

  await file.save(args.buffer, {
    resumable: false,
    contentType: args.contentType,
    metadata: {
      cacheControl: "private, max-age=31536000",
      metadata: Object.fromEntries(
        Object.entries(args.metadata ?? {}).filter((entry): entry is [string, string] => typeof entry[1] === "string"),
      ),
    },
  });

  return {
    bucketName: BUCKET_NAME,
    objectName: args.objectName,
    uri: toGcsUri(BUCKET_NAME, args.objectName),
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
